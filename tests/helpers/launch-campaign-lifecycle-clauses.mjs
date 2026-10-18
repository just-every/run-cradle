import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mutationSnapshot } from './launch-write-context.mjs'

const shift = (date, count, field = 'date') => {
 assert.ok(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), `${field}: expected YYYY-MM-DD, received ${JSON.stringify(date)}`)
 const parsed = Date.parse(date + 'T12:00:00Z')
 assert.ok(Number.isFinite(parsed), `${field}: invalid calendar date ${date}`)
 assert.equal(new Date(parsed).toISOString().slice(0, 10), date, `${field}: invalid calendar date`)
 return new Date(parsed + count * 86400000).toISOString().slice(0, 10)
}
const rows = async (db, table, campaignId) => (await db.prepare(`SELECT * FROM ${table} WHERE campaign_id=? ORDER BY 1`).bind(campaignId).all()).results
const json = async (h, path) => { const response = await h.request(h.ownerSession, path); assert.equal(response.status, 200, path); return response.json() }
const children = ['deliverable', 'milestone', 'risk', 'decision']

async function stagedImport(h, campaign) {
 const command = async (action, input) => {
  const response = await h.request(h.ownerSession, `/api/v1/commands/${action}`, { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), expected: [], input }) })
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body.error))
  return body.data.value
 }
 const staged = await command('source.stage', { appId: h.r.LAUNCH_APP_ID, purpose: 'import' })
 const csv = `Code,Summary\r\n${campaign.code},Imported lifecycle status\r\n`
 const upload = await command('upload.begin', { appId: h.r.LAUNCH_APP_ID, subject: staged.subject, filename: 'lifecycle.csv', mediaType: 'text/csv', bytes: Buffer.byteLength(csv), sha256: createHash('sha256').update(csv).digest('hex') })
 const put = await h.request(h.ownerSession, upload.uploadUrl, { method: 'PUT', headers: { 'content-type': 'text/csv' }, body: csv })
 assert.equal(put.status, 200, await put.text())
 const response = await h.request(h.ownerSession, '/api/v1/launch/imports/preview', { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), expected: [], input: { kind: 'campaign', fileId: upload.file.id, mapping: [{ column: 'Code', field: 'code' }, { column: 'Summary', field: 'statusSummary' }] } }) })
 const preview = await response.json()
 assert.equal(response.status, 200, JSON.stringify(preview.error))
 assert.equal(preview.data.value.state, 'valid')
 assert.ok((await h.db.prepare('SELECT COUNT(*) AS n FROM portability_preview_rows WHERE preview_id=? AND record_id=?').bind(preview.data.value.id, campaign.id).first()).n > 0, 'A real staged CSV preview references the campaign')
 return { previewId: preview.data.value.id, fileId: upload.file.id }
}

