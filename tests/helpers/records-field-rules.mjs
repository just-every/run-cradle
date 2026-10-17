import assert from 'node:assert/strict'
import { createUlid } from '../../src/core/shared/ids.ts'
import { newField } from '../../src/ui/records/schema/templates.ts'
import { createCommandHttp } from '../../src/core/registry/http.ts'
import { registerRecordFormActions } from '../../src/domains/records/form-actions.server.ts'
import { createAuthorizedRecordCreatePreparer } from '../../src/domains/records/actions.server.ts'
import { createAutomationEffects } from '../../src/domains/automations/effects.server.ts'
import { createAutomationDestinations } from '../../src/domains/automations/destinations.server.ts'
import { createRecordAutomationConfiguration } from '../../src/domains/automations/configuration.server.ts'
import { createRecordAutomationRuntime } from '../../src/domains/automations/runtime.server.ts'
import { createApplicationEntityRegistry } from '../../src/core/app/composition/entities.server.ts'
import { harness, add } from './records-manual-harness.mjs'
import { adoptFixtureOperators } from './base-fixture-auth.mjs'

export async function fieldRulesJourney() {
 const h = await harness()
 try {
  const code = { ...newField('Code'), required: true, unique: true, validation: { minLength: 4, maxLength: 4, pattern: '^[A-Z]{2}[0-9]{2}$' } }
  const status = { ...newField('Status', 'select'), options: ['Draft', 'Shipped'].map(label => ({ id: createUlid(), label })) }
  status.defaultValue = status.options[0].id
  const ship = { ...newField('Ship date', 'date'), validation: { min: '2026-01-01', max: '2027-12-31' } }
  const discount = { ...newField('Discount', 'number'), required: true, defaultValue: '0', validation: { min: '0', max: '100' } }
  const approval = { ...newField('Manager approval', 'boolean'), defaultValue: false }
  const tags = { ...newField('Tags', 'multi_select'), options: [{ id: createUlid(), label: 'Standard' }] }; tags.defaultValue = [tags.options[0].id]
  const money = { ...newField('Price', 'money'), validation: { min: '0', max: '5000' }, defaultValue: { minor: '2500', currency: 'USD', scale: 2 } }
  const note = { ...newField('Note'), validation: { maxLength: 2 } }
  const batch = newField('Batch')
  const instant = { ...newField('Scheduled at', 'instant'), validation: { min: '2026-01-01T00:00:00.000Z', max: '2027-12-31T23:59:59.999Z' } }
  const condition = (field, op, value) => ({ kind: 'condition', fieldId: field.id, op, ...(value === undefined ? {} : { value }) })
  const shipping = { id: createUlid(), name: 'Shipping date', message: 'Shipped orders need a ship date.', when: condition(status, 'eq', status.options[1].id), require: condition(ship, 'not_empty') }
  const manager = { id: createUlid(), name: 'Manager approval', message: 'Discounts above 20 need manager approval.', when: condition(discount, 'gt', '20'), require: condition(approval, 'eq', true) }
  const draft = { appId: createUlid(), name: 'Orders', tables: [{ id: createUlid(), label: 'Orders', fields: [code, status, ship, discount, approval, tags, money, note, batch, instant], validationRules: [shipping, manager] }] }
  let { r } = await h.create(draft), schema = r.registry.get(draft.appId, draft.tables[0].id).schema
  const first = await add(h, r, schema, { [code.id]: 'AB01', [note.id]: '🧭北', [batch.id]: 'Group' })
  assert.equal(first.fields[status.id].value, status.defaultValue)
  assert.equal(first.fields[discount.id].value, '0'); assert.equal(first.fields[approval.id].value, false)
  assert.deepEqual(first.fields[tags.id].value, tags.defaultValue); assert.deepEqual(first.fields[money.id].value, money.defaultValue)
  const rejects = (operation, pattern) => assert.rejects(operation, error => error.code === 'validation' && pattern.test(error.message))
  await rejects(add(h, r, schema, { [code.id]: 'A' }), /Code minLength/)
  await rejects(add(h, r, schema, { [code.id]: 'AB011' }), /Code maxLength/)
  await rejects(add(h, r, schema, { [code.id]: 'bad!' }), /Code pattern/)
  await rejects(add(h, r, schema, { [code.id]: 'AB01' }), /Code unique/)
  await rejects(add(h, r, schema, { [code.id]: 'XX01', [discount.id]: '100.00000000000000000000000001' }), /Discount max/)
  await rejects(add(h, r, schema, { [code.id]: 'XX01', [discount.id]: '-0.01' }), /Discount min/)
  await rejects(add(h, r, schema, { [code.id]: 'XX01', [discount.id]: 'broken' }), /Discount/)
  await rejects(add(h, r, schema, { [code.id]: 'XX01', [money.id]: { minor: '5001', currency: 'USD', scale: 2 } }), /Price max/)
  await rejects(add(h, r, schema, { [code.id]: 'XX01', [note.id]: '🧭北a' }), /Note maxLength/)
  await rejects(add(h, r, schema, { [code.id]: 'XX01', [ship.id]: '2025-12-31' }), /Ship date min/)
  await rejects(add(h, r, schema, { [code.id]: 'XX01', [instant.id]: '2028-01-01T00:00:00.000Z' }), /Scheduled at max/)
  await rejects(add(h, r, schema, { [code.id]: 'XX01', [status.id]: status.options[1].id }), /Shipping date.*Shipped orders/)
  const patch = (row, changes) => r.commands.get('record.patch').execute(h.ctx, { commandId: createUlid(), expected: [{ ref: row.ref, version: row.version }], input: { ref: row.ref, changes } })
  await rejects(patch(first, { [status.id]: status.options[1].id }), /Shipping date/)
  let shipped = (await patch(first, { [status.id]: status.options[1].id, [ship.id]: '2027-01-15' })).result.value
  await rejects(patch(shipped, { [discount.id]: '21' }), /Manager approval.*Discounts above 20/)
  shipped = (await patch(shipped, { [discount.id]: '21', [approval.id]: true })).result.value
  const second = await add(h, r, schema, { [code.id]: 'AB02', [batch.id]: 'Group' })
  await rejects(r.commands.get('record.bulk-preview').execute(h.ctx, { commandId: createUlid(), expected: [], input: { appId: draft.appId, entityId: schema.id, selection: { ids: [first.id, second.id] }, change: { fieldId: status.id, value: status.options[1].id } } }), /Shipping date/)
  const http = createCommandHttp({ commands: r.commands, admission: r.admission, authenticate: async () => h.ctx })
  const response = await http.fetch(new Request('https://records.test/api/v1/commands/record.patch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commandId: createUlid(), expected: [{ ref: shipped.ref, version: shipped.version }], input: { ref: shipped.ref, changes: { [approval.id]: false } } }) }))
  assert.equal(response.status, 400); assert.match((await response.json()).error.message, /Manager approval/)
  registerRecordFormActions(r.commands, { metadata: r.services.metadata, policy: r.policy, prepareCreate: createAuthorizedRecordCreatePreparer(r.services) })
  const form = (await r.commands.get('form.save').execute(h.ctx, { commandId: createUlid(), expected: [], input: { form: { appId: draft.appId, entityId: schema.id, title: 'New order', fields: schema.fields.map(field => ({ fieldId: field.id, label: field.label, help: '', required: field.required })), submitAction: 'record.create', authenticated: true } } })).result.value
  await rejects(r.commands.get('form.submit').execute(h.ctx, { commandId: createUlid(), expected: [{ ref: { appId: draft.appId, entityId: '00000000000000000000000003', recordId: form.id }, version: form.version }, { ref: { appId: draft.appId, entityId: '00000000000000000000000001', recordId: schema.id }, version: schema.version }], input: { appId: draft.appId, entityId: schema.id, formId: form.id, values: { [code.id]: 'FF01', [discount.id]: '21' } } }), /Manager approval/)
  const csv = await r.csv.preview(h.ctx, { appId: draft.appId, entityId: schema.id, csv: 'Code,Status,Discount,Manager approval\nPC01,Draft,0,false\nPC02,Shipped,0,false\nPC03,Draft,21,false', mapping: [code, status, discount, approval].map(field => ({ column: field.label, fieldId: field.id })), mergeFieldId: code.id })
  assert.equal(csv.creates, 1); assert.equal(csv.rejected, 2)
  assert.match(csv.errors[0].message, /Shipping date/); assert.match(csv.errors[1].message, /Manager approval/)
  await r.csv.commit(h.ctx, createUlid(), csv.id)
  const defaults = await r.csv.preview(h.ctx, { appId: draft.appId, entityId: schema.id, csv: 'Code\nPC04', mapping: [{ column: code.label, fieldId: code.id }], mergeFieldId: code.id })
  assert.equal(defaults.creates, 1); assert.equal(defaults.rejected, 0)
  const action = { kind: 'update', fieldId: approval.id, value: false }, definition = { name: 'Remove approval', appId: draft.appId, entityId: schema.id, event: 'updated', enabled: true, actions: [action] }
  const scope = await r.policy.scope(h.ctx, { appId: draft.appId, entityId: schema.id, purpose: 'read' })
  await adoptFixtureOperators(h.db)
  const baseSession = createUlid()
  await h.db.prepare("INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at) VALUES(?,?,?,1,'native',?,?)").bind(baseSession, createUlid(), h.owner, Date.now(), Date.now() + 3600000).run()
  await h.db.prepare('INSERT INTO cradle_base_sessions(base_id,session_id) VALUES(?,?)').bind(baseSession, h.session).run()
  h.ctx.principal.baseSessionId = baseSession
  r = await h.runtime(undefined, true)
  const effects = createAutomationEffects({ env: { DB: h.db }, entities: createApplicationEntityRegistry(r.registry), admission: r.admission, commands: r.commands, destinations: createAutomationDestinations({ DB: h.db }, r.policy, r.admission) })
  const configuration = createRecordAutomationConfiguration(h.db, r.policy, r.admission, r.registry, 'https://records.test')
  const automation = (await configuration.save(h.ctx, { commandId: createUlid(), expiresAt: new Date(Date.now() + 3600000).toISOString(), definition })).result.value
  const triggered = await patch(shipped, { [note.id]: 'OK' }); shipped = triggered.result.value
  await createRecordAutomationRuntime({ db: h.db, appOrigin: 'https://records.test', policy: r.policy, descriptors: r.registry, effects }).tick(triggered.result.commandId)
  const run = await h.db.prepare('SELECT id,state,error_code FROM automation_runs WHERE automation_id=?').bind(automation.id).first()
  assert.equal(run.state, 'Failed'); assert.equal(run.error_code, 'validation')
  const failure = await h.db.prepare('SELECT result_json FROM launch_automation_actions WHERE run_id=?').bind(run.id).first()
  assert.match(JSON.parse(failure.result_json).message, /Manager approval.*Discounts above 20/)
  let edit = await r.manual.read(h.ctx, draft.appId)
  assert.deepEqual(edit.tables[0].validationRules, [shipping, manager])
  const draftDate = { id: createUlid(), name: 'Planning date', message: 'Draft orders need a planned date.', when: condition(status, 'eq', status.options[0].id), require: condition(ship, 'not_empty') }
  edit.tables[0].validationRules.push(draftDate); edit.tables[0].fields.find(f => f.id === discount.id).validation.max = '10'; edit.tables[0].fields.find(f => f.id === status.id).unique = true
  const invalid = await r.manual.preview(h.ctx, edit), impact = invalid.impacts[0]
  assert.equal(impact.violatingRecordCount, 3)
  assert.deepEqual(impact.validationViolations.find(v => v.ruleId === draftDate.id).recordIds.sort(), [second.id, csv.rows[0].id].sort())
  assert.equal(impact.validationViolations.find(v => v.ruleName === 'Discount max').count, 1)
  assert.equal(impact.validationViolations.find(v => v.ruleName === 'Status unique').count, 2)
  await rejects(r.manual.adopt(h.ctx, createUlid(), invalid.id), /Planning date.*2 records|Discount max/)
  assert.equal((await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(draft.appId).first()).version, 1)
  edit.tables[0].fields.find(f => f.id === discount.id).validation.max = '100'; edit.tables[0].fields.find(f => f.id === status.id).unique = false
  edit.tables[0].fields.find(f => f.id === tags.id).required = true
  await patch(second, { [ship.id]: '2027-02-01' })
  const imported = (await r.services.reader.query(h.ctx, scope, {})).items.find(row => row.id === csv.rows[0].id)
  await patch(imported, { [ship.id]: '2027-02-02' })
  const ready = await r.manual.preview(h.ctx, edit); assert.equal(ready.impacts[0].violatingRecordCount, 0)
  await patch(shipped, { [note.id]: 'OK' })
  await assert.rejects(r.manual.adopt(h.ctx, createUlid(), ready.id), /stale/)
  const refreshed = await r.manual.preview(h.ctx, edit); await r.manual.adopt(h.ctx, createUlid(), refreshed.id)
  r = await h.runtime(); schema = r.registry.get(draft.appId, schema.id).schema
  assert.equal(schema.fields.find(f => f.id === tags.id).required, true)
  const liveScope = await r.policy.scope(h.ctx, { appId: draft.appId, entityId: schema.id, purpose: 'read' })
  assert.deepEqual((await r.services.reader.record(h.ctx, liveScope, first.ref)).fields[tags.id].value, tags.defaultValue)
  await rejects(add(h, r, schema, { [code.id]: 'ZZ01' }), /Planning date/)
  const bad = structuredClone(edit); bad.tables[0].validationRules[0].require.fieldId = createUlid()
  await assert.rejects(r.manual.preview(h.ctx, bad), /stored fields/)
  const pattern = structuredClone(edit); pattern.tables[0].fields[0].validation.pattern = '^(a+)+$'
  await assert.rejects(r.manual.preview(h.ctx, pattern), /Pattern groups/)
 } finally { h.close() }
}
