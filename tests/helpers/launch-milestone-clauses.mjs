import assert from 'node:assert/strict'
import { mutationSnapshot } from './launch-write-context.mjs'

// MILE-001's deletion outcome uses the emitted Worker's native commands and
// public reads. Keep the broader internal clause assertions below as well.
export async function verifyPublicMilestoneDeletion(h) {
 const operator = await h.addPerson({ name: 'Milestone operator' })
 const base = `/api/v1/apps/${h.r.LAUNCH_APP_ID}/entities/${h.r.launchEntities.milestone}`
 const read = async (route, session = h.ownerSession) => {
  const response = await h.request(session, route)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
 }
 const submit = (session, action, input, revisions = []) => h.request(session, `/api/v1/commands/launch.${action}`, {
  method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), input, expected: revisions }),
 })
 const write = async (action, input, revisions = [], session = operator.session) => {
  const response = await submit(session, action, input, revisions)
  assert.equal(response.status, 200, await response.clone().text())
  const { data } = await response.json()
  assert.equal(data.state, 'committed')
  return data.value
 }
 const campaign = await write('campaign.create', { fields: {
  code: 'MILE-PUBLIC', name: 'Milestone deletion', ownerId: h.actor,
  startDate: '2026-11-01', launchDate: '2026-12-01', objective: 'Independent milestones',
  statusSummary: '', phase: 'Planning', status: 'On track', health: 50,
  budgetMinor: 0, spendMinor: 0, tags: [], customFields: {},
 } })
 const fields = { campaignId: campaign.id, title: 'Public review', ownerId: operator.id,
  type: 'Review', status: 'Not started', startDate: '2026-11-20', endDate: null, conflictReason: null }
 const created = await write('milestone.create', { fields })
 const neighbor = await write('milestone.create', { fields: {
  ...fields, title: 'Independent publication', ownerId: h.actor, type: 'Publish',
  startDate: '2026-11-25', endDate: '2026-11-26',
 } })
 const record = async (id, session) => (await read(`${base}/records/${id}`, session)).data.record
 const detail = async id => (await read(`/api/milestones/${id}`)).milestone
 const collection = async () => ({
  campaign: (await read(`/api/campaigns/${campaign.id}`)).milestones,
  timeline: (await read('/api/milestones/timeline')).items,
 })
 const original = await detail(created.id), neighborRecord = await record(neighbor.id), neighborDetail = await detail(neighbor.id)
 for (const [field, value] of Object.entries(fields)) {
  if (field === 'campaignId') assert.equal(original.campaign.id, value)
  else if (field === 'ownerId') assert.equal(original.owner.id, value)
  else assert.deepEqual(original[field], value)
 }
 const neighborBefore = await collection()
 for (const rows of Object.values(neighborBefore)) {
  assert.ok(rows.some(row => row.id === created.id), 'The created milestone is publicly listed before deletion')
  assert.ok(rows.some(row => row.id === neighbor.id), 'The independent neighboring milestone is publicly listed')
 }
 const revision = await record(created.id, operator.session)
 await write('milestone.patch', { id: created.id, changes: {
  title: 'Reviewed public milestone', startDate: '2026-11-21', endDate: '2026-11-22', status: 'Watch',
 } }, h.expected('milestone', revision))
 const current = await record(created.id, operator.session), edited = await detail(created.id)
 assert.equal(current.version, revision.version + 1)
 assert.equal(edited.version, current.version)
 assert.equal(edited.title, 'Reviewed public milestone')
 assert.equal(edited.startDate, '2026-11-21')
 assert.equal(edited.endDate, '2026-11-22')
 assert.equal(edited.status, 'Watch')
 assert.deepEqual(await record(neighbor.id), neighborRecord, 'Editing one milestone leaves the neighboring record unchanged')
 assert.deepEqual(await detail(neighbor.id), neighborDetail)

 // Retain this signed-in operator and the freshly read revision while removing
 // only delete authority; read and patch authority remain in the current policy.
 const narrowed = operator.rules.map(rule => rule.entityId === h.r.launchEntities.milestone
  ? { ...rule, actions: rule.actions.filter(action => action !== 'launch.milestone.delete') } : rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?')
  .bind(JSON.stringify(narrowed), operator.policyId).run()
 assert.deepEqual(await record(created.id, operator.session), current)
 const visibleBefore = await collection(), before = await mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
 const denied = await submit(operator.session, 'milestone.delete', { id: created.id }, h.expected('milestone', current))
 assert.equal(denied.status, 404, await denied.clone().text())
 assert.equal((await denied.json()).error.code, 'not_found')
 assert.deepEqual(await mutationSnapshot(h.db, { omitSessionReadTimestamp: true }), before,
  'A delete refused by current authority changes no stored product, activity, audit, event or admission')
 assert.deepEqual(await record(created.id), current)
 assert.deepEqual(await detail(created.id), edited)
 assert.deepEqual(await collection(), visibleBefore)

 const authorized = await record(created.id)
 const deleted = await write('milestone.delete', { id: created.id }, h.expected('milestone', authorized), h.ownerSession)
 assert.equal(deleted.deletedId, created.id)
 for (const route of [`${base}/records/${created.id}`, `/api/milestones/${created.id}`]) {
  assert.equal((await h.request(h.ownerSession, route)).status, 404, 'Deleted milestone detail is publicly absent')
 }
 const after = await collection()
 for (const key of ['campaign', 'timeline']) {
  assert.ok(!after[key].some(row => row.id === created.id), `Deleted milestone is absent from ${key}`)
  assert.deepEqual(after[key], visibleBefore[key].filter(row => row.id !== created.id),
   'Deletion removes only the selected milestone from populated public collections')
  assert.deepEqual(after[key].find(row => row.id === neighbor.id), neighborBefore[key].find(row => row.id === neighbor.id))
 }
 assert.deepEqual(await record(neighbor.id), neighborRecord, 'Deletion preserves the complete independently captured neighboring record')
 assert.deepEqual(await detail(neighbor.id), neighborDetail)
}

