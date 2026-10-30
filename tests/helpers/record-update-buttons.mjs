import assert from 'node:assert/strict'
import { recordUpdateButtonAuthorship } from './record-update-button-authorship.mjs'
import { createUlid } from '../../src/core/shared/ids.ts'
import { RECORD_SCHEMA_ENTITY_ID } from '../../src/domains/records/contracts.ts'

/** Configured scalar updates enter the emitted Worker's ordinary command door. */
export async function recordUpdateButtons(h) {
  const appId = createUlid(), entityId = createUlid(), nameId = createUlid(), statusId = createUlid(), approvalId = createUlid()
  const queued = createUlid(), reviewed = createUlid()
  const draft = { appId, name: 'synthetic-cradle-161', tables: [{ id: entityId, label: 'Reviews', primaryFieldId: nameId, fields: [
    { id: nameId, label: 'Name', type: 'text', required: true, unique: false },
    { id: statusId, label: 'Status', type: 'select', required: true, unique: false, options: [{ id: queued, label: 'Queued' }, { id: reviewed, label: 'Reviewed' }] },
    { id: approvalId, label: 'Manager approval', type: 'boolean', required: false, unique: false },
  ], validationRules: [{ id: createUlid(), name: 'Manager approval', message: 'Reviewed records need manager approval.', when: { kind: 'condition', fieldId: statusId, op: 'eq', value: reviewed }, require: { kind: 'condition', fieldId: approvalId, op: 'eq', value: true } }] }] }
  const command = async (action, input, expected = [], status = 200, commandId = createUlid(), secret) => (await h.request(`/api/v1/commands/${action}`, { method: 'POST', status, secret, body: { commandId, expected, input } })).data
  const adopt = async definition => {
    const preview = (await h.request('/api/v1/records/schema-preview', { method: 'POST', body: definition })).data
    await command('release.adopt', { kind: 'manual_schema', previewId: preview.id })
    return (await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data
  }
  let schema = await adopt(draft)
  const schemaExpected = () => ({ ref: { appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: entityId }, version: schema.version })
  const base = `/api/v1/apps/${appId}/entities/${entityId}`
  const read = async id => (await h.request(`${base}/records/${id}`)).data.record
  const create = async (name, approved) => (await command('record.create', { appId, entityId, values: { [nameId]: name, [statusId]: queued, [approvalId]: approved } }, [schemaExpected()])).value
  let source = await create('synthetic-cradle-162', true)
  const unsafe = await create('synthetic-cradle-163', false)
  const config = { appId, entityId, kind: 'update-field', fieldId: statusId, value: reviewed, name: 'synthetic-cradle-164', confirmation: true }
  let button = (await command('record.template-button-save', config, [schemaExpected()])).value
  assert.equal(button.kind, 'update-field')
  const list = async record => (await h.request(`${base}/template-buttons?recordId=${record.id}`)).data
  const expected = record => [schemaExpected(), { ref: record.ref, version: record.version }]
  const input = (record = source, configured = button) => ({ appId, entityId, buttonId: configured.id, buttonVersion: configured.version, ref: record.ref, confirmed: true })
  const unchanged = async (record, operation) => {
    const before = await read(record.id)
    await operation()
    assert.deepEqual(await read(record.id), before, 'A refused configured update leaves the current record unchanged')
  }
  assert.equal((await list(source)).find(row => row.id === button.id).enabled, true)
  assert.deepEqual((await list(source)).find(row => row.id === button.id).value, reviewed)
  await unchanged(source, () => command('record.template-button-run', { ...input(), confirmed: false }, expected(source), 400))
  const withoutConfirmation = { ...input() }; delete withoutConfirmation.confirmed
  await unchanged(source, () => command('record.template-button-run', withoutConfirmation, expected(source), 400))
  const withoutButtonVersion = { ...input() }; delete withoutButtonVersion.buttonVersion
  await unchanged(source, () => command('record.template-button-run', withoutButtonVersion, expected(source), 409))
  await unchanged(source, () => command('record.template-button-run', input(), [schemaExpected()], 400))
  const invalid = await h.request('/api/v1/commands/record.template-button-run', { method: 'POST', status: 400, body: { commandId: createUlid(), expected: expected(unsafe), input: input(unsafe) } })
  assert.match(invalid.error.message, /Manager approval.*Reviewed records need manager approval/)
  assert.deepEqual(await read(unsafe.id), unsafe, 'Configured actions retain ordinary row validation')
  await command('record.template-button-save', { ...config, value: createUlid() }, [schemaExpected()], 400)
  await command('record.template-button-save', { ...config, value: { unsupported: true } }, [schemaExpected()], 400)
  assert.equal((await list(source)).filter(row => row.kind === 'update-field').length, 1, 'Invalid literal values create no configuration')
  const retained = button
  button = (await command('record.template-button-save', { ...config, id: button.id, buttonVersion: button.version, name: 'synthetic-cradle-165' }, [schemaExpected()])).value
  assert.equal(button.version, retained.version + 1)
  await unchanged(source, () => command('record.template-button-run', input(source, retained), expected(source), 409))
  await command('record.template-button-save', { ...config, id: button.id, buttonVersion: retained.version }, [schemaExpected()], 409)
  const automation = (await h.request('/api/user-automations', { method: 'POST', status: 201, body: { commandId: createUlid(), expiresAt: new Date(Date.now() + 86400000).toISOString(), definition: { name: 'synthetic-cradle-166', appId, entityId, event: 'updated', enabled: true, actions: [{ kind: 'notify', operatorId: h.operator, title: 'synthetic-cradle-167' }] } } })).data.result.value
  try {
    const commandId = createUlid(), capturedInput = input(), capturedExpected = expected(source), before = source
    const committed = await command('record.template-button-run', capturedInput, capturedExpected, 200, commandId)
    source = committed.value
    assert.equal(source.id, before.id, 'The button updates its triggering record rather than creating a new one')
    assert.equal(source.version, before.version + 1)
    assert.equal(source.fields[statusId].value, reviewed)
    assert.equal((await h.request(`${base}/query`, { method: 'POST', body: { limit: 100 } })).data.items.length, 2)
    const facts = (await h.db.prepare('SELECT action,subject_json,changes_json FROM admission_audit WHERE command_id=?').bind(commandId).all()).results
    assert.equal(facts.length, 1)
    assert.equal(facts[0].action, 'record.patch')
    assert.deepEqual(JSON.parse(facts[0].subject_json), source.ref)
    assert.deepEqual(JSON.parse(facts[0].changes_json), [{ fieldId: statusId, before: { state: 'value', value: queued }, after: { state: 'value', value: reviewed } }])
    const admission = await h.db.prepare('SELECT action,state FROM command_admissions WHERE command_id=?').bind(commandId).first()
    assert.deepEqual(admission, { action: 'record.template-button-run', state: 'committed' })
    const events = (await h.db.prepare('SELECT id,command_id,record_id,event,record_version FROM record_automation_events WHERE command_id=?').bind(commandId).all()).results
    assert.equal(events.length, 1)
    assert.deepEqual(events[0], { id: `${commandId}:${entityId}:${source.id}:updated`, command_id: commandId, record_id: source.id, event: 'updated', record_version: source.version })
    assert.deepEqual((await command('record.template-button-run', capturedInput, capturedExpected, 200, commandId)).value, source)
    await h.restart()
    assert.deepEqual((await command('record.template-button-run', capturedInput, capturedExpected, 200, commandId)).value, source)
    assert.deepEqual(await read(source.id), source, 'Worker restart and replay preserve one patch and its effect identity')
    assert.equal((await h.db.prepare('SELECT count(*) n FROM admission_audit WHERE command_id=?').bind(commandId).first()).n, 1)
    assert.equal((await h.db.prepare('SELECT count(*) n FROM record_automation_events WHERE command_id=?').bind(commandId).first()).n, 1)
    let run
    for (let pass = 0; pass < 30; pass++) {
      await h.tick(commandId)
      run = (await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.find(row => row.recordId === source.id)
      if (run?.state === 'Complete') break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(run?.state, 'Complete', 'The native update capture executes the configured automation')
    await h.tick(commandId)
    assert.equal((await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.filter(row => row.recordId === source.id).length, 1)
    const effect = await h.db.prepare('SELECT idempotency_key,state FROM launch_automation_actions WHERE run_id=?').bind(run.id).first()
    assert.equal(effect.state, 'Complete')
    assert.ok(effect.idempotency_key)
    await unchanged(source, () => command('record.template-button-run', input(before), expected(before), 409))
    const credential = (await h.request('/api/user-keys', { method: 'POST', status: 201, body: { commandId: createUlid(), appId, entityId, name: 'synthetic-cradle-168', permissions: 'write', expiresAt: new Date(Date.now() + 86400000).toISOString() } })).data.key
    await unchanged(source, () => command('record.template-button-run', input(), expected(source), 403, createUlid(), credential.secret))
    await command('record.template-button-save', config, [schemaExpected()], 403, createUlid(), credential.secret)
    await h.request(`/api/user-keys/${credential.id}/revoke`, { method: 'POST', body: { commandId: createUlid(), appId } })
    await unchanged(source, () => command('record.template-button-run', input(), expected(source), 401, createUlid(), credential.secret))
    const policy = await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId, h.operator).first()
    const original = JSON.parse(policy.rules_json)
    try {
      for (const modify of [
        rule => ({ ...rule, actions: rule.actions.filter(action => action !== 'record.patch') }),
        rule => ({ ...rule, writableFields: rule.writableFields.filter(id => id !== statusId) }),
      ]) {
        await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(original.map(rule => rule.entityId === entityId ? modify(rule) : rule)), policy.id).run()
        assert.equal((await list(source)).find(row => row.id === button.id).enabled, false)
        await unchanged(source, () => command('record.template-button-run', input(), expected(source), 403))
        await command('record.template-button-save', { ...config, id: button.id, buttonVersion: button.version }, [schemaExpected()], 403)
      }
      const hidden = original.map(rule => rule.entityId === entityId ? { ...rule, rows: { kind: 'condition', fieldId: nameId, op: 'ne', value: 'synthetic-cradle-162' } } : rule)
      await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(hidden), policy.id).run()
      assert.equal((await list(source)).find(row => row.id === button.id).enabled, false)
      await command('record.template-button-run', input(), expected(source), 404)
    } finally {
      await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json, policy.id).run()
    }
    assert.deepEqual(await read(source.id), source)
    const oldSchema = schemaExpected()
    draft.tables[0].fields.push({ id: createUlid(), label: 'Review note', type: 'text', required: false, unique: false })
    schema = await adopt(draft)
    await unchanged(source, () => command('record.template-button-run', input(), [oldSchema, { ref: source.ref, version: source.version }], 409))
    const currentConfiguration = (await list(source)).find(row => row.id === button.id)
    await command('record.template-button-save', { ...config, id: button.id, buttonVersion: button.version }, [oldSchema], 409)
    assert.deepEqual((await list(source)).find(row => row.id === button.id), currentConfiguration, 'Stale schema authoring preserves the complete current configuration')
    button = (await command('record.template-button-save', { ...config, id: button.id, buttonVersion: button.version, confirmation: false, value: queued }, [schemaExpected()])).value
    source = (await command('record.template-button-run', { ...input(), confirmed: false }, expected(source))).value
    assert.equal(source.fields[statusId].value, queued, 'An update configured without confirmation executes directly')
    const authored = await recordUpdateButtonAuthorship(h, { appId, entityId, config: { ...config, value: reviewed }, button, record: source, expected: expected(source) })
    button = authored.button; source = authored.record
    const unsafeAfter = await read(unsafe.id)
    assert.equal(unsafeAfter.version, unsafe.version)
    for (const [id, cell] of Object.entries(unsafe.fields)) assert.deepEqual(unsafeAfter.fields[id], cell)
    return { appId, entityId, buttonId: button.id, recordId: source.id, commandId, automationRunId: run.id }
  } finally {
    await h.request(`/api/user-automations/${automation.id}/disable`, { method: 'POST', body: { commandId: createUlid(), version: automation.version } })
  }
}