async function fixture(h, reader) {
 let campaign = await h.campaign('LIFECYCLE-PROOF')
 const custom = await h.commit('custom-field.save', { field: { name: 'Lifecycle date', type: 'date' } })
 campaign = await h.commit('campaign.patch', { id: campaign.id, changes: { name: 'Lifecycleproof campaign', status: 'At risk', health: 37, tags: ['Lifecycle', 'Review'], customFields: { [custom.id]: '2026-11-10' } } }, h.expected('campaign', campaign))
 const deliverable = await h.commit('deliverable.create', { fields: { campaignId: campaign.id, title: 'Lifecycleproof deliverable', ownerId: h.actor, dueDate: '2026-09-20' } })
 const undated = await h.commit('deliverable.create', { fields: { campaignId: campaign.id, title: 'Lifecycleproof undated work', ownerId: h.actor, dueDate: null } })
 const makeMilestone = (title, startDate, endDate) => h.commit('milestone.create', { fields: { campaignId: campaign.id, title, ownerId: h.actor, type: 'Review', status: 'Not started', startDate, endDate, conflictReason: null } })
 const predecessor = await makeMilestone('Lifecycleproof predecessor', '2026-09-18', '2026-09-19')
 let milestone = await makeMilestone('Lifecycleproof successor', '2026-09-20', null)
 milestone = await h.commit('milestone.set-predecessors', { id: milestone.id, predecessorIds: [predecessor.id] }, h.expected('milestone', milestone))
 const risk = await h.commit('risk.create', { fields: { campaignId: campaign.id, title: 'Lifecycleproof risk', ownerId: h.actor, severity: 'High', dueDate: null, signal: 'Observed evidence', mitigation: 'Investigate' } })
 const decision = await h.commit('decision.create', { fields: { campaignId: campaign.id, riskId: risk.id, supersedesId: null, title: 'Lifecycleproof decision', requesterId: h.actor, assigneeId: null, priority: 'High', dueAt: '2026-10-21T08:00:00.000Z', recommendation: 'Review', impact: 'Launch scope' } })
 const person = await h.addPerson({ name: 'Lifecycle notification recipient' })
 const quiet = await h.db.prepare('SELECT quiet_hours_start,quiet_hours_end FROM workspace_settings LIMIT 1').first()
 const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
 const start = minute(quiet.quiet_hours_start), end = minute(quiet.quiet_hours_end)
 const zone = Intl.supportedValuesOf('timeZone').find(timeZone => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(h.ctx.now)).map(part => [part.type, part.value]))
  const now = Number(parts.hour) * 60 + Number(parts.minute)
  return start < end ? now >= start + 30 && now < end - 30 : start > end && (now >= start + 30 || now < end - 30)
 })
 assert.ok(zone, 'The fixture needs a recipient inside the configured quiet hours')
 const preference = await h.request(person.session, '/api/v1/commands/preferences.update', { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), expected: [], input: { version: 0, preferences: { timezone: zone, mutedKinds: [], digestEnabled: null, progressEnabled: false } } }) })
 assert.equal(preference.status, 200, await preference.text())
 await h.commit('comment.create', { campaignId: campaign.id, body: 'Lifecycleproof private comment', mentions: [person.id] }, h.expected('campaign', campaign))
 assert.ok((await rows(h.db, 'channel_notifications', campaign.id)).length > 0, 'The source has an actual notification to exclude from its copies')
 assert.ok((await rows(h.db, 'channel_deliveries', campaign.id)).some(row => row.state === 'held'), 'A real comment notification email is held under NOTIFY-002')
 return { campaign: await reader.get(h.ctx, 'campaign', campaign.id), custom, deliverable, undated, predecessor, milestone, risk, decision, person }
}

async function duplication(h, reader, f) {
 const source = await reader.get(h.ctx, 'campaign', f.campaign.id)
 const originalChildren = Object.fromEntries(await Promise.all(children.map(async kind => [kind, (await reader.list(h.ctx, kind, { campaignId: source.id })).items])))
 const histories = (await h.db.prepare('SELECT * FROM admission_events ORDER BY id').all()).results
 const runsBefore = (await h.db.prepare('SELECT * FROM automation_runs ORDER BY id').all()).results
 const notifications = (await h.db.prepare('SELECT * FROM notifications ORDER BY id').all()).results
 for (const [newCode, offset] of [['LIFECYCLE-COPY', 0], ['LIFECYCLE-SHIFT', 12]]) {
  const input = { id: source.id, newCode, ...(offset ? { newLaunchDate: shift(source.launchDate, offset, 'source campaign launchDate') } : {}) }
  const result = await h.commit('campaign.duplicate', input, h.expected('campaign', source))
  const copy = await reader.get(h.ctx, 'campaign', result.id)
  assert.notEqual(copy.id, source.id)
  assert.equal(copy.code, newCode)
  for (const field of ['name', 'ownerId', 'objective', 'statusSummary', 'phase', 'status', 'health', 'budgetMinor', 'spendMinor', 'tags']) assert.deepEqual(copy[field], source[field], `Duplicate preserves ${field}`)
  assert.equal(copy.startDate, shift(source.startDate, offset, 'source campaign startDate'))
  assert.equal(copy.launchDate, shift(source.launchDate, offset, 'source campaign launchDate'))
  assert.deepEqual(copy.customFields, { [f.custom.id]: shift(source.customFields[f.custom.id], offset, `source custom date ${f.custom.id}`) }, 'Custom date values follow the supplied launch-date shift')
  const ids = new Map()
  for (const kind of children) {
   const actual = (await reader.list(h.ctx, kind, { campaignId: copy.id })).items
   if (['risk', 'decision'].includes(kind)) { assert.equal(actual.length, 0, `Duplicate has no ${kind}`); continue }
   assert.equal(actual.length, originalChildren[kind].length)
   for (const before of originalChildren[kind]) {
    const after = actual.find(row => row.title === before.title)
    assert.ok(after)
    assert.notEqual(after.id, before.id)
    ids.set(before.id, after.id)
    for (const field of ['title', 'ownerId', ...(kind === 'deliverable' ? ['state'] : ['type', 'status', 'conflictReason'])]) assert.deepEqual(after[field], before[field])
    for (const field of kind === 'deliverable' ? ['dueDate'] : ['startDate', 'endDate']) assert.equal(after[field], before[field] === null ? null : shift(before[field], offset, `${kind} ${before.id} ${field}`))
   }
  }
  assert.deepEqual((await reader.get(h.ctx, 'milestone', ids.get(f.milestone.id))).predecessorIds, [ids.get(f.predecessor.id)], 'Internal dependency endpoints point to the copied milestones')
  assert.equal((await rows(h.db, 'comments', copy.id)).length, 0)
  assert.equal((await rows(h.db, 'channel_notifications', copy.id)).length, 0)
  assert.equal((await h.db.prepare('SELECT id FROM launch_analyses WHERE subject_id=?').bind(copy.id).all()).results.length, 0)
  const copiedActivity = await rows(h.db, 'activity_entries', copy.id)
  assert.ok(copiedActivity.every(entry => entry.type === 'campaign.duplicated' && entry.subject_id === copy.id), 'Only fresh duplication activity exists; source activity is not copied')
 }
 assert.deepEqual(await reader.get(h.ctx, 'campaign', source.id), source)
 assert.deepEqual((await h.db.prepare('SELECT * FROM admission_events ORDER BY id').all()).results, histories, 'Duplication emits no automation-triggering events')
 assert.deepEqual((await h.db.prepare('SELECT * FROM automation_runs ORDER BY id').all()).results, runsBefore)
 assert.deepEqual((await h.db.prepare('SELECT * FROM notifications ORDER BY id').all()).results, notifications)
 const before = await mutationSnapshot(h.db)
 await assert.rejects(() => h.commit('campaign.duplicate', { id: source.id, newCode: 'lifecycle-copy' }, h.expected('campaign', source)))
 assert.deepEqual(await mutationSnapshot(h.db), before, 'Duplicate code rejection is atomic and case-insensitive')
}

