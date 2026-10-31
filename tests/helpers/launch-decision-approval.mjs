import assert from 'node:assert/strict'
import { mutationSnapshot } from './launch-write-context.mjs'

/** Attribute one approval through native commands and independent public reads. */
export async function verifyPublicDecisionApproval(h, campaign, fields) {
 const approverName = 'Decision approval operator'
 const approver = await h.addPerson({ name: approverName })
 assert.notEqual(approver.id, h.actor, 'The approver is distinct from the requester')
 const read = async (route, session = approver.session) => {
  const response = await h.request(session, route), body = await response.json()
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`)
  return body
 }
 const command = async (session, action, input, expected = []) => {
  const commandId = h.r.createUlid(), started = Date.now()
  const response = await h.request(session, `/api/v1/commands/launch.${action}`, { method: 'POST', body: JSON.stringify({ commandId, input, expected }) })
  const finished = Date.now(), body = await response.json()
  assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`)
  assert.equal(body.data.state, 'committed')
  return { commandId, started, finished, value: body.data.value }
 }
 const createdRisk = await command(h.ownerSession, 'risk.create', { fields: { campaignId: campaign.id, title: 'Public approval linked risk', ownerId: h.actor, severity: 'High', dueDate: null, signal: 'Review required', mitigation: 'Operator approval' } })
 const riskId = createdRisk.value.id
 await command(h.ownerSession, 'risk.escalate', { id: riskId, reason: 'Approval required' }, h.expected('risk', createdRisk.value))
 const riskBefore = (await read(`/api/risks/${riskId}`)).risk
 assert.equal(riskBefore.state, 'Escalated')
 const created = await command(h.ownerSession, 'decision.create', { fields: fields({ riskId, title: 'Public attributed approval' }) })
 const id = created.value.id
 const control = await command(h.ownerSession, 'decision.create', { fields: fields({ title: 'Unresolved queue control' }) })
 const before = (await read(`/api/decisions/${id}`)).decision
 assert.equal(before.state, 'Awaiting approval')
 assert.equal(before.requester.id, h.actor)
 assert.equal(before.risk.id, riskId)
 const queueBefore = (await read('/api/decisions')).items
 for (const decisionId of [id, control.value.id]) assert.ok(queueBefore.some(row => row.id === decisionId), 'Both unresolved decisions are publicly queued before approval')

 const rationale = 'Reviewed the supplier evidence and approved the plan'
 const approved = await command(approver.session, 'decision.outcome', { id, outcome: 'Approved', rationale }, h.expected('decision', before))
 const within = instant => {
  const time = Date.parse(instant)
  assert.ok(Number.isFinite(time) && time >= approved.started && time <= approved.finished, 'Outcome time lies within independent request bounds')
 }
 assert.equal(approved.value.id, id)
 assert.equal(approved.value.state, 'Approved')
 assert.equal(approved.value.rationale, rationale)
 assert.equal(approved.value.requesterId, h.actor)
 assert.equal(approved.value.outcomeById, approver.id)
 within(approved.value.outcomeAt)
 assert.equal(approved.value.version, before.version + 1)
 const retained = (await read(`/api/v1/commands/${approved.commandId}`)).data
 assert.equal(retained.state, 'committed')
 assert.deepEqual(retained.result, approved.value, 'Public command status retains the same attributed outcome')

 const detail = (await read(`/api/decisions/${id}`)).decision
 assert.equal(detail.state, 'Approved')
 assert.equal(detail.rationale, rationale)
 assert.equal(detail.version, approved.value.version)
 assert.equal(detail.requester.id, h.actor)
 const riskAfter = (await read(`/api/risks/${riskId}`)).risk
 assert.deepEqual(riskAfter, { ...riskBefore, state: 'In progress', version: riskBefore.version + 1 }, 'Approval moves the linked risk to In progress without resolving it or changing other fields')
 assert.equal(riskAfter.resolvedAt, null)
 assert.equal(riskAfter.resolvedById, null)
 assert.equal(riskAfter.resolutionNote, null)
 const campaignAfter = await read(`/api/campaigns/${campaign.id}`)
 for (const [subjectId, previousValue, nextValue] of [[id, 'Awaiting approval', 'Approved'], [riskId, 'Escalated', 'In progress']]) {
  const entries = campaignAfter.activity.filter(entry => entry.actionId === approved.commandId && entry.subjectId === subjectId && entry.fieldName === 'state')
  assert.equal(entries.length, 1, 'One activity transition belongs to the same committed approval')
  assert.equal(entries[0].actor.id, approver.id)
  assert.equal(entries[0].actor.name, approverName)
  assert.equal(entries[0].previousValue, previousValue)
  assert.equal(entries[0].nextValue, nextValue)
  within(entries[0].occurredAt)
 }
 const queueAfter = (await read('/api/decisions')).items
 assert.equal(queueAfter.some(row => row.id === id), false, 'Approved decision leaves Decision Queue')
 assert.ok(queueAfter.some(row => row.id === control.value.id), 'The unrelated unresolved decision remains queued')
 assert.equal(campaignAfter.decisions.some(row => row.id === id), false)
 assert.ok(campaignAfter.decisions.some(row => row.id === control.value.id))

 const narrowed = approver.rules.map(rule => rule.entityId === h.r.launchEntities.decision ? { ...rule, readableFields: rule.readableFields.filter(field => field !== h.r.launchFieldIds.decision.state) } : rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrowed), approver.policyId).run()
 const unchanged = await mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
 for (const [route, init] of [
  [`/api/v1/commands/${approved.commandId}`, {}],
  ['/api/v1/commands/launch.decision.outcome', { method: 'POST', body: JSON.stringify({ commandId: approved.commandId, input: { id, outcome: 'Approved', rationale }, expected: h.expected('decision', before) }) }],
 ]) {
  const response = await h.request(approver.session, route, init), body = await response.json()
  assert.equal(response.status, 403, 'Current read authority fences retained approval attribution and captured replay')
  assert.equal(Object.hasOwn(body, 'data'), false)
 }
 assert.deepEqual(await mutationSnapshot(h.db, { omitSessionReadTimestamp: true }), unchanged, 'Refused receipt reads and replay change nothing')
}
