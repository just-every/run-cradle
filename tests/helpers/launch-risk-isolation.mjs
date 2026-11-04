import assert from 'node:assert/strict'

// Public commands author every business control. Raw snapshots supplement the
// complete public record values, including fields absent from the Launch cards.
export async function verifyPublicRiskIsolation(h, { read, command, snapshot, checkpoint = async () => {} }) {
 const recipient = await h.addPerson({ name: 'Isolation campaign owner' })
 const create = async (kind, fields) => (await command(h.ownerSession, `${kind}.create`, { fields })).value
 const campaigns = []
 for (const [index, code] of ['ISO-TARGET', 'ISO-CONTROL'].entries()) campaigns.push(await create('campaign', {
  code, name: `${code} supplier launch`, ownerId: recipient.id, startDate: '2099-01-05', launchDate: '2099-06-20',
  objective: `Supplier objective ${index}`, statusSummary: `Reviewed summary ${index}`, phase: 'Planning', status: 'On track',
  health: 63 + index, budgetMinor: 450000 + index, spendMinor: 120000 + index, tags: [`Isolation ${index}`], customFields: {},
 }))
 const campaign = campaigns[0], controls = campaigns.map(row => ['campaign', row])
 const riskFields = (row, title, severity) => ({ campaignId: row.id, title, ownerId: recipient.id, severity, dueDate: '2099-04-20', signal: `${title} evidence`, mitigation: `${title} mitigation` })
 const decisionFields = (row, title, riskId = null) => ({ campaignId: row.id, riskId, supersedesId: null, title, requesterId: h.actor, assigneeId: null, priority: 'High', dueAt: '2099-05-01T12:00:00.000Z', recommendation: `${title} recommendation`, impact: `${title} impact` })
 for (const [index, row] of campaigns.entries()) {
  controls.push(['risk', await create('risk', riskFields(row, `${row.code} control risk`, index ? 'High' : 'Medium'))])
  controls.push(['deliverable', await create('deliverable', { campaignId: row.id, title: `${row.code} artwork`, ownerId: recipient.id, dueDate: '2099-03-15' })])
  controls.push(['milestone', await create('milestone', { campaignId: row.id, title: `${row.code} review`, ownerId: recipient.id, type: 'Review', status: 'Not started', startDate: '2099-03-10', endDate: '2099-03-12', conflictReason: 'Supplier review note' })])
  controls.push(['decision', await create('decision', decisionFields(row, `${row.code} unrelated decision`))])
 }
 let risk = await create('risk', riskFields(campaign, 'Supplier capacity', 'High'))
 const prior = await create('decision', decisionFields(campaign, 'Earlier capacity decision', risk.id))
 await command(h.ownerSession, 'decision.outcome', { id: prior.id, outcome: 'Rejected', rationale: 'Await fresh capacity evidence' }, h.expected('decision', prior))
 controls.push(['decision', prior])
 const record = async (kind, row) => (await read(`/api/v1/apps/${h.r.LAUNCH_APP_ID}/entities/${h.r.launchEntities[kind]}/records/${row.id}`)).data.record
 const publicControls = () => Promise.all(controls.map(([kind, row]) => record(kind, row)))
 const baseline = await publicControls()
 for (const [index, [kind, row]] of controls.entries()) {
  assert.equal(baseline[index].id, row.id)
  assert.ok(baseline[index].version >= 1)
  for (const id of Object.values(h.r.launchFieldIds[kind])) assert.equal(baseline[index].fields[id]?.state, 'value', 'Every control business field is publicly readable')
 }
 const otherBefore = await read(`/api/campaigns/${campaigns[1].id}`)
 const campaignBefore = (await read(`/api/campaigns/${campaign.id}`)).campaign
 const linkedBefore = await record('decision', prior)
 const inbox = async session => {
  const notices = []; let cursor = null, result
  do {
   result = await read(`/api/notifications?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, session)
   notices.push(...result.notifications); cursor = result.cursor
  } while (cursor !== null)
  return { notifications: notices, unreadCount: result.unreadCount, total: result.total }
 }
 const activityRows = async () => (await h.db.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results
 const transition = (entries, receipt, subjectId, field, previousValue, nextValue) => {
  const matches = entries.filter(entry => entry.actionId === receipt.commandId && entry.subjectId === subjectId && entry.fieldName === field)
  assert.equal(matches.length, 1, `One command-correlated ${field} activity entry`)
  assert.equal(matches[0].previousValue, previousValue)
  assert.equal(matches[0].nextValue, nextValue)
 }
 let createdDecision, createdNotice, createdDecisionBefore
 const steps = [
  { action: 'risk.patch', input: { changes: { severity: 'Critical', dueDate: '2099-04-22', signal: 'Confirmed capacity shortfall', mitigation: 'Reserve alternate capacity' } }, changes: { severity: 'Critical', dueDate: '2099-04-22', signal: 'Confirmed capacity shortfall', mitigation: 'Reserve alternate capacity' }, rating: 'Critical', activity: [['severity', 'High', 'Critical'], ['due_date', '2099-04-20', '2099-04-22'], ['signal', 'Supplier capacity evidence', 'Confirmed capacity shortfall'], ['mitigation', 'Supplier capacity mitigation', 'Reserve alternate capacity']] },
  { action: 'risk.escalate', input: { reason: 'Approve alternate capacity' }, changes: { state: 'Escalated' }, rating: 'Critical', activity: [['state', 'Watching', 'Escalated'], ['escalation_reason', null, 'Approve alternate capacity']] },
  { action: 'risk.resolve', input: { resolutionNote: 'Alternate capacity confirmed' }, changes: { state: 'Resolved', resolutionNote: 'Alternate capacity confirmed', resolvedById: h.actor }, rating: 'Medium', activity: [['state', 'Escalated', 'Resolved'], ['resolution_note', null, 'Alternate capacity confirmed']] },
 ]
 for (const step of steps) {
  const beforeRisk = (await read(`/api/risks/${risk.id}`)).risk
  const before = await snapshot(risk.id), oldActivity = await activityRows()
  const ownerInbox = await inbox(recipient.session), actorInbox = await inbox(h.ownerSession)
  const receipt = await command(h.ownerSession, step.action, { id: risk.id, ...step.input }, h.expected('risk', beforeRisk))
  const detail = await read(`/api/risks/${risk.id}`), currentCampaign = await read(`/api/campaigns/${campaign.id}`)
  risk = detail.risk
  const expectedRisk = { ...beforeRisk, ...step.changes, version: beforeRisk.version + 1 }
  if (step.action === 'risk.resolve') {
   const at = Date.parse(risk.resolvedAt)
   assert.ok(at >= receipt.started && at <= receipt.finished, 'Resolution time is inside the independent command window')
   expectedRisk.resolvedAt = risk.resolvedAt
  }
  assert.deepEqual(risk, expectedRisk, `${step.action} changes exactly its risk fields and one version`)
  const returned = step.action === 'risk.escalate' ? receipt.value.risk : receipt.value
  for (const key of ['id', 'title', 'severity', 'state', 'dueDate', 'signal', 'mitigation', 'version']) assert.equal(returned[key], risk[key], 'Independent risk detail agrees with the command response')
  assert.equal(currentCampaign.campaign.riskRating, step.rating)
  assert.deepEqual(currentCampaign.campaign, { ...campaignBefore, riskRating: step.rating, unresolvedDecisionCount: campaignBefore.unresolvedDecisionCount + (step.action === 'risk.patch' ? 0 : 1) }, 'Only the expected campaign rollups change; stored business values and version stay exact')
  assert.deepEqual(await publicControls(), baseline, `${step.action} preserves every complete public control record and version`)
  assert.deepEqual(await read(`/api/campaigns/${campaigns[1].id}`), otherBefore, 'The unrelated campaign and its complete public children and activity remain unchanged')
  assert.deepEqual(await record('decision', prior), linkedBefore, 'The pre-existing linked decision remains unchanged')
  const entries = currentCampaign.activity.filter(entry => entry.actionId === receipt.commandId)
  assert.ok(entries.length > 0)
  for (const [field, previousValue, nextValue] of step.activity) transition(entries, receipt, risk.id, field, previousValue, nextValue)
  for (const entry of entries) {
   assert.equal(entry.actor?.id, h.actor)
   assert.ok(Date.parse(entry.occurredAt) >= receipt.started && Date.parse(entry.occurredAt) <= receipt.finished)
  }
  const after = await snapshot(risk.id), nextOwnerInbox = await inbox(recipient.session)
  if (step.action === 'risk.escalate') {
   createdDecision = receipt.value.decision
   assert.ok(createdDecision, 'Critical escalation creates its expected linked decision')
   assert.equal(detail.decision.id, createdDecision.id)
   const decision = (await read(`/api/decisions/${createdDecision.id}`)).decision
   assert.equal(decision.risk.id, risk.id)
   assert.equal(decision.campaign.id, campaign.id)
   for (const [key, value] of Object.entries({ title: 'Resolve Critical risk: Supplier capacity', priority: 'Critical', state: 'Awaiting approval', version: 1, recommendation: 'Approve alternate capacity', impact: 'Confirmed capacity shortfall' })) assert.equal(decision[key], value)
   assert.equal(decision.assignee.id, recipient.id)
   assert.equal(decision.requester.id, h.actor)
   createdDecisionBefore = await record('decision', createdDecision)
   transition(entries, receipt, createdDecision.id, 'state', null, 'Awaiting approval')
   const oldIds = new Set(ownerInbox.notifications.map(row => row.id)), notices = nextOwnerInbox.notifications.filter(row => !oldIds.has(row.id))
   assert.equal(notices.length, 1, 'Exactly one new in-app notice reaches the campaign owner')
   createdNotice = notices[0]
   assert.equal(createdNotice.kind, 'critical-risk-escalated')
   assert.equal(createdNotice.version, 1)
   assert.equal(createdNotice.readAt, null)
   assert.equal(createdNotice.subject.id, risk.id)
   assert.equal(createdNotice.subject.available, true)
   assert.equal(createdNotice.subject.href, `/app/risks/${risk.id}`)
   assert.equal(nextOwnerInbox.unreadCount, ownerInbox.unreadCount + 1)
   assert.equal(nextOwnerInbox.total, ownerInbox.total + 1)
   assert.deepEqual(nextOwnerInbox.notifications.filter(row => oldIds.has(row.id)), ownerInbox.notifications, 'Pre-existing owner notices remain exact')
   // Permit only the new policy records; no table or old row is excluded.
   for (const [table, field, id] of [['decisions', 'id', createdDecision.id], ['notifications', 'id', createdNotice.id], ['channel_notifications', 'notification_id', createdNotice.id], ['channel_deliveries', 'notification_id', createdNotice.id], ['channel_events', 'notification_id', createdNotice.id]]) {
    const additions = after[table].filter(row => row[field] === id)
    assert.equal(additions.length, 1, `Exactly one expected ${table} row`)
    if (table === 'notifications' || table === 'channel_events') assert.equal(additions[0].operator_id, recipient.id)
    if (table === 'channel_events') assert.equal(additions[0].event_id, receipt.commandId)
    after[table] = after[table].filter(row => row[field] !== id)
   }
  } else {
   assert.deepEqual(nextOwnerInbox, ownerInbox, `${step.action} creates or changes no owner notification`)
   if (createdDecision) assert.deepEqual(await record('decision', createdDecision), createdDecisionBefore, 'Risk resolution leaves its unresolved linked decision intact')
  }
  assert.deepEqual(await inbox(h.ownerSession), actorInbox, 'No notification is created for the actor or another recipient')
  assert.deepEqual(after, before, `${step.action} preserves all unrelated stored business records and existing notifications`)
  const currentActivity = await activityRows(), oldIds = new Set(oldActivity.map(entry => entry.id))
  assert.deepEqual(currentActivity.filter(entry => oldIds.has(entry.id)), oldActivity, 'All previous stored activity remains immutable')
  const added = currentActivity.filter(entry => !oldIds.has(entry.id)), publicIds = new Set(entries.map(entry => entry.id))
  assert.equal(added.length, entries.length, 'Every new stored activity entry is visible in the command-correlated campaign activity')
  for (const entry of added) {
   assert.ok(publicIds.has(entry.id))
   assert.equal(entry.campaign_id, campaign.id)
   assert.equal(entry.actor_id, h.actor)
   assert.ok([risk.id, step.action === 'risk.escalate' ? createdDecision.id : risk.id].includes(entry.subject_id), 'Activity only concerns the changed risk and the one new policy decision')
  }
  const retained = (await read(`/api/v1/commands/${receipt.commandId}`)).data
  assert.equal(retained.state, 'committed')
  assert.deepEqual(retained.result, receipt.value)
  console.log(`PROBE RISK-004 ${step.action}: native command and public detail, campaign activity and inbox -> ${risk.state}, rating ${step.rating}, unrelated values and versions unchanged; new decisions=${step.action === 'risk.escalate' ? 1 : 0}, new notices=${step.action === 'risk.escalate' ? 1 : 0}`)
  await checkpoint({ action: step.action, risk, campaign, recipient, decision: createdDecision, notice: createdNotice })
 }
}
