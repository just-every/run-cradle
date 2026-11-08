import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { writeContext, mutationSnapshot } from './launch-write-context.mjs'
import { verifyPublicRiskIsolation } from './launch-risk-isolation.mjs'

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
 const read = async route => {
  const response = await h.request(h.ownerSession, route)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
 }
 const write = async (action, input, revisions = []) => {
  const response = await h.request(h.ownerSession, `/api/v1/commands/launch.${action}`, {
   method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), input, expected: revisions }),
  })
  assert.equal(response.status, 200, await response.clone().text())
  const { data } = await response.json()
  assert.equal(data.state, 'committed')
  return data.value
 }
 const rating = async expected => {
  assert.equal((await reader.get(h.ctx, 'campaign', campaign.id)).riskRating, expected)
  const page = await reader.list(h.ctx, 'campaign', { includeArchived: true, limit: 200 })
  assert.equal(page.items.find(row => row.id === campaign.id)?.riskRating, expected, 'Campaign collections carry the same derived rating')
  assert.equal((await read(`/api/campaigns/${campaign.id}`)).campaign.riskRating, expected, 'Public campaign detail has the authored maximum')
  assert.equal((await read('/api/campaigns?limit=200')).items.find(row => row.id === campaign.id)?.riskRating, expected, 'Public grid has the authored maximum')
 }
 await rating('None')
 const risks = []
 for (const [severity, expected] of [['Low', 'Low'], ['Medium', 'Medium'], ['High', 'High'], ['Critical', 'Critical']]) {
  risks.push(await write('risk.create', { fields: fields(h, campaign, { severity, title: `${severity} rating evidence` }) }))
  await rating(expected)
 }
 // Lowering the highest risk must reveal another risk, not its new severity.
 risks[3] = await write('risk.patch', { id: risks[3].id, changes: { severity: 'Medium' } }, h.expected('risk', risks[3]))
 await rating('High')
 // Literal expectations include tied maxima; none is derived from returned risks.
 for (const [index, expected] of [[2, 'Medium'], [1, 'Medium'], [3, 'Low'], [0, 'None']]) {
  risks[index] = await write('risk.resolve', { id: risks[index].id, resolutionNote: 'Addressed' }, h.expected('risk', risks[index]))
  await rating(expected)
 }
 const reopened = await write('risk.reopen', { id: risks[0].id }, h.expected('risk', await reader.get(h.ctx, 'risk', risks[0].id)))
 await rating('Low')
 await write('risk.patch', { id: reopened.id, changes: { severity: 'High' } }, h.expected('risk', reopened))
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

