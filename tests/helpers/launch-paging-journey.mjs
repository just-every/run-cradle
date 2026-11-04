import assert from 'node:assert/strict'
import { createUlid, LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'

/** Publicly authored ties, isolated from the installation's other campaigns by owner. */
export async function pagingCampaigns(h, author) {
 const reader = await h.addPerson({ name: 'Paging operator' })
 const command = async (action, input, expected = []) => {
  const response = await h.request(author.session, `/api/v1/commands/${action}`, { method: 'POST', body: JSON.stringify({ commandId: createUlid(), expected, input }) })
  assert.equal(response.status, 200, await response.clone().text())
  const result = await response.json()
  assert.equal(result.data.state, 'committed')
  return result.data.value
 }
 const ref = row => ({ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: row.id }, version: row.version })
 let serial = 0
 const create = changes => command('launch.campaign.create', { fields: {
  code: `synthetic-cradle-paging-${++serial}`, name: 'Tied paging campaign', ownerId: reader.id,
  startDate: '2026-01-01', launchDate: '2026-12-01', objective: '', statusSummary: '',
  phase: 'Review', status: 'Watch', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {}, ...changes,
 } })
 const authored = []
 for (let index = 0; index < 201; index++) authored.push(await create({}))
 // Expected identities come from the create receipts, never from a collection response
 // or the product comparator. Do not sort an observed page before comparing it.
 const expected = authored.map(row => row.id).sort()
 const last = authored.find(row => row.id === expected.at(-1))
 authored[authored.indexOf(last)] = await command('launch.campaign.patch', { id: last.id, changes: { launchDate: '2026-02-01' } }, [ref(last)])
 const excluded = [await create({ phase: 'Build' }), await create({ status: 'Blocked' }), await create({ ownerId: author.id })]
 const archived = await create({})
 excluded.push(await command('launch.campaign.archive', { id: archived.id }, [ref(archived)]))
 const cleanup = async () => {
  for (const row of [...authored, ...excluded]) await command('launch.campaign.delete', { id: row.id, confirmationCode: row.code }, [ref(row)])
 }
 return { reader, expected, excluded: excluded.map(row => row.id), query: 'view=mine&phase=Review&status=Watch&sort=name&direction=asc', cleanup }
}

export async function verifyPagingCampaigns(h, fixture) {
 const read = async (overrides = {}) => {
  const query = new URLSearchParams(fixture.query)
  for (const [key, value] of Object.entries(overrides)) query.set(key, value)
  const response = await h.request(fixture.reader.session, `/api/campaigns?${query}`)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
 }
 const repositoryOrder = await read({ sort: 'launchDate', direction: 'asc' })
 assert.deepEqual(repositoryOrder.items.map(row => row.id), [fixture.expected.at(-1), ...fixture.expected.slice(0, 199)], 'The default launch-date order differs from the requested tied ID order')
 const first = await read({ direction: 'desc' })
 assert.deepEqual([first.shown, first.items.length, first.total, first.totalLabel], [200, 200, 201, '201'])
 assert.ok(first.cursor, 'The default capped page supplies the remaining-page cursor')
 assert.deepEqual(first.items.map(row => row.id), fixture.expected.slice(0, 200), 'The first 200 tied records use ascending IDs even with descending name sort')
 const remaining = await read({ direction: 'desc', cursor: first.cursor })
 assert.deepEqual([remaining.shown, remaining.total, remaining.totalLabel, remaining.cursor], [1, 201, '201', null])
 assert.deepEqual(remaining.items.map(row => row.id), fixture.expected.slice(200), 'The remaining cursor page contains exactly the last independently expected identity')
 const observed = [...first.items, ...remaining.items].map(row => row.id)
 assert.deepEqual(observed, fixture.expected, 'Page concatenation preserves the expected sequence without repeats or skips')
 assert.equal(new Set(observed).size, 201)
 assert.ok(fixture.excluded.every(id => !observed.includes(id)), 'Other phases, statuses, owners and archived campaigns do not inflate the total or appear on either page')
 const refused = await h.request(fixture.reader.session, `/api/campaigns?${fixture.query}&limit=201`)
 assert.equal(refused.status, 400, 'A client cannot request 201 records in one page')
 assert.match((await refused.json()).error.message, /1 to 200 records/)
 return first
}
