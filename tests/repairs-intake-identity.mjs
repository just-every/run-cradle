import { test } from 'node:test'
import assert from 'node:assert/strict'
import { harness, base } from './repairs-harness.mjs'

const inputFor = (h, text, values = {}) => ({ appId: h.r.REPAIRS_APP_ID, formId: h.r.REPAIRS_FORM_ID, values, text, fileIds: [] })
const selectionFor = (h, b) => ({
  [h.r.repairFieldId('intakes', 'store_id')]: h.r.repairRef('stores', b.store),
  [h.r.repairFieldId('intakes', 'asset_id')]: h.r.repairRef('assets', b.asset),
})
const intakeCount = async h => (await h.db.prepare('SELECT COUNT(*) n FROM repair_intakes').first()).n

test('repair intake requires exact app/entity references and an active asset in the selected store', async () => {
  const h = await harness()
  try {
    const b = await base(h), values = selectionFor(h, b)
    const storeField = h.r.repairFieldId('intakes', 'store_id'), assetField = h.r.repairFieldId('intakes', 'asset_id')
    for (const [index, invalid] of [
      { ...values, [storeField]: { ...values[storeField], appId: h.r.createUlid() } },
      { ...values, [storeField]: h.r.repairRef('assets', b.store) },
      { ...values, [storeField]: b.store },
      { ...values, [assetField]: h.r.repairRef('stores', b.asset) },
      { ...values, [assetField]: h.r.repairRef('assets', h.r.createUlid()) },
    ].entries()) {
      await assert.rejects(h.run('intake.submit', inputFor(h, `Invalid reference ${index}`, invalid), [h.ref('stores', b.store), h.ref('assets', b.asset)]), error => ['validation', 'not_found'].includes(error.code))
    }
    const otherStore = await h.insert('stores', { name: 'Other store', location: 'Brisbane', contact_id: h.ctx.principal.id, availability: '09:00–17:00', active: 1 })
    const otherAsset = await h.insert('assets', { name: 'Other cold room', store_id: otherStore, serial: h.r.createUlid(), trade: 'refrigeration', active: 1 })
    await assert.rejects(h.run('intake.submit', inputFor(h, 'Wrong store', { ...values, [assetField]: h.r.repairRef('assets', otherAsset) }), [h.ref('stores', b.store), h.ref('assets', otherAsset)]), /Asset and store disagree/)
    await h.db.prepare('UPDATE repair_assets SET active=0,version=version+1 WHERE id=?').bind(b.asset).run()
    await assert.rejects(h.run('intake.submit', inputFor(h, 'Inactive selection', values), [h.ref('stores', b.store), h.ref('assets', b.asset)]), /Asset is inactive/)
    assert.equal(await intakeCount(h), 0)
    assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM command_admissions').first()).n, 0)
  } finally { await h.close() }
})

test('displayed repair identity versions are confirmed before intake and again at atomic commit', async () => {
  const h = await harness()
  try {
    const b = await base(h), input = inputFor(h, 'Selected unit is warm', selectionFor(h, b))
    await assert.rejects(h.run('intake.submit', input), { code: 'version_conflict' })
    const expected = await Promise.all([h.ref('stores', b.store), h.ref('assets', b.asset)])
    await h.db.prepare('UPDATE repair_assets SET name=?,version=version+1 WHERE id=?').bind('Renamed unit', b.asset).run()
    await assert.rejects(h.run('intake.submit', input, expected), { code: 'version_conflict' })
    const prepared = await h.prepare('intake.submit', input, [h.ref('stores', b.store), h.ref('assets', b.asset)])
    await h.db.prepare('UPDATE repair_stores SET active=0,version=version+1 WHERE id=?').bind(b.store).run()
    const before = await h.snapshot()
    await assert.rejects(h.admission.commit(h.ctx, prepared.plan), { code: 'version_conflict' })
    assert.deepEqual(await h.snapshot(), before)
    assert.equal(await intakeCount(h), 0)
  } finally { await h.close() }
})

test('new store assignment or changed asset invalidates automatic repair identity without side effects', async () => {
  const h = await harness()
  try {
    const b = await base(h), prepared = await h.prepare('intake.submit', inputFor(h, 'Automatic identity'))
    const otherStore = await h.insert('stores', { name: 'Second store', location: 'Brisbane', contact_id: h.ctx.principal.id, availability: '09:00–17:00', active: 1 })
    await h.insert('staff', { store_id: otherStore, principal_id: h.ctx.principal.id, active: 1 })
    const before = await h.snapshot()
    await assert.rejects(h.admission.commit(h.ctx, prepared.plan), { code: 'version_conflict' })
    assert.deepEqual(await h.snapshot(), before)
    assert.equal(await intakeCount(h), 0)
    const ambiguous = await h.run('intake.submit', inputFor(h, 'Multiple stores are now assigned'))
    assert.equal(ambiguous.value.state, 'needs_identity')
    assert.equal(ambiguous.value.exactIdentity, null)
    assert.match(ambiguous.value.question.text, /Which store/)
    const selected = await h.prepare('intake.submit', inputFor(h, 'Explicit store still works', selectionFor(h, b)), [h.ref('stores', b.store), h.ref('assets', b.asset)])
    await h.db.prepare('UPDATE repair_assets SET active=0,version=version+1 WHERE id=?').bind(b.asset).run()
    await assert.rejects(h.admission.commit(h.ctx, selected.plan), { code: 'version_conflict' })
    assert.equal(await intakeCount(h), 1)
  } finally { await h.close() }
})

test('current selected identity reaches a real work order and legacy fingerprint history still deduplicates', async () => {
  const h = await harness()
  try {
    const b = await base(h), input = inputFor(h, 'Current selected unit', selectionFor(h, b))
    const submitted = await h.run('intake.submit', input, [h.ref('stores', b.store), h.ref('assets', b.asset)])
    assert.equal(submitted.value.state, 'ready')
    assert.deepEqual(submitted.value.exactIdentity, h.r.repairRef('assets', b.asset))
    const opened = await h.run('repair.open', { intakeId: submitted.value.id, asset: await h.ref('assets', b.asset), store: await h.ref('stores', b.store) }, [h.ref('intakes', submitted.value.id)])
    assert.equal(opened.value.stage, 'triage')
    assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM repair_work_orders').first()).n, 1)
    const duplicate = await h.run('intake.submit', input)
    assert.equal(duplicate.value.state, 'duplicate')
    assert.equal(duplicate.value.duplicateOf, submitted.value.id)
    assert.equal(await intakeCount(h), 1)
    const legacyInput = inputFor(h, 'Prior report without explicit identity')
    const fingerprint = await h.r.canonicalHash({ principal: h.ctx.principal.id, form: legacyInput.formId, text: legacyInput.text, files: [] })
    const payload = await h.r.canonicalHash(legacyInput)
    const prior = await h.insert('intakes', { text: legacyInput.text, fingerprint, payload_hash: payload, submitter_id: h.ctx.principal.id, store_id: b.store, asset_id: b.asset, source_ids: '[]', file_ids: '[]', candidates: '[]', question: null, case_id: null, work_order_id: null, lifecycle: 'ready' })
    const replay = await h.run('intake.submit', legacyInput)
    assert.equal(replay.value.duplicateOf, prior)
    assert.equal(await intakeCount(h), 2)
    await assert.rejects(h.run('intake.submit', { ...legacyInput, values: selectionFor(h, b) }), /different data/)
  } finally { await h.close() }
})
