import assert from 'node:assert/strict'

const shift = (day, count) => new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10)
const dateIn = (instant, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant))

// The emitted Worker admits every write; detail, timeline and campaign activity
// are read independently. The retained internal graph journey below still runs.
export async function verifyPublicMilestoneDependencies(h) {
 const operator = await h.addPerson({ name: 'Milestone operator' })
 assert.notEqual(operator.id, h.actor)
 const read = async route => {
  const response = await h.request(operator.session, route)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
 }
 const get = async id => (await read(`/api/milestones/${id}`)).milestone
 const submit = async (action, input, commandId = h.r.createUlid()) => h.request(operator.session, `/api/v1/commands/launch.${action}`, { method: 'POST', body: JSON.stringify({ commandId, input, expected: input.id ? h.expected('milestone', await get(input.id)) : [] }) })
 const write = async (action, input, commandId) => {
  const response = await submit(action, input, commandId)
  assert.equal(response.status, 200, await response.clone().text())
  const receipt = await response.json()
  assert.equal(receipt.data.state, 'committed')
  return receipt.data.value
 }
 const campaign = async code => write('campaign.create', { fields: { code, name: code, ownerId: h.actor, startDate: '2027-06-01', launchDate: '2027-06-30', objective: 'Dependency review', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} } })
 const predecessorCampaign = await campaign('MILE-PUBLIC-P'), successorCampaign = await campaign('MILE-PUBLIC-S')
 const create = (parent, title, startDate, endDate = null) => write('milestone.create', { fields: { campaignId: parent.id, title, ownerId: h.actor, type: 'Review', status: 'Not started', startDate, endDate, conflictReason: null } })
 const predecessor = await create(predecessorCampaign, 'Public predecessor', '2027-06-01', '2027-06-06')
 const extra = await create(successorCampaign, 'Public extra predecessor', '2027-06-01')
 const successor = await create(successorCampaign, 'Public successor', '2027-06-05')
 const tail = await create(predecessorCampaign, 'Public dependency tail', '2027-06-20')
 await write('milestone.set-predecessors', { id: successor.id, predecessorIds: [predecessor.id, extra.id] })
 await write('milestone.set-predecessors', { id: tail.id, predecessorIds: [successor.id] })
 const linked = await get(successor.id)
 assert.equal(linked.campaign.id, successorCampaign.id)
 assert.equal((await get(predecessor.id)).campaign.id, predecessorCampaign.id)
 assert.deepEqual(new Set(linked.predecessors.map(row => row.id)), new Set([predecessor.id, extra.id]), 'Public detail retains predecessors from both campaigns')
 const state = async () => ({
  details: await Promise.all([predecessor, extra, successor, tail].map(row => get(row.id))),
  timeline: await read('/api/milestones/timeline'),
  campaigns: await Promise.all([predecessorCampaign, successorCampaign].map(row => read(`/api/campaigns/${row.id}`))),
 })
 const refuse = async (action, input, message) => {
  const visible = await state(), stored = await h.snapshot()
  const response = await submit(action, input)
  assert.equal(response.status, 400, await response.clone().text())
  const error = (await response.json()).error
  assert.equal(error.code, 'validation'); assert.match(error.message, message)
  assert.deepEqual(await h.snapshot(), stored, 'A current-version validation refusal changes no record, dependency, activity or effect')
  assert.deepEqual(await state(), visible, 'Refusal leaves public details, timeline and campaign activity unchanged')
 }
 await refuse('milestone.set-predecessors', { id: predecessor.id, predecessorIds: [tail.id] }, /cycle/i)
 const markers = async expectedConflict => {
  const timeline = (await read('/api/milestones/timeline')).milestones
  for (const row of [predecessor, successor]) {
   assert.equal((await get(row.id)).dependencyConflict, expectedConflict, 'Detail reflects the derived conflict at both endpoints')
   assert.equal(timeline.find(item => item.id === row.id)?.dependencyConflict, expectedConflict, 'Timeline reflects the derived conflict at both endpoints')
  }
  for (const row of [extra, tail]) assert.equal((await get(row.id)).dependencyConflict, false, 'Nonconflicting edges stay clear')
 }
 await markers(true)
 await refuse('milestone.patch', { id: successor.id, changes: { status: 'On track' } }, /conflictReason/)
 await refuse('milestone.patch', { id: successor.id, changes: { status: 'On track', conflictReason: ' \t ' } }, /schema/)
 const reason = 'Owner reviewed the packaging overlap', commandId = h.r.createUlid(), lower = Date.now()
 await write('milestone.patch', { id: successor.id, changes: { status: 'On track', conflictReason: reason } }, commandId)
 const upper = Date.now(), overridden = await get(successor.id)
 assert.equal(overridden.status, 'On track'); assert.equal(overridden.conflictReason, reason)
 const retained = (await read(`/api/v1/commands/${commandId}`)).data
 assert.equal((retained.value ?? retained.result).conflictReason, reason)
 const entries = (await read(`/api/campaigns/${successorCampaign.id}`)).activity.filter(row => row.actionId === commandId && row.subjectId === successor.id && row.fieldName === 'conflict_reason')
 assert.equal(entries.length, 1)
 assert.equal(entries[0].previousValue, null); assert.equal(entries[0].nextValue, reason)
 assert.equal(entries[0].actor.id, operator.id); assert.equal(entries[0].actor.name, 'Milestone operator')
 assert.ok(Date.parse(entries[0].occurredAt) >= lower && Date.parse(entries[0].occurredAt) <= upper, 'Override activity is attributed within the HTTP request window')
 await markers(true)
 const stored = id => h.db.prepare('SELECT * FROM milestones WHERE id=?').bind(id).first()
 const successorBefore = await stored(successor.id), successorDetail = await get(successor.id), predecessorBefore = await get(predecessor.id)
 assert.equal(successorBefore.start_date, '2027-06-05'); assert.equal(successorBefore.end_date, null)
 await write('milestone.patch', { id: predecessor.id, changes: { endDate: '2027-06-05' } })
 assert.equal((await get(predecessor.id)).endDate, '2027-06-05')
 assert.equal((await get(predecessor.id)).version, predecessorBefore.version + 1)
 assert.deepEqual(await stored(successor.id), successorBefore, 'Editing predecessor dates leaves every stored successor value and version unchanged')
 assert.deepEqual(await get(successor.id), { ...successorDetail, dependencyConflict: false })
 await markers(false)
 const predecessorStored = await stored(predecessor.id), predecessorDetail = await get(predecessor.id), successorVersion = (await get(successor.id)).version
 assert.equal(predecessorStored.start_date, '2027-06-01'); assert.equal(predecessorStored.end_date, '2027-06-05')
 await write('milestone.patch', { id: successor.id, changes: { startDate: '2027-06-04' } })
 assert.equal((await get(successor.id)).startDate, '2027-06-04')
 assert.equal((await get(successor.id)).version, successorVersion + 1)
 assert.equal((await get(successor.id)).conflictReason, reason)
 assert.deepEqual(await stored(predecessor.id), predecessorStored, 'Editing successor dates leaves every stored predecessor value and version unchanged')
 assert.deepEqual(await get(predecessor.id), { ...predecessorDetail, dependencyConflict: true })
 await markers(true)
}

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
