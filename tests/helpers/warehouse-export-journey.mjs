import assert from 'node:assert/strict'
import { createUlid, LAUNCH_APP_ID, launchEntities, launchFieldIds } from './launch-authority-runtime.mjs'
import { parseCsv } from '../../src/domains/portability/csv.ts'

const bytes = value => new TextEncoder().encode(value)
const unpack = text => parseCsv(bytes(text))
const campaignFields = (code, name, ownerId) => ({ code, name, ownerId, startDate: '2026-01-01', launchDate: '2027-12-01', objective: 'Private analysis note', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 100, spendMinor: 0, tags: [], customFields: {} })

/** [SYNC-002] Settings and data writes cross the emitted Worker's public doors.
 * R2 reads observe the same local bucket used by its scheduled handler. */
export async function warehouseExportJourney(doors, world) {
 const { h, call, command, commit, ref } = doors
 const bucket = await h.runtime.getR2Bucket('WAREHOUSE')
 const id = createUlid()
 const input = { id, name: 'Analysis export', bases: [LAUNCH_APP_ID], mode: 'incremental', localRule: 'hourly', timezone: 'UTC', version: 0 }
 const list = async () => { const response = await call('/api/v1/warehouse-exports'); assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.data }
 const settings = await list()
 assert.ok(settings.bases.some(base => base.id === LAUNCH_APP_ID), 'An owner can choose the Launch base')
 assert.equal((await command('warehouse.save', { ...input, localRule: '* * * * *' })).status, 400, 'Schedules more frequent than hourly are refused')
 assert.notEqual((await command('warehouse.save', input, [], world.stay.session)).status, 200, 'A non-owner cannot configure an export')
 await commit('warehouse.save', input)
 const saved = (await list()).exports.find(item => item.id === id)
 assert.ok(saved && saved.version > 0, 'Configuration is read back through the settings API')
 assert.notEqual((await command('warehouse.save', { ...input, name: 'Stale config' })).status, 200, 'Changing an export requires its current version')

 // Isolate the warehouse's no-change tick from independent shipped automation effects.
 const enabled = (await h.db.prepare('SELECT id,version FROM automations WHERE enabled=1').all()).results
 for (const automation of enabled) await commit('launch.automation.disable', { id: automation.id }, ref('automation', automation))
 const current = async row => h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(row.id).first()
 const edited = await commit('launch.campaign.create', { fields: campaignFields('WARE-EDIT', 'Warehouse original', world.adminId) })
 const deleted = await commit('launch.campaign.create', { fields: campaignFields('WARE-DELETE', 'Warehouse deletion', world.adminId) })
 const leaver = await doors.member(world.leaver.id)
 const personal = await commit('launch.campaign.create', { fields: campaignFields('WARE-IDENTITY', `${leaver.name} archive`, world.leaver.id) }, [], world.leaver.session)
 const runDay = new Date(Date.now() + 86400000)
 runDay.setUTCHours(1, 0, 0, 0)
 let time = runDay.getTime()
 const tick = async () => { const at = new Date(time).toISOString(); time += 3600000; const result = await doors.tick(at); assert.equal(result.outcome, 'ok', `Scheduled export tick failed: ${JSON.stringify({ result, writes: (await h.db.prepare('SELECT id,object_key FROM lifecycle_file_writes').all()).results })}`); return at }
 const keys = async () => { const objects = []; let cursor; do { const page = await bucket.list({ prefix: id + '/', cursor }); objects.push(...page.objects.map(object => object.key)); cursor = page.truncated ? page.cursor : undefined } while (cursor); return objects.sort() }
 const read = async key => { const object = await bucket.get(key); assert.ok(object, `Missing exported object ${key}`); return object.text() }
 const fileAt = (all, at, suffix) => all.find(key => key.startsWith(`${id}/${LAUNCH_APP_ID}/${launchEntities.campaign}/`) && key.endsWith(`${at}-${suffix}.csv`))
 const rowsById = parsed => new Map(parsed.rows.map(row => [row[parsed.headers.indexOf('_record_id')], row]))
 const fullAt = await tick(), fullKeys = await keys(), fullKey = fileAt(fullKeys, fullAt, 'full')
 assert.ok(fullKey, `The first incremental schedule writes its full baseline: ${JSON.stringify({ fullAt, fullKeys, settings: await list(), stored: await h.db.prepare('SELECT running_id,last_slot FROM warehouse_exports WHERE id=?').bind(id).first() })}`)
 const full = unpack(await read(fullKey))
 assert.deepEqual(full.headers.slice(0, 2), ['_record_id', '_operation'])
 assert.ok(rowsById(full).has(edited.id) && rowsById(full).has(deleted.id) && rowsById(full).has(personal.id))
 const fields = Object.values(launchFieldIds.campaign)
 const publicCsv = await call('/api/v1/records/export-csv', { method: 'POST', body: JSON.stringify({ appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, query: { fields, includeArchived: true } }) })
 assert.equal(publicCsv.status, 200, JSON.stringify(publicCsv.body))
 const ordinary = unpack(publicCsv.body.data.csv)
 assert.deepEqual(full.headers.slice(2), ordinary.headers, 'Field order exactly matches the existing CSV export')
 assert.deepEqual(full.rows.map(row => row.slice(2)), ordinary.rows, 'Typed values exactly match the existing CSV export')
 assert.ok((await Promise.all(fullKeys.map(read))).some(text => text.includes(leaver.name)), 'The real bucket contains the person’s values before erasure')
 const manifests = fullKeys.filter(key => key.endsWith('-manifest.json'))
 assert.equal(manifests.length, 1, 'A scheduled run writes one manifest')
 const manifest = JSON.parse(await read(manifests[0]))
 assert.ok(JSON.stringify(manifest).includes('schemaHash'), 'Manifest records the schema hash')
 const manifestTable = manifest.files.find(file => file.key === fullKey)
 assert.equal(manifestTable.rows, full.rows.length, 'Manifest row count matches the read-back table object')
 assert.match(manifestTable.schemaHash, /^[a-f0-9]{64}$/, 'Manifest schema hash is a SHA-256 digest')
 assert.ok(JSON.stringify(manifest).includes('watermarkBefore') && JSON.stringify(manifest).includes('watermarkAfter'), 'Manifest records both watermarks')

 await commit('launch.campaign.patch', { id: edited.id, changes: { name: 'Warehouse changed' } }, ref('campaign', await current(edited)))
 const added = await commit('launch.campaign.create', { fields: campaignFields('WARE-ADD', 'Warehouse added', world.adminId) })
 const incrementAt = await tick(), incrementKey = fileAt(await keys(), incrementAt, 'incr')
 assert.ok(incrementKey)
 const incremental = unpack(await read(incrementKey)), changed = rowsById(incremental)
 assert.deepEqual([...changed.keys()].sort(), [edited.id, added.id].sort(), 'Incremental CSV contains exactly the changed and newly created records')
 for (const row of changed.values()) assert.equal(row[1], 'upsert')
 assert.equal(changed.get(edited.id)[incremental.headers.indexOf('Name')], 'Warehouse changed')
 assert.equal(changed.get(added.id)[incremental.headers.indexOf('Name')], 'Warehouse added')

 await commit('launch.campaign.delete', { id: deleted.id, confirmationCode: 'WARE-DELETE' }, ref('campaign', await current(deleted)))
 const deletionAt = await tick(), deletionKey = fileAt(await keys(), deletionAt, 'incr')
 assert.ok(deletionKey)
 const tombstones = unpack(await read(deletionKey))
 assert.deepEqual(tombstones.rows.map(row => row.slice(0, 2)), [[deleted.id, 'delete']], 'Deletion is an explicit tombstone, not a disappeared row')
 const beforeIdle = (await keys()).filter(key => key.endsWith('.csv'))
 await tick()
 assert.deepEqual((await keys()).filter(key => key.endsWith('.csv')), beforeIdle, 'A second tick with no changes writes no data file')

 // Fixture policy changes use the same durable policy rows as the authority suite;
 // the export itself still runs through the scheduled Worker with current policy.
 const policy = await h.db.prepare('SELECT p.* FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(world.adminId, LAUNCH_APP_ID).first()
 const rules = JSON.parse(policy.rules_json)
 const narrowed = rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, rows: { kind: 'condition', fieldId: launchFieldIds.campaign.code, op: 'eq', value: 'WARE-EDIT' }, readableFields: rule.readableFields.filter(field => field !== launchFieldIds.campaign.objective) } : rule)
 try {
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrowed), policy.id).run()
  const config = (await list()).exports.find(item => item.id === id)
  await commit('warehouse.save', { ...input, version: config.version, mode: 'full' })
  const narrowAt = await tick(), narrowKey = fileAt(await keys(), narrowAt, 'full')
  assert.ok(narrowKey)
  const projected = unpack(await read(narrowKey))
  assert.deepEqual(projected.rows.map(row => row[0]), [edited.id], 'A narrowed owner exports only currently readable records')
  assert.ok(!projected.headers.includes('Objective') && !(await read(narrowKey)).includes('Private analysis note'), 'A redacted field stays redacted in the object')
  const narrowManifest = await read(`${id}/${narrowAt}-manifest.json`)
  for (const hiddenId of [added.id, personal.id]) assert.ok(!narrowManifest.includes(hiddenId), 'The narrowed manifest exposes no hidden record identifiers')
 } finally {
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json, policy.id).run()
 }
 // The identity copy stays owned by the removed person, so the shared erasure
 // custody path scrubs its source row and deletes the exported objects.
 await commit('launch.campaign.archive', { id: personal.id }, ref('campaign', await current(personal)))
 for (const automation of enabled) { const row = await h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(automation.id).first(); await commit('launch.automation.enable', { id: row.id }, ref('automation', row)) }
 const second = { ...input, id: createUlid(), name: 'Removed export' }
 await commit('warehouse.save', second)
 const removable = (await list()).exports.find(item => item.id === second.id)
 await commit('warehouse.remove', { id: second.id, version: removable.version })
 assert.ok(!(await list()).exports.some(item => item.id === second.id), 'Removing an export removes it from settings')
 // Ownership is rechecked at dispatch, independently of the session that configured it.
 const otherBase = await h.db.prepare('SELECT base_id FROM cradle_base_operators WHERE principal_id=?').bind(world.other.id).first('base_id')
 const changeRole = async role => { const response = await h.request(doors.admin, '/auth/operator/role', { method: 'POST', body: JSON.stringify({ operatorId: otherBase, role }) }); assert.equal(response.status, 200, await response.clone().text()) }
 await changeRole('owner')
 const temporaryOwner = await h.signIn(world.other.id), pausedId = createUlid()
 await commit('warehouse.save', { ...input, id: pausedId, name: 'Owner-loss probe' }, [], temporaryOwner)
 await changeRole('member')
 await tick()
 const paused = (await list()).exports.find(item => item.id === pausedId)
 assert.equal(paused.state, 'paused', 'Losing ownership pauses the configuring owner’s export')
 const inbox = await call('/api/v1/notifications')
 assert.equal(inbox.status, 200, JSON.stringify(inbox.body))
 assert.ok(inbox.body.data.items.some(item => item.title === 'Bucket export paused'), `A remaining owner receives the pause in their in-app inbox: ${JSON.stringify({ adminId: world.adminId, pauseRows: (await h.db.prepare("SELECT operator_id,title,unavailable FROM notifications WHERE kind='warehouse-paused'").all()).results, inboxTitles: inbox.body.data.items.map(item => item.title) })}`)
 await commit('warehouse.remove', { id: paused.id, version: paused.version })
 const wake=await(await h.runtime.getWorker()).queue('cradle-work',[{id:'warehouse-wake',timestamp:Date.now(),attempts:1,body:{kind:'cradle.warehouse.wake.v1'}}])
 assert.equal(wake.outcome,'ok','The existing work queue wakes due exports without carrying authority')
 const audit = (await h.db.prepare("SELECT action FROM admission_audit WHERE action IN ('warehouse.save','warehouse.remove')").all()).results
 assert.ok(audit.filter(row => row.action === 'warehouse.save').length >= 3 && audit.some(row => row.action === 'warehouse.remove'), 'Creating, changing and removing exports are audited')
 return { async erased() { assert.deepEqual(await keys(), [], 'Erasure confirmation leaves no managed warehouse objects containing the person’s values') } }
}
