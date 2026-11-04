import assert from 'node:assert/strict'
import { LAUNCH_APP_ID, launchEntities, createUlid } from './launch-authority-runtime.mjs'

const revision = (kind, row) => [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities[kind], recordId: row.id }, version: row.version }]

/** Authored queue examples shared by the native and rendered public-door journeys. */
export async function decisionQueueFixture(h, tag) {
 const now = Date.now()
 let tick = now
 const command = async (action, input, expected = []) => {
  h.setNow(tick++)
  const response = await h.request(h.ownerSession, '/api/v1/commands/launch.' + action, {
   method: 'POST', body: JSON.stringify({ commandId: createUlid(), input, expected }),
  })
  assert.equal(response.status, 200, await response.clone().text())
  return (await response.json()).data.value
 }
 const campaign = suffix => command('campaign.create', { fields: {
  code: 'QUEUE-' + tag + '-' + suffix, name: 'Queue readiness ' + suffix, ownerId: h.owner,
  startDate: '2026-01-01', launchDate: '2026-12-01', objective: 'Review launch decisions',
  statusSummary: '', phase: 'Planning', status: 'On track', health: 70,
  budgetMinor: 0, spendMinor: 0, tags: [], customFields: {},
 } })
 const active = await campaign('ACTIVE'), archived = await campaign('ARCHIVED')
 const rows = {}
 const add = async (name, priority, offset, state = 'Awaiting approval', parent = active) => {
  let row = await command('decision.create', { fields: {
   campaignId: parent.id, riskId: null, supersedesId: null, title: 'Queue ' + name,
   requesterId: h.owner, assigneeId: null, priority, dueAt: new Date(now + offset).toISOString(),
   recommendation: 'Review the current evidence', impact: 'Release readiness',
  } })
  if (state === 'In review') row = await command('decision.request-change', { id: row.id, rationale: 'Review current evidence' }, revision('decision', row))
  else if (state !== 'Awaiting approval') row = await command('decision.outcome', { id: row.id, outcome: state, rationale: 'Recorded queue exclusion' }, revision('decision', row))
  rows[name] = row
  return row
 }
 // Creation order deliberately interleaves due times, priorities and urgency.
 await add('future Low', 'Low', 3600000)
 await add('overdue Low', 'Low', -7200000)
 await add('future Medium', 'Medium', 3600000, 'In review')
 await add('overdue Medium', 'Medium', -7200000)
 await add('future High later due', 'High', 7200000)
 await add('overdue High later due', 'High', -3600000, 'In review')
 await add('future High newer', 'High', 3600000)
 await add('overdue High earlier due', 'High', -7200000)
 await add('future Critical', 'Critical', 7200000)
 await add('overdue Critical', 'Critical', -3600000)
 await add('future High retained older', 'High', 3600000, 'In review')
 // Retained IDs need not encode recorded creation time. Keep their public
 // identities while supplying that historical metadata in the fixture.
 const newer = rows['future High newer'], older = rows['future High retained older']
 assert.ok(newer.id < older.id, 'The retained older decision has the later identity')
 await h.db.batch([
  h.db.prepare('UPDATE decisions SET created_at=? WHERE id=?').bind(Date.UTC(2020, 0, 2), newer.id),
  h.db.prepare('UPDATE decisions SET created_at=? WHERE id=?').bind(Date.UTC(2020, 0, 1), older.id),
 ])
 // Equal creation times retain the ID as the final total-order tiebreak.
 const tieFirst = await add('future High tied first', 'High', 3600000)
 const tieSecond = await add('future High tied second', 'High', 3600000)
 assert.ok(tieFirst.id < tieSecond.id)
 await h.db.batch([tieFirst, tieSecond].map(row => h.db.prepare('UPDATE decisions SET created_at=? WHERE id=?').bind(Date.UTC(2020, 0, 3), row.id)))
 for (const state of ['Approved', 'Rejected', 'Cancelled']) await add('excluded ' + state, 'Critical', -86400000, state)
 await add('archived Awaiting approval', 'Critical', -86400000, 'Awaiting approval', archived)
 await add('archived In review', 'Critical', -86400000, 'In review', archived)
 const archivedResult = await command('campaign.archive', { id: archived.id }, revision('campaign', archived))
 h.setNow(now)
 const order = [
  'overdue Critical', 'overdue High earlier due', 'overdue High later due', 'overdue Medium', 'overdue Low',
  'future Critical', 'future High retained older', 'future High newer', 'future High tied first', 'future High tied second',
  'future High later due', 'future Medium', 'future Low',
 ].map(name => rows[name].id)
 return { now, rows, order, command, cleanup: async () => {
  for (const parent of [active, archivedResult]) await command('campaign.delete', { id: parent.id, confirmationCode: parent.code }, revision('campaign', parent))
  h.setNow(undefined)
 } }
}

export async function verifyDecisionQueueHttp(h, fixture) {
 const read = async route => {
  const response = await h.request(h.ownerSession, route)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
 }
 const ids = new Set(Object.values(fixture.rows).map(row => row.id))
 const queue = await read('/api/decisions')
 assert.deepEqual(queue.items.filter(row => ids.has(row.id)).map(row => row.id), fixture.order,
  'Public queue contains both unresolved states, excludes every terminal state and archived campaign, and preserves the authored order')
 assert.deepEqual(queue.decisions, queue.items)
 assert.equal(queue.items.find(row => row.id === fixture.rows['future High retained older'].id).createdAt, '2020-01-01T00:00:00.000Z')
 const seen = [], cursors = new Set()
 let cursor = null
 do {
  const page = await read('/api/decisions?limit=2' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))
  assert.ok(page.items.length <= 2)
  assert.equal(page.shown, page.items.length)
  assert.equal(page.total, queue.total)
  assert.deepEqual(page.decisions, page.items)
  seen.push(...page.items.map(row => row.id))
  cursor = page.cursor
  if (cursor) { assert.equal(cursors.has(cursor), false, 'Cursor must advance'); cursors.add(cursor) }
 } while (cursor)
 assert.deepEqual(seen, queue.items.map(row => row.id), 'Small cursor pages preserve the complete public sequence with no skips or repeats')
 assert.deepEqual(seen.filter(id => ids.has(id)), fixture.order, 'Small pages match the independently authored identities without sorting responses')
 return { expectedOrder: fixture.order, httpOrder: queue.items.filter(row => ids.has(row.id)).map(row => row.id), pages: cursors.size + 1 }
}