const shift = (day, count) => new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10)
const dateIn = (instant, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant))
function localEight(day, timezone) {
 let instant = Date.parse(day + 'T08:00:00Z')
 for (let attempt = 0; attempt < 3; attempt++) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant)).map(part => [part.type, part.value]))
  const represented = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`)
  instant += Date.parse(day + 'T08:00:00Z') - represented
 }
 assert.equal(dateIn(instant, timezone), day)
 return new Date(instant)
}

// Folded into a clause-tagged launch journey: no additional test registration.
// Writes use command handlers/admission or the real retained daily scheduler.
export async function verifyMilestoneClauses(h) {
 const { r, db, ctx, actor, commit, prepare, expected } = h
 const settings = await db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first()
 const today = dateIn(ctx.now, settings.timezone)
 const reader = r.createLaunchReader(db, h.context.policy)
 const get = row => reader.get(ctx, 'milestone', row.id)
 const create = (campaign, changes = {}) => commit('milestone.create', { fields: { campaignId: campaign.id, title: 'Release checkpoint', ownerId: actor, type: 'Review', status: 'Not started', startDate: today, endDate: null, conflictReason: null, ...changes } })
 const patch = (row, changes) => commit('milestone.patch', { id: row.id, changes }, expected('milestone', row))
 const dependencies = (row, rows) => commit('milestone.set-predecessors', { id: row.id, predecessorIds: rows.map(item => item.id) }, expected('milestone', row))
 const snapshot = async () => {
  const tables = ['milestones', 'milestone_dependencies', 'activity_entries', 'launch_readiness', 'notifications', 'command_admissions', 'admission_audit', 'admission_events', 'admission_outbox']
  const rows = await db.batch(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`)))
  return rows.map(result => result.results)
 }
 const invalid = async (action, input, revisions = []) => {
  const before = await snapshot()
  await assert.rejects(async () => prepare(action, input, revisions), error => error.code === 'validation' || error.name === 'ZodError', action)
  assert.deepEqual(await snapshot(), before, 'Rejected milestone input must change nothing')
 }
 const campaign = await h.campaign('MILE-A'), other = await h.campaign('MILE-Z')

 // MILE-001: both date shapes, every allowed type/status, required relationships,
 // creation state, ordinary editing, deletion, and domain/schema rejection.
 let editable
 const types = ['Launch', 'Review', 'Approval', 'Decision', 'Event', 'Publish']
 const statuses = ['Not started', 'On track', 'Watch', 'At risk', 'Blocked', 'Complete']
 for (const [index, type] of types.entries()) {
  let row = await create(campaign, { type, title: type + ' checkpoint', endDate: index % 2 ? shift(today, 2) : null })
  assert.equal(row.status, 'Not started')
  assert.equal(row.type, type)
  assert.equal(row.campaignId, campaign.id)
  assert.equal(row.ownerId, actor)
  row = await patch(row, { status: statuses[index], title: 'Edited ' + type })
  assert.equal((await get(row)).status, statuses[index])
  assert.equal((await get(row)).title, 'Edited ' + type)
  if (index === 1) editable = row
 }
 const fields = { campaignId: campaign.id, title: 'Validation checkpoint', ownerId: actor, type: 'Review', status: 'Not started', startDate: today, endDate: null, conflictReason: null }
 for (const changes of [{ title: '  ' }, { ownerId: null }, { campaignId: null }, { ownerId: r.createUlid() }, { campaignId: r.createUlid() }, { type: 'Other' }, { status: 'Other' }, { status: 'On track' }, { endDate: shift(today, -1) }]) await invalid('milestone.create', { fields: { ...fields, ...changes } })
 await invalid('milestone.patch', { id: editable.id, changes: { endDate: shift(today, -1) } }, expected('milestone', editable))
 editable = await patch(editable, { campaignId: other.id, startDate: shift(today, 1), endDate: shift(today, 1) })
 assert.equal((await get(editable)).campaignId, other.id, 'A milestone has one current campaign')
 assert.equal((await reader.list(ctx, 'milestone', { campaignId: campaign.id })).items.some(row => row.id === editable.id), false)
 await commit('milestone.delete', { id: editable.id }, expected('milestone', editable))
 await assert.rejects(() => get(editable), error => error.code === 'not_found')

 // MILE-003: cross-campaign predecessors, cycle atomicity, conflict markers,
 // nonblank override activity, and independent dates in both directions.
 let predecessor = await create(other, { title: 'Predecessor range', startDate: today, endDate: shift(today, 3) })
 const extra = await create(campaign, { title: 'Additional predecessor', startDate: shift(today, -2) })
 let successor = await create(campaign, { title: 'Dependent checkpoint', startDate: shift(today, 2) })
 successor = await dependencies(successor, [predecessor, extra])
 assert.deepEqual(new Set((await get(successor)).predecessorIds), new Set([predecessor.id, extra.id]))
 const tail = await dependencies(await create(other, { title: 'Dependency tail', startDate: shift(today, 10) }), [successor])
 for (const [row, ids] of [[successor, [successor.id]], [predecessor, [successor.id]], [predecessor, [tail.id]], [successor, [predecessor.id, predecessor.id]]]) await invalid('milestone.set-predecessors', { id: row.id, predecessorIds: ids }, expected('milestone', row))
 await assert.rejects(async () => prepare('milestone.set-predecessors', { id: successor.id, predecessorIds: [r.createUlid()] }, expected('milestone', successor)), error => error.code === 'not_found')
 for (const row of [predecessor, successor]) {
  assert.equal((await get(row)).dependencyConflict, true, 'Both dependency endpoints carry the marker')
  assert.equal((await reader.list(ctx, 'milestone', { campaignId: row.campaignId })).items.find(item => item.id === row.id).dependencyConflict, true)
 }
 await invalid('milestone.patch', { id: successor.id, changes: { status: 'On track' } }, expected('milestone', successor))
 await invalid('milestone.patch', { id: successor.id, changes: { status: 'On track', conflictReason: ' \t ' } }, expected('milestone', successor))
 const reason = 'Approved overlap after owner review'
 successor = await patch(successor, { status: 'On track', conflictReason: reason })
 assert.equal((await get(successor)).conflictReason, reason)
 const activity = (await db.prepare("SELECT actor_id,next_value FROM activity_entries WHERE campaign_id=? AND subject_id=? AND field_name='conflict_reason'").bind(campaign.id, successor.id).all()).results
 assert.ok(activity.some(row => row.actor_id === actor && row.next_value === reason), 'The dependency override is attributed in campaign activity')
 const successorBefore = await get(successor)
 predecessor = await patch(predecessor, { endDate: shift(today, 2) })
 assert.deepEqual(await get(successor), { ...successorBefore, dependencyConflict: false }, 'Changing a predecessor date never reschedules the successor')
 const predecessorBefore = await get(predecessor)
 successor = await patch(successor, { startDate: shift(today, 4) })
 assert.deepEqual(await get(predecessor), predecessorBefore, 'Changing a successor date never reschedules its predecessor')

 // MILE-002: use the installed definition, preserving date then campaign-code
 // ordering and exclusion of archived campaigns. Rendering/scale belongs to UI.
 const shipped = await db.prepare("SELECT * FROM lenses WHERE shipped_key='timeline'").first()
 const definition = { name: shipped.name, description: shipped.description, recordType: shipped.record_type, conditions: JSON.parse(shipped.conditions_json), sort: JSON.parse(shipped.sort_json), fields: JSON.parse(shipped.fields_json), display: shipped.display }
 const timeline = await r.previewLens(db, definition, ctx.now)
 const sorted = [...timeline.items].sort((a, b) => a.startDate.localeCompare(b.startDate) || ({ [campaign.id]: campaign.code, [other.id]: other.code }[a.campaignId] ?? '').localeCompare({ [campaign.id]: campaign.code, [other.id]: other.code }[b.campaignId] ?? '') || a.id.localeCompare(b.id))
 const ours = timeline.items.filter(row => [campaign.id, other.id].includes(row.campaignId))
 assert.deepEqual(ours.map(row => row.id), sorted.filter(row => [campaign.id, other.id].includes(row.campaignId)).map(row => row.id))
 const all = [...(await reader.list(ctx, 'milestone', { campaignId: campaign.id })).items, ...(await reader.list(ctx, 'milestone', { campaignId: other.id })).items]
 assert.deepEqual(new Set(ours.map(row => row.id)), new Set(all.map(row => row.id)))

 // MILE-006: today is inclusive; a range uses its end, and completion clears
 // overdue on detail and collection reads in the configured workspace timezone.
 const overdueCases = [
  [{ startDate: shift(today, -1) }, true],
  [{ startDate: today }, false],
  [{ startDate: shift(today, -3), endDate: today }, false],
  [{ startDate: shift(today, -3), endDate: shift(today, -1) }, true],
 ]
 for (const [changes, overdue] of overdueCases) {
  let row = await create(campaign, changes)
  assert.equal((await get(row)).overdue, overdue)
  assert.equal((await reader.list(ctx, 'milestone', { campaignId: campaign.id })).items.find(item => item.id === row.id).overdue, overdue)
  row = await patch(row, { status: 'Complete' })
  assert.equal((await get(row)).overdue, false)
 }

 // MILE-005: genuine shipped schedule and retained service authority create the
 // requests. D1 is used only to observe their durable states and notifications.
 const archivedCampaign = await h.campaign('MILE-ARCHIVE')
 const scheduleDay = shift(today, 1)
 let moving = await create(campaign, { type: 'Launch', title: 'Rescheduled launch', startDate: shift(today, 2) })
 let completing = await create(campaign, { type: 'Launch', title: 'Completing launch', startDate: scheduleDay })
 const deleting = await create(campaign, { type: 'Launch', title: 'Deleting launch', startDate: scheduleDay })
 const archiving = await create(archivedCampaign, { type: 'Launch', title: 'Archived launch', startDate: scheduleDay })
 const past = await create(campaign, { type: 'Launch', title: 'Past launch', startDate: shift(today, -1) })
 let clock = localEight(scheduleDay, settings.timezone)
 const service = r.createLegacyAutomationAuthority(h.context, () => clock)
 const admission = r.createAdmissionService(db, { authorizeReplay: service.authorizeReplay })
 const runtime = r.createLegacyAutomationRuntime(h.context, admission, { releaseId: h.context.releaseId, authority: service.authority, context: service.context })
 const readinessDefinition = await db.prepare("SELECT * FROM automations WHERE shipped_key='launch-readiness'").first()
 if (!readinessDefinition.enabled) await commit('automation.enable', { id: readinessDefinition.id }, expected('automation', readinessDefinition))
 const evaluate = async day => {
  clock = localEight(day, settings.timezone)
  const ids = await runtime.schedule(service.scheduleContext())
  for (const id of ids) {
   await runtime.execute(() => service.dispatchContext(id), id)
   assert.equal((await db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(id).first()).state, 'Succeeded')
  }
 }
 const requests = async row => (await db.prepare('SELECT * FROM launch_readiness WHERE milestone_id=? ORDER BY created_at,id').bind(row.id).all()).results
 await evaluate(scheduleDay)
 const originals = new Map()
 for (const row of [moving, completing, deleting, archiving]) {
  const outstanding = (await requests(row)).filter(request => request.state === 'Outstanding')
  assert.equal(outstanding.length, 1)
  originals.set(row.id, outstanding[0])
 }
 assert.equal((await requests(past)).length, 0, 'A launch already in the past receives no request')
 moving = await patch(moving, { startDate: shift(today, 6) })
 assert.equal((await requests(moving))[0].state, 'Cancelled')
 moving = await patch(moving, { startDate: shift(today, 2) })
 assert.equal((await requests(moving)).filter(request => request.state === 'Outstanding').length, 0, 'Moving inside waits for the next daily evaluation')
 completing = await patch(completing, { status: 'Complete' })
 assert.equal((await requests(completing))[0].state, 'Cancelled')
 await commit('milestone.delete', { id: deleting.id }, expected('milestone', deleting))
 assert.equal((await requests(deleting)).filter(request => request.state === 'Outstanding').length, 0)
 await commit('campaign.archive', { id: archivedCampaign.id }, expected('campaign', archivedCampaign))
 assert.equal((await requests(archiving))[0].state, 'Cancelled')
 for (const request of originals.values()) {
  assert.ok(request.notification_id, 'The real scheduled request must address an in-app notification')
  assert.equal((await db.prepare('SELECT unavailable FROM notifications WHERE id=?').bind(request.notification_id).first()).unavailable, 1)
 }
 await evaluate(scheduleDay)
 assert.equal((await requests(moving)).filter(request => request.state === 'Outstanding').length, 0)
 await evaluate(shift(scheduleDay, 1))
 assert.equal((await requests(moving)).filter(request => request.state === 'Outstanding').length, 1)
 assert.equal((await requests(completing)).filter(request => request.state === 'Outstanding').length, 0)
 assert.equal((await requests(archiving)).filter(request => request.state === 'Outstanding').length, 0)
 assert.equal((await requests(past)).length, 0)
 const afterArchive = await r.previewLens(db, definition, ctx.now)
 assert.equal(afterArchive.items.some(row => row.campaignId === archivedCampaign.id), false)
}
