import { launchImportDeletionJourney } from './helpers/launch-import-deletion.mjs'
import {warehouseNetworkEdge} from './helpers/warehouse-network-edge.mjs'
import {companyLifecycle} from './helpers/company-lifecycle.mjs'
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { launchAuthorityRuntime, createUlid, LAUNCH_APP_ID, launchEntities } from './helpers/launch-authority-runtime.mjs'
import { clauseAnalysisFixture } from './helpers/launch-clause-analysis.mjs'
import { lifecycleDoors, seedLeaver, verifyRemoval } from './helpers/launch-operator-lifecycle.mjs'
import { verifyErasure } from './helpers/launch-operator-erasure.mjs'
import { warehouseExportJourney } from './helpers/warehouse-export-journey.mjs'
import { childImportMergeJourney } from './helpers/launch-import-merge.mjs'
import { customFieldDeletionJourney } from './helpers/launch-custom-field-deletion.mjs'
import { launchBulkUndoJourney } from './helpers/launch-bulk-undo.mjs'

// High-stakes launch doors through the emitted Worker: data import, sample removal,
// ownership handover and paging. Each request uses the app's own routes and session.
const analysis = clauseAnalysisFixture()
const warehouseEdge=await warehouseNetworkEdge()
let h
try{h=await launchAuthorityRuntime({...analysis.configuration,...warehouseEdge.bindings}, { installedLaunchDefinitions: true, installationOwner: true, testClock: true, providerFetch:request=>request.url==='https://relay.egress.example.com/v1/deliver'?warehouseEdge.outbound(request):analysis.providerFetch(request) })}catch(error){await warehouseEdge.close();throw error}
after(async()=>{await h.close();await warehouseEdge.close()})
const envelope = (input, expected = []) => JSON.stringify({ commandId: createUlid(), expected, input })
async function call(route, init = {}, session = h.ownerSession) {
 const response = await h.request(session, route, init)
 return { status: response.status, body: await response.json().catch(() => null) }
}
const command = (action, input, expected = [], session) => call(`/api/v1/commands/${action}`, { method: 'POST', body: envelope(input, expected) }, session)
const campaignRef = row => ({ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: row.id }, version: row.version })
async function uploadBytes(filename, text) {
 const staged = (await command('source.stage', { appId: LAUNCH_APP_ID, purpose: 'import' })).body.data.value
 const sha256 = createHash('sha256').update(text).digest('hex')
 const begun = await command('upload.begin', { appId: LAUNCH_APP_ID, subject: staged.subject, filename, mediaType: 'text/csv', bytes: Buffer.byteLength(text), sha256 })
 assert.equal(begun.status, 200, JSON.stringify(begun.body))
 const put = await h.request(h.ownerSession, begun.body.data.value.uploadUrl, { method: 'PUT', headers: { 'content-type': 'text/csv' }, body: text })
 return { fileId: begun.body.data.value.file.id, status: put.status, body: await put.json() }
}
async function upload(filename, text) {
 const result = await uploadBytes(filename, text)
 assert.equal(result.status, 200, JSON.stringify(result.body))
 return result.fileId
}
const preview = (kind, fileId, mapping, session) => call('/api/v1/launch/imports/preview', { method: 'POST', body: envelope({ kind, fileId, mapping: Object.entries(mapping).map(([column, field]) => ({ column, field })) }) }, session)

