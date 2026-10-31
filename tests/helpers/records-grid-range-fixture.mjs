import assert from 'node:assert/strict'
import { createUlid } from '../../src/core/shared/ids.ts'
import { newField } from '../../src/ui/records/schema/templates.ts'
import { createFixtureAuth } from './base-fixture-auth.mjs'
import { browserCall, liveCommand } from './records-live-fixture.mjs'

export async function rangeFixture(owner, runtime, width) {
  const appId = createUlid(), entityId = createUlid()
  const fields = [newField('Item'), newField('Quantity', 'number'), newField('Ship date', 'date'), newField('Packed', 'boolean'), newField('Website', 'url')]
  const preview = await browserCall(owner, '/api/v1/records/schema-preview', { appId, name: `Range history ${width}`, tables: [{ id: entityId, label: 'Shipments', primaryFieldId: fields[0].id, fields }] })
  await browserCall(owner, '/api/v1/commands/release.adopt', liveCommand({ kind: 'manual_schema', previewId: preview.id }))
  const base = `/api/v1/apps/${appId}/entities/${entityId}`, schema = await browserCall(owner, base)
  // Expectations are authored here, independently of command results and inverses.
  const before = [], after = [], clipboard = [], ids = []
  for (let index = 0; index < 50; index++) {
    const suffix = String(index).padStart(2, '0'), day = String(index % 28 + 1).padStart(2, '0')
    before.push([`Before ${suffix}`, `${index + 100}.5`, `2026-11-${day}`, index % 2 === 0, `https://example.test/before-${suffix}`])
    after.push([`Pasted ${suffix}`, `-${index + 1}.25`, `2027-02-${day}`, index % 2 !== 0, `https://example.test/after-${suffix}`])
    clipboard.push([`Pasted ${suffix}`, `-${index + 1}.2500`, `2027-02-${day}`, index % 2 ? 'yes' : 'no', `https://example.test/after-${suffix}`].join('\t'))
    const values = Object.fromEntries(fields.map((field, column) => [field.id, before[index][column]]))
    const created = await browserCall(owner, '/api/v1/commands/record.create', liveCommand({ appId, entityId, values }, [{ ref: { appId, entityId: '00000000000000000000000001', recordId: entityId }, version: schema.version }]))
    ids.push(created.value.id)
  }
  const operator = createUlid(), time = Date.now()
  const original = await runtime.db.prepare('SELECT o.email FROM operators o JOIN authority_principals p ON p.human_id=o.id WHERE p.initial_owner=1').first()
  const email = original.email.replace(/^[^@]+/, `synthetic-cradle-${width}`)
  await runtime.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at) VALUES(?,?,?,1,?,?)').bind(operator, 'Range editor', email, time, time).run()
  await runtime.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(operator, operator, time, time).run()
  const collaborators = `/api/v1/records/bases/${appId}/collaborators`
  async function role(role) {
    const current = (await browserCall(owner, collaborators)).items.find(person => person.id === operator)
    return browserCall(owner, collaborators, { commandId: createUlid(), principalId: operator, role, destructive: false, version: current.version })
  }
  await role('editor')
  const auth = await createFixtureAuth(runtime.db, { appOrigin: runtime.origin, sessionSecret: 'test-only-records-session-secret-at-least-32-characters', mode: 'development' }, operator)
  const session = await auth.signIn(operator)
  async function read() {
    const result = await browserCall(owner, base + '/query', { limit: 100 })
    assert.equal(result.items.length, 50)
    assert.ok(!result.nextCursor, 'The assertion must read every range record')
    return ids.map(id => { const row = result.items.find(row => row.id === id); assert.ok(row, `Missing range record ${id}`); return row })
  }
  async function values(expected, version) {
    const rows = await read()
    for (const [index, row] of rows.entries()) {
      assert.equal(row.version, version, `Row ${index + 1}: exactly one write per action`)
      for (const [column, field] of fields.entries()) assert.deepEqual(row.fields[field.id], { state: 'value', value: expected[index][column] }, `Row ${index + 1}, ${field.label}`)
    }
    return rows
  }
  return { appId, entityId, base, fields, ids, before, after, text: clipboard.join('\n'), operator, cookie: session.cookie, role, read, values, path: `${runtime.origin}/app/records/${appId}/${entityId}` }
}

export async function rangeReceipt(runtime, response, fixture, actor) {
  const request = response.request().postDataJSON(), body = await response.json()
  assert.equal(response.status(), 200, JSON.stringify(body))
  assert.equal(body.data.state, 'committed')
  assert.equal(body.data.commandId, request.commandId)
  assert.equal(request.input.appId, fixture.appId)
  assert.equal(request.input.entityId, fixture.entityId)
  assert.equal(request.input.rows.length, 50)
  assert.equal(request.input.rows.reduce((count, row) => count + Object.keys(row.changes).length, 0), 250)
  const admission = await runtime.db.prepare('SELECT actor_id,actor_kind,action,state,result_json FROM command_admissions WHERE command_id=?').bind(request.commandId).first()
  assert.equal(admission.actor_id, actor)
  assert.equal(admission.actor_kind, 'human')
  assert.equal(admission.action, 'record.patch')
  assert.equal(admission.state, 'committed')
  assert.deepEqual(JSON.parse(admission.result_json).value, body.data.value)
  const audit = (await runtime.db.prepare('SELECT actor_id,subject_json,changes_json FROM admission_audit WHERE command_id=?').bind(request.commandId).all()).results
  assert.equal(audit.length, 50)
  assert.deepEqual(audit.map(row => JSON.parse(row.subject_json).recordId).sort(), [...fixture.ids].sort())
  for (const row of audit) { assert.equal(row.actor_id, actor); assert.equal(JSON.parse(row.changes_json).length, 5) }
  return { commandId: request.commandId, actor, records: audit.length, cells: 250 }
}
