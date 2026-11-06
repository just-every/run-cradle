import assert from 'node:assert/strict'
import { readArchive } from '@runeditrun/rer/modules/portability'
import { createUlid, LAUNCH_APP_ID, launchEntities, launchAuthorityRuntime } from './launch-authority-runtime.mjs'

/** Public writes and independent reads for a populated definition and an unrelated control. */
export async function customFieldDeletionFixture(h, session, ownerId, suffix, existing = {}) {
 const read = async (route, init) => {
  const response = await h.request(session(), route, init)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
 }
 const send = (action, input, expected = []) => h.request(session(), `/api/v1/commands/${action}`, {
  method: 'POST', body: JSON.stringify({ commandId: createUlid(), expected, input }),
 })
 const write = async (action, input, expected) => {
  const response = await send(action, input, expected)
  assert.equal(response.status, 200, await response.clone().text())
  const result = (await response.json()).data
  assert.equal(result.state, 'committed')
  return result.value
 }
 const target = existing.target ?? await write('launch.custom-field.save', { field: { name: `Market ${suffix}`, type: 'select', options: ['North', 'South'] } })
 const retained = await write('launch.custom-field.save', { field: { name: `Retained note ${suffix}`, type: 'text' } })
 const ids = []
 for (let index = 0; index < 3; index++) {
  const row = index === 0 && existing.firstId ? { id: existing.firstId } : await write('launch.campaign.create', { fields: {
   code: `synthetic-cradle-delete-${suffix}-${index}`, name: `Deletion control ${suffix} ${index}`,
   ownerId, startDate: '2026-11-01', launchDate: '2026-12-01', objective: `Retained objective ${index}`,
   statusSummary: `Retained summary ${index}`, phase: 'Build', status: 'Watch', health: 67,
   budgetMinor: 12345, spendMinor: 6789, tags: ['Retained'], customFields: {},
  } })
  ids.push(row.id)
  const current = (await read(`/api/campaigns/${row.id}`)).campaign
  await write('launch.campaign.patch', { id: row.id, changes: { customFields: { [retained.id]: `Keep ${index}` } } }, [{
   ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: row.id }, version: current.version,
  }])
 }
 const snapshot = async () => ({
  definitions: (await read('/api/v1/launch/custom-fields')).data.items,
  campaigns: await Promise.all(ids.map(id => read(`/api/campaigns/${id}`))),
 })
 const expected = field => [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.customField, recordId: target.id }, version: field.version }]
 const assertPopulated = async () => {
  const before = await snapshot(), field = before.definitions.find(row => row.id === target.id)
  assert.equal(field.type, 'select')
  assert.deepEqual(field.options, ['North', 'South'])
  assert.equal(field.campaigns, 2, 'Exactly two campaigns hold a value; the third is unset')
  assert.deepEqual(before.campaigns.map(row => row.customFields.find(field => field.id === target.id)?.value), ['North', 'South', null])
  assert.deepEqual(before.campaigns.map(row => row.customFields.find(field => field.id === retained.id)?.value), ['Keep 0', 'Keep 1', 'Keep 2'])
  return before
 }
 const refuseWrongCount = async () => {
  const before = await assertPopulated(), field = before.definitions.find(row => row.id === target.id)
  const response = await send('launch.custom-field.delete', { id: target.id, confirmedAffectedCount: 1 }, expected(field))
  const failure = await response.json()
  assert.equal(response.status, 400, JSON.stringify(failure))
  assert.equal(failure.error.message, 'Confirm deletion of 2 campaign values', 'The current version with an incorrect count is refused for the count')
  assert.deepEqual(await snapshot(), before, 'Incorrect confirmation changes no definition, value or campaign detail')
  return { status: response.status, message: failure.error.message, version: field.version }
 }
 // A detail read joins definitions. Read the actual stored rows through the shipped
 // installation archive too, so orphaned values cannot masquerade as deletion.
 const storedRows = async () => {
  const { data: { id } } = await read('/api/v1/commands/export.start', { method: 'POST', body: JSON.stringify({ scope: 'installation', format: 'archive' }) })
  let status
  for (let step = 0; step < 100; step++) {
   status = (await read(`/api/v1/archive-jobs/${id}/advance`, { method: 'POST', body: '{}' })).data
   if (status.phase === 'complete') break
  }
  assert.equal(status.phase, 'complete', 'The public archive completes')
  const download = await h.request(session(), `/api/v1/archive-jobs/${id}/content`)
  assert.equal(download.status, 200)
  const rows = []
  for await (const part of readArchive(download.body)) for (const item of part.items ?? []) {
   if (item.kind === 'row' && ['launch_custom_fields', 'launch_custom_values', 'campaigns', 'campaign_tags'].includes(item.table)) rows.push({ table: item.table, row: item.row })
  }
  return rows
 }
 const assertDeleted = async (before, storedBefore) => {
  const after = await snapshot()
  assert.deepEqual(after.definitions, before.definitions.filter(field => field.id !== target.id), 'Only the selected definition disappears')
  for (let index = 0; index < ids.length; index++) {
   assert.equal(after.campaigns[index].customFields.some(field => field.id === target.id), false, 'Public campaign detail no longer offers the deleted field or value')
   assert.deepEqual(after.campaigns[index], { ...before.campaigns[index], customFields: before.campaigns[index].customFields.filter(field => field.id !== target.id) }, 'Campaign business fields and unrelated custom values remain intact')
  }
  const values = storedBefore.filter(item => item.table === 'launch_custom_values' && item.row.field_id === target.id)
  assert.deepEqual(values.map(item => [item.row.campaign_id, JSON.parse(item.row.value_json)]).sort(), [[ids[0], 'North'], [ids[1], 'South']].sort(), 'The public pre-deletion archive contains both independently authored stored values')
  assert.ok(storedBefore.some(item => item.table === 'launch_custom_fields' && item.row.id === target.id))
  const storedAfter = await storedRows()
  assert.deepEqual(storedAfter, storedBefore.filter(item => !(item.table === 'launch_custom_fields' && item.row.id === target.id) && !(item.table === 'launch_custom_values' && item.row.field_id === target.id)), 'The public post-deletion archive removes exactly the definition and its two stored values, retaining every other definition, value, campaign and tag')
 }
 return { ids, target, retained, read, write, snapshot, expected, assertPopulated, refuseWrongCount, storedRows, assertDeleted }
}

