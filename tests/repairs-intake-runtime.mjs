import { test } from 'node:test'
import assert from 'node:assert/strict'
import { harness, base, realAuthority } from './repairs-harness.mjs'

test('mounted manual intake shares real authority, atomic admission, reads and original-key replay', async () => {
  const h = await harness()
  try {
    const b = await base(h), auth = await realAuthority(h), { r } = h
    const replay = r.createReplayAccess(h.db, h.d.policy, r.createApplicationEntityRegistry(r.createDescriptorRegistry(r.repairDescriptors)))
    const admission = r.createAdmissionService(h.db, { authorizeReplay: replay.authorizeReplay })
    const registry = r.createCommandRegistry(admission)
    // Production manual intake needs no fabricated case/execution/provider implementation.
    const deps = { db: h.db, policy: h.d.policy, evidence: h.d.evidence }
    r.registerRepairIntakeCommands(registry, deps)
    assert.equal(registry.get('repair.book-visit'), undefined)
    assert.equal(registry.get('repair.open'), undefined)
    const reads = r.createRepairIntakeReads({ ...deps, records: h.d.records, intakeClaims: h.d.intakeClaims })
    const http = r.createRepairIntakeHttp(reads, async () => h.ctx)
    const contextResponse = await http.request('http://local/api/v1/repairs/intake-context')
    assert.equal(contextResponse.status, 200, await contextResponse.clone().text())
    const context = (await contextResponse.json()).data
    assert.deepEqual(context.stores.map(s => s.ref.recordId), [b.store])
    assert.deepEqual(context.assets.map(a => a.ref.recordId), [b.asset])
    const input = { appId: r.REPAIRS_APP_ID, formId: r.REPAIRS_FORM_ID, values: { [context.fieldIds.store]: context.stores[0].ref, [context.fieldIds.asset]: context.assets[0].ref }, text: 'Mounted unit is warm', fileIds: [] }
    const command = await h.envelope(input, [h.ref('stores', b.store), h.ref('assets', b.asset)])
    const submitted = await registry.get('intake.submit').execute(h.ctx, command)
    assert.equal(submitted.result.value.state, 'ready')
    assert.equal((await registry.get('intake.submit').execute(h.ctx, command)).replay, true)
    assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM repair_intakes').first()).n, 1)
    const detail = await http.request(`http://local/api/v1/intakes/${submitted.result.value.id}`)
    assert.equal(detail.status, 200)
    assert.deepEqual((await detail.json()).data.exactIdentity, r.repairRef('assets', b.asset))
    const list = await http.request('http://local/api/v1/intakes?state=ready&limit=1')
    assert.equal(list.status, 200)
    assert.equal((await list.json()).data.items.length, 1)
    assert.equal((await http.request('http://local/api/v1/intakes?state=fiction')).status, 400)
    assert.equal((await http.request('http://local/api/v1/intakes?appId='+r.createUlid())).status, 404)
    await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1").run()
    await assert.rejects(registry.get('intake.submit').execute(h.ctx, command), { code: 'not_found' })
    assert.equal((await http.request('http://local/api/v1/repairs/intake-context')).status, 403)
    assert.equal((await http.request(`http://local/api/v1/intakes/${submitted.result.value.id}`)).status, 403)
    assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM repair_intakes').first()).n, 1)
  } finally { await h.close() }
})