test('[IMPORT-001] [IMPORT-002] [IMPORT-003] [IMPORT-004] [IMPORT-005] campaign CSV previews changes, refuses stale or invalid files, commits once and keeps its file', async () => {
 const vertex = await h.db.prepare("SELECT id,name FROM campaigns WHERE code='CMP-261'").first(), brand = await h.db.prepare("SELECT name FROM campaigns WHERE code='CMP-262'").first()
 const owner = await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(h.owner).first()
 const csv = `\uFEFFCode,Name,Owner,Start,Launch,Health\r\nCMP-261,${vertex.name} v2,,,,\r\nCMP-262,${brand.name},,,,\r\nIMP-NEW,"Imported, quoted launch",${owner.email},2026-11-01,2026-12-01,80\r\n`
 const mapping = { Code: 'code', Name: 'name', Owner: 'ownerId', Start: 'startDate', Launch: 'launchDate', Health: 'health' }
 const fileId = await upload('portfolio.csv', csv)
 const first = await preview('campaign', fileId, mapping)
 assert.equal(first.status, 200, JSON.stringify(first.body))
 const result = first.body.data.value
 assert.deepEqual([result.state, result.creates, result.updates, result.unchanged, result.errors], ['valid', 1, 1, 1, []])
 const rows = await call(`/api/v1/launch/imports/${result.id}/rows`)
 const update = rows.body.data.rows.find(row => row.operation === 'update')
 assert.deepEqual(update.changes, [{ field: 'name', before: vertex.name, after: `${vertex.name} v2` }], 'An update names each changing field with its stored and incoming value')

 // A record changed after preview makes confirm ask for a new preview and changes nothing.
 const stale = await h.db.prepare("SELECT id,version FROM campaigns WHERE code='CMP-262'").first()
 assert.equal((await command('launch.campaign.patch', { id: stale.id, changes: { statusSummary: 'Edited after preview' } }, [campaignRef(stale)])).status, 200)
 const refused = await call(`/api/v1/launch/imports/${result.id}/commit`, { method: 'POST', body: envelope({ token: result.token }) })
 assert.equal(refused.status, 409, JSON.stringify(refused.body))
 assert.equal(await h.db.prepare("SELECT COUNT(*) AS n FROM campaigns WHERE code='IMP-NEW'").first('n'), 0)

 // One invalid row blocks the whole file.
 const invalid = await preview('campaign', await upload('invalid.csv', 'Code,Name,Owner\r\nCMP-261,Fine,\r\nIMP-BAD,Bad,synthetic-cradle-1\r\n'), { Code: 'code', Name: 'name', Owner: 'ownerId' })
 assert.equal(invalid.body.data.value.state, 'invalid')
 assert.match(invalid.body.data.value.errors[0].message, /does not identify one current operator/)
 assert.equal((await call(`/api/v1/launch/imports/${invalid.body.data.value.id}/commit`, { method: 'POST', body: envelope({ token: invalid.body.data.value.token }) })).status, 400)

 // A fresh preview commits atomically; replaying the same key returns the original result.
 const fresh = (await preview('campaign', fileId, mapping)).body.data.value
 const body = JSON.stringify({ commandId: createUlid(), expected: [], input: { token: fresh.token } })
 const committed = await call(`/api/v1/launch/imports/${fresh.id}/commit`, { method: 'POST', body })
 assert.equal(committed.status, 200, JSON.stringify(committed.body))
 assert.deepEqual(committed.body.data.value, { id: fresh.id, rows: 3 })
 const replay = await call(`/api/v1/launch/imports/${fresh.id}/commit`, { method: 'POST', body })
 assert.deepEqual(replay.body.data.value, committed.body.data.value)
 const created = await h.db.prepare("SELECT id,name FROM campaigns WHERE code='IMP-NEW'").first()
 assert.equal(created.name, 'Imported, quoted launch')
 assert.equal(await h.db.prepare("SELECT name FROM campaigns WHERE code='CMP-261'").first('name'), `${vertex.name} v2`)
 assert.equal(await h.db.prepare("SELECT COUNT(*) AS n FROM activity_entries WHERE campaign_id=? AND type='import.committed'").bind(created.id).first('n'), 1, 'Replay writes no second activity entry')

 // The committed import record keeps the original upload for any launch operator.
 const listed = await call('/api/v1/launch/imports')
 assert.equal(listed.body.data.items[0].filename, 'portfolio.csv')
 const file = await h.request(h.ownerSession, `/api/v1/launch/imports/${fresh.id}/file`)
 assert.equal(file.status, 200)
 assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from(csv), 'The stored file is the original upload byte for byte')

 // Deliverable rows merge by campaign code and title; an unknown campaign is a row error.
 const deliverables = (await preview('deliverable', await upload('tasks.csv', 'Campaign,Title,Owner\r\nIMP-NEW,Brief agency,' + owner.email + '\r\nNOPE-1,Orphan,' + owner.email + '\r\n'), { Campaign: 'campaignCode', Title: 'title', Owner: 'ownerId' })).body.data.value
 assert.deepEqual([deliverables.creates, deliverables.errors.map(error => error.message)], [1, ['Referenced campaign must already exist']])

 // Author a real select definition and populated records through the public commands.
 const definition = await command('launch.custom-field.save', { field: { name: 'Import market', type: 'select', options: ['North', 'South'] } })
 assert.equal(definition.status, 200, JSON.stringify(definition.body))
 const fieldId = definition.body.data.value.id
 const readCampaign = async id => {
  const read = await call(`/api/campaigns/${id}`)
  assert.equal(read.status, 200, JSON.stringify(read.body))
  return read.body
 }
 const snapshot = async () => {
  const tables = ['campaigns', 'campaign_tags', 'launch_custom_values', 'deliverables', 'milestones', 'activity_entries', 'portability_previews', 'portability_preview_rows', 'evidence_files', 'command_admissions', 'admission_assertions', 'admission_provenance_segments', 'admission_audit', 'admission_events', 'admission_outbox', 'record_automation_context', 'record_automation_events', 'launch_search_rows', 'launch_search', 'execution_runs', 'execution_attempts']
  const stored = {}
  for (const table of tables) stored[table] = (await h.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results
  return { ...stored, imports: (await call('/api/v1/launch/imports')).body.data.items, providerCalls: warehouseEdge.calls.length }
 }
 const stored = []
 for (const [index, market] of ['North', 'South'].entries()) {
  const created = await command('launch.campaign.create', { fields: {
   code: `synthetic-cradle-${index + 1}`, name: `Stored campaign ${index + 1}`, ownerId: h.owner,
   startDate: '2026-11-01', launchDate: '2026-12-01', objective: `Stored objective ${index + 1}`,
   statusSummary: `Stored summary ${index + 1}`, phase: 'Build', status: 'Watch', health: 67,
   budgetMinor: 12345, spendMinor: 6789, tags: ['Retained'], customFields: { [fieldId]: market },
  } })
  assert.equal(created.status, 200, JSON.stringify(created.body))
  const captured = await readCampaign(created.body.data.value.id)
  assert.equal(captured.campaign.objective, `Stored objective ${index + 1}`)
  assert.equal(captured.customFields.find(field => field.id === fieldId).value, market)
  stored.push(captured)
 }
 const codes = stored.map(row => row.campaign.code)
 // Malformed bytes and quoted cells must fail parsing before a preview or any business effect.
 const validPrefix = `Code,Name\r\n${codes[0]},Proposed update before malformed row\r\n`
 const malformedFiles = [
  ['invalid-utf8.csv', Buffer.concat([Buffer.from(validPrefix + `${codes[1]},`), Buffer.from([0xc3, 0x28]), Buffer.from('\r\n')]), /UTF-8/],
  ['nul.csv', Buffer.from(validPrefix + `${codes[1]},Rejected\0name\r\n`), /NUL/],
  ['bom-without-header.csv', Buffer.from([0xef, 0xbb, 0xbf]), null],
  ['unterminated-quote.csv', Buffer.from(validPrefix + `${codes[1]},"Unterminated name\r\n`), null],
  ['illegally-closed-quote.csv', Buffer.from(validPrefix + `${codes[1]},"Closed name"suffix\r\n`), null],
 ]
 const restricted = await h.addPerson({ change: () => [] })
 for (const [filename, bytes, uploadError] of malformedFiles) {
  const uploaded = await uploadBytes(filename, bytes), { fileId } = uploaded
  const original = await h.request(h.ownerSession, `/api/v1/files/${fileId}/content`)
  if (uploadError) {
   assert.equal(uploaded.status, 413, JSON.stringify(uploaded.body))
   assert.equal(uploaded.body.error.code, 'upload_rejected')
   assert.match(uploaded.body.error.message, uploadError)
   assert.equal((await call(`/api/v1/files/${fileId}`)).body.data.state, 'rejected')
   assert.equal(original.status, 404, 'Rejected text bytes cannot be downloaded')
  } else {
   assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body))
   assert.equal(original.status, 200, filename)
   assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes, 'The native upload retains the actual malformed structure')
  }
  const beforeRecords = await Promise.all([...stored.map(row => row.campaign.id), vertex.id].map(readCampaign))
  const before = await snapshot() // Upload has completed; only the preview attempt is measured.
  const refused = await preview('campaign', fileId, { Code: 'code', Name: 'name' })
  assert.equal(refused.status, 400, `${filename}: ${JSON.stringify(refused.body)}`)
  assert.equal(refused.body.error.code, 'validation', filename)
  assert.match(refused.body.error.message, /The CSV could not be read: .+/, filename)
  assert.equal(refused.body.data, undefined, 'A parse refusal supplies no preview or confirmation token')
  assert.deepEqual(await snapshot(), before, `${filename}: parsing refusal changes no retained records, activity, previews, files, admissions, events, outbox or execution work`)
  assert.deepEqual(await Promise.all([...stored.map(row => row.campaign.id), vertex.id].map(readCampaign)), beforeRecords, `${filename}: affected and unrelated campaigns, custom values and activity stay unchanged through public reads`)
  if (uploadError) {
   const hidden = await preview('campaign', fileId, { Code: 'code', Name: 'name' }, restricted.session)
   const absent = await preview('campaign', createUlid(), { Code: 'code', Name: 'name' }, restricted.session)
   assert.deepEqual([hidden.status, hidden.body.error.code, hidden.body.error.message], [404, 'not_found', absent.body.error.message], 'An unreadable rejected upload reveals no file state or parsing details')
   assert.equal(absent.status, 404)
   assert.deepEqual(await snapshot(), before, 'Hidden and absent file refusals also change no business state')
  }
 }
 const refusedImport = async (filename, csv, mapping, errors) => {
  const before = await Promise.all(stored.map(row => readCampaign(row.campaign.id)))
  const response = await preview('campaign', await upload(filename, csv), mapping)
  assert.equal(response.status, 200, JSON.stringify(response.body))
  const invalid = response.body.data.value
  assert.equal(invalid.state, 'invalid')
  assert.deepEqual(invalid.errors, errors, 'Invalid rows name their physical CSV row')
  const rows = await call(`/api/v1/launch/imports/${invalid.id}/rows`)
  assert.equal(rows.status, 200, JSON.stringify(rows.body))
  assert.deepEqual(rows.body.data.errors, errors)
  const refused = await call(`/api/v1/launch/imports/${invalid.id}/commit`, { method: 'POST', body: envelope({ token: invalid.token }) })
  assert.equal(refused.status, 400, JSON.stringify(refused.body))
  assert.match(refused.body.error.message, /Every row must be valid/)
  for (const row of before) assert.deepEqual(await readCampaign(row.campaign.id), row, 'Refused confirmation preserves every affected campaign, its select values and activity')
 }

 // A duplicate key invalidates the entire file, including its otherwise valid updates.
 await refusedImport('duplicate-keys.csv', `Code,Name\r\n${codes[0]},First proposed update\r\n${codes[1]},Second proposed update\r\n ${codes[0].toUpperCase()} ,Duplicate proposed update\r\n`,
  { Code: 'code', Name: 'name' }, [{ row: 4, message: 'Duplicate merge key' }])

 // The select is publicly authored; one unknown option also fences the valid sibling row.
 await refusedImport('unknown-option.csv', `Code,Name,Market\r\n${codes[0]},Valid proposed update,South\r\n${codes[1]},Invalid proposed update,Unknown\r\n`,
  { Code: 'code', Name: 'name', Market: `custom:${fieldId}` }, [{ row: 3, message: 'Unknown custom field option' }])

 // Built-in phase and status selects refuse an option they do not have in the same way.
 await refusedImport('unknown-phase.csv', `Code,Phase,Status\r\n${codes[0]},Launched,\r\n${codes[1]},,Green\r\n`,
  { Code: 'code', Phase: 'phase', Status: 'status' }, [2, 3].map(row => ({ row, message: 'Invalid campaign dates, phase or status' })))

 // A database failure on a later mutation rolls back an otherwise valid multirow import. Test-only triggers abort the
 // second campaign update only after the first campaign, tags and custom value changed inside this transaction,
 // then the activity write and committed-preview marker after all row mutations.
 const faultCsv = `Code,Name,Owner,Start,Launch,Health,Tags,Market\r\n${codes[0]},Fault update 1,,,,,Fault tag 1,South\r\n${codes[1]},Fault update 2,,,,,Fault tag 2,North\r\nIMP-FAULT,Fault created,${owner.email},2026-11-01,2026-12-01,80,Fault tag 3,South\r\n`
 const faultFileId = await upload('fault.csv', faultCsv)
 const faultPreview = (await preview('campaign', faultFileId, { ...mapping, Tags: 'tags', Market: `custom:${fieldId}` })).body.data.value
 assert.deepEqual([faultPreview.state, faultPreview.creates, faultPreview.updates, faultPreview.unchanged, faultPreview.errors], ['valid', 1, 2, 0, []])
 const faultBody = JSON.stringify({ commandId: createUlid(), expected: [], input: { token: faultPreview.token } })
 const commitFault = () => call(`/api/v1/launch/imports/${faultPreview.id}/commit`, { method: 'POST', body: faultBody })
 const beforeFault = await snapshot()
 const unrelated = await readCampaign(vertex.id)
 const affectedBefore = await Promise.all(stored.map(row => readCampaign(row.campaign.id)))
 const originalFile = async () => {
  const response = await h.request(h.ownerSession, `/api/v1/files/${faultFileId}/content`)
  assert.equal(response.status, 200)
  return Buffer.from(await response.arrayBuffer())
 }
 assert.deepEqual(await originalFile(), Buffer.from(faultCsv))
 for (const [name, trigger] of [
  ['later_row', `BEFORE UPDATE OF name ON campaigns
   WHEN NEW.id='${stored[1].campaign.id}' AND NEW.name='Fault update 2'
   AND EXISTS(SELECT 1 FROM campaigns WHERE id='${stored[0].campaign.id}' AND name='Fault update 1' AND version=${stored[0].campaign.version + 1})
   AND EXISTS(SELECT 1 FROM campaign_tags WHERE campaign_id='${stored[0].campaign.id}' AND tag='Fault tag 1')
   AND EXISTS(SELECT 1 FROM launch_custom_values WHERE campaign_id='${stored[0].campaign.id}' AND field_id='${fieldId}' AND value_json='"South"')`],
  ['activity', "BEFORE INSERT ON activity_entries WHEN NEW.type='import.committed'"],
  ['marker', 'BEFORE UPDATE OF committed_command_id ON portability_previews WHEN NEW.committed_command_id IS NOT NULL'],
 ]) {
  await h.db.prepare(`CREATE TRIGGER test_import_fault_${name} ${trigger} BEGIN SELECT RAISE(ABORT, 'synthetic-cradle-late-fault'); END`).run()
  try {
   const failed = await commitFault()
   assert.equal(failed.status, 500, `The induced ${name} failure surfaces as a server error: ${JSON.stringify(failed.body)}`)
   assert.equal(failed.body.error.code, 'internal', 'The failure is not a validation, expiry or staleness refusal')
  } finally { await h.db.prepare(`DROP TRIGGER test_import_fault_${name}`).run() }
  assert.deepEqual(await snapshot(), beforeFault, `A failed ${name} write leaves records, values, versions, activity, preview marker, audit, events, outbox, effects and the uploaded file unchanged`)
  for (const row of affectedBefore) assert.deepEqual(await readCampaign(row.campaign.id), row, 'Every affected public campaign, version, value and activity is unchanged')
  assert.deepEqual(await readCampaign(vertex.id), unrelated, 'An unrelated campaign is untouched')
  assert.deepEqual(await originalFile(), Buffer.from(faultCsv), 'Each failed transaction preserves the original uploaded bytes')
  assert.equal(await h.db.prepare("SELECT COUNT(*) AS n FROM campaigns WHERE code='IMP-FAULT'").first('n'), 0)
  assert.equal((await call(`/api/v1/launch/imports/${faultPreview.id}/rows`)).body.data.state, 'valid', 'The reviewed preview stays reviewable')
 }
 // With the fault removed the same reviewed import commits once and replays without a second effect.
 const faultCommitted = await commitFault()
 assert.equal(faultCommitted.status, 200, JSON.stringify(faultCommitted.body))
 assert.deepEqual(faultCommitted.body.data.value, { id: faultPreview.id, rows: 3 })
 const afterFaultCommit = await snapshot()
 const faultReplay = await commitFault()
 assert.equal(faultReplay.status, 200, JSON.stringify(faultReplay.body))
 assert.deepEqual(faultReplay.body.data.value, faultCommitted.body.data.value)
 assert.deepEqual(await snapshot(), afterFaultCommit, 'Replay adds no record mutation, version, activity, admission, event or outbox effect')
 const faultCreated = await h.db.prepare("SELECT id,name FROM campaigns WHERE code='IMP-FAULT'").first()
 assert.equal(faultCreated.name, 'Fault created')
 for (const [index, row] of affectedBefore.entries()) {
  const after = await readCampaign(row.campaign.id)
  assert.equal(after.campaign.name, `Fault update ${index + 1}`)
  assert.equal(after.campaign.version, row.campaign.version + 1, 'Only the successful control increments the version')
  assert.deepEqual(after.campaign.tags, [`Fault tag ${index + 1}`])
  assert.equal(after.customFields.find(field => field.id === fieldId).value, ['South', 'North'][index])
 }
 assert.equal(await h.db.prepare('SELECT committed_command_id FROM portability_previews WHERE id=?').bind(faultPreview.id).first('committed_command_id'), JSON.parse(faultBody).commandId)
 assert.deepEqual(await readCampaign(vertex.id), unrelated, 'Successful control also preserves the unrelated campaign')
 for (const id of [...stored.map(row => row.campaign.id), faultCreated.id])
  assert.equal(await h.db.prepare("SELECT COUNT(*) AS n FROM activity_entries WHERE campaign_id=? AND type='import.committed'").bind(id).first('n'), 1, 'Each affected campaign gets one activity entry for this import, none from the replay')
 assert.deepEqual(await originalFile(), Buffer.from(faultCsv), 'The original upload survives the failed attempts byte for byte')
 const committedFile = await h.request(h.ownerSession, `/api/v1/launch/imports/${faultPreview.id}/file`)
 assert.equal(committedFile.status, 200)
 assert.deepEqual(Buffer.from(await committedFile.arrayBuffer()), Buffer.from(faultCsv))

 // Both empty and whitespace-only cells preserve populated values during real updates.
 const retained = await Promise.all(stored.map(row => readCampaign(row.campaign.id)))
 const headers = ['Code', 'Name', 'Owner', 'Start', 'Launch', 'Objective', 'Summary', 'Phase', 'Status', 'Health', 'Budget', 'Spend', 'Tags', 'Market']
 const blanks = headers.join(',') + '\r\n' + ['', ' \t '].map((blank, index) =>
  [codes[index], `Merged campaign ${index + 1}`, ...Array(12).fill(blank)].join(',')).join('\r\n') + '\r\n'
 const blankPreview = await preview('campaign', await upload('preserve-blanks.csv', blanks), {
  Code: 'code', Name: 'name', Owner: 'ownerId', Start: 'startDate', Launch: 'launchDate', Objective: 'objective',
  Summary: 'statusSummary', Phase: 'phase', Status: 'status', Health: 'health', Budget: 'budgetMinor',
  Spend: 'spendMinor', Tags: 'tags', Market: `custom:${fieldId}`,
 })
 assert.equal(blankPreview.status, 200, JSON.stringify(blankPreview.body))
 const blankResult = blankPreview.body.data.value
 assert.deepEqual([blankResult.state, blankResult.creates, blankResult.updates, blankResult.unchanged, blankResult.errors], ['valid', 0, 2, 0, []])
 const blankRows = await call(`/api/v1/launch/imports/${blankResult.id}/rows`)
 assert.equal(blankRows.status, 200, JSON.stringify(blankRows.body))
 assert.deepEqual(blankRows.body.data.rows.map(row => ({ row: row.row, changes: row.changes })), retained.map((row, index) => ({
  row: index + 2, changes: [{ field: 'name', before: row.campaign.name, after: `Merged campaign ${index + 1}` }],
 })), 'The preview lists only the separate real change, never a blank overwrite')
 const merged = await call(`/api/v1/launch/imports/${blankResult.id}/commit`, { method: 'POST', body: envelope({ token: blankResult.token }) })
 assert.equal(merged.status, 200, JSON.stringify(merged.body))
 assert.deepEqual(merged.body.data.value, { id: blankResult.id, rows: 2 })
 for (const [index, before] of retained.entries()) {
  const after = await readCampaign(before.campaign.id)
  assert.equal(after.campaign.name, `Merged campaign ${index + 1}`, 'The successful merge applies its real change')
  assert.equal(after.campaign.version, before.campaign.version + 1)
  for (const field of ['code', 'owner', 'startDate', 'launchDate', 'objective', 'summary', 'phase', 'status', 'health', 'healthSetAt', 'healthSetBy', 'budgetMinor', 'spendMinor', 'tags'])
   assert.deepEqual(after.campaign[field], before.campaign[field], `${field} survives ${index === 0 ? 'empty' : 'whitespace-only'} incoming cells`)
  assert.deepEqual(after.customFields, before.customFields, 'Blank select cells retain the independently captured stored options')
 }
 // Independently advance authenticated HTTP time across the preview's lifetime.
 const issuedAt = Date.now() + 60_000, expiresAt = issuedAt + 30 * 60_000
 h.setNow(issuedAt)
 try {
  const timed = []
  for (const suffix of ['BEFORE', 'EXACT', 'AFTER']) {
   const code = `IMP-EXP-${suffix}`, name = `Expiry control ${suffix}`
   const response = await preview('campaign', await upload(`expiry-${suffix}.csv`, `Code,Name,Owner,Start,Launch,Health\r\n${code},${name},${h.owner},2026-11-01,2026-12-01,80\r\n`), mapping)
   assert.equal(response.status, 200, JSON.stringify(response.body))
   assert.equal(response.body.meta.evaluatedAt, new Date(issuedAt).toISOString(), 'The authenticated context uses the independently chosen issuance time')
   const value = response.body.data.value
   assert.deepEqual([value.state, value.creates, value.updates, value.errors], ['valid', 1, 0, []])
   assert.equal(value.expiresAt, new Date(expiresAt).toISOString(), 'The token expires exactly thirty minutes after issuance')
   timed.push({ ...value, code, name })
  }
  const [control, exact, after] = timed
  h.setNow(expiresAt - 1)
  const accepted = await call(`/api/v1/launch/imports/${control.id}/commit`, { method: 'POST', body: envelope({ token: control.token }) })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
  assert.equal(accepted.body.meta.evaluatedAt, new Date(expiresAt - 1).toISOString())
  assert.deepEqual(accepted.body.data.value, { id: control.id, rows: 1 })
  const saved = await h.db.prepare('SELECT id,name FROM campaigns WHERE code=?').bind(control.code).first()
  assert.equal(saved.name, control.name, 'An equivalent valid import commits just before expiry')
  assert.equal(await h.db.prepare("SELECT COUNT(*) AS n FROM activity_entries WHERE campaign_id=? AND type='import.committed'").bind(saved.id).first('n'), 1)

  const beforeExpiryRefusals = await snapshot()
  for (const [candidate, now] of [[exact, expiresAt], [after, expiresAt + 1]]) {
   h.setNow(now)
   const refused = await call(`/api/v1/launch/imports/${candidate.id}/commit`, { method: 'POST', body: envelope({ token: candidate.token }) })
   assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.message], [409, 'version_conflict', 'Preview expired; make a new preview'], 'Otherwise-valid confirmation is refused specifically for expiry')
   assert.deepEqual(await snapshot(), beforeExpiryRefusals, 'Expiry changes no records, activity, committed imports, audit, events, queued work or provider effects')
   assert.equal(await h.db.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE code=?').bind(candidate.code).first('n'), 0)
  }
 } finally { h.setNow(undefined) }
 await customFieldDeletionJourney()
 await launchImportDeletionJourney({ h, call, command, envelope, upload, preview, mapping, unrelatedId: faultPreview.id, unrelatedBytes: faultCsv, sharedId: fresh.id })
})

