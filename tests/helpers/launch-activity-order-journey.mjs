import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'
import { createUlid, LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'

// Author the sequence independently of the reader and presentation helpers.
// Two changed fields per command also exercise the rendered action grouping.
export async function verifyPublicCampaignActivityOrder(h) {
 const read = async () => {
  const response = await h.request(h.ownerSession, `/api/campaigns/${campaign.id}`)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
 }
 const write = async (action, input, expected = [], commandId = createUlid()) => {
  const response = await h.request(h.ownerSession, `/api/v1/commands/launch.${action}`, {
   method: 'POST', body: JSON.stringify({ commandId, input, expected }),
  })
  assert.equal(response.status, 200, await response.clone().text())
  const receipt = await response.json()
  assert.equal(receipt.data.state, 'committed')
  return receipt.data.value
 }
 const campaign = await write('campaign.create', { fields: {
  code: `synthetic-cradle-${createUlid()}`, name: 'Initial activity campaign', ownerId: h.owner,
  startDate: '2026-01-01', launchDate: '2026-12-01', objective: 'Initial activity objective',
  statusSummary: '', phase: 'Planning', status: 'On track', health: 50,
  budgetMinor: 0, spendMinor: 0, tags: [], customFields: {},
 } })
 const authored = []
 for (const [name, objective] of [
  ['Zulu release review', 'Review the supplier evidence'],
  ['Alpha release preparation', 'Prepare the approved package'],
  ['Mike release confirmation', 'Confirm the delivery handover'],
 ]) {
  const before = (await read()).campaign
  // Each request starts after the preceding independently observed interval.
  // No persisted timestamps are changed to manufacture the expected order.
  while (Date.now() <= (authored.at(-1)?.finished ?? -1)) await setTimeout(1)
  const commandId = createUlid(), started = Date.now()
  const updated = await write('campaign.patch', { id: campaign.id, changes: { name, objective } }, [
   { ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: campaign.id }, version: before.version },
  ], commandId)
  const finished = Date.now(), detail = await read()
  assert.equal(updated.version, before.version + 1)
  assert.equal(detail.campaign.version, before.version + 1, 'Each edit uses a freshly read public revision')
  assert.equal(detail.campaign.name, name)
  assert.equal(detail.campaign.objective, objective)
  const facts = detail.activity.filter(entry => entry.actionId === commandId)
  assert.equal(facts.length, 2, 'The two authored field changes are present once for this command')
  for (const [field, previous, next] of [['name', before.name, name], ['objective', before.objective, objective]]) {
   const entries = facts.filter(entry => entry.fieldName === field)
   assert.equal(entries.length, 1)
   const entry = entries[0], occurred = Date.parse(entry.occurredAt)
   assert.equal(entry.type, 'campaign.updated')
   assert.equal(entry.subjectId, campaign.id)
   assert.equal(entry.actor.id, h.owner)
   assert.equal(entry.previousValue, previous)
   assert.equal(entry.nextValue, next)
   assert.ok(occurred >= started && occurred <= finished, 'Activity time falls inside the independently observed command interval')
  }
  assert.equal(facts[0].occurredAt, facts[1].occurredAt)
  if (authored.length) assert.ok(Date.parse(facts[0].occurredAt) > Date.parse(authored.at(-1).occurredAt), 'Authored edits have distinct increasing instants')
  authored.push({ commandId, name, objective, started, finished, version: detail.campaign.version, occurredAt: facts[0].occurredAt })
 }
 const detail = await read(), expectedActions = authored.toReversed().map(edit => edit.commandId)
 const observed = detail.activity.filter(entry => authored.some(edit => edit.commandId === entry.actionId))
 assert.deepEqual(observed.map(entry => entry.actionId), expectedActions.flatMap(id => [id, id]), 'Public campaign detail returns the authored edits newest first, with adjacent facts; observed entries are never sorted')
 console.log('PROBE ACT-001 1: three fresh native campaign edits -> public detail returns reverse authored command order')
 return { campaignId: campaign.id, authored, expectedActions, observedActions: observed.map(entry => entry.actionId) }
}
