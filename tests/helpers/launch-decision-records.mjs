import assert from 'node:assert/strict'
import { mutationSnapshot } from './launch-write-context.mjs'

export async function verifyPublicDecisionRecords(h, campaign, fields) {
 const operator = await h.addPerson({ name: 'Decision record operator', change: rules => rules.map(rule => rule.entityId === h.r.launchEntities.decision ? { ...rule, actions: rule.actions.filter(action => action !== 'launch.decision.delete') } : rule) })
 const read = async route => {
  const response = await h.request(operator.session, route), body = await response.json()
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`)
  return body
 }
 const submit = async (session, action, input, expected = []) => {
  const response = await h.request(session, `/api/v1/commands/launch.${action}`, { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), input, expected }) })
  const body = await response.json()
  assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`)
  assert.equal(body.data.state, 'committed')
  return body.data.value
 }
 const risk = await submit(h.ownerSession, 'risk.create', { fields: { campaignId: campaign.id, title: 'Public deletion linked risk', ownerId: h.actor, severity: 'High', dueDate: null, signal: 'Supplier evidence pending', mitigation: 'Retain independent review' } })
 const riskBefore = (await read(`/api/risks/${risk.id}`)).risk
 const input = fields({ riskId: risk.id, title: 'Public decision to remove', requesterId: operator.id })
 const created = await submit(operator.session, 'decision.create', { fields: input })
 const sibling = await submit(operator.session, 'decision.create', { fields: { ...input, title: 'Keep sibling decision', recommendation: 'Retain the separate review' } })
 const deliverable = await submit(h.ownerSession, 'deliverable.create', { fields: { campaignId: campaign.id, title: 'Keep sibling deliverable', ownerId: h.actor, dueDate: null } })
 const milestone = await submit(h.ownerSession, 'milestone.create', { fields: { campaignId: campaign.id, title: 'Keep sibling milestone', ownerId: h.actor, type: 'Review', status: 'Not started', startDate: '2026-12-01', endDate: null, conflictReason: null } })
 const createdDetail = (await read(`/api/decisions/${created.id}`)).decision
 assert.equal(createdDetail.title, input.title)
 assert.equal(createdDetail.requester.id, operator.id)
 assert.equal(createdDetail.risk.id, risk.id)
 const changes = { title: 'Edited public decision to remove', recommendation: 'Use the current supplier evidence', impact: 'Updated release scope', priority: 'Critical' }
 await submit(operator.session, 'decision.patch', { id: created.id, changes }, h.expected('decision', createdDetail))
 const before = (await read(`/api/decisions/${created.id}`)).decision
 for (const [key, value] of Object.entries(changes)) assert.equal(before[key], value)
 assert.equal(before.version, createdDetail.version + 1)
 assert.equal(before.risk.id, risk.id)
 assert.deepEqual((await read(`/api/risks/${risk.id}`)).risk, riskBefore, 'Creating and editing decisions leave their linked risk unchanged')
 const campaignBefore = await read(`/api/campaigns/${campaign.id}`), queueBefore = (await read('/api/decisions')).items
 for (const id of [created.id, sibling.id]) {
  assert.ok(campaignBefore.decisions.some(row => row.id === id), 'Both real decisions appear in campaign decisions before deletion')
  assert.ok(queueBefore.some(row => row.id === id), 'Both real decisions appear in Decision Queue before deletion')
 }
 assert.ok(campaignBefore.deliverables.some(row => row.id === deliverable.id))
 assert.ok(campaignBefore.milestones.some(row => row.id === milestone.id))
 const siblingBefore = (await read(`/api/decisions/${sibling.id}`)).decision
 const revisions = h.expected('decision', before)
 const unchanged = await mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
 const denied = await h.request(operator.session, '/api/v1/commands/launch.decision.delete', { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), input: { id: created.id }, expected: revisions }) })
 const failure = await denied.json()
 assert.equal(denied.status, 404, 'A current-version deletion without delete authority refuses without exposing the target')
 assert.equal(failure.error.code, 'not_found')
 assert.equal(Object.hasOwn(failure, 'data'), false)
 assert.deepEqual(await mutationSnapshot(h.db, { omitSessionReadTimestamp: true }), unchanged, 'Refused deletion changes no business, authority, audit, event or outbox row')
 assert.deepEqual((await read(`/api/decisions/${created.id}`)).decision, before)
 assert.deepEqual(await read(`/api/campaigns/${campaign.id}`), campaignBefore)
 assert.deepEqual((await read('/api/decisions')).items, queueBefore)

 const deleted = await submit(h.ownerSession, 'decision.delete', { id: created.id }, revisions)
 assert.deepEqual(deleted, { deletedId: created.id })
 const absent = await h.request(operator.session, `/api/decisions/${created.id}`), absentBody = await absent.json()
 assert.equal(absent.status, 404, 'Deleted decision is absent from public detail')
 assert.equal(Object.hasOwn(absentBody, 'decision'), false)
 const campaignAfter = await read(`/api/campaigns/${campaign.id}`), queueAfter = (await read('/api/decisions')).items
 assert.deepEqual(campaignAfter.decisions, campaignBefore.decisions.filter(row => row.id !== created.id), 'Campaign decisions remove only the deleted decision')
 assert.deepEqual(queueAfter, queueBefore.filter(row => row.id !== created.id), 'Decision Queue removes only the deleted decision')
 assert.deepEqual((await read(`/api/risks/${risk.id}`)).risk, riskBefore, 'Deletion leaves every linked-risk business field unchanged')
 assert.deepEqual((await read(`/api/decisions/${sibling.id}`)).decision, siblingBefore, 'Deletion leaves the sibling decision linked to the risk unchanged')
 for (const key of ['deliverables', 'milestones', 'risks']) assert.deepEqual(campaignAfter[key], campaignBefore[key], `Deletion leaves sibling ${key} unchanged`)
 assert.deepEqual(campaignAfter.campaign, { ...campaignBefore.campaign, unresolvedDecisionCount: campaignBefore.campaign.unresolvedDecisionCount - 1 }, 'Only the derived unresolved count changes on the campaign')
}