export async function customFieldDeletionJourney() {
 // Installation exports retain their own snapshot tables. Keep this journey's
 // complete before and after archives in its own real installation, independent
 // of the operator file's later ownership and warehouse erasure journeys.
 const h = await launchAuthorityRuntime({}, { installedLaunchDefinitions: true, installationOwner: true, port: Number(process.env.CRADLE_AUTHORITY_PORT ?? 41879) + 2 })
 try {
 const f = await customFieldDeletionFixture(h, () => h.ownerSession, h.owner, 'native')
 for (const [index, value] of ['North', 'South'].entries()) {
  const row = (await f.read(`/api/campaigns/${f.ids[index]}`)).campaign
  await f.write('launch.campaign.patch', { id: row.id, changes: { customFields: { [f.target.id]: value } } }, [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: row.id }, version: row.version }])
 }
 const before = await f.assertPopulated(), storedBefore = await f.storedRows()
 await f.refuseWrongCount()
 const field = (await f.snapshot()).definitions.find(row => row.id === f.target.id)
 const deleted = await f.write('launch.custom-field.delete', { id: field.id, confirmedAffectedCount: 2 }, f.expected(field))
 assert.deepEqual(deleted, { deletedId: field.id, affected: 2 })
 await f.assertDeleted(before, storedBefore)
 console.log('PROBE CAMP-008 2 native: two stored select values and one unset campaign; current-version wrong count refused unchanged; confirmed deletion removes exactly definition and two values through public reads and archive')
 } finally { await h.close() }
}