// Native HTTP doors shared by the public risk journeys.
async function publicRead(h, route, session = h.ownerSession) {
 const response = await h.request(session, route), body = await response.json()
 assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`)
 return body
}

async function publicCommand(h, session, action, input, expected = [], status = 200) {
 const commandId = h.r.createUlid(), started = Date.now()
 const response = await h.request(session, `/api/v1/commands/launch.${action}`, { method: 'POST', body: JSON.stringify({ commandId, input, expected }) })
 const finished = Date.now(), body = await response.json()
 assert.equal(response.status, status, `${action}: ${JSON.stringify(body)}`)
 if (status === 200) assert.equal(body.data.state, 'committed')
 return { commandId, started, finished, body, value: body.data?.value }
}

async function publicLinkedRiskDeletion(h, campaign) {
 const editor = await h.addPerson({ name: 'Risk deletion operator', change: rules => rules.map(rule => rule.entityId === h.r.launchEntities.decision ? { ...rule, writableFields: rule.writableFields.filter(id => id !== h.r.launchFieldIds.decision.riskId) } : rule) })
 const deleter = await h.addPerson({ name: 'Linked risk custodian' })
 const command = (...args) => publicCommand(h, ...args)
 const read = route => publicRead(h, route)
 const quiet = () => mutationSnapshot(h.db, { omitSessionReadTimestamp: true })

 // This same operator can delete a risk; only the secondary decision write is restricted.
 const control = (await command(editor.session, 'risk.create', { fields: fields(h, campaign, { title: 'Unlinked deletion control' }) })).value
 assert.equal((await command(editor.session, 'risk.delete', { id: control.id }, h.expected('risk', control))).value.deletedId, control.id)
 assert.equal((await h.request(h.ownerSession, `/api/risks/${control.id}`)).status, 404)

 const created = (await command(editor.session, 'risk.create', { fields: fields(h, campaign, { title: 'Public linked risk', signal: 'Original supplier evidence' }) })).value
 const decision = (await command(h.ownerSession, 'decision.create', { fields: { campaignId: campaign.id, riskId: created.id, supersedesId: null, title: 'Retain the supplier decision', requesterId: h.actor, assigneeId: null, priority: 'High', dueAt: '2030-12-01T12:00:00.000Z', recommendation: 'Review retained evidence', impact: 'Supplier readiness' } })).value
 const changes = { title: 'Edited public linked risk', signal: 'Reviewed supplier evidence', mitigation: 'Retain the decision on deletion', dueDate: '2030-11-30' }
 const edited = (await command(editor.session, 'risk.patch', { id: created.id, changes }, h.expected('risk', created))).value
 assert.equal(edited.version, created.version + 1)
 const riskRoute = `/api/risks/${created.id}`, decisionRoute = `/api/decisions/${decision.id}`, campaignRoute = `/api/campaigns/${campaign.id}`
 const beforeRisk = await read(riskRoute), beforeDecision = await read(decisionRoute), beforeCampaign = await read(campaignRoute)
 for (const [field, value] of Object.entries(changes)) assert.equal(beforeRisk.risk[field], value, `The public risk retains the edited ${field}`)
 assert.equal(beforeRisk.risk.version, edited.version)
 assert.equal(beforeRisk.risk.campaign.id, campaign.id)
 assert.equal(beforeRisk.risk.owner.id, h.actor)
 assert.equal(beforeRisk.decision.id, decision.id)
 assert.deepEqual(beforeDecision.decision.risk, { id: created.id, title: changes.title })
 assert.ok(beforeCampaign.risks.some(row => row.id === created.id))
 assert.ok(beforeCampaign.decisions.some(row => row.id === decision.id))

 const before = await quiet()
 const refused = await command(editor.session, 'risk.delete', { id: created.id }, h.expected('risk', beforeRisk.risk), 403)
 assert.equal(refused.body.error.code, 'forbidden')
 assert.deepEqual(await quiet(), before, 'A fresh-version linked deletion without detach authority changes no records, activity, audit, receipts or queued effects')
 assert.deepEqual(await read(riskRoute), beforeRisk)
 assert.deepEqual(await read(decisionRoute), beforeDecision)
 assert.deepEqual(await read(campaignRoute), beforeCampaign, 'The refused deletion preserves the public campaign and its activity')

 const deleted = await command(deleter.session, 'risk.delete', { id: created.id }, h.expected('risk', beforeRisk.risk))
 assert.equal(deleted.value.deletedId, created.id)
 const missing = await h.request(h.ownerSession, riskRoute)
 assert.equal(missing.status, 404, 'The authorized deletion removes the public risk')
 const afterDecision = await read(decisionRoute), afterCampaign = await read(campaignRoute)
 assert.deepEqual(afterDecision, { ...beforeDecision, decision: { ...beforeDecision.decision, risk: null, version: beforeDecision.decision.version + 1 } }, 'The public decision survives with only its risk link cleared and one version change')
 assert.ok(!afterCampaign.risks.some(row => row.id === created.id))
 assert.deepEqual(afterCampaign.decisions.find(row => row.id === decision.id), { ...beforeCampaign.decisions.find(row => row.id === decision.id), version: decision.version + 1 })
 const previousIds = new Set(beforeCampaign.activity.map(entry => entry.id))
 assert.deepEqual(afterCampaign.activity.filter(entry => previousIds.has(entry.id)), beforeCampaign.activity, 'Deletion preserves prior public activity')
 const added = afterCampaign.activity.filter(entry => !previousIds.has(entry.id))
 assert.equal(added.length, 2, 'Only the risk deletion and the decision link clearing add activity')
 assert.ok(added.every(entry => entry.actionId === deleted.commandId && entry.actor?.id === deleter.id))
 const detached = added.find(entry => entry.subjectId === decision.id)
 assert.equal(detached.fieldName, 'risk_id')
 assert.equal(detached.previousValue, created.id)
 assert.equal(detached.nextValue, null)
 assert.ok(added.some(entry => entry.subjectId === created.id && entry.type === 'risk.deleted'))

 const after = await quiet(), storedBefore = before.decisions.find(row => row.id === decision.id), storedAfter = after.decisions.find(row => row.id === decision.id)
 assert.ok(storedAfter.updated_at >= deleted.started && storedAfter.updated_at <= deleted.finished)
 assert.deepEqual(storedAfter, { ...storedBefore, risk_id: null, version: storedBefore.version + 1, updated_at: storedAfter.updated_at, launch_updated_iso: new Date(storedAfter.updated_at).toISOString() }, 'Independent storage retains every decision value except the link and its single versioned update')
 assert.deepEqual(after.risks, before.risks.filter(row => row.id !== created.id), 'Only the selected risk is removed')
 assert.deepEqual(after.decisions.filter(row => row.id !== decision.id), before.decisions.filter(row => row.id !== decision.id), 'Every unrelated decision stays exact')
 for (const table of tables.filter(table => !['risks', 'decisions'].includes(table))) assert.deepEqual(after[table], before[table], `${table} stays unchanged by authorized risk deletion`)
 const receipt = await h.request(deleter.session, `/api/v1/commands/${deleted.commandId}`), receiptBody = await receipt.json()
 assert.equal(receipt.status, 403, 'Current authority refuses a retained receipt whose risk subject has been deleted')
 assert.equal(receiptBody.error.code, 'forbidden')
 assert.equal(Object.hasOwn(receiptBody, 'data'), false)
 assert.deepEqual(await quiet(), after, 'The refused deleted-subject receipt changes nothing')
}

async function publicLifecycle(h, campaign) {
 const resolver = await h.addPerson({ name: 'Risk resolver' }), reopener = await h.addPerson({ name: 'Risk reopener' })
 assert.notEqual(resolver.id, h.actor)
 assert.notEqual(reopener.id, resolver.id)
 const read = (route, session) => publicRead(h, route, session), command = (...args) => publicCommand(h, ...args)
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

// Native commands reach Watching, Escalated and In progress; the installed example
// supplies Needs decision, which no command sets. Each is open in every public
// projection, resolves with a note and reopens to Watching; Resolved is not open.
async function publicOpenStates(h) {
 const read = (route, session) => publicRead(h, route, session), command = (...args) => publicCommand(h, ...args)
 const quiet = () => mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
 const lens = async () => {
  const items = []; let cursor = null
  do {
   const page = await read(`/api/risks/lens${cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`}`)
   items.push(...page.items); cursor = page.nextCursor ?? null
  } while (cursor !== null)
  return new Map(items.map(row => [row.id, row.state]))
 }
 const projections = async id => {
  const { risk } = await read(`/api/risks/${id}`), detail = await read(`/api/campaigns/${risk.campaign.id}`)
  return { risk, rating: detail.campaign.riskRating, open: detail.risks.map(row => [row.id, row.state]) }
 }
 // A launch date already passed keeps each High risk inside the shipped lens window on any clock.
 const create = async code => {
  const campaign = (await command(h.ownerSession, 'campaign.create', { fields: { code, name: `${code} launch`, ownerId: h.actor, startDate: '2026-01-05', launchDate: '2026-02-02', objective: 'Prove the open risk states', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} } })).value
  return (await command(h.ownerSession, 'risk.create', { fields: fields(h, campaign, { title: `${code} evidence` }) })).value
 }
 const watching = await create('OPEN-WATCHING'), escalated = await create('OPEN-ESCALATED'), progressing = await create('OPEN-PROGRESS')
 await command(h.ownerSession, 'risk.escalate', { id: escalated.id, reason: 'Supplier evidence needs attention' }, h.expected('risk', escalated))
 const awaiting = (await command(h.ownerSession, 'risk.escalate', { id: progressing.id, reason: 'Supplier evidence needs a decision' }, h.expected('risk', progressing))).value.risk
 const decision = (await command(h.ownerSession, 'decision.create', { fields: { campaignId: awaiting.campaignId, riskId: awaiting.id, supersedesId: null, title: 'Approve the evidence plan', requesterId: h.actor, assigneeId: null, priority: 'High', dueAt: new Date(Date.now() + 86400000).toISOString(), recommendation: 'Proceed with the evidence plan', impact: 'Launch readiness' } })).value
 await command(h.ownerSession, 'decision.outcome', { id: decision.id, outcome: 'Approved', rationale: '' }, h.expected('decision', decision))
 const retained = JSON.parse(await readFile(new URL('../../sample-data/cradle.json', import.meta.url), 'utf8')).risks.filter(row => row.state === 'Needs decision')
 assert.equal(retained.length, 1, 'The installed example independently supplies one risk awaiting a decision')
 const matrix = [['Watching', watching.id], ['In progress', progressing.id], ['Needs decision', retained[0].id], ['Escalated', escalated.id]]
 const limited = await h.addPerson({ name: 'Risk editor without state', change: rules => rules.map(rule => rule.entityId === h.r.launchEntities.risk ? { ...rule, writableFields: rule.writableFields.filter(id => id !== h.r.launchFieldIds.risk.state) } : rule) })

 let listed = await lens()
 const opened = await quiet()
 for (const [state, id] of matrix) {
  const { risk, rating, open } = await projections(id)
  assert.equal(risk.state, state)
  for (const field of ['resolutionNote', 'resolvedAt', 'resolvedById']) assert.equal(risk[field], null)
  assert.deepEqual(open, [[id, state]], `${state} is listed as an open risk of its campaign`)
  assert.equal(rating, 'High', `${state} counts toward the campaign risk rating`)
  assert.equal(listed.get(id), state, `${state} stays in the shipped open-risk lens`)
  assert.equal((await command(h.ownerSession, 'risk.reopen', { id }, h.expected('risk', risk), 400)).body.error.code, 'validation', `An open ${state} risk cannot reopen`)
 }
 // Only the lifecycle commands change state: record edits and an operator without state authority cannot resolve.
 for (const changes of [{ state: 'Resolved' }, { resolutionNote: 'Edited outcome' }]) {
  assert.equal((await command(h.ownerSession, 'risk.patch', { id: watching.id, changes }, h.expected('risk', watching), 400)).body.error.code, 'validation')
 }
 assert.equal((await command(limited.session, 'risk.resolve', { id: watching.id, resolutionNote: 'Closed without authority' }, h.expected('risk', watching), 403)).body.error.code, 'forbidden')
 assert.deepEqual(await quiet(), opened, 'Refused reopening, record edits and unauthorized resolution change nothing')

 for (const [state, id] of matrix) {
  const { risk } = await read(`/api/risks/${id}`)
  assert.equal((await command(h.ownerSession, 'risk.resolve', { id, resolutionNote: `Closed from ${state}` }, h.expected('risk', risk))).value.state, 'Resolved', `${state} resolves with a note`)
 }
 listed = await lens()
 const closed = await quiet()
 for (const [state, id] of matrix) {
  const { risk, rating, open } = await projections(id)
  assert.equal(risk.state, 'Resolved')
  assert.equal(risk.resolutionNote, `Closed from ${state}`)
  assert.equal(risk.resolvedById, h.actor)
  assert.deepEqual(open, [], `A risk resolved from ${state} is no longer open on its campaign`)
  assert.equal(rating, 'None', `A risk resolved from ${state} no longer counts toward the rating`)
  assert.equal(listed.has(id), false, `A risk resolved from ${state} leaves the open-risk lens`)
  assert.equal((await command(h.ownerSession, 'risk.resolve', { id, resolutionNote: 'Closed again' }, h.expected('risk', risk), 400)).body.error.code, 'validation')
 }
 const resolvedWatching = (await read(`/api/risks/${watching.id}`)).risk
 assert.equal((await command(limited.session, 'risk.reopen', { id: watching.id }, h.expected('risk', resolvedWatching), 403)).body.error.code, 'forbidden')
 assert.deepEqual(await quiet(), closed, 'A resolved risk refuses another resolution and unauthorized reopening without change')

 for (const [state, id] of matrix) {
  const { risk } = await read(`/api/risks/${id}`)
  assert.equal((await command(h.ownerSession, 'risk.reopen', { id }, h.expected('risk', risk))).value.state, 'Watching', `A risk resolved from ${state} reopens to Watching`)
 }
 listed = await lens()
 for (const [state, id] of matrix) {
  const { risk, rating, open } = await projections(id)
  assert.equal(risk.state, 'Watching')
  assert.deepEqual(open, [[id, 'Watching']], `A risk reopened after ${state} is open again`)
  assert.equal(rating, 'High')
  assert.equal(listed.get(id), 'Watching')
 }
}

export async function verifyRiskClauses(h) {
 const reader = h.r.createLaunchReader(h.db, h.context.policy)
 const campaign = await h.campaign('RISK-LIFECYCLE'), other = await h.campaign('RISK-ISOLATION')
 await h.commit('risk.create', { fields: fields(h, other, { title: 'Unrelated campaign risk' }) })
 await h.commit('deliverable.create', { fields: { campaignId: campaign.id, title: 'Unrelated deliverable', ownerId: h.actor, dueDate: null } })
 await h.commit('milestone.create', { fields: { campaignId: campaign.id, title: 'Unrelated milestone', ownerId: h.actor, type: 'Review', status: 'Not started', startDate: '2026-10-20', endDate: null, conflictReason: null } })
 await lifecycle(h, reader, campaign)
 await publicLinkedRiskDeletion(h, campaign)
 await ratings(h, reader, campaign)
 await shippedLens(h, reader)
 await publicLifecycle(h, campaign)
 await publicOpenStates(h)
 await verifyPublicRiskIsolation(h, { read: (route, session) => publicRead(h, route, session), command: (...args) => publicCommand(h, ...args), snapshot: id => snapshot(h.db, id) })
}
