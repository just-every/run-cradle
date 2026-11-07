import assert from 'node:assert/strict'

// Native HTTP results are the primary proof; persistence snapshots also catch
// hidden writes, activity, admissions and queued effects on refused or replayed commands.
export async function launchBulkUndoJourney({ h, call, command, envelope, campaignRef }) {
 const read = async id => {
  const response = await call(`/api/campaigns/${id}`)
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return response.body
 }
 const snapshot = async () => {
  const stored = {}
  for (const table of ['campaigns', 'campaign_tags', 'launch_custom_values', 'launch_bulk', 'activity_entries', 'command_admissions', 'admission_assertions', 'admission_provenance_segments', 'admission_audit', 'admission_events', 'admission_outbox', 'record_automation_context', 'record_automation_events', 'launch_search_rows', 'launch_search', 'execution_runs', 'execution_attempts'])
   stored[table] = (await h.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results
  return stored
 }
 const batches = []
 for (const name of ['BEFORE', 'EXACT', 'AFTER']) {
  const prior = []
  for (const [index, status] of ['On track', 'Watch'].entries()) {
   const response = await command('launch.campaign.create', { fields: {
    code: `UNDO-${name}-${index + 1}`, name: `Undo ${name.toLowerCase()} campaign ${index + 1}`, ownerId: h.owner,
    startDate: '2026-11-01', launchDate: '2026-12-01', objective: 'Retain the prior campaign status',
    statusSummary: '', phase: 'Planning', status, health: 70, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {},
   } })
   assert.equal(response.status, 200, JSON.stringify(response.body))
   const captured = await read(response.body.data.value.id)
   assert.equal(captured.campaign.status, status)
   prior.push(captured)
  }
  batches.push({ prior })
 }
 const appliedAt = Date.now() + 60_000, expiresAt = appliedAt + 3_600_000
 h.setNow(appliedAt)
 try {
  for (const batch of batches) {
   const applied = await command('launch.bulk.apply', {
    recordType: 'Campaign', ids: batch.prior.map(row => row.campaign.id), change: { kind: 'field', field: 'status', value: 'Blocked' },
   }, batch.prior.map(row => campaignRef(row.campaign)))
   assert.equal(applied.status, 200, JSON.stringify(applied.body))
   assert.equal(applied.body.meta.evaluatedAt, new Date(appliedAt).toISOString())
   assert.equal(applied.body.data.value.count, 2)
   assert.equal(applied.body.data.value.undoExpiresAt, new Date(expiresAt).toISOString(), 'The undo window is exactly one hour from independently controlled application time')
   batch.bulkId = applied.body.data.value.bulkId
   batch.changed = []
   for (const prior of batch.prior) {
    const changed = await read(prior.campaign.id)
    assert.equal(changed.campaign.status, 'Blocked')
    assert.equal(changed.campaign.version, prior.campaign.version + 1)
    batch.changed.push(changed)
   }
  }
  console.log('PROBE CAMP-013 expiry: native bulk apply at T on three separate two-campaign batches -> each undoExpiresAt is T + 3600000 ms')

  const [before, exact, after] = batches
  h.setNow(expiresAt - 1)
  const body = envelope({ bulkId: before.bulkId })
  const undo = () => call('/api/v1/commands/launch.bulk.undo', { method: 'POST', body })
  const restored = await undo()
  assert.equal(restored.status, 200, JSON.stringify(restored.body))
  assert.equal(restored.body.meta.evaluatedAt, new Date(expiresAt - 1).toISOString())
  assert.deepEqual(restored.body.data.value, { bulkId: before.bulkId, restored: 2 })
  const restoredReadbacks = []
  for (const prior of before.prior) {
   const current = await read(prior.campaign.id)
   assert.equal(current.campaign.status, prior.campaign.status, 'Each record restores its own independently captured prior status')
   assert.equal(current.campaign.version, prior.campaign.version + 2)
   assert.equal(current.activity.filter(entry => entry.type === 'campaign.bulk-undone').length, 1)
   restoredReadbacks.push(current)
  }
  console.log('PROBE CAMP-013 before-expiry: native undo at T + 3599999 ms -> both distinct prior statuses restored, versions advance once')

  const afterUndo = await snapshot()
  const used = await command('launch.bulk.undo', { bulkId: before.bulkId })
  assert.deepEqual([used.status, used.body.error.code, used.body.error.message], [400, 'validation', 'Bulk undo has expired or was already used'])
  assert.deepEqual(await snapshot(), afterUndo, 'A second command cannot consume an already-used undo or create any effects')
  for (const current of restoredReadbacks) assert.deepEqual(await read(current.campaign.id), current)
  const replay = await undo()
  assert.equal(replay.status, 200, JSON.stringify(replay.body))
  assert.deepEqual(replay.body.data, restored.body.data, 'Replaying the successful command returns its original committed result')
  assert.deepEqual(await snapshot(), afterUndo, 'Replay adds no record write, activity, admission, audit, event or outbox work')
  for (const current of restoredReadbacks) assert.deepEqual(await read(current.campaign.id), current)
  console.log('PROBE CAMP-013 single-use: new undo command before expiry -> refused unchanged; original successful command replay -> original result and no writes or activity')

  for (const [batch, now] of [[exact, expiresAt], [after, expiresAt + 1]]) {
   h.setNow(now)
   const stored = await snapshot()
   const refused = await command('launch.bulk.undo', { bulkId: batch.bulkId })
   assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.message], [400, 'validation', 'Bulk undo has expired or was already used'])
   assert.deepEqual(await snapshot(), stored, 'Expired undo leaves every record, activity, admission, audit, event and outbox unchanged')
   for (const changed of batch.changed) assert.deepEqual(await read(changed.campaign.id), changed, 'Every campaign retains the applied status and version after expiry refusal')
   console.log(`PROBE CAMP-013 ${now === expiresAt ? 'exact-expiry' : 'after-expiry'}: native undo at T + ${now - appliedAt} ms -> refused; both campaigns and all effects unchanged`)
  }
 } finally { h.setNow(undefined) }
}