function localEight(date, timezone) {
 let instant = Date.parse(date + 'T08:00:00Z')
 for (let i = 0; i < 3; i++) {
  const part = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(item => [item.type, item.value]))
  instant += Date.parse(date + 'T08:00:00Z') - Date.parse(`${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}:00Z`)
 }
 return new Date(instant)
}

async function archiveRestore(h, reader, f) {
 let campaign = await reader.get(h.ctx, 'campaign', f.campaign.id)
 const timezone = (await h.db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first()).timezone
 const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(h.ctx.now))
 campaign = await h.commit('campaign.patch', { id: campaign.id, changes: { name: 'Lifecycleproof archive subject', startDate: shift(today, -30), launchDate: shift(today, 20) } }, h.expected('campaign', campaign))
 // A separate future schedule key keeps this proof independent of earlier daily evaluations.
 const scheduleDay = shift(today, 9)
 const launch = await h.commit('milestone.create', { fields: { campaignId: campaign.id, title: 'Lifecycleproof readiness', ownerId: h.actor, type: 'Launch', status: 'Not started', startDate: shift(scheduleDay, 1), endDate: null, conflictReason: null } })
 let clock = new Date()
 const service = h.r.createLegacyAutomationAuthority(h.context, () => clock)
 const admission = h.r.createAdmissionService(h.db, { authorizeReplay: service.authorizeReplay })
 const runtime = h.r.createLegacyAutomationRuntime(h.context, admission, { releaseId: h.context.releaseId, authority: service.authority, context: service.context })
 const queued = []
 for (const [kind, subject] of [['campaign', campaign], ['deliverable', f.deliverable], ['milestone', f.milestone], ['risk', f.risk], ['decision', f.decision]]) {
  const automation = await h.commit('automation.save', { definition: { name: `Lifecycle pending ${kind}`, enabled: true, trigger: { kind: 'event', event: {campaign:'campaign.created.v1',deliverable:'deliverable.completed.v1',milestone:'milestone.updated.v1',risk:'risk.created.v1',decision:'decision.requested.v1'}[kind] }, actions: [{ command: 'add-activity', input: { campaignId: campaign.id, message: 'Must never execute while archived' } }] } })
  const definition = await h.db.prepare('SELECT * FROM automations WHERE id=?').bind(automation.id).first()
  const event = await h.db.prepare("SELECT id FROM admission_events WHERE json_extract(subject_json,'$.recordId')=? AND name=? ORDER BY id LIMIT 1").bind(subject.id, `${kind}.created`).first()
  const id = await runtime.trigger(service.eventContext(event.id), definition, event.id, [subject.id])
  assert.ok(id)
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(id).first()).state, 'Queued')
  queued.push(id)
 }
 const readiness = await h.db.prepare("SELECT * FROM automations WHERE shipped_key='launch-readiness'").first()
 if (!readiness.enabled) await h.commit('automation.enable', { id: readiness.id }, h.expected('automation', readiness))
 const evaluate = async date => {
  clock = localEight(date, timezone)
  const definition = await h.db.prepare('SELECT * FROM automations WHERE id=?').bind(readiness.id).first()
  const id = await runtime.trigger(service.scheduleContext(), definition, `schedule:${date}`, [])
  await runtime.execute(() => service.dispatchContext(id), id)
 }
 await evaluate(scheduleDay)
 assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM launch_readiness WHERE milestone_id=? AND state='Outstanding'").bind(launch.id).first()).n, 1)
 const original = Object.fromEntries(await Promise.all(children.map(async kind => [kind, (await reader.list(h.ctx, kind, { campaignId: campaign.id })).items])))
 const metrics = (await json(h, '/api/portfolio')).metrics
 const search = await json(h, '/api/search?q=Lifecycleproof')
 assert.ok(JSON.stringify(search).includes(campaign.id))
 assert.ok(JSON.stringify(await json(h, '/api/decisions')).includes(f.decision.id))
 const digest = () => h.r.createLegacyDigestProjection(h.db)(h.ctx, h.actor, { localDate: today, now: h.ctx.now })
 const digestBefore = (await digest()).body
 for (const label of [campaign.name, f.risk.title, f.decision.title]) assert.ok(digestBefore.includes(label), 'Active work is present in the real recipient digest projection')
 const lenses = (await reader.list(h.ctx, 'lens', { limit: 200 })).items.map(lens => ({ name: lens.name, description: lens.description, recordType: lens.recordType, conditions: JSON.parse(lens.conditionsJson), sort: JSON.parse(lens.sortJson), fields: JSON.parse(lens.fieldsJson), display: lens.display }))
 const lensBefore = await Promise.all(lenses.map(definition => h.r.previewLens(h.db, definition, h.ctx.now)))
 assert.ok(lensBefore.some(page => page.items.some(row => row.id === f.risk.id)), 'The active high risk appears in a lens before archive')
 assert.ok(lensBefore.some(page => page.items.some(row => row.id === f.milestone.id)), 'The active milestone appears in a lens before archive')
 const plan = await h.prepare('campaign.archive', { id: campaign.id }, h.expected('campaign', campaign))
 assert.equal((await reader.get(h.ctx, 'campaign', campaign.id)).archivedAt, null, 'Preparation does not withdraw work before admission')
 campaign = (await h.admission.commit(h.ctx, plan)).result.value
 assert.ok(campaign.archivedAt)
 for (const kind of children) {
  assert.equal((await reader.list(h.ctx, kind, { campaignId: campaign.id })).items.length, 0)
  const archived = (await reader.list(h.ctx, kind, { campaignId: campaign.id, includeArchived: true })).items
  for (const row of archived) assert.deepEqual(row, { ...original[kind].find(before => before.id === row.id), ...(['milestone', 'deliverable'].includes(kind) ? { overdue: false } : {}) }, 'Archiving leaves child values and lifecycle unchanged')
 }
 assert.ok(!JSON.stringify(await json(h, '/api/decisions')).includes(f.decision.id))
 const digestAfter = (await digest()).body
 for (const label of [campaign.name, f.risk.title, f.decision.title]) assert.ok(!digestAfter.includes(label), 'Archived work leaves the recipient digest')
 assert.ok(!JSON.stringify(await json(h, '/api/search?q=Lifecycleproof')).includes(campaign.id))
 assert.ok(JSON.stringify(await json(h, '/api/search?q=Lifecycleproof&archived=true')).includes(campaign.id))
 const after = (await json(h, '/api/portfolio')).metrics
 assert.equal(after.liveCampaigns, metrics.liveCampaigns - 1)
 assert.equal(after.needsAttention, metrics.needsAttention - 1)
 assert.equal(after.openDecisions, metrics.openDecisions - 1)
 const active = (await reader.list(h.ctx, 'campaign', { limit: 200 })).items
 assert.equal(after.portfolioHealth, Math.round(active.reduce((sum, row) => sum + row.health, 0) / active.length))
 assert.equal(after.staleHealthCount, active.filter(row => row.healthStale).length)
 for (const definition of lenses) {
  assert.ok(!(await h.r.previewLens(h.db, definition, h.ctx.now)).items.some(row => row.campaignId === campaign.id || row.id === campaign.id), 'Archived work leaves every saved lens')
 }
 assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM launch_readiness WHERE milestone_id=? AND state='Outstanding'").bind(launch.id).first()).n, 0)
 for (const id of queued) {
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(id).first()).state, 'Cancelled')
  await runtime.execute(() => service.dispatchContext(id), id)
  assert.ok((await h.db.prepare('SELECT state FROM launch_automation_actions WHERE run_id=?').bind(id).all()).results.every(row => row.state === 'Pending'), 'Cancelled runs execute no action')
 }
 assert.ok((await rows(h.db, 'channel_deliveries', campaign.id)).every(row => !['held', 'queued', 'muted'].includes(row.state)), 'Outstanding campaign email is dropped')
 await evaluate(shift(scheduleDay, 1))
 const sideEffects = async () => {
  const result = await h.db.batch(['notifications', 'launch_readiness', 'automation_runs'].map(table => h.db.prepare(`SELECT * FROM ${table} ORDER BY 1`)))
  return result.map(page => page.results)
 }
 const archivedEffects = await sideEffects()
 campaign = await h.commit('campaign.restore', { id: campaign.id }, h.expected('campaign', campaign))
 assert.equal(campaign.archivedAt, null)
 assert.deepEqual(await sideEffects(), archivedEffects, 'Restore creates no catch-up notifications, requests, or runs')
 for (const kind of children) assert.deepEqual((await reader.list(h.ctx, kind, { campaignId: campaign.id })).items, original[kind], 'Restored children regain exactly their original state and overdue projection')
 assert.ok(JSON.stringify(await json(h, '/api/decisions')).includes(f.decision.id))
 return campaign
}