test('[IMPORT-002] deliverable and milestone CSV rows merge by campaign code and title, name key, owner, select and campaign errors by row and keep stored values for blank cells', async () => {
 const people = (await h.db.prepare('SELECT id,name FROM operators WHERE active=1 AND id<>? ORDER BY name LIMIT 3').bind(h.owner).all()).results
 assert.equal(people.length, 3, 'Three current colleagues besides the owner')
 await childImportMergeJourney({ owner: h.owner, people, call, command, envelope, upload, preview })
})

test('[CAMP-013] two-campaign bulk status undo restores once before one hour, refuses at and after expiry, and replays without effects', async () => {
 await launchBulkUndoJourney({ h, call, command, envelope, campaignRef })
})

test('[SET-003] sample data installs and removes in one action, and removal is refused naming edited records', async () => {
 const install = async () => (await command('launch.samples.install', {})).body.data.value
 const edited = await install(), kept = await install()
 const listed = (await call('/api/v1/launch/samples')).body.data.items
 assert.equal(listed.length, 2)
 const sample = await h.db.prepare('SELECT c.id,c.name,c.version FROM campaigns c JOIN launch_sample_records s ON s.record_id=c.id WHERE s.installation_id=? ORDER BY c.id LIMIT 1').bind(edited.installationId).first()
 assert.equal((await command('launch.campaign.patch', { id: sample.id, changes: { statusSummary: 'Changed by an operator' } }, [campaignRef(sample)])).status, 200)
 const refused = await call('/api/v1/commands/launch.samples.remove', { method: 'POST', body: envelope({ installationId: edited.installationId },listed.find(item=>item.id===edited.installationId).revisions) })
 assert.equal(refused.status, 409, JSON.stringify(refused.body))
 assert.match(refused.body.error.message, new RegExp(`current version ${sample.version+1}`))
 const refreshed=(await call('/api/v1/launch/samples')).body.data.items.find(item=>item.id===edited.installationId)
 const editedRefusal=await command('launch.samples.remove',{installationId:edited.installationId},refreshed.revisions)
 assert.equal(editedRefusal.status,400,JSON.stringify(editedRefusal.body))
 assert.match(editedRefusal.body.error.message,new RegExp(`campaign “${sample.name}”`))
 assert.equal(await h.db.prepare('SELECT COUNT(*) AS n FROM launch_sample_records WHERE installation_id=?').bind(edited.installationId).first('n'), edited.recordIds.length, 'A refused removal deletes nothing')
 const removed = await call('/api/v1/commands/launch.samples.remove', { method: 'POST', body: envelope({ installationId: kept.installationId },listed.find(item=>item.id===kept.installationId).revisions) })
 assert.equal(removed.status, 200, JSON.stringify(removed.body))
 assert.equal(await h.db.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(kept.recordIds)).first('n'), 0)
 assert.equal(await h.db.prepare("SELECT COUNT(*) AS n FROM lifecycle_erasures WHERE subject_kind='campaign' AND state<>'complete' AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(kept.recordIds)).first('n'), 0)
})

test('[VIEW-007] campaign pages follow a keyset cursor: a record added before the cursor neither repeats nor skips others', async () => {
 const read = async cursor => (await h.request(h.ownerSession, `/api/campaigns?sort=name&limit=2${cursor ? `&cursor=${cursor}` : ''}`)).json()
 const before = []
 for (let page = await read(); ; page = await read(page.cursor)) { before.push(...page.items.map(item => item.id)); if (!page.cursor) break }
 const first = await read()
 const owner = h.owner
 assert.equal((await command('launch.campaign.create', { fields: { code: 'PAGE-AAA', name: '!! First by name', ownerId: owner, startDate: '2026-01-01', launchDate: '2026-02-01', objective: '', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} } })).status, 200)
 const rest = []
 for (let page = await read(first.cursor); ; page = await read(page.cursor)) { rest.push(...page.items.map(item => item.id)); if (!page.cursor) break }
 assert.deepEqual([...first.items.map(item => item.id), ...rest], before, 'Every existing record appears once and in order')
})

