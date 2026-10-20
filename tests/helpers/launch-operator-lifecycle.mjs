import assert from 'node:assert/strict'
import { createUlid, LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'

// OPS-004 / OPS-005 fixture: one leaver whose work stays behind, two remaining digest recipients,
// everything created and read through the launch HTTP doors; D1 is a read-only observation door.
const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10)
const today = new Date().toISOString().slice(0, 10)
export const monday = addDays(today, 7 - (new Date().getUTCDay() + 6) % 7)
const MEMBER_ENTITY = '00000000000000000000000101'

export function lifecycleDoors(h, admin) {
 const call = async (route, init = {}, session = admin) => { const response = await h.request(session, route, init); return { status: response.status, body: await response.json().catch(() => null) } }
 const command = (action, input, expected = [], session = admin) => call(`/api/v1/commands/${action}`, { method: 'POST', body: JSON.stringify({ commandId: createUlid(), expected, input }) }, session)
 const commit = async (action, input, expected = [], session = admin) => { const result = await command(action, input, expected, session); assert.equal(result.status, 200, `${action}: ${JSON.stringify(result.body)}`); return result.body.data.value }
 const ref = (kind, row) => [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities[kind], recordId: row.id }, version: row.version }]
 const memberRef = member => [{ ref: { appId: LAUNCH_APP_ID, entityId: MEMBER_ENTITY, recordId: member.id }, version: member.version }]
 const member = async id => (await call(`/api/v1/members?appId=${LAUNCH_APP_ID}`)).body.data.items.find(item => item.id === id)
 const count = async (sql, ...params) => Number((await h.db.prepare(sql).bind(...params).first()).n)
 const tick = async at => (await h.runtime.getWorker()).scheduled({ scheduledTime: Date.parse(at), cron: '* * * * *' })
 return { h, admin, call, command, commit, ref, memberRef, member, count, tick }
}

const campaignFields = (code, ownerId, launchDate) => ({ code, name: `Lifecycle ${code}`, ownerId, startDate: addDays(monday, -7), launchDate, objective: 'Operator lifecycle journey', statusSummary: '', phase: 'Planning', status: 'On track', health: 60, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} })
const decisionFields = (campaignId, title, requesterId, assigneeId) => ({ campaignId, riskId: null, supersedesId: null, title, requesterId, assigneeId, priority: 'High', dueAt: addDays(monday, 40) + 'T10:00:00.000Z', recommendation: 'Proceed', impact: 'Launch readiness' })
const lensDefinition = (name, recordType, field, value) => ({ name, description: '', recordType, conditions: [{ field, operator: 'equals', value }], sort: { field: recordType === 'Milestone' ? 'startDate' : 'title', direction: 'asc' }, fields: recordType === 'Milestone' ? ['title', 'startDate', 'owner'] : ['title', 'state'], display: recordType === 'Milestone' ? 'Timeline' : recordType === 'Risk' ? 'Cards' : 'Cards' })