async function restoreRemovedOwner(h, reader, person) {
 let campaign = await h.campaign('LIFECYCLE-REMOVED-OWNER')
 campaign = await h.commit('campaign.patch', { id: campaign.id, changes: { ownerId: person.id } }, h.expected('campaign', campaign))
 campaign = await h.commit('campaign.archive', { id: campaign.id }, h.expected('campaign', campaign))
 const member = (await json(h, `/api/v1/members?appId=${h.r.LAUNCH_APP_ID}`)).data.items.find(row => row.id === person.id)
 assert.ok(member)
 const response = await h.request(h.ownerSession, '/api/v1/commands/member.remove', { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), expected: [{ ref: { appId: h.r.LAUNCH_APP_ID, entityId: '00000000000000000000000101', recordId: person.id }, version: member.version }], input: { memberId: person.id, reason: 'Archived campaign owner has left' } }) })
 assert.equal(response.status, 200, await response.text())
 const before = await mutationSnapshot(h.db)
 await assert.rejects(() => h.commit('campaign.restore', { id: campaign.id }, h.expected('campaign', campaign)), error => error.code === 'validation')
 assert.deepEqual(await mutationSnapshot(h.db), before, 'A removed owner prevents restore without changing anything')
 campaign = await h.commit('campaign.restore', { id: campaign.id, ownerId: h.actor }, h.expected('campaign', campaign))
 assert.equal((await reader.get(h.ctx, 'campaign', campaign.id)).ownerId, h.actor)
 assert.equal(campaign.archivedAt, null)
}

