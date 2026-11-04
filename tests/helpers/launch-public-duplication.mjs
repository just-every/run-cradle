import assert from 'node:assert/strict'
import { createUlid, LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'
import { recordComment, recordThread } from './record-comment-command.mjs'

const revision = (kind, row) => [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities[kind], recordId: row.id }, version: row.version }]
const pick = (row, fields) => Object.fromEntries(fields.map(field => [field, row[field]]))
const all = async (db, sql, ...values) => (await db.prepare(sql).bind(...values).all()).results

// Expectations are authored calendar dates, including a leap day and month
// boundary. Neither the production date shifter nor source readback derives them.
const dates = [
 { start: '2028-02-20', launch: '2028-02-28', custom: '2028-02-29', due: '2028-02-27', predecessor: ['2028-02-23', '2028-02-25'], successor: '2028-02-26' },
 { start: '2028-02-23', launch: '2028-03-02', custom: '2028-03-03', due: '2028-03-01', predecessor: ['2028-02-26', '2028-02-28'], successor: '2028-02-29' },
]

/** A populated plan enters and leaves through native HTTP. The browser supplies
 * only the duplicate action so the same checks exercise the shipped control. */
export async function verifyPublicCampaignDuplication({ h, namespace, completeAnalysis, duplicate, onCopy = async () => {} }) {
 const read = async route => {
  const response = await h.request(h.ownerSession, route)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
 }
 const command = async (action, input, expected = []) => {
  const response = await h.request(h.ownerSession, `/api/v1/commands/launch.${action}`, { method: 'POST', body: JSON.stringify({ commandId: createUlid(), expected, input }) })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result.error))
  return { commandId: result.data.commandId, value: result.data.value }
 }
 const create = async (action, input, expected) => (await command(action, input, expected)).value
 // Leave real event automations enabled during copying, after source work has
 // been consumed. A missing event is checked in durable storage and queue replay.
 const control = await create('campaign.create', { fields: { code: `DUP-CONTROL-${namespace}`, name: 'Unrelated duplication control', ownerId: h.owner, startDate: '2028-01-01', launchDate: '2028-01-02', objective: 'Unrelated work stays intact', statusSummary: 'Control', phase: 'Planning', status: 'On track', health: 62, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} } })
 const automation = await create('automation.save', { definition: { name: `Duplication control ${namespace}`, enabled: true, trigger: { kind: 'event', event: 'campaign.created.v1' }, actions: [{ command: 'add-activity', input: { campaignId: control.id, message: 'Source creation control fired' } }] } })
 const custom = {}
 for (const [key, type] of [['date', 'date'], ['text', 'text'], ['number', 'number'], ['boolean', 'boolean']]) custom[key] = await create('custom-field.save', { field: { name: `Duplication ${key} ${namespace}`, type } })
 const customValues = { [custom.date.id]: '2028-02-29', [custom.text.id]: 'Reviewed reusable plan', [custom.number.id]: '23.5', [custom.boolean.id]: true }
 const fields = { code: `DUP-SOURCE-${namespace}`, name: 'Reusable launch plan', ownerId: h.owner, startDate: '2028-02-20', launchDate: '2028-02-28', objective: 'Ship the reviewed release', statusSummary: 'Supplier review complete', phase: 'Build', status: 'At risk', health: 73, budgetMinor: 145900, spendMinor: 28400, tags: ['Reusable', 'Reviewed'], customFields: customValues }
 const source = await create('campaign.create', { fields })
 const dated = await create('deliverable.create', { fields: { campaignId: source.id, title: 'Reviewed release kit', ownerId: h.owner, dueDate: '2028-02-27' } })
 let undated = await create('deliverable.create', { fields: { campaignId: source.id, title: 'Completed undated checklist', ownerId: h.owner, dueDate: null } })
 undated = await create('deliverable.complete', { id: undated.id }, revision('deliverable', undated))
 let predecessor = await create('milestone.create', { fields: { campaignId: source.id, title: 'Reusable review', ownerId: h.owner, type: 'Review', status: 'Not started', startDate: '2028-02-23', endDate: '2028-02-25', conflictReason: null } })
 predecessor = await create('milestone.patch', { id: predecessor.id, changes: { status: 'On track' } }, revision('milestone', predecessor))
 let successor = await create('milestone.create', { fields: { campaignId: source.id, title: 'Reusable approval', ownerId: h.owner, type: 'Approval', status: 'Not started', startDate: '2028-02-26', endDate: null, conflictReason: null } })
 successor = await create('milestone.patch', { id: successor.id, changes: { status: 'Watch', conflictReason: 'Keep the reviewed sequence' } }, revision('milestone', successor))
 successor = await create('milestone.set-predecessors', { id: successor.id, predecessorIds: [predecessor.id] }, revision('milestone', successor))
 const risk = await create('risk.create', { fields: { campaignId: source.id, title: 'Source-only risk', ownerId: h.owner, severity: 'High', dueDate: null, signal: 'Source-only signal', mitigation: 'Source-only mitigation' } })
 const person = await h.addPerson({ name: 'Duplication notice recipient' })
 const decision = await create('decision.create', { fields: { campaignId: source.id, riskId: risk.id, supersedesId: null, title: 'Source-only decision', requesterId: h.owner, assigneeId: person.id, priority: 'High', dueAt: '2028-02-27T12:00:00.000Z', recommendation: 'Keep source history', impact: 'Source only' } })
 const comment = await recordComment(h, 'comment.add', { campaignId: source.id, body: 'Source-only discussion', mentions: [person.id] }, revision('campaign', source))
 const analysisId = await completeAnalysis(source.id)
 const analysis = (await read(`/api/v1/launch/analyses/${analysisId}`)).data
 assert.ok(analysis.content.length > 0, 'A completed source analysis is publicly readable')
 const before = await read(`/api/campaigns/${source.id}`)
 assert.ok(before.activity.some(item => item.type === 'campaign.created'), 'Historical source activity is populated')
 assert.deepEqual(before.risks.map(item => item.id), [risk.id])
 assert.deepEqual(before.decisions.map(item => item.id), [decision.id])
 const thread = await recordThread(h, revision('campaign', source)[0].ref)
 assert.equal(thread.items.find(item => item.id === comment.id).body, 'Source-only discussion')
 const notices = await h.request(person.session, '/api/notifications')
 assert.equal(notices.status, 200)
 assert.ok((await notices.json()).notifications.some(item => item.subject.id === source.id), 'The source has a real publicly readable mention notice')
 assert.ok((await read(`/api/automations/${automation.id}/runs`)).runs.length > 0, 'The enabled automation really ran for source creation')
 const sourceRows = async () => {
  const result = {}
  for (const table of ['campaigns', 'deliverables', 'milestones', 'risks', 'decisions', 'campaign_tags', 'launch_custom_values', 'activity_entries', 'channel_notifications']) result[table] = await all(h.db, `SELECT * FROM ${table} WHERE ${table === 'campaigns' ? 'id' : 'campaign_id'}=? ORDER BY 1`, source.id)
  result.comments = await all(h.db, 'SELECT * FROM evidence_comments WHERE record_id=? ORDER BY id', source.id)
  result.analyses = await all(h.db, 'SELECT * FROM launch_analyses WHERE subject_id=? ORDER BY id', source.id)
  result.dependencies = await all(h.db, 'SELECT * FROM milestone_dependencies WHERE milestone_id=? ORDER BY id', successor.id)
  return result
 }
 const original = await sourceRows()
 const effects = async () => {
  const result = {}
  for (const table of ['admission_events', 'admission_outbox', 'automation_runs', 'notifications', 'channel_notifications', 'channel_deliveries']) result[table] = await all(h.db, `SELECT * FROM ${table} ORDER BY 1`)
  return result
 }
 const effectsBefore = await effects(), allIds = new Set([source.id, dated.id, undated.id, predecessor.id, successor.id])
 const copies = []
 for (const [index, expectedDates] of dates.entries()) {
  const input = { id: source.id, newCode: `DUP-${index ? 'SHIFT' : 'SAME'}-${namespace}`, ...(index ? { newLaunchDate: '2028-03-02' } : {}) }
  const result = duplicate ? await duplicate({ source, input, expectedDates }) : await command('campaign.duplicate', input, revision('campaign', source))
  assert.match(result.commandId, /^[0-9A-HJKMNP-TV-Z]{26}$/, 'Queue replay names the committed duplicate command')
  const copy = await read(`/api/campaigns/${result.value.id}`), campaign = copy.campaign
  assert.equal(allIds.has(campaign.id), false, 'Each campaign has a fresh identity')
  allIds.add(campaign.id)
  assert.equal(campaign.code, input.newCode)
  assert.deepEqual(pick(campaign, ['name', 'objective', 'phase', 'status', 'health', 'budgetMinor', 'spendMinor']), pick(fields, ['name', 'objective', 'phase', 'status', 'health', 'budgetMinor', 'spendMinor']))
  assert.equal(campaign.summary, 'Supplier review complete')
  assert.equal(campaign.owner.id, h.owner)
  assert.deepEqual([...campaign.tags].sort(), ['Reusable', 'Reviewed'])
  assert.equal(campaign.startDate, expectedDates.start)
  assert.equal(campaign.launchDate, expectedDates.launch)
  for (const [id, value] of Object.entries({ ...customValues, [custom.date.id]: expectedDates.custom })) assert.deepEqual(copy.customFields.find(field => field.id === id)?.value, value, 'Public custom values are exact')
  assert.equal(copy.deliverables.length, 2)
  assert.equal(copy.milestones.length, 2)
  for (const child of [...copy.deliverables, ...copy.milestones]) {
   assert.equal(allIds.has(child.id), false, 'Every copied child has an independent identity')
   allIds.add(child.id)
   assert.equal(child.owner.id, h.owner)
   assert.equal(child.version, 1)
  }
  for (const [title, state, dueDate] of [['Reviewed release kit', 'Open', expectedDates.due], ['Completed undated checklist', 'Complete', null]]) assert.deepEqual(pick(copy.deliverables.find(item => item.title === title), ['title', 'state', 'dueDate']), { title, state, dueDate })
  const first = copy.milestones.find(item => item.title === 'Reusable review'), next = copy.milestones.find(item => item.title === 'Reusable approval')
  assert.deepEqual(pick(first, ['type', 'status', 'startDate', 'endDate']), { type: 'Review', status: 'On track', startDate: expectedDates.predecessor[0], endDate: expectedDates.predecessor[1] })
  assert.deepEqual(pick(next, ['type', 'status', 'startDate', 'endDate']), { type: 'Approval', status: 'Watch', startDate: expectedDates.successor, endDate: null })
  const milestone = (await read(`/api/milestones/${next.id}`)).milestone
  assert.equal(milestone.campaign.id, campaign.id)
  assert.equal(milestone.conflictReason, 'Keep the reviewed sequence')
  assert.deepEqual(milestone.predecessors, [{ id: first.id, title: 'Reusable review' }], 'Public dependency endpoints belong to this copy')
  assert.deepEqual((await read(`/api/milestones/${first.id}`)).milestone.predecessors, [])
  assert.deepEqual(copy.risks, [])
  assert.deepEqual(copy.decisions, [])
  for (const table of ['risks', 'decisions']) assert.deepEqual(await all(h.db, `SELECT id FROM ${table} WHERE campaign_id=?`, campaign.id), [], 'Excluded records are absent even outside active projections')
  assert.deepEqual((await recordThread(h, revision('campaign', campaign)[0].ref)).items, [])
  assert.ok(copy.activity.length > 0, 'Fresh duplication activity exists')
  assert.ok(copy.activity.every(item => item.type === 'campaign.duplicated' && item.subjectId === campaign.id && !before.activity.some(old => old.id === item.id)), 'No source historical activity is copied')
  assert.ok(copy.activity.every(item => item.actionId === result.commandId && item.actor.id === h.owner), 'Fresh duplication activity belongs to this command and operator')
  assert.deepEqual(await all(h.db, 'SELECT id FROM launch_analyses WHERE subject_id=?', campaign.id), [])
  assert.deepEqual(await all(h.db, 'SELECT notification_id FROM channel_notifications WHERE campaign_id=?', campaign.id), [])
  assert.deepEqual(await effects(), effectsBefore, 'Duplication adds no event, queued command, run, notification or delivery')
  await (await h.runtime.getWorker()).queue('cradle-work', [1, 2].map(attempt => ({ id: createUlid(), timestamp: Date.now(), attempts: attempt, body: { kind: 'cradle.launch.events.v1', commandId: result.commandId } })))
  assert.deepEqual(await effects(), effectsBefore, 'Real event queue delivery and replay add no automation work')
  await onCopy({ copy, milestone, expectedDates, input })
  copies.push({ id: campaign.id, code: campaign.code, dates: expectedDates })
 }
 assert.deepEqual(await read(`/api/campaigns/${source.id}`), before, 'Public source work is unchanged')
 assert.deepEqual((await recordThread(h, revision('campaign', source)[0].ref)).items, thread.items)
 assert.deepEqual((await read(`/api/v1/launch/analyses/${analysisId}`)).data, analysis)
 assert.deepEqual(await sourceRows(), original, 'All populated source records and their stored bytes are unchanged')
 return { sourceId: source.id, copies, automationId: automation.id, sourceUnchanged: true, eventQueueReplay: true }
}