/** Builds the leaver's work and the remaining recipient; returns the handles both clauses read back. */
export async function seedLeaver(doors, adminId) {
 const { h, commit, command, ref, count, tick } = doors
 const leaver = await h.addPerson({ name: 'Casey Leaver', legacy: true }), stay = await h.addPerson({ name: 'Dana Stayer', legacy: true }), other = await h.addPerson({ name: 'Eli Remaining', legacy: true })
 const row = sql => h.db.prepare(sql)
 // Schedules: UTC workspace, readiness at 08:00 with three lead days, weekly digest to both people, AI on.
 const settings = (await doors.call('/api/v1/settings')).body.data
 const readiness = await row("SELECT id,version FROM automations WHERE shipped_key='launch-readiness'").first()
 await commit('settings.update', { version: settings.version, changes: { readinessVersion: readiness.version, timezone: 'UTC', readinessHour: 8, readinessLeadDays: 3, aiEnabled: true, aiDailyCeiling: 100 } })
 for (const key of ['launch-readiness', 'weekly-digest']) { const definition = await row('SELECT id,version FROM automations WHERE shipped_key=?').bind(key).first(); await commit('launch.automation.enable', { id: definition.id }, ref('automation', definition)) }
 for (const key of ['critical-risk', 'campaign-brief']) { const definition = await row('SELECT id,version,enabled FROM automations WHERE shipped_key=?').bind(key).first(); if (definition.enabled) await commit('launch.automation.disable', { id: definition.id }, ref('automation', definition)) }
 const digest = await row("SELECT version FROM channel_digest_settings WHERE id='digest'").first()
 await commit('digest.update', { version: digest.version, recipientIds: [stay.id, other.id, leaver.id] })

 // The leaver authors work in their own session: a campaign they still own, an archived one, a risk,
 // deliverable, milestones, a comment, decisions and an AI analysis.
 const owned = await commit('launch.campaign.create', { fields: campaignFields('LEAVE-1', leaver.id, addDays(monday, 60)) }, [], leaver.session)
 const archived = await commit('launch.campaign.create', { fields: campaignFields('LEAVE-2', leaver.id, addDays(monday, 61)) }, [], leaver.session)
 const risk = await commit('launch.risk.create', { fields: { campaignId: owned.id, ownerId: leaver.id, title: 'Supplier slips', severity: 'High', signal: 'Known', mitigation: 'Second source', dueDate: null } }, [], leaver.session)
 const deliverable = await commit('launch.deliverable.create', { fields: { campaignId: owned.id, title: 'Press kit', ownerId: leaver.id, dueDate: null } }, [], leaver.session)
 const milestone = await commit('launch.milestone.create', { fields: { campaignId: owned.id, title: 'Readiness gate', ownerId: leaver.id, type: 'Launch', status: 'Not started', startDate: monday, endDate: null, conflictReason: null } }, [], leaver.session)
 const later = await commit('launch.milestone.create', { fields: { campaignId: owned.id, title: 'Beyond the lead window', ownerId: leaver.id, type: 'Launch', status: 'Not started', startDate: addDays(monday, 4), endDate: null, conflictReason: null } }, [], leaver.session)
 const control = await commit('launch.milestone.create', { fields: { campaignId: owned.id, title: 'Control gate', ownerId: stay.id, type: 'Launch', status: 'Not started', startDate: addDays(monday, 4), endDate: null, conflictReason: null } })
 const comment = await commit('launch.comment.create', { campaignId: owned.id, body: 'Supplier call is booked for Tuesday.', mentions: [] }, ref('campaign', owned), leaver.session)
 const unresolved = await commit('launch.decision.create', { fields: decisionFields(owned.id, 'Approve the press kit', leaver.id, leaver.id) }, [], leaver.session)
 const decided = await commit('launch.decision.create', { fields: decisionFields(owned.id, 'Choose the launch region', leaver.id, leaver.id) }, [], leaver.session)
 const outcome = await commit('launch.decision.outcome', { id: decided.id, outcome: 'Approved', rationale: 'Region confirmed' }, ref('decision', decided), leaver.session)
 const assigned = await commit('launch.decision.create', { fields: decisionFields(owned.id, 'Sign off the budget', adminId, leaver.id) })
 await commit('launch.campaign.archive', { id: archived.id }, ref('campaign', archived))
 const requested = await commit('launch.analysis.request', { feature: 'campaign-brief', campaignId: owned.id }, [], leaver.session)
 await tick(new Date().toISOString())
 const analysisRequest = await doors.call(`/api/v1/launch/analysis-requests/${requested.requestId}`, {}, leaver.session)
 assert.equal(analysisRequest.body.data.state, 'Complete', JSON.stringify(analysisRequest.body))
 // Saved lenses naming the leaver as owner, requester and assignee.
 const lenses = {
  milestone: await commit('launch.lens.save', { definition: lensDefinition('Leaver milestones', 'Milestone', 'owner', leaver.id) }),
  risk: await commit('launch.lens.save', { definition: lensDefinition('Leaver risks', 'Risk', 'owner', leaver.id) }),
  requested: await commit('launch.lens.save', { definition: lensDefinition('Leaver requests', 'Decision', 'requester', leaver.id) }),
  assigned: await commit('launch.lens.save', { definition: lensDefinition('Leaver assignments', 'Decision', 'assignee', leaver.id) }),
 }
 return { leaver, stay, other, owned, archived, risk, deliverable, milestone, later, control, comment, unresolved, decided, outcome, assigned, analysisId: analysisRequest.body.data.analysis.id, requestId: requested.requestId, lenses, adminId }
}

