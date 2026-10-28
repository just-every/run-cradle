import {recordComment,recordThread,commentNotices} from './record-comment-command.mjs'
import assert from 'node:assert/strict'

const productTables = ['campaigns', 'deliverables', 'milestones', 'risks', 'decisions', 'evidence_comments', 'campaign_tags', 'launch_custom_values', 'notifications', 'channel_events', 'channel_notifications', 'channel_deliveries', 'activity_entries', 'automation_runs', 'launch_analyses', 'launch_analysis_requests', 'launch_model_calls', 'command_admissions', 'admission_audit', 'admission_events', 'admission_outbox']
async function snapshot(db, tables = productTables) {
 const rows = await db.batch(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`)))
 return Object.fromEntries(tables.map((table, index) => [table, rows[index].results]))
}
const fields = (h, campaign, changes = {}) => ({ campaignId: campaign.id, riskId: null, supersedesId: null, title: 'Launch approval', requesterId: h.actor, assigneeId: null, priority: 'High', dueAt: new Date(Date.parse(h.ctx.now) + 86400000).toISOString(), recommendation: 'Proceed after review', impact: 'Launch readiness', ...changes })
async function rejectsUnchanged(h, action, input, expected = [], code = 'validation') {
 const before = await snapshot(h.db)
 await assert.rejects(async () => h.prepare(action, input, expected), error => error.code === code || code === 'validation' && error.name === 'ZodError', action)
 assert.deepEqual(await snapshot(h.db), before, `${action} rejection leaves all product, audit, event and outbox records unchanged`)
}
async function readHttp(h, route) {
 const response = await h.request(h.ownerSession, route)
 assert.equal(response.status, 200, route)
 return response.json()
}
async function activity(h, row, field, value, actor = h.actor) {
 const entries = (await h.db.prepare('SELECT * FROM activity_entries WHERE subject_id=? AND field_name=?').bind(row.id, field).all()).results
 assert.ok(entries.some(entry => entry.actor_id === actor && entry.created_at === Date.parse(h.ctx.now) && entry.next_value === value), `${field} records its actor, time and value`)
}

async function records(h, reader, campaign, other) {
 const create = changes => h.commit('decision.create', { fields: fields(h, campaign, changes) })
 for (const priority of ['Critical', 'High', 'Medium', 'Low']) {
  let row = await create({ priority, title: priority + ' approval' })
  assert.equal(row.state, 'Awaiting approval')
  assert.equal(row.priority, priority)
  assert.equal(row.requesterId, h.actor)
  assert.equal(row.assigneeId, null)
  assert.equal(row.campaignId, campaign.id)
  row = await h.commit('decision.patch', { id: row.id, changes: { title: 'Edited ' + priority, recommendation: 'Revised recommendation', impact: 'Revised impact', dueAt: new Date(Date.parse(row.dueAt) + 3600000).toISOString() } }, h.expected('decision', row))
  const detail = await reader.get(h.ctx, 'decision', row.id)
  for (const [key, value] of Object.entries(row)) assert.deepEqual(detail[key], value)
  assert.equal((await readHttp(h, `/api/decisions/${row.id}`)).decision.title, row.title)
  assert.ok((await readHttp(h, '/api/decisions')).items.some(item => item.id === row.id && item.title === row.title))
  assert.ok((await readHttp(h, `/api/campaigns/${campaign.id}`)).decisions.some(item => item.id === row.id && item.title === row.title))
  await h.commit('decision.delete', { id: row.id }, h.expected('decision', row))
  await assert.rejects(reader.get(h.ctx, 'decision', row.id), error => error.code === 'not_found')
  assert.equal((await readHttp(h, '/api/decisions')).items.some(item => item.id === row.id), false)
 }
 const risk = await h.commit('risk.create', { fields: { campaignId: other.id, title: 'Other campaign risk', ownerId: h.actor, severity: 'High', dueDate: null, signal: '', mitigation: '' } })
 const another = await h.commit('decision.create', { fields: fields(h, other) })
 for (const changes of [{ title: ' \t' }, { requesterId: null }, { requesterId: h.r.createUlid() }, { campaignId: null }, { campaignId: h.r.createUlid() }, { priority: 'Urgent' }, { dueAt: 'tomorrow' }, { riskId: [risk.id] }, { supersedesId: [another.id] }, { riskId: risk.id }, { supersedesId: another.id }, { state: 'Approved' }]) await rejectsUnchanged(h, 'decision.create', { fields: fields(h, campaign, changes) })
 for (const key of ['title', 'requesterId', 'campaignId', 'dueAt', 'recommendation', 'impact']) {
  const missing = fields(h, campaign); delete missing[key]
  await rejectsUnchanged(h, 'decision.create', { fields: missing })
 }
}

async function outcomes(h, reader, campaign) {
 const create = changes => h.commit('decision.create', { fields: fields(h, campaign, changes) })
 const getRisk = row => reader.get(h.ctx, 'risk', row.id)
 const risk = await h.commit('risk.create', { fields: { campaignId: campaign.id, title: 'Decision policy risk', ownerId: h.actor, severity: 'High', dueDate: null, signal: 'Review evidence', mitigation: 'Owner review' } })
 await h.commit('risk.escalate', { id: risk.id, reason: 'Needs an operator outcome' }, h.expected('risk', risk))
 let row = await create({ riskId: risk.id })
 const originalRisk = await getRisk(risk)
 row = await h.commit('decision.patch', { id: row.id, changes: { recommendation: 'Updated recommendation' } }, h.expected('decision', row))
 assert.deepEqual(await getRisk(risk), originalRisk, 'Editing a linked decision never changes its risk')
 for (const input of [{ rationale: '' }, { rationale: ' \t\n' }]) await rejectsUnchanged(h, 'decision.request-change', { id: row.id, ...input }, h.expected('decision', row))
 row = await h.commit('decision.request-change', { id: row.id, rationale: 'Please attach current evidence' }, h.expected('decision', row))
 assert.equal(row.state, 'In review')
 assert.equal(row.rationale, 'Please attach current evidence')
 await activity(h, row, 'state', 'In review')
 assert.equal((await readHttp(h, `/api/decisions/${row.id}`)).decision.state, 'In review')
 assert.ok((await readHttp(h, '/api/decisions')).items.some(item => item.id === row.id && item.state === 'In review'))
 assert.deepEqual(await getRisk(risk), originalRisk, 'Requesting changes leaves the linked risk unchanged')
 await rejectsUnchanged(h, 'decision.supersede', { id: row.id, fields: fields(h, campaign) }, h.expected('decision', row))
 for (const outcome of ['Rejected', 'Cancelled']) {
  const current = outcome === 'Rejected' ? row : await create({ riskId: risk.id })
  for (const rationale of ['', ' \t\n']) await rejectsUnchanged(h, 'decision.outcome', { id: current.id, outcome, rationale }, h.expected('decision', current))
  const terminal = await h.commit('decision.outcome', { id: current.id, outcome, rationale: 'Evidence is not ready' }, h.expected('decision', current))
  assert.equal(terminal.state, outcome)
  assert.equal(terminal.outcomeById, h.actor)
  assert.equal(terminal.outcomeAt, h.ctx.now)
  await activity(h, terminal, 'rationale', 'Evidence is not ready')
  assert.deepEqual(await getRisk(risk), originalRisk, `${outcome} leaves the linked risk unchanged`)
  await finality(h, reader, campaign, terminal)
 }
 row = await create({ riskId: risk.id })
 const revisions = h.expected('decision', row)
 const approval = await h.prepare('decision.outcome', { id: row.id, outcome: 'Approved', rationale: '' }, revisions)
 const competing = await h.prepare('decision.outcome', { id: row.id, outcome: 'Rejected', rationale: 'Competing outcome' }, revisions)
 const approved = (await h.admission.commit(h.ctx, approval)).result.value
 assert.equal(approved.state, 'Approved')
 assert.equal(approved.outcomeById, h.actor)
 assert.equal(approved.outcomeAt, h.ctx.now)
 assert.equal((await getRisk(risk)).state, 'In progress')
 assert.equal((await getRisk(risk)).resolvedAt, null, 'Approval never resolves a risk')
 const settled = await snapshot(h.db)
 await assert.rejects(h.admission.commit(h.ctx, competing), error => error.code === 'version_conflict')
 assert.deepEqual(await snapshot(h.db), settled, 'A previously prepared losing outcome commits no effects')
 const stale = await h.request(h.ownerSession, '/api/v1/commands/launch.decision.outcome', { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), input: { id: row.id, outcome: 'Cancelled', rationale: 'Stale cancellation' }, expected: revisions }) })
 assert.equal(stale.status, 409)
 const failure = (await stale.json()).error
 assert.equal(failure.code, 'version_conflict')
 assert.ok(failure.message.includes(String(approved.version)), 'The stale response names the current version')
 assert.deepEqual(await snapshot(h.db), settled, 'A stale HTTP outcome changes nothing')
 assert.equal((await readHttp(h, `/api/decisions/${row.id}`)).decision.state, 'Approved')
 assert.equal((await readHttp(h, '/api/decisions')).items.some(item => item.id === row.id), false)
 assert.equal((await readHttp(h, `/api/campaigns/${campaign.id}`)).decisions.some(item => item.id === row.id), false)
 await finality(h, reader, campaign, approved)
 // The retained installed example supplies the other policy input state;
 // creating and approving its decision still use the ordinary public commands.
 const needs=(await reader.list(h.ctx,'risk',{limit:200})).items.find(row=>row.state==='Needs decision')
 assert.ok(needs,'Retained data includes a risk awaiting a decision')
 const needsCampaign=await reader.get(h.ctx,'campaign',needs.campaignId)
 const review=await h.commit('decision.create',{fields:fields(h,needsCampaign,{riskId:needs.id,title:'Review existing decision need'})})
 await h.commit('decision.outcome',{id:review.id,outcome:'Approved',rationale:''},h.expected('decision',review))
 assert.equal((await getRisk(needs)).state,'In progress')
 assert.equal((await getRisk(needs)).resolvedAt,null)
 // Approval of a linked Watching risk has no policy transition.
 const watching = await h.commit('risk.create', { fields: { campaignId: campaign.id, title: 'Watching policy risk', ownerId: h.actor, severity: 'Low', dueDate: null, signal: '', mitigation: '' } })
 const untouched = await getRisk(watching), pending = await create({ riskId: watching.id })
 await h.commit('decision.outcome', { id: pending.id, outcome: 'Approved', rationale: 'Reviewed' }, h.expected('decision', pending))
 assert.deepEqual(await getRisk(watching), untouched)
}

async function finality(h, reader, campaign, terminal) {
 for (const [action, input] of [
  ['decision.patch', { id: terminal.id, changes: { title: 'Rewrite terminal' } }],
  ['decision.outcome', { id: terminal.id, outcome: terminal.state === 'Approved' ? 'Rejected' : 'Approved', rationale: 'Rewrite terminal' }],
  ['decision.request-change', { id: terminal.id, rationale: 'Reopen terminal' }],
  ['decision.assign', { id: terminal.id, assigneeId: h.actor }],
 ]) await rejectsUnchanged(h, action, input, h.expected('decision', terminal))
 const before = await reader.get(h.ctx, 'decision', terminal.id)
 const replacement = await h.commit('decision.supersede', { id: terminal.id, fields: fields(h, campaign, { title: 'Superseding approval' }) }, h.expected('decision', terminal))
 assert.equal(replacement.state, 'Awaiting approval')
 assert.equal((await reader.get(h.ctx, 'decision', replacement.id)).supersedesId, terminal.id)
 assert.deepEqual(await reader.get(h.ctx, 'decision', terminal.id), { ...before, supersededByIds: [...before.supersededByIds, replacement.id].sort() })
 const priorDetail = (await readHttp(h, `/api/decisions/${terminal.id}`)).decision
 const replacementDetail = (await readHttp(h, `/api/decisions/${replacement.id}`)).decision
 assert.equal(priorDetail.supersedes, null)
 assert.deepEqual(priorDetail.supersededBy, [{ id: replacement.id, title: replacement.title }])
 assert.deepEqual(replacementDetail.supersedes, { id: terminal.id, title: terminal.title })
 assert.deepEqual(replacementDetail.supersededBy, [])
 const queuedReplacement = (await readHttp(h, '/api/decisions')).items.find(row => row.id === replacement.id)
 assert.deepEqual(queuedReplacement.supersedes, replacementDetail.supersedes)
}

async function assignmentsAndComments(h, reader, campaign) {
 const first = await h.addPerson({ name: 'Decision reviewer' }), second = await h.addPerson({ name: 'Second decision reviewer' })
 const risk = await h.commit('risk.create', { fields: { campaignId: campaign.id, title: 'Assignment isolation risk', ownerId: h.actor, severity: 'High', dueDate: null, signal: '', mitigation: '' } })
 const riskBefore = await reader.get(h.ctx, 'risk', risk.id)
 let row = await h.commit('decision.create', { fields: fields(h, campaign, { riskId: risk.id }) })
 const before = await reader.get(h.ctx, 'decision', row.id)
 row = await h.commit('decision.assign', { id: row.id, assigneeId: first.id }, h.expected('decision', row))
 assert.deepEqual(await reader.get(h.ctx, 'decision', row.id), { ...before, assigneeId: first.id, version: row.version, updatedAt: row.updatedAt })
 await activity(h, row, 'assignee_id', first.id)
 await rejectsUnchanged(h, 'decision.assign', { id: row.id, assigneeId: h.r.createUlid() }, h.expected('decision', row))
 const assigned = await reader.get(h.ctx, 'decision', row.id)
 const response = await h.request(first.session, '/api/v1/commands/launch.decision.assign', { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), input: { id: row.id, assigneeId: second.id }, expected: h.expected('decision', row) }) })
 assert.equal(response.status, 200, JSON.stringify(await response.clone().json()))
 row = (await response.json()).data.value
 assert.deepEqual(await reader.get(h.ctx, 'decision', row.id), { ...assigned, assigneeId: second.id, version: row.version, updatedAt: row.updatedAt })
 const reassignment = (await h.db.prepare("SELECT * FROM activity_entries WHERE subject_id=? AND field_name='assignee_id' AND next_value=?").bind(row.id, second.id).all()).results
 assert.ok(reassignment.some(entry => entry.actor_id === first.id && Number.isFinite(entry.created_at)))
 const notices = (await h.db.prepare("SELECT operator_id FROM notifications WHERE subject_id=? AND kind='decision-assigned'").bind(row.id).all()).results
 assert.deepEqual(notices.map(item => item.operator_id).sort(), [first.id, second.id].sort())
 await h.commit('decision.delete', { id: row.id }, h.expected('decision', row))
 assert.deepEqual(await reader.get(h.ctx, 'risk', risk.id), riskBefore, 'Creation, assignment, reassignment and deletion leave the linked risk unchanged')

 const unchangedTables = productTables.filter(table => !['evidence_comments', 'notifications', 'channel_events', 'channel_notifications', 'channel_deliveries', 'activity_entries', 'command_admissions', 'admission_audit'].includes(table))
 const beforeComment = await snapshot(h.db, unchangedTables)
 const body = `Plain text <b>is not markup</b> @${first.id} and an unavailable colleague`
 const comment = await recordComment(h,'comment.add', { campaignId: campaign.id, body, mentions: [first.id] }, h.expected('campaign', campaign))
 assert.equal(comment.body, body)
 assert.deepEqual(await snapshot(h.db, unchangedTables), beforeComment, 'Commenting changes no business field and creates no automation event, run, AI request/call or outbox work')
 const thread=await recordThread(h,h.expected('campaign',campaign)[0].ref)
 assert.ok(thread.items.some(item=>item.id===comment.id&&item.body===body&&item.author.id===h.actor))
 assert.ok(await h.db.prepare("SELECT 1 FROM admission_audit WHERE actor_id=? AND action='comment.add' AND personal_refs_json=?").bind(h.actor,JSON.stringify([comment.id])).first())
 const detail=await readHttp(h,`/api/campaigns/${campaign.id}`);assert.ok(detail.activity.some(item=>item.subjectId===comment.id&&item.actor.id===h.actor))
 const mentions = await commentNotices(h.db,comment.id)
 assert.deepEqual(mentions.map(item => item.operator_id), [first.id], 'Only the selected current operator is notified')
}

export async function verifyDecisionClauses(h) {
 const reader = h.r.createLaunchReader(h.db, h.context.policy)
 const campaign = await h.campaign('DECISION-CLAUSES'), other = await h.campaign('DECISION-OTHER')
 await records(h, reader, campaign, other)
 await outcomes(h, reader, campaign)
 await assignmentsAndComments(h, reader, campaign)
}