test('[PERM-007] [OPS-002] [OPS-004] [OPS-005] [SYNC-002] [BASE-ACCESS] the sole owner hands over ownership after a fresh confirmation, the installation keeps exactly one owner, the former owner removes themselves, Base operator routes cannot remove the owner, and scheduled CSV and Parquet exports to every destination follow current policy before a leaver is removed and erased through company SCIM for good', async t => {
 const person = await h.addPerson({ name: 'Alex Successor' })
 const member = async (id = person.id, session = h.ownerSession) => (await call(`/api/v1/members?appId=${LAUNCH_APP_ID}`, {}, session)).body.data.items.find(item => item.id === id)
 const memberRef = row => [{ ref: { appId: LAUNCH_APP_ID, entityId: '00000000000000000000000101', recordId: row.id }, version: row.version }]
 const owners = async () => (await h.db.prepare("SELECT p.id FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.state='active' AND (p.initial_owner=1 OR (o.role='owner' AND o.status='active'))").all()).results.map(row => row.id)
 const roleOf = id => h.db.prepare('SELECT p.initial_owner,o.role FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=?').bind(id).first()
 // The confirmation link completes in the owner's own session.
 const confirm = async session => {
  const previous = (await h.mailMessages()).length
  const asked = await h.request(session, '/auth/step-up', { method: 'POST', body: JSON.stringify({ action: 'owner:transfer', returnTo: '/app/settings' }) })
  assert.equal(asked.status, 202, await asked.text())
  const messages = (await h.mailMessages()).slice(previous)
  const links = messages.flatMap(message => [...message.content.find(part=>part.type==='text/plain').value.matchAll(/https?:\/\/\S+/g)].map(match => new URL(match[0]))).filter(url => url.pathname === '/auth/confirm')
  assert.equal(links.length, 1, 'The fresh step-up request captures one confirmation link, independent of queued notifications')
  const token = links[0].searchParams.get('token')
  assert.equal((await h.request(session, '/auth/confirm', { method: 'POST', body: JSON.stringify({ token }), redirect: 'manual' })).status, 303)
 }
 const target = await member()
 assert.equal(target.allowedActions.find(action => action.action === 'member.transfer-ownership').enabled, true)

 // A session without a fresh email-link proof is refused, as is a member who is not the owner.
 await h.db.prepare('UPDATE oa_sessions SET created_at=created_at-700000 WHERE id=?').bind(h.ownerSession.baseId).run()
 const unproven = await command('member.transfer-ownership', { memberId: person.id }, memberRef(target))
 assert.equal(unproven.status, 400, JSON.stringify(unproven.body))
 assert.equal(unproven.body.error.blockers[0].code, 'step_up_required')
 const self = await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(h.owner).first()
 assert.equal((await command('member.transfer-ownership', { memberId: h.owner }, memberRef({ id: h.owner, version: self.version }), person.session)).status, 403)

 // The owner cannot leave without handing over first.
 const ownerLeaves = await command('member.remove', { memberId: h.owner, reason: 'Leaving' }, memberRef(await member(h.owner)))
 assert.equal(ownerLeaves.status, 403, JSON.stringify(ownerLeaves.body))

 await confirm(h.ownerSession)
 const handed = await command('member.transfer-ownership', { memberId: person.id }, memberRef(target))
 assert.equal(handed.status, 200, JSON.stringify(handed.body))
 assert.deepEqual(await roleOf(person.id), { initial_owner: 1, role: 'owner' })
 assert.deepEqual(await roleOf(h.owner), { initial_owner: 0, role: 'admin' }, 'The former owner becomes a Base admin in the same commit')
 assert.deepEqual(await owners(), [person.id], 'Exactly one owner remains')
 assert.equal((await h.request(h.ownerSession, '/api/v1/session')).status, 401, 'Losing the owner role ends the former owner\'s sessions, as any Base role change does')
 assert.equal((await h.request(person.session, `/api/v1/members?appId=${LAUNCH_APP_ID}`)).status, 401, 'Becoming owner ends the new owner\'s older sessions, as any Base role change does')

 // The new owner cannot remove themselves and leave the installation without an owner.
 const owner = await h.signIn(person.id)
 assert.equal((await member(person.id, owner)).owner, true)
 const ownerless = await command('member.remove', { memberId: person.id, reason: 'Leaving' }, memberRef(await member(person.id, owner)), owner)
 assert.equal(ownerless.status, 403, JSON.stringify(ownerless.body))
 assert.deepEqual(await owners(), [person.id])

 // The former owner signs in again with their app access and can leave once their campaigns move to someone else.
 const former = await h.signIn(h.owner)
 const formerSelf = () => member(h.owner, former)
 const blocked = await command('member.remove', { memberId: h.owner, reason: 'Handing the workspace over' }, memberRef(await formerSelf()), former)
 assert.equal(blocked.status, 409, JSON.stringify(blocked.body))
 const owned = (await h.db.prepare('SELECT id,version FROM campaigns WHERE owner_id=? AND archived_at IS NULL').bind(h.owner).all()).results
 assert.equal((await command('launch.bulk.apply', { recordType: 'Campaign', ids: owned.map(row => row.id), change: { kind: 'field', field: 'ownerId', value: person.id } }, owned.map(campaignRef), former)).status, 200)
 for (const decision of (await h.db.prepare("SELECT id,version FROM decisions WHERE assignee_id=? AND state IN ('Awaiting approval','In review')").bind(h.owner).all()).results)
  assert.equal((await command('launch.decision.assign', { id: decision.id, assigneeId: person.id }, [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.decision, recordId: decision.id }, version: decision.version }], former)).status, 200)
 const removed = await command('member.remove', { memberId: h.owner, reason: 'Handing the workspace over' }, memberRef(await formerSelf()), former)
 assert.equal(removed.status, 200, JSON.stringify(removed.body))
 assert.equal((await h.request(former, '/api/v1/session')).status, 401, 'The former owner is signed out everywhere')

 // Ownership can still be handed on: the new owner hands over to a third member.
 const next = await h.addPerson({ name: 'Jo Next' })
 await confirm(owner)
 const again = await command('member.transfer-ownership', { memberId: next.id }, memberRef(await member(next.id, owner)), owner)
 assert.equal(again.status, 200, JSON.stringify(again.body))
 assert.deepEqual(await owners(), [next.id])

 // Base's own operator routes cannot leave the installation without an owner: a Base co-owner
 // cannot deactivate or demote the installation owner, nor can the owner demote themselves.
 const baseId = id => h.db.prepare('SELECT base_id FROM cradle_base_operators WHERE principal_id=?').bind(id).first('base_id')
 const operator = async (session, route, body) => { const response = await h.request(session, route, { method: 'POST', body: JSON.stringify(body) }); return { status: response.status, body: await response.json().catch(() => null) } }
 const current = await h.signIn(next.id)
 await confirm(current)
 assert.equal((await operator(current, '/auth/operator/role', { operatorId: await baseId(person.id), role: 'owner' })).status, 200)
 const coOwner = await h.signIn(person.id)
 await confirm(coOwner)
 for (const [session, route, change] of [[coOwner, '/auth/operator/status', { status: 'inactive' }], [coOwner, '/auth/operator/role', { role: 'admin' }], [current, '/auth/operator/role', { role: 'admin' }]]) {
  const refused = await operator(session, route, { operatorId: await baseId(next.id), ...change })
  assert.deepEqual([refused.status, refused.body?.error], [409, 'last_owner'], `${route} ${JSON.stringify(change)}`)
 }
 assert.deepEqual(await roleOf(next.id), { initial_owner: 1, role: 'owner' }, 'The installation owner stays active and the Base owner')
 assert.deepEqual((await h.db.prepare("SELECT id FROM authority_principals WHERE state='active' AND initial_owner=1").all()).results.map(row => row.id), [next.id])
 assert.equal((await operator(current, '/auth/operator/role', { operatorId: await baseId(person.id), role: 'admin' })).status, 200)
 // [OPS-004] [OPS-005] One leaver's journey on the same installation: blocked, removed, read back, erased, irreversible.
 const doors = lifecycleDoors(h, await h.signIn(next.id))
 const world = await seedLeaver(doors, next.id)
 const warehouse = await warehouseExportJourney(doors, world, warehouseEdge)
 const company=await companyLifecycle(t,doors,world)
 await verifyRemoval(doors, world, company)
 await verifyErasure(doors, world, { confirm, erasureProbe:warehouse.erasureProbe })
 await company.erased()
 await warehouse.erased()
})