/** [OPS-004] Removal, read back through the doors. */
export async function verifyRemoval(doors, w) {
 const { h, call, command, commit, ref, memberRef, member, count, tick } = doors
 const { leaver, stay, other } = w
 const lensTotal = async lens => { const page = await call(`/api/lenses/${lens.id}?view=results`); assert.equal(page.status, 200, JSON.stringify(page.body)); return page.body.total?.value ?? page.body.total }
 for (const [name, lens] of Object.entries(w.lenses)) assert.ok(await lensTotal(lens) > 0, `${name} lens finds the active leaver's records`)
 assert.equal((await h.request(leaver.session, '/api/v1/session')).status, 200)

 // Monday 08:05 workspace time: the readiness schedule asks the leaver for readiness on their gate.
 await tick(monday + 'T08:05:00.000Z')
 assert.equal(await count("SELECT COUNT(*) n FROM launch_readiness WHERE owner_id=? AND state='Outstanding'", leaver.id), 1, 'The leaver has one outstanding readiness request')
 assert.ok(await count('SELECT COUNT(*) n FROM notifications WHERE operator_id=?', leaver.id) > 0 && await count('SELECT COUNT(*) n FROM channel_deliveries WHERE operator_id=?', leaver.id) > 0, 'The leaver has notifications and delivery records')

 // Removal is refused, naming each blocking record, while they own an active campaign or are assigned an unresolved decision.
 const blocked = await command('member.remove', { memberId: leaver.id, reason: 'Left the company' }, memberRef(await member(leaver.id)))
 assert.equal(blocked.status, 409, JSON.stringify(blocked.body))
 const message = blocked.body.error.message
 for (const record of [w.owned, w.unresolved, w.assigned]) assert.ok(message.includes(record.id), `The refusal names blocking record ${record.id}: ${message}`)
 for (const record of [w.archived, w.decided]) assert.ok(!message.includes(record.id), 'A resolved decision or archived campaign does not block')
 assert.equal((await member(leaver.id)).state, 'active')
 assert.equal((await h.request(leaver.session, '/api/v1/session')).status, 200, 'A refused removal ends no session')
 assert.equal(await count("SELECT COUNT(*) n FROM launch_readiness WHERE owner_id=? AND state='Outstanding'", leaver.id), 1)

 // Hand the blocking records on, then remove. Sessions end in the same commit.
 const version = table => async id => (await h.db.prepare(`SELECT id,version FROM ${table} WHERE id=?`).bind(id).first())
 const campaign = await version('campaigns')(w.owned.id)
 await commit('launch.bulk.apply', { recordType: 'Campaign', ids: [campaign.id], change: { kind: 'field', field: 'ownerId', value: stay.id } }, ref('campaign', campaign))
 for (const decision of [w.unresolved, w.assigned]) await commit('launch.decision.assign', { id: decision.id, assigneeId: stay.id }, ref('decision', await version('decisions')(decision.id)))
 const removedAt = Date.now()
 await commit('member.remove', { memberId: leaver.id, reason: 'Left the company' }, memberRef(await member(leaver.id)))
 assert.equal((await h.request(leaver.session, '/api/v1/session')).status, 401, 'Removal ends their session at once')
 assert.ok(Date.now() - removedAt < 60000, 'Their session ended inside one minute')
 assert.equal((await member(leaver.id)).state, 'removed')

 // Outstanding readiness requests are Cancelled and none is created for them afterwards.
 assert.equal(await count("SELECT COUNT(*) n FROM launch_readiness WHERE owner_id=? AND state='Outstanding'", leaver.id), 0)
 assert.equal(await count("SELECT COUNT(*) n FROM launch_readiness WHERE owner_id=? AND milestone_id=? AND state='Cancelled'", leaver.id, w.milestone.id), 1)
 await tick(addDays(monday, 1) + 'T08:05:00.000Z')
 assert.equal(await count('SELECT COUNT(*) n FROM launch_readiness WHERE milestone_id=?', w.control.id), 1, 'The schedule still asks the remaining owner')
 assert.equal(await count('SELECT COUNT(*) n FROM launch_readiness WHERE owner_id=? AND milestone_id=?', leaver.id, w.later.id), 0, 'No request is created for the removed operator')

 // The weekly digest goes to each remaining recipient and none to the removed person.
 await tick(monday + 'T09:00:00.000Z')
  const digestFor = id => count("SELECT COUNT(*) n FROM channel_deliveries WHERE kind='weekly-digest' AND operator_id=?", id)
 assert.deepEqual([await digestFor(stay.id), await digestFor(other.id), await digestFor(leaver.id)], [1, 1, 0])

 // Their work keeps its attribution, read back with their name.
 const named = person => { assert.equal(person.id, leaver.id); assert.equal(person.name, 'Casey Leaver') }
 const detail = (await call(`/api/campaigns/${w.owned.id}`)).body
 named(detail.risks.find(item => item.id === w.risk.id).owner)
 named(detail.deliverables.find(item => item.id === w.deliverable.id).owner)
 for (const id of [w.milestone.id, w.later.id]) named(detail.milestones.find(item => item.id === id).owner)
 const comment = detail.comments.find(item => item.id === w.comment.id)
 assert.deepEqual([comment.authorId, comment.authorName], [leaver.id, 'Casey Leaver'])
 const acted = detail.activity.filter(item => item.actor?.id === leaver.id)
 assert.ok(acted.length > 5); acted.forEach(item => named(item.actor))
 named((await call(`/api/risks/${w.risk.id}`)).body.risk.owner)
 named((await call(`/api/milestones/${w.milestone.id}`)).body.milestone.owner)
 named((await call(`/api/campaigns/${w.archived.id}`)).body.campaign.owner)
 const decided = (await call(`/api/decisions/${w.decided.id}`)).body.decision
 assert.equal(decided.state, 'Approved'); named(decided.requester); named(decided.assignee)
 const analysis = await call(`/api/v1/launch/analyses/${w.analysisId}`)
 assert.equal(analysis.status, 200, 'The analysis stays readable')
 assert.equal(await count('SELECT COUNT(*) n FROM launch_analysis_requests WHERE id=? AND actor_id=?', w.requestId, leaver.id), 1, 'The analysis request stays attributed to the removed operator')
 assert.equal(await count('SELECT COUNT(*) n FROM milestones WHERE owner_id=?', leaver.id), 2)

 // A lens condition naming the removed operator returns zero results, not an error.
 for (const [name, lens] of Object.entries(w.lenses)) assert.equal(await lensTotal(lens), 0, `${name} lens returns zero results`)
}
