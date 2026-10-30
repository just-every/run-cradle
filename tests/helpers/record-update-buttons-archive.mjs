import assert from 'node:assert/strict'
import { createUlid } from '../../src/core/shared/ids.ts'
import { RECORD_SCHEMA_ENTITY_ID } from '../../src/domains/records/contracts.ts'

/** The configured action is ordinary retained installation data, never a restored credential. */
export async function addUpdateButtonArchiveState(h, recordId) {
  const { appId, entityId, statusId: fieldId } = h
  const base = `/api/v1/apps/${appId}/entities/${entityId}`
  const schema = (await h.request(base)).data
  const schemaExpected = { ref: { appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: entityId }, version: schema.version }
  const config = { appId, entityId, kind: 'update-field', fieldId, value: 'synthetic-cradle-181', name: 'synthetic-cradle-182', confirmation: true }
  const button = (await h.request('/api/v1/commands/record.template-button-save', { method: 'POST', body: { commandId: createUlid(), expected: [schemaExpected], input: config } })).data.value
  const record = (await h.request(`${base}/records/${recordId}`)).data.record
  const commandId = createUlid()
  const updated = (await h.request('/api/v1/commands/record.template-button-run', { method: 'POST', body: { commandId, expected: [schemaExpected, { ref: record.ref, version: record.version }], input: { appId, entityId, ref: record.ref, buttonId: button.id, buttonVersion: button.version, confirmed: true } } })).data.value
  assert.equal(updated.id, record.id)
  assert.equal(updated.fields[fieldId].value, config.value)
  assert.equal(updated.version, record.version + 1)
  return { appId, entityId, recordId, fieldId, config, button, recordVersion: updated.version }
}

/** Called after a real rer import and fresh native-owner bootstrap. */
export async function restoredUpdateButtonArchive(request, fixture) {
  const { appId, entityId, recordId, fieldId, config, button, recordVersion } = fixture
  const base = `/api/v1/apps/${appId}/entities/${entityId}`
  const before = (await request(`${base}/records/${recordId}`)).record
  assert.equal(before.version, recordVersion, 'Archive return runs no stored button action')
  assert.equal(before.fields[fieldId].value, config.value)
  const returned = (await request(`${base}/template-buttons?recordId=${recordId}`)).find(row => row.id === button.id)
  assert.ok(returned, 'The configured update button survives the installation archive')
  assert.deepEqual(Object.fromEntries(['id', 'kind', 'name', 'fieldId', 'value', 'confirmation', 'version'].map(key => [key, returned[key]])), { id: button.id, kind: 'update-field', name: config.name, fieldId, value: config.value, confirmation: true, version: button.version })
  assert.equal(returned.enabled, true, 'The fresh owner uses current authority to execute the restored configuration')
  const schema = await request(base), commandId = createUlid()
  const envelope = { commandId, expected: [{ ref: { appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: entityId }, version: schema.version }, { ref: before.ref, version: before.version }], input: { appId, entityId, ref: before.ref, buttonId: button.id, buttonVersion: button.version, confirmed: true } }
  const committed = (await request('/api/v1/commands/record.template-button-run', envelope)).value
  assert.equal(committed.id, before.id)
  assert.equal(committed.version, before.version + 1)
  assert.equal(committed.fields[fieldId].value, config.value)
  assert.deepEqual((await request('/api/v1/commands/record.template-button-run', envelope)).value, committed)
  assert.deepEqual((await request(`${base}/records/${recordId}`)).record, committed, 'A returned button executes once under the fresh owner')
}
