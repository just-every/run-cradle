import assert from 'node:assert/strict'

/** Actual uploads, commands and scheduled delivery on the emitted Worker. R2 is observed only. */
export async function launchImportDeletionJourney({ h, call, command, envelope, upload, preview, mapping, unrelatedId, unrelatedBytes }) {
 const actor = await h.addPerson({ name: 'Import custodian' })
 const denied = await h.addPerson({ name: 'Import reader', change: rules => rules.map(rule => ({ ...rule, actions: rule.actions.filter(action => action !== 'import.delete') })) })
 const csv = `Code,Name,Owner,Start,Launch,Health\r\nIMP-NEW,Preserved imported update,,,,\r\nDEL-NEW,Preserved imported creation,${h.owner},2026-11-01,2026-12-01,80\r\n`
 const fileId = await upload('delete-artifact.csv', csv)
 const reviewed = await preview('campaign', fileId, mapping)
 assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body))
 const artifact = reviewed.body.data.value
 assert.deepEqual([artifact.state, artifact.creates, artifact.updates, artifact.errors], ['valid', 1, 1, []])
 const rows = await call(`/api/v1/launch/imports/${artifact.id}/rows`)
 assert.equal(rows.status, 200, JSON.stringify(rows.body))
 assert.equal(rows.body.data.rows.length, 2, 'The retained preview really contains imported content')
 const commitBody = envelope({ token: artifact.token })
 const committed = await call(`/api/v1/launch/imports/${artifact.id}/commit`, { method: 'POST', body: commitBody })
 assert.equal(committed.status, 200, JSON.stringify(committed.body))
 const readFile = async (id, bytes, session = h.ownerSession) => {
  const response = await h.request(session, `/api/v1/launch/imports/${id}/file`)
  assert.equal(response.status, 200)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(bytes))
 }
 const listed = () => call('/api/v1/launch/imports')
 const beforeList = (await listed()).body.data.items
 assert.ok(beforeList.some(item => item.id === artifact.id))
 assert.ok(beforeList.some(item => item.id === unrelatedId))
 await readFile(artifact.id, csv, actor.session)
 await readFile(unrelatedId, unrelatedBytes)
 const file = await h.db.prepare('SELECT object_key FROM evidence_files WHERE id=?').bind(fileId).first()
 const bucket = () => h.runtime.getR2Bucket('FILES')
 assert.equal((await (await bucket()).head(file.object_key)).size, Buffer.byteLength(csv))
 const business = async () => {
  const result = {}
  for (const table of ['campaigns', 'campaign_tags', 'launch_custom_values', 'deliverables', 'milestones', 'activity_entries'])
   result[table] = (await h.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results
  return result
 }
 const snapshot = async () => {
  const result = await business()
  for (const table of ['portability_previews', 'portability_preview_rows', 'evidence_files', 'lifecycle_erasures', 'lifecycle_erasure_blobs', 'command_admissions', 'admission_audit', 'admission_events', 'admission_outbox'])
   result[table] = (await h.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results
  return result
 }
 const retained = await business()
 const imported = retained.campaigns.filter(row => ['IMP-NEW', 'DEL-NEW'].includes(row.code))
 assert.equal(imported.length, 2)
 assert.equal(imported.find(row => row.code === 'DEL-NEW').name, 'Preserved imported creation')
 assert.equal(imported.find(row => row.code === 'IMP-NEW').name, 'Preserved imported update')
 const publicBefore = await Promise.all(imported.map(async row => (await call(`/api/campaigns/${row.id}`)).body))
 const deleteBody = envelope({ previewId: artifact.id })
 const beforeDenied = await snapshot()
 const refused = await call('/api/v1/commands/import.delete', { method: 'POST', body: deleteBody }, denied.session)
 assert.equal(refused.status, 403, JSON.stringify(refused.body))
 assert.deepEqual(await snapshot(), beforeDenied, 'Missing current import.delete authority changes nothing, including receipts and cleanup')
 await readFile(artifact.id, csv)
 assert.ok(await (await bucket()).head(file.object_key), 'Refusal retains the original R2 object')

 const started = performance.now()
 const removed = await call('/api/v1/commands/import.delete', { method: 'POST', body: deleteBody }, actor.session)
 assert.equal(removed.status, 200, JSON.stringify(removed.body))
 assert.equal(removed.body.data.state, 'committed')
 const receipt = removed.body.data.value
 assert.equal(receipt.id, artifact.id)
 assert.equal(receipt.state, 'pending', 'The response does not claim external cleanup before it is confirmed')
 const remaining = (await listed()).body.data.items
 assert.deepEqual(remaining, beforeList.filter(item => item.id !== artifact.id), 'Only the deleted import is withdrawn from the public listing')
 for (const path of [`/api/v1/launch/imports/${artifact.id}/file`, `/api/v1/launch/imports/${artifact.id}/rows`, `/api/v1/files/${fileId}/content`])
  assert.equal((await h.request(h.ownerSession, path)).status, 404, `${path} cannot disclose the deleted artifact`)
 assert.equal((await call(`/api/v1/launch/imports/${artifact.id}/commit`, { method: 'POST', body: commitBody })).status, 404, 'Captured import confirmation cannot resurrect a deleted artifact')
 assert.equal(await h.db.prepare('SELECT COUNT(*) n FROM portability_previews WHERE id=?').bind(artifact.id).first('n'), 0)
 assert.equal(await h.db.prepare('SELECT COUNT(*) n FROM portability_preview_rows WHERE preview_id=?').bind(artifact.id).first('n'), 0)
 assert.deepEqual(await business(), retained, 'Deleting an artifact preserves every imported record, version and activity entry')
 assert.equal(await h.db.prepare('SELECT state FROM lifecycle_erasures WHERE id=?').bind(receipt.erasureId).first('state'), 'pending')
 assert.ok(await (await bucket()).head(file.object_key), 'Original bytes await durable scheduled cleanup')

 await h.restart()
 assert.equal(await h.db.prepare('SELECT state FROM lifecycle_erasures WHERE id=?').bind(receipt.erasureId).first('state'), 'pending', 'The cleanup obligation survives Worker restart')
 const tick = async () => {
  const result = await (await h.runtime.getWorker()).scheduled({ cron: '* * * * *', scheduledTime: Date.now() })
  assert.equal(result.outcome, 'ok')
 }
 await tick()
 assert.equal(await (await bucket()).head(file.object_key), null, 'Scheduled cleanup confirms removal of the original FILES object')
 const elapsedMs = performance.now() - started
 assert.ok(elapsedMs <= 300000, `Original object removal took ${elapsedMs} ms`)
 const status = await call(`/api/v1/erasures/${receipt.erasureId}`, {}, actor.session)
 assert.equal(status.status, 200, JSON.stringify(status.body))
 assert.equal(status.body.data.state, 'complete')
 assert.ok(status.body.data.completed_at)
 const completed = await h.db.prepare('SELECT * FROM lifecycle_erasures WHERE id=?').bind(receipt.erasureId).first()
 await tick()
 const replayed = await call('/api/v1/commands/import.delete', { method: 'POST', body: deleteBody }, actor.session)
 assert.equal(replayed.status, 200, JSON.stringify(replayed.body))
 assert.deepEqual(replayed.body.data.value, receipt)
 assert.deepEqual(await h.db.prepare('SELECT * FROM lifecycle_erasures WHERE id=?').bind(receipt.erasureId).first(), completed, 'Repeated delivery and command replay preserve the completed receipt')
 assert.equal(await h.db.prepare('SELECT COUNT(*) n FROM admission_audit WHERE command_id=? AND action=?').bind(receipt.erasureId, 'import.delete').first('n'), 1)
 assert.deepEqual(await business(), retained, 'Restart and repeated scheduled delivery cannot alter business history')
 assert.deepEqual(await Promise.all(imported.map(async row => (await call(`/api/campaigns/${row.id}`)).body)), publicBefore, 'Public campaigns retain their complete values and versions')
 await readFile(unrelatedId, unrelatedBytes)
 assert.equal(await (await bucket()).head(file.object_key), null)

 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?')
  .bind(JSON.stringify(actor.rules.map(rule => ({ ...rule, actions: rule.actions.filter(action => action !== 'import.delete') }))), actor.policyId).run()
 const beforeRevoked = await snapshot()
 assert.equal((await call('/api/v1/commands/import.delete', { method: 'POST', body: deleteBody }, actor.session)).status, 403, 'Revoking import.delete also fences a captured deletion receipt')
 assert.equal((await call(`/api/v1/erasures/${receipt.erasureId}`, {}, actor.session)).status, 403, 'Cleanup status requires current import deletion authority')
 assert.deepEqual(await snapshot(), beforeRevoked, 'Revoked replay changes nothing')
 console.log(`PROBE IMPORT-005 2: native campaign CSV upload, preview, commit and human import.delete -> artifact withdrawn, original FILES object absent in ${Math.ceil(elapsedMs)} ms after restart and scheduled delivery; imported records, versions, activity and unrelated bytes unchanged; missing and revoked authority refused unchanged`)
}
