import assert from 'node:assert/strict'
import { writeContext, mutationSnapshot } from './launch-write-context.mjs'

const day = (date, offset) => new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
const fields = (h, campaign, changes = {}) => ({ campaignId: campaign.id, title: 'Evidence requires review', ownerId: h.actor, severity: 'High', dueDate: null, signal: 'Supplier evidence', mitigation: 'Review the evidence', ...changes })
const tables = ['campaigns', 'deliverables', 'milestones', 'risks', 'decisions', 'notifications', 'lenses', 'automations', 'automation_runs', 'launch_analyses', 'launch_custom_fields', 'launch_readiness', 'evidence_comments', 'campaign_tags', 'launch_custom_values', 'milestone_dependencies', 'channel_notifications', 'channel_deliveries', 'channel_events', 'notification_reads', 'channel_preferences']

async function snapshot(db, riskId) {
 const rows = await db.batch(tables.map(table => db.prepare(`SELECT * FROM ${table}${table === 'risks' ? ' WHERE id<>?' : ''} ORDER BY 1`).bind(...table === 'risks' ? [riskId] : [])))
 return Object.fromEntries(tables.map((table, i) => [table, rows[i].results]))
}

async function isolated(h, row, action, input, createsDecision = false) {
 const before = await snapshot(h.db, row.id)
 const activity = (await h.db.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results
 const result = await h.commit(action, { id: row.id, ...input }, h.expected('risk', row))
 const after = await snapshot(h.db, row.id)
 if (createsDecision) {
  assert.ok(result.decision, 'Critical escalation returns the newly created decision')
  assert.equal(result.decision.riskId, row.id)
  assert.equal(result.decision.campaignId, row.campaignId)
  assert.equal(result.decision.priority, 'Critical')
  assert.equal(result.decision.state, 'Awaiting approval')
  after.decisions = after.decisions.filter(decision => decision.id !== result.decision.id)
 }
 assert.deepEqual(after, before, `${action} preserves every other product record and existing notification`)
 const current = (await h.db.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results
 const oldIds = new Set(activity.map(entry => entry.id))
 assert.deepEqual(current.filter(entry => oldIds.has(entry.id)), activity, 'Previous activity is immutable')
 const added = current.filter(entry => !oldIds.has(entry.id))
 assert.ok(added.length > 0, `${action} records activity`)
 assert.ok(added.every(entry => entry.campaign_id === row.campaignId && entry.actor_id === h.actor && [row.id, createsDecision ? result.decision.id : row.id].includes(entry.subject_id)), 'Activity belongs only to the changed risk and any new linked decision')
 return result
}

async function lifecycle(h, reader, campaign) {
 let risk = await h.commit('risk.create', { fields: fields(h, campaign) })
 assert.equal(risk.state, 'Watching')
 const created = await reader.get(h.ctx, 'risk', risk.id)
 for (const [key, value] of Object.entries(risk)) assert.deepEqual(created[key], value)
 const unchanged = async (action, input, field) => {
  const before = await reader.get(h.ctx, 'risk', risk.id), rest = await snapshot(h.db, risk.id)
  const activity = (await h.db.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results
  await assert.rejects(h.commit(action, input, h.expected('risk', risk)), error => error.code === 'validation' || error.issues?.some(issue => issue.path.includes(field)))
  assert.deepEqual(await reader.get(h.ctx, 'risk', risk.id), before)
  assert.deepEqual(await snapshot(h.db, risk.id), rest)
  assert.deepEqual((await h.db.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results, activity)
 }
 for (const [key, value] of [['title', '  '], ['ownerId', ''], ['campaignId', h.r.createUlid()], ['severity', 'Severe'], ['dueDate', 'tomorrow'], ['signal', 's'.repeat(2001)], ['mitigation', 'm'.repeat(2001)]]) {
  await unchanged('risk.patch', { id: risk.id, changes: { [key]: value } }, key)
 }
 for (const key of ['title', 'ownerId', 'campaignId']) {
  const missing = fields(h, campaign); delete missing[key]
  await unchanged('risk.create', { fields: missing }, key)
 }
 risk = await isolated(h, risk, 'risk.patch', { changes: { title: 'Updated evidence', dueDate: '2026-10-20', signal: 's'.repeat(2000), mitigation: 'm'.repeat(2000), severity: 'Critical' } })
 const edited = await reader.get(h.ctx, 'risk', risk.id)
 for (const [key, value] of Object.entries({ title: 'Updated evidence', dueDate: '2026-10-20', signal: 's'.repeat(2000), mitigation: 'm'.repeat(2000), severity: 'Critical' })) assert.equal(edited[key], value)
 const linked = await isolated(h, risk, 'risk.escalate', { reason: 'Supplier requires a decision' }, true)
 risk = linked.risk
 assert.equal(risk.state, 'Escalated')
 assert.equal(risk.escalatedById, h.actor)
 assert.equal(risk.escalatedAt, h.ctx.now)
 assert.equal(risk.escalationReason, 'Supplier requires a decision')
 assert.equal((await isolated(h, risk, 'risk.escalate', { reason: 'Further evidence' })).decision, null, 'An existing unresolved decision is not duplicated')
 risk = await reader.get(h.ctx, 'risk', risk.id)
 await h.commit('decision.outcome', { id: linked.decision.id, outcome: 'Approved', rationale: '' }, h.expected('decision', linked.decision))
 risk = await reader.get(h.ctx, 'risk', risk.id)
 assert.equal(risk.state, 'In progress', 'Approval is the explicit decision policy transition')
 await unchanged('risk.resolve', { id: risk.id, resolutionNote: ' \n\t ' }, 'resolutionNote')
 await unchanged('risk.reopen', { id: risk.id }, 'id')
 risk = await isolated(h, risk, 'risk.resolve', { resolutionNote: 'Evidence has been addressed' })
 assert.equal(risk.state, 'Resolved')
 assert.equal(risk.resolvedById, h.actor)
 assert.equal(risk.resolvedAt, h.ctx.now)
 assert.equal(risk.resolutionNote, 'Evidence has been addressed')
 await unchanged('risk.resolve', { id: risk.id, resolutionNote: 'Again' }, 'resolutionNote')
 await unchanged('risk.escalate', { id: risk.id, reason: 'Already closed' }, 'reason')
 risk = await isolated(h, risk, 'risk.reopen', {})
 assert.equal(risk.state, 'Watching')
 assert.equal(risk.resolvedAt, null)
 assert.equal(risk.resolvedById, null)
 assert.equal(risk.resolutionNote, null)
 const history = (await h.db.prepare("SELECT * FROM activity_entries WHERE subject_id=? AND field_name='resolution_note'").bind(risk.id).all()).results
 assert.ok(history.some(entry => entry.next_value === 'Evidence has been addressed'))
 assert.ok(history.some(entry => entry.previous_value === 'Evidence has been addressed' && entry.next_value === null), 'Reopening retains the previous resolution in activity')
 const decisionBefore=await reader.get(h.ctx,'decision',linked.decision.id)
 const limited=await h.addPerson({change:rules=>rules.map(rule=>rule.entityId===h.r.launchEntities.decision?{...rule,writableFields:rule.writableFields.filter(id=>id!==h.r.launchFieldIds.decision.riskId)}:rule)})
 const restricted=await writeContext(h,limited.session)
 const beforeDelete=await mutationSnapshot(h.db)
 await assert.rejects(restricted.commit('risk.delete',{id:risk.id},h.expected('risk',risk)),error=>error.code==='forbidden')
 assert.deepEqual(await mutationSnapshot(h.db),beforeDelete,'Deleting a linked risk also requires authority to detach its decision')
 const deleted = await h.commit('risk.delete', { id: risk.id }, h.expected('risk', risk))
 assert.equal(deleted.deletedId, risk.id)
 await assert.rejects(reader.get(h.ctx, 'risk', risk.id), error => error.code === 'not_found')
 assert.ok(!(await reader.list(h.ctx, 'risk', { campaignId: campaign.id })).items.some(row => row.id === risk.id))
 assert.deepEqual(await reader.get(h.ctx,'decision',linked.decision.id),{...decisionBefore,riskId:null,version:decisionBefore.version+1,updatedAt:h.ctx.now},'Risk deletion preserves the complete decision while removing its stale link')
}

async function ratings(h, reader, campaign) {
 const rating = async expected => {
  assert.equal((await reader.get(h.ctx, 'campaign', campaign.id)).riskRating, expected)
  const page = await reader.list(h.ctx, 'campaign', { includeArchived: true, limit: 200 })
  assert.equal(page.items.find(row => row.id === campaign.id)?.riskRating, expected, 'Campaign collections carry the same derived rating')
 }
 await rating('None')
 const risks = []
 for (const severity of ['Low', 'Medium', 'High', 'Critical']) {
  risks.push(await h.commit('risk.create', { fields: fields(h, campaign, { severity, title: `${severity} rating evidence` }) }))
  await rating(severity)
 }
 for (let i = risks.length - 1; i >= 0; i--) {
  await h.commit('risk.resolve', { id: risks[i].id, resolutionNote: 'Addressed' }, h.expected('risk', risks[i]))
  await rating(i ? risks[i - 1].severity : 'None')
 }
 const reopened = await h.commit('risk.reopen', { id: risks[0].id }, h.expected('risk', await reader.get(h.ctx, 'risk', risks[0].id)))
 await rating('Low')
 await h.commit('risk.patch', { id: reopened.id, changes: { severity: 'High' } }, h.expected('risk', reopened))
 await rating('High')
}

async function shippedLens(h, reader) {
 const shipped = (await reader.list(h.ctx, 'lens', { limit: 200 })).items.find(row => row.shippedKey === 'risks')
 assert.ok(shipped, 'Setup supplies the shipped Risks Lens')
 const definition = { name: shipped.name, description: shipped.description, recordType: shipped.recordType, conditions: JSON.parse(shipped.conditionsJson), sort: JSON.parse(shipped.sortJson), fields: JSON.parse(shipped.fieldsJson), display: shipped.display }
 const read = async () => {
  const items = []; let cursor = 0
  do {
   const page = await h.r.previewLens(h.db, definition, h.ctx.now, cursor)
   items.push(...page.items); cursor = page.nextCursor === null ? null : Number(page.nextCursor)
  } while (cursor !== null)
  return items
 }
 const before = await read(), timezone = (await h.db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first()).timezone
 const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(h.ctx.now))
 const component = key => parts.find(part => part.type === key).value
 const today = `${component('year')}-${component('month')}-${component('day')}`
 const campaign = async (code, launchDate) => {
  const created = await h.campaign(code)
  return h.commit('campaign.patch', { id: created.id, changes: { startDate: day(today, -100), launchDate } }, h.expected('campaign', created))
 }
 const a = await campaign('RISK-A', day(today, 30)), b = await campaign('RISK-B', day(today, -1)), future = await campaign('RISK-FUTURE', day(today, 31)), archived = await campaign('RISK-ARCHIVED', today)
 const make = (campaign, title, severity, dueDate) => h.commit('risk.create', { fields: fields(h, campaign, { title, severity, dueDate }) })
 const high = await make(a, 'High earlier due', 'High', day(today, -2))
 const criticalLater = await make(a, 'Critical later due', 'Critical', day(today, 2))
 const criticalB = await make(b, 'Critical campaign B tie', 'Critical', today)
 const criticalA = await make(a, 'Critical campaign A tie', 'Critical', today)
 const criticalNone = await make(a, 'Critical without due', 'Critical', null)
 const highNone = await make(a, 'High without due', 'High', null)
 const excluded = [await make(a, 'Low excluded', 'Low', today), await make(a, 'Medium excluded', 'Medium', today), await make(future, 'Future excluded', 'Critical', today), await make(archived, 'Archived excluded', 'Critical', today)]
 const resolved = await make(a, 'Resolved excluded', 'Critical', today)
 await h.commit('risk.resolve', { id: resolved.id, resolutionNote: 'Closed' }, h.expected('risk', resolved))
 excluded.push(resolved)
 await h.commit('campaign.archive', { id: archived.id }, h.expected('campaign', archived))
 const expected = [criticalA, criticalB, criticalLater, criticalNone, high, highNone], ids = new Set([...expected, ...excluded].map(row => row.id))
 const result = await read()
 assert.deepEqual(result.filter(row => ids.has(row.id)).map(row => row.id), expected.map(row => row.id), 'Shipped membership includes overdue campaigns and day 30, excludes day 31/archive/resolved/low severities, and sorts severity, due date, nulls, then campaign code')
 assert.deepEqual(result.filter(row => !ids.has(row.id)), before, 'New fixtures do not alter existing lens records')
 for (const row of result.filter(row => ids.has(row.id))) {
  const detail = await reader.get(h.ctx, 'risk', row.id)
  for (const field of ['severity', 'state', 'ownerId', 'dueDate', 'signal', 'mitigation', 'campaignId']) assert.equal(row[field], detail[field])
 }
 const lower = await isolated(h, high, 'risk.escalate', { reason: 'Review lower severity' })
 assert.equal(lower.decision, null)
 assert.equal((await read()).find(row => row.id === high.id).state, 'Escalated', 'Escalated remains an open state in the lens')
 await h.commit('risk.resolve', { id: lower.risk.id, resolutionNote: 'Closed after review' }, h.expected('risk', lower.risk))
 assert.ok(!(await read()).some(row => row.id === high.id), 'A committed resolution immediately removes the risk from the lens')
}

async function publicLifecycle(h, campaign) {
 const resolver = await h.addPerson({ name: 'Risk resolver' }), reopener = await h.addPerson({ name: 'Risk reopener' })
 assert.notEqual(resolver.id, h.actor)
 assert.notEqual(reopener.id, resolver.id)
 const read = async (route, session = h.ownerSession) => {
  const response = await h.request(session, route), body = await response.json()
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`)
  return body
 }
 const command = async (session, action, input, expected = [], status = 200) => {
  const commandId = h.r.createUlid(), started = Date.now()
  const response = await h.request(session, `/api/v1/commands/launch.${action}`, { method: 'POST', body: JSON.stringify({ commandId, input, expected }) })
  const finished = Date.now(), body = await response.json()
  assert.equal(response.status, status, `${action}: ${JSON.stringify(body)}`)
  if (status === 200) assert.equal(body.data.state, 'committed')
  return { commandId, started, finished, body, value: body.data?.value }
 }
 const within = (instant, receipt) => {
  assert.ok(Number.isFinite(Date.parse(instant)) && Date.parse(instant) >= receipt.started && Date.parse(instant) <= receipt.finished, 'Recorded time lies within independent request bounds')
 }
 const created = await command(h.ownerSession, 'risk.create', { fields: fields(h, campaign, { title: 'Public lifecycle evidence' }) })
 const riskId = created.value.id
 const risk = async () => (await read(`/api/risks/${riskId}`)).risk
 const activity = async () => (await read(`/api/campaigns/${campaign.id}`)).activity
 const before = await risk(), historyBefore = await activity()
 assert.equal(before.state, 'Watching')
 for (const field of ['resolutionNote', 'resolvedAt', 'resolvedById']) assert.equal(before[field], null)
 const unchanged = await mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
 const refused = await command(resolver.session, 'risk.resolve', { id: riskId, resolutionNote: ' \n\t ' }, h.expected('risk', before), 400)
 assert.equal(refused.body.error.code, 'validation')
 assert.deepEqual(await mutationSnapshot(h.db, { omitSessionReadTimestamp: true }), unchanged, 'Blank resolution commits no data, activity, audit, event or receipt')
 assert.deepEqual(await risk(), before, 'A refused resolution preserves the public risk including its version')
 assert.deepEqual(await activity(), historyBefore, 'A refused resolution preserves public campaign activity')

 const note = 'Supplier evidence independently verified'
 const resolved = await command(resolver.session, 'risk.resolve', { id: riskId, resolutionNote: note }, h.expected('risk', before))
 const resolution = await risk()
 for (const row of [resolution, resolved.value]) {
  assert.equal(row.state, 'Resolved')
  assert.equal(row.resolutionNote, note)
  assert.equal(row.resolvedById, resolver.id, 'The resolver is the known acting operator, rather than the risk owner')
  within(row.resolvedAt, resolved)
 }
 assert.equal(resolution.version, before.version + 1)
 assert.equal(resolution.resolvedAt, resolved.value.resolvedAt)
 const retained = (await read(`/api/v1/commands/${resolved.commandId}`, resolver.session)).data
 assert.equal(retained.state, 'committed')
 assert.deepEqual(retained.result, resolved.value, 'The public command status retains the committed resolution')
 const transition = (entries, receipt, actor, field, previousValue, nextValue) => {
  const matches = entries.filter(entry => entry.actionId === receipt.commandId && entry.subjectId === riskId && entry.fieldName === field)
  assert.equal(matches.length, 1, `One public ${field} transition belongs to the committed command`)
  const entry = matches[0]
  assert.equal(entry.actor?.id, actor.id)
  assert.equal(entry.actor?.name, actor.name)
  assert.equal(entry.previousValue, previousValue)
  assert.equal(entry.nextValue, nextValue)
  within(entry.occurredAt, receipt)
 }
 const resolvedActivity = await activity()
 transition(resolvedActivity, resolved, { id: resolver.id, name: 'Risk resolver' }, 'state', 'Watching', 'Resolved')
 transition(resolvedActivity, resolved, { id: resolver.id, name: 'Risk resolver' }, 'resolution_note', null, note)

 const reopened = await command(reopener.session, 'risk.reopen', { id: riskId }, h.expected('risk', resolution))
 const watching = await risk()
 for (const row of [watching, reopened.value]) {
  assert.equal(row.state, 'Watching')
  assert.equal(row.resolutionNote, null)
  assert.equal(row.resolvedAt, null)
  assert.equal(row.resolvedById, null)
 }
 assert.equal(watching.version, resolution.version + 1)
 const reopening = (await read(`/api/v1/commands/${reopened.commandId}`, reopener.session)).data
 assert.equal(reopening.state, 'committed')
 assert.deepEqual(reopening.result, reopened.value)
 const reopenedActivity = await activity()
 const priorIds = new Set(resolvedActivity.map(entry => entry.id))
 assert.deepEqual(reopenedActivity.filter(entry => priorIds.has(entry.id)), resolvedActivity, 'Reopening preserves every previous public activity entry')
 transition(reopenedActivity, reopened, { id: reopener.id, name: 'Risk reopener' }, 'state', 'Resolved', 'Watching')
 transition(reopenedActivity, reopened, { id: reopener.id, name: 'Risk reopener' }, 'resolution_note', note, null)
 const narrowed = resolver.rules.map(rule => rule.entityId === h.r.launchEntities.risk ? { ...rule, readableFields: rule.readableFields.filter(id => id !== h.r.launchFieldIds.risk.state) } : rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrowed), resolver.policyId).run()
 const beforeDeniedRead = await mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
 for (const route of [`/api/v1/commands/${resolved.commandId}`, `/api/risks/${riskId}`]) {
  const response = await h.request(resolver.session, route), body = await response.json()
  assert.equal(response.status, 403, 'Current read authority still fences risk metadata and retained resolution receipts')
  assert.equal(Object.hasOwn(body, 'data'), false)
  assert.equal(Object.hasOwn(body, 'risk'), false)
 }
 assert.deepEqual(await mutationSnapshot(h.db, { omitSessionReadTimestamp: true }), beforeDeniedRead, 'Refused metadata reads change nothing')
}

async function publicEscalation(h, campaign) {
 const actor = await h.addPerson({ name: 'Risk escalation operator' }), owner = await h.addPerson({ name: 'Risk evidence owner' })
 const escalations = []
 assert.notEqual(actor.id, campaign.ownerId)
 assert.notEqual(actor.id, owner.id)
 const read = async (route, session = actor.session) => {
  const response = await h.request(session, route), body = await response.json()
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`)
  return body
 }
 const command = async (action, input, expected = []) => {
  const commandId = h.r.createUlid(), started = Date.now()
  const response = await h.request(actor.session, `/api/v1/commands/launch.${action}`, { method: 'POST', body: JSON.stringify({ commandId, input, expected }) })
  const finished = Date.now(), body = await response.json()
  assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`)
  assert.equal(body.data.state, 'committed')
  return { commandId, started, finished, value: body.data.value }
 }
 const within = (instant, receipt) => {
  assert.ok(Number.isFinite(Date.parse(instant)) && Date.parse(instant) >= receipt.started && Date.parse(instant) <= receipt.finished, 'Escalation time lies within independent request bounds')
 }
 const decisions = async riskId => (await read('/api/decisions')).items.filter(row => row.risk?.id === riskId)
 for (const existing of [false, true]) {
  const created = await command('risk.create', { fields: fields(h, campaign, { title: existing ? 'Critical evidence with prior review' : 'Critical evidence needing review', ownerId: owner.id, severity: 'Critical' }) })
  const before = (await read(`/api/risks/${created.value.id}`)).risk
  assert.equal(before.state, 'Watching')
  assert.equal(before.owner.id, owner.id)
  let prior = null
  if (existing) {
   const decision = await command('decision.create', { fields: { campaignId: campaign.id, riskId: before.id, supersedesId: null, title: 'Independent supplier review', requesterId: owner.id, assigneeId: campaign.ownerId, priority: 'High', dueAt: '2099-01-01T12:00:00.000Z', recommendation: 'Retain the independent review', impact: 'Supplier readiness' } })
   await command('decision.request-change', { id: decision.value.id, rationale: 'Awaiting supplier evidence' }, h.expected('decision', decision.value))
   prior = (await read(`/api/decisions/${decision.value.id}`)).decision
   assert.equal(prior.state, 'In review')
   assert.equal(prior.priority, 'High')
   assert.equal(prior.risk.id, before.id)
   assert.equal(prior.campaign.id, campaign.id)
  }
  const listedBefore = await decisions(before.id)
  assert.deepEqual(listedBefore.map(row => row.id), prior ? [prior.id] : [], 'The unresolved-decision control is publicly present before escalation')
  const activityBefore = (await read(`/api/campaigns/${campaign.id}`)).activity
  const reason = existing ? 'Supplier evidence needs the existing reviewer' : 'Supplier evidence requires a Critical review'
  const escalation = await command('risk.escalate', { id: before.id, reason }, h.expected('risk', before))
  escalations.push(escalation)
  const risk = (await read(`/api/risks/${before.id}`)).risk
  const retained = (await read(`/api/v1/commands/${escalation.commandId}`)).data
  assert.equal(retained.state, 'committed')
  assert.deepEqual(retained.result, escalation.value, 'The public command status retains the committed escalation and policy result')
  assert.equal(risk.id, before.id)
  assert.equal(risk.state, 'Escalated')
  assert.equal(risk.version, before.version + 1)
  assert.deepEqual(risk.owner, before.owner)
  for (const row of [escalation.value.risk, retained.result.risk]) {
   assert.equal(row.id, before.id)
   assert.equal(row.state, 'Escalated')
   assert.equal(row.version, before.version + 1)
   assert.equal(row.escalatedById, actor.id, 'Attribution names the known operator distinct from both owners')
   assert.equal(row.escalationReason, reason)
   within(row.escalatedAt, escalation)
   assert.equal(row.escalatedAt, escalation.value.risk.escalatedAt)
  }
  const activity = (await read(`/api/campaigns/${campaign.id}`)).activity
  const priorIds = new Set(activityBefore.map(entry => entry.id))
  assert.deepEqual(activity.filter(entry => priorIds.has(entry.id)), activityBefore, 'Escalation preserves prior public activity')
  for (const [field, previousValue, nextValue] of [['state', 'Watching', 'Escalated'], ['escalation_reason', null, reason]]) {
   const entries = activity.filter(entry => entry.actionId === escalation.commandId && entry.subjectId === before.id && entry.fieldName === field)
   assert.equal(entries.length, 1, `The committed escalation has one public ${field} activity entry`)
   assert.equal(entries[0].actor?.id, actor.id)
   assert.equal(entries[0].actor?.name, 'Risk escalation operator')
   assert.equal(entries[0].previousValue, previousValue)
   assert.equal(entries[0].nextValue, nextValue)
   assert.equal(entries[0].occurredAt, escalation.value.risk.escalatedAt)
  }
  const listedAfter = await decisions(before.id)
  if (prior) {
   assert.equal(escalation.value.decision, null, 'The escalation returns no new decision when an unresolved decision is already linked')
   assert.deepEqual(listedAfter, listedBefore, 'No new decision is listed and the original identity, priority, state and link are unchanged')
   assert.deepEqual((await read(`/api/decisions/${prior.id}`)).decision, prior, 'The complete original public decision remains unchanged')
  } else {
   const decision = escalation.value.decision
   assert.ok(decision, 'Critical escalation returns its newly created decision in the committed response')
   assert.equal(listedAfter.length, 1)
   assert.equal(listedAfter[0].id, decision.id)
   assert.equal(decision.riskId, before.id)
   assert.equal(decision.campaignId, campaign.id)
   assert.equal(decision.priority, 'Critical')
   assert.equal(decision.state, 'Awaiting approval')
   for (const row of [listedAfter[0], (await read(`/api/decisions/${decision.id}`)).decision]) {
    assert.equal(row.risk.id, before.id)
    assert.equal(row.campaign.id, campaign.id)
    assert.equal(row.priority, 'Critical')
    assert.equal(row.state, 'Awaiting approval')
   }
  }
  const inbox = (await read('/api/notifications', h.ownerSession)).notifications
  assert.equal(inbox.filter(notice => notice.kind === 'critical-risk-escalated' && notice.subject.id === before.id && notice.subject.available).length, 1, 'The campaign owner reads the Critical escalation notice through the public inbox')
  console.log(`PROBE RISK-003 ${existing ? '3 existing decision' : '1 and 2 attribution'}: native escalation, retained command, risk, activity and owner inbox -> attributed Escalated risk; ${prior ? 'original In review High decision unchanged, no new decision' : 'one linked unresolved Critical decision'}`)
 }
 const narrowed = actor.rules.map(rule => rule.entityId === h.r.launchEntities.risk ? { ...rule, readableFields: rule.readableFields.filter(id => id !== h.r.launchFieldIds.risk.signal) } : rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrowed), actor.policyId).run()
 const unchanged = await mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
 for (const receipt of escalations) {
  const response = await h.request(actor.session, `/api/v1/commands/${receipt.commandId}`)
  assert.equal(response.status, 403, 'A retained escalation still requires current read authority for every risk field')
  assert.equal(Object.hasOwn(await response.json(), 'data'), false, 'A narrowed reader gets no retained escalation content')
 }
 assert.deepEqual(await mutationSnapshot(h.db, { omitSessionReadTimestamp: true }), unchanged, 'Refused escalation receipt reads change nothing')
}

export async function verifyRiskClauses(h) {
 const reader = h.r.createLaunchReader(h.db, h.context.policy)
 const campaign = await h.campaign('RISK-LIFECYCLE'), other = await h.campaign('RISK-ISOLATION')
 await h.commit('risk.create', { fields: fields(h, other, { title: 'Unrelated campaign risk' }) })
 await h.commit('deliverable.create', { fields: { campaignId: campaign.id, title: 'Unrelated deliverable', ownerId: h.actor, dueDate: null } })
 await h.commit('milestone.create', { fields: { campaignId: campaign.id, title: 'Unrelated milestone', ownerId: h.actor, type: 'Review', status: 'Not started', startDate: '2026-10-20', endDate: null, conflictReason: null } })
 await lifecycle(h, reader, campaign)
 await ratings(h, reader, campaign)
 await shippedLens(h, reader)
 await publicLifecycle(h, campaign)
 await publicEscalation(h, campaign)
}