async function deletion(h, reader, campaign) {
 const subjects = [campaign.id]
 for (const kind of children) subjects.push(...(await reader.list(h.ctx, kind, { campaignId: campaign.id })).items.map(row => row.id))
 const audit = (await h.db.prepare("SELECT id FROM admission_audit WHERE json_extract(subject_json,'$.recordId') IN (SELECT value FROM json_each(?))").bind(JSON.stringify(subjects)).all()).results
 assert.ok(audit.length)
 const before = await mutationSnapshot(h.db)
 await assert.rejects(() => h.commit('campaign.delete', { id: campaign.id, confirmationCode: campaign.code.toLowerCase() }, h.expected('campaign', campaign)), error => error.code === 'validation')
 assert.deepEqual(await mutationSnapshot(h.db), before, 'Wrong confirmation changes nothing')
 const erased=await h.request(h.ownerSession,'/api/v1/commands/launch.campaign.delete',{method:'POST',body:JSON.stringify({commandId:h.r.createUlid(),expected:h.expected('campaign',campaign),input:{id:campaign.id,confirmationCode:campaign.code}})})
 const receipt=await erased.json();assert.equal(erased.status,200,JSON.stringify(receipt.error));assert.equal(receipt.data.value.deletedId,campaign.id);assert.equal(receipt.data.value.confirmed,true,'The public deletion door completes retained-file cleanup')
 for (const table of ['deliverables', 'milestones', 'risks', 'decisions', 'comments', 'activity_entries', 'campaign_tags', 'launch_custom_values']) assert.equal((await rows(h.db, table, campaign.id)).length, 0, `Deletion removes ${table}`)
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM milestone_dependencies WHERE milestone_id IN (SELECT value FROM json_each(?)) OR predecessor_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(subjects), JSON.stringify(subjects)).first()).n, 0)
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM launch_analyses WHERE subject_id=?').bind(campaign.id).first()).n, 0)
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM portability_preview_rows WHERE record_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(subjects)).first()).n, 0)
 for (const entry of audit) {
  const retained = await h.db.prepare('SELECT subject_json,changes_json FROM admission_audit WHERE id=?').bind(entry.id).first()
  assert.ok(retained, 'Historical audit records survive campaign deletion')
  assert.ok(!subjects.includes(JSON.parse(retained.subject_json)?.recordId), 'Surviving campaign audit references are anonymised')
  assert.equal(retained.changes_json, '[]')
 }
 await assert.rejects(() => reader.get(h.ctx, 'campaign', campaign.id), error => error.code === 'not_found')
 await assert.rejects(() => h.commit('campaign.restore', { id: campaign.id }, h.expected('campaign', campaign)), error => error.code === 'not_found')
}

export async function verifyCampaignLifecycleClauses(h) {
 const reader = h.r.createLaunchReader(h.db, h.context.policy)
 const f = await fixture(h, reader)
 const imported = await stagedImport(h, f.campaign)
 const analysisId = await h.completeAnalysis(f.campaign.id)
 const analysis = await h.db.prepare('SELECT * FROM launch_analyses WHERE id=?').bind(analysisId).first()
 assert.ok(analysis, 'The emitted analysis request persists a real analysis before duplication')
 assert.equal(analysis.subject_id, f.campaign.id)
 assert.equal(analysis.feature, 'campaign-brief')
 assert.ok(typeof analysis.content === 'string' && analysis.content.trim().length > 0, 'The source analysis contains the completed provider response')
 const requests = (await h.db.prepare('SELECT id,state FROM launch_analysis_requests WHERE analysis_id=?').bind(analysisId).all()).results
 assert.ok(requests.length > 0 && requests.every(row => row.state === 'Complete'), 'The durable analysis belongs to completed emitted requests')
 await duplication(h, reader, f)
 assert.deepEqual(await h.db.prepare('SELECT * FROM launch_analyses WHERE id=?').bind(analysisId).first(), analysis, 'Duplication preserves the populated source analysis')
 const campaign = await archiveRestore(h, reader, f)
 await deletion(h, reader, campaign)
 assert.equal(await h.db.prepare('SELECT id FROM launch_analyses WHERE id=?').bind(analysisId).first(), null, 'Campaign erasure removes the populated AI analysis')
 for (const request of requests) assert.equal(await h.db.prepare('SELECT id FROM launch_analysis_requests WHERE id=?').bind(request.id).first(), null, 'Campaign erasure removes the completed analysis request')
 assert.equal(await h.db.prepare('SELECT id FROM portability_previews WHERE id=?').bind(imported.previewId).first(), null, 'Deletion removes the actual retained import preview')
 assert.equal((await h.db.prepare('SELECT state FROM evidence_files WHERE id=?').bind(imported.fileId).first()).state, 'erased', 'The staged import file is included in campaign erasure')
 await restoreRemovedOwner(h, reader, f.person)
}
