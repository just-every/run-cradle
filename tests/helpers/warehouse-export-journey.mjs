import assert from 'node:assert/strict'
import { createUlid, LAUNCH_APP_ID, launchEntities, launchFieldIds } from './launch-authority-runtime.mjs'
import {createHash} from 'node:crypto'
import { parquetMetadata, parquetReadObjects } from 'hyparquet'
import { parseCsv } from '../../src/domains/portability/csv.ts'

const bytes = value => new TextEncoder().encode(value)
const unpack = text => parseCsv(bytes(text))
const campaignFields = (code, name, ownerId) => ({ code, name, ownerId, startDate: '2026-01-01', launchDate: '2027-12-01', objective: 'Private analysis note', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 100, spendMinor: 0, tags: [], customFields: {} })

/** [SYNC-002] Settings and data writes cross the emitted Worker's public doors.
 * R2 reads observe the same local bucket used by its scheduled handler. */
export async function warehouseExportJourney(doors, world, edge) {
 const formats=[]
 for(const destination of ['r2','s3','bigquery','snowflake'])for(const format of ['csv','parquet'])formats.push(await exportFormatJourney(doors,world,format,destination,edge))
 // A native role transition invalidates sessions. One transition exercises the
 // same owner-loss behavior for the entire destination/format matrix.
 const otherBase=await doors.h.db.prepare('SELECT base_id FROM cradle_base_operators WHERE principal_id=?').bind(world.other.id).first('base_id')
 const changeRole=async role=>{const response=await doors.h.request(doors.admin,'/auth/operator/role',{method:'POST',body:JSON.stringify({operatorId:otherBase,role})});assert.equal(response.status,200,await response.clone().text())}
 await changeRole('owner')
 const temporaryOwner=await doors.h.signIn(world.other.id)
 for(const result of formats)await result.ownerProbe(temporaryOwner)
 await changeRole('member')
 const requestsBefore={s3:edge.calls.length,bigquery:edge.bigQuery.uploads.length,snowflake:edge.snowflake.uploads.length}
 await formats.at(-1).tick()
 assert.deepEqual({s3:edge.calls.length,bigquery:edge.bigQuery.uploads.length,snowflake:edge.snowflake.uploads.length},requestsBefore,'Losing ownership sends nothing to any export destination')
 for(const result of formats)await result.paused()
 const inbox=await doors.call('/api/v1/notifications');assert.equal(inbox.status,200,JSON.stringify(inbox.body));assert.ok(inbox.body.data.items.some(item=>item.title==='Bucket export paused'),'A remaining owner receives the pause in their in-app inbox')

 return {async erasureProbe(send){
  for(const [control,cause,hasCopies]of [
   [value=>edge.refuseDelete(value),/S3 delete was refused.*custody is unconfirmed/,()=>edge.objects.size>0],
   [value=>edge.bigQuery.refuseDelete(value),/BigQuery.*custody is unconfirmed/,()=>[...edge.bigQuery.tables.values()].some(rows=>rows.length)],
   [value=>edge.snowflake.refuseDelete(value),/Snowflake.*custody is unconfirmed/,()=>[...edge.snowflake.tables.values()].some(rows=>rows.length)],
  ]){
   control(true)
   try{const refused=await send();assert.equal(refused.status,503,JSON.stringify(refused.body));assert.match(refused.body.error.message,cause);assert.ok(hasCopies(),'Denied deletion keeps destination copies in custody');assert.equal(await doors.h.db.prepare('SELECT state FROM lifecycle_erasures WHERE id=?').bind(world.leaver.id).first('state'),'pending','Erasure is not confirmed while a destination copy remains')}finally{control(false)}
  }
 },async erased(){for(const result of formats)await result.erased();edge.bigQuery.assertEmpty();for(const rows of edge.snowflake.tables.values())assert.equal(rows.length,0,'Snowflake has no exported record copies after confirmed erasure')}}
}

async function exportFormatJourney(doors, world, format, destination, edge) {
 const { h, call, command, commit, ref } = doors
 const provider=destination==='bigquery'?edge.bigQuery:destination==='snowflake'?edge.snowflake:null,access=provider?.access??edge.access
 const bucket = destination==='r2'||destination==='bigquery'?await h.runtime.getR2Bucket('WAREHOUSE'):edge.observeBucket,tag=destination+'-'+format
 const id = createUlid()
 const input = { id, name: 'Analysis export', bases: [LAUNCH_APP_ID], mode: 'incremental', format, destination:destination==='r2'?{kind:'r2'}:provider?.destination??edge.destination,...(destination!=='r2'?{access}:{}), localRule: 'hourly', timezone: 'UTC', version: 0 }
 const list = async () => { const response = await call('/api/v1/warehouse-exports'); assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.data }
 const settings = await list()
 assert.ok(settings.bases.some(base => base.id === LAUNCH_APP_ID), 'An owner can choose the Launch base')
 assert.equal((await command('warehouse.save', { ...input, localRule: '* * * * *' })).status, 400, 'Schedules more frequent than hourly are refused')
 assert.notEqual((await command('warehouse.save', input, [], world.stay.session)).status, 200, 'A non-owner cannot configure an export')
 await commit('warehouse.save', input)
 const saved = (await list()).exports.find(item => item.id === id)
 assert.ok(saved && saved.version > 0, 'Configuration is read back through the settings API')
 assert.equal(saved.format,format,'The requested format is read back through Settings')
 assert.equal(saved.destination.kind,destination)
 if(destination!=='r2'){
  assert.equal(saved.credentialsConfigured,true)
  assert.equal('access'in saved,false,'Destination credentials are write-only')
  const stored=await h.db.prepare('SELECT sealed_json FROM warehouse_exports WHERE id=?').bind(id).first()
  for(const secret of Object.values(access))assert.ok(!stored.sealed_json.includes(secret),'Destination keys are sealed at rest')
  const audits=await h.db.prepare('SELECT changes_json FROM admission_audit WHERE action=?').bind('warehouse.save').all()
  for(const audit of audits.results)for(const change of JSON.parse(audit.changes_json)){
   const after=change.after?.value;if(typeof after==='string'&&after.startsWith('{'))assert.equal('access'in JSON.parse(after),false,'Destination credentials never enter audit changes')
  }
 }

 assert.notEqual((await command('warehouse.save', { ...input, name: 'Stale config' })).status, 200, 'Changing an export requires its current version')

 // Isolate the warehouse's no-change tick from independent shipped automation effects.
 const enabled = (await h.db.prepare('SELECT id,version FROM automations WHERE enabled=1').all()).results
 for (const automation of enabled) await commit('launch.automation.disable', { id: automation.id }, ref('automation', automation))
 const current = async row => h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(row.id).first()
 const edited = await commit('launch.campaign.create', { fields: campaignFields(`WARE-${tag}-EDIT`, 'Warehouse original', world.adminId) })
 const deleted = await commit('launch.campaign.create', { fields: campaignFields(`WARE-${tag}-DELETE`, 'Warehouse deletion', world.adminId) })
 const leaver = await doors.member(world.leaver.id)
 const personal = await commit('launch.campaign.create', { fields: campaignFields(`WARE-${tag}-IDENTITY`, `${leaver.name} archive`, world.leaver.id) }, [], world.leaver.session)
 const runDay = new Date(Date.now() + 86400000)
 runDay.setUTCHours(1, 0, 0, 0)
 let time = runDay.getTime()
 const tick = async () => { const at = new Date(time).toISOString(); time += 3600000; const result = await doors.tick(at); assert.equal(result.outcome, 'ok', `Scheduled export tick failed: ${JSON.stringify({ result, writes: (await h.db.prepare('SELECT id,object_key FROM lifecycle_file_writes').all()).results })}`); return at }
 const keys = async () => { const objects = []; let cursor; do { const page = await bucket.list({ prefix: id + '/', cursor }); objects.push(...page.objects.map(object => object.key)); cursor = page.truncated ? page.cursor : undefined } while (cursor); return objects.sort() }
 const read = async key => { const object = await bucket.get(key); assert.ok(object, `Missing exported object ${key}`); return object.text() }
 const readData = async key => {
  const normalize=async parsed=>{
   if(destination!=='bigquery')return parsed
   let mapping
   for(const manifestKey of (await keys()).filter(key=>key.endsWith('-manifest.json'))){const manifest=JSON.parse(await read(manifestKey));const file=manifest.files.find(file=>file.key===key);if(file){mapping=file.columns;break}}
   assert.ok(mapping,'BigQuery source-field aliases are recorded in the exported manifest')
   assert.equal(new Set(mapping.map(column=>column.fieldId)).size,mapping.length,'Mapped columns retain unique source-field identity')
   for(const column of mapping){assert.ok(parsed.headers.includes(column.column),'The exact uploaded file uses its manifest column alias');assert.match(column.column,/^[A-Za-z_][A-Za-z0-9_]*$/,'Mapped names are valid BigQuery identifiers')}
   return {...parsed,columns:mapping,headers:parsed.headers.map(name=>mapping.find(column=>column.column===name)?.label??name)}
  }
  const object=await bucket.get(key);assert.ok(object,`Missing exported object ${key}`)
  const captured=await object.arrayBuffer()
  if(provider){
   const uploaded=destination==='bigquery'?provider.uploads.find(file=>file.jobId==='cradle_load_'+createHash('sha256').update(key).digest('hex')):provider.uploads.find(file=>file.key===key)
   assert.ok(uploaded,'The destination accepted this exact file identity');assert.ok(Buffer.from(uploaded.bytes).equals(Buffer.from(captured)),'The real provider edge consumed the exact exported file bytes')
  }
  if(format==='csv')return normalize(unpack(new TextDecoder().decode(captured)))
  assert.equal(object.httpMetadata.contentType,'application/vnd.apache.parquet')
  const file=captured,metadata=parquetMetadata(file),headers=metadata.schema.slice(1).map(column=>column.name)
  const records=await parquetReadObjects({file})
  const parsed=await normalize({headers,rows:records.map(record=>headers.map(name=>record[name]===null?'':typeof record[name]==='boolean'?(record[name]?'Yes':'No'):String(record[name])))})
  const numericName=destination==='bigquery'?parsed.columns.find(column=>column.fieldId===launchFieldIds.campaign.health)?.column:parsed.headers.find(name=>name==='Health'||name==='Reported health (%)')
  assert.ok(numericName,'The current readable numeric source field has a Parquet column')
  assert.equal(metadata.schema.find(column=>column.name===numericName)?.type,'DOUBLE','Numeric fields retain DOUBLE type in every destination’s Parquet files')
  return parsed
 }
 const fileAt = (all, at, suffix) => all.find(key => key.startsWith(`${id}/${LAUNCH_APP_ID}/${launchEntities.campaign}/`) && key.endsWith(`${at}-${suffix}.${format}`))
 const rowsById = parsed => new Map(parsed.rows.map(row => [row[parsed.headers.indexOf('_record_id')], row]))
 if(destination==='bigquery'&&format==='csv')edge.bigQuery.loseNextAcknowledgement()
 if(destination==='snowflake'&&format==='csv')edge.snowflake.loseCopyAcknowledgementOnce()
 const fullAt = await tick(), fullKeys = await keys(), fullKey = fileAt(fullKeys, fullAt, 'full')
 assert.ok(fullKey, `The first incremental schedule writes its full baseline: ${JSON.stringify({ fullAt, fullKeys, settings: await list(), stored: await h.db.prepare('SELECT running_id,last_slot FROM warehouse_exports WHERE id=?').bind(id).first() })}`)
 const full = await readData(fullKey)
 assert.deepEqual(full.headers.slice(0, 2), ['_record_id', '_operation'])
 assert.ok(rowsById(full).has(edited.id) && rowsById(full).has(deleted.id) && rowsById(full).has(personal.id))
 const fields = Object.values(launchFieldIds.campaign)
 const publicCsv = await call('/api/v1/records/export-csv', { method: 'POST', body: JSON.stringify({ appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, query: { fields, includeArchived: true } }) })
 assert.equal(publicCsv.status, 200, JSON.stringify(publicCsv.body))
 const ordinary = unpack(publicCsv.body.data.csv)
 assert.deepEqual(full.headers.slice(2), ordinary.headers, 'Field order exactly matches the existing CSV export')
 assert.deepEqual(full.rows.map(row => row.slice(2)), ordinary.rows, 'Typed values exactly match the existing CSV export')
 assert.ok(JSON.stringify(full.rows).includes(leaver.name), 'The real bucket contains the person’s values before erasure')
 const manifests = fullKeys.filter(key => key.endsWith('-manifest.json'))
 assert.equal(manifests.length, 1, 'A scheduled run writes one manifest')
 const manifest = JSON.parse(await read(manifests[0]))
 assert.ok(JSON.stringify(manifest).includes('schemaHash'), 'Manifest records the schema hash')
 const manifestTable = manifest.files.find(file => file.key === fullKey)
 assert.equal(manifestTable.rows, full.rows.length, 'Manifest row count matches the read-back table object')
 assert.match(manifestTable.schemaHash, /^[a-f0-9]{64}$/, 'Manifest schema hash is a SHA-256 digest')
 assert.ok(JSON.stringify(manifest).includes('watermarkBefore') && JSON.stringify(manifest).includes('watermarkAfter'), 'Manifest records both watermarks')

 await commit('launch.campaign.patch', { id: edited.id, changes: { name: 'Warehouse changed' } }, ref('campaign', await current(edited)))
 const added = await commit('launch.campaign.create', { fields: campaignFields(`WARE-${tag}-ADD`, 'Warehouse added', world.adminId) })
 const incrementAt = await tick(), incrementKey = fileAt(await keys(), incrementAt, 'incr')
 assert.ok(incrementKey)
 const incremental = await readData(incrementKey), changed = rowsById(incremental)
 assert.deepEqual([...changed.keys()].sort(), [edited.id, added.id].sort(), 'Incremental CSV contains exactly the changed and newly created records')
 for (const row of changed.values()) assert.equal(row[1], 'upsert')
 assert.equal(changed.get(edited.id)[incremental.headers.indexOf('Name')], 'Warehouse changed')
 assert.equal(changed.get(added.id)[incremental.headers.indexOf('Name')], 'Warehouse added')

 await commit('launch.campaign.delete', { id: deleted.id, confirmationCode: `WARE-${tag}-DELETE` }, ref('campaign', await current(deleted)))
 const deletionAt = await tick(), deletionKey = fileAt(await keys(), deletionAt, 'incr')
 assert.ok(deletionKey)
 const tombstones = await readData(deletionKey)
 assert.deepEqual(tombstones.rows.map(row => row.slice(0, 2)), [[deleted.id, 'delete']], 'Deletion is an explicit tombstone, not a disappeared row')
 const beforeIdle = (await keys()).filter(key => key.endsWith('.'+format))
 await tick()
 assert.deepEqual((await keys()).filter(key => key.endsWith('.'+format)), beforeIdle, 'A second tick with no changes writes no data file')

 if(destination==='s3'){
  const wide=[]
  for(let index=0;index<12;index++)wide.push(await commit('launch.campaign.create',{fields:{...campaignFields(`WARE-${tag}-WIDE-${index}`,'Warehouse partition '+index,world.adminId),objective:`synthetic-cradle-${index} `+'ä'.repeat(50000)}}))
  const splitAt=await tick(),splitManifest=JSON.parse(await read(`${id}/${splitAt}-manifest.json`)),parts=splitManifest.files.filter(file=>file.key.includes('/'+launchEntities.campaign+'/'))
  assert.ok(parts.length>1,'Large exports are partitioned into complete files rather than truncated')
  const all=(await Promise.all(parts.map(file=>readData(file.key)))).flatMap(file=>file.rows)
  assert.deepEqual(all.map(row=>row[0]).sort(),wide.map(row=>row.id).sort(),'Every large record appears exactly once across read-back parts')
  for(const row of wide)await commit('launch.campaign.delete',{id:row.id,confirmationCode:`WARE-${tag}-WIDE-${wide.indexOf(row)}`},ref('campaign',await current(row)))
 }

 // Fixture policy changes use the same durable policy rows as the authority suite;
 // the export itself still runs through the scheduled Worker with current policy.
 const policy = await h.db.prepare('SELECT p.* FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(world.adminId, LAUNCH_APP_ID).first()
 const rules = JSON.parse(policy.rules_json)
 const narrowed = rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, rows: { kind: 'condition', fieldId: launchFieldIds.campaign.code, op: 'eq', value: `WARE-${tag}-EDIT` }, readableFields: rule.readableFields.filter(field => field !== launchFieldIds.campaign.objective) } : rule)
 try {
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrowed), policy.id).run()
  const config = (await list()).exports.find(item => item.id === id)
  await commit('warehouse.save', { ...input, version: config.version, mode: 'full' })
  const narrowAt = await tick(), narrowKey = fileAt(await keys(), narrowAt, 'full')
  assert.ok(narrowKey)
  const projected = await readData(narrowKey)
  assert.deepEqual(projected.rows.map(row => row[0]), [edited.id], 'A narrowed owner exports only currently readable records')
  assert.ok(!projected.headers.includes('Objective') && !JSON.stringify(projected.rows).includes('Private analysis note'), 'A redacted field stays redacted in the object')
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
 const wake=await(await h.runtime.getWorker()).queue('cradle-work',[{id:'warehouse-wake',timestamp:Date.now(),attempts:1,body:{kind:'cradle.warehouse.wake.v1'}}])
 assert.equal(wake.outcome,'ok','The existing work queue wakes due exports without carrying authority')
 const audit = (await h.db.prepare("SELECT action FROM admission_audit WHERE action IN ('warehouse.save','warehouse.remove')").all()).results
 assert.ok(audit.filter(row => row.action === 'warehouse.save').length >= 3 && audit.some(row => row.action === 'warehouse.remove'), 'Creating, changing and removing exports are audited')
 const finished=(await list()).exports.find(item=>item.id===id)
 await commit('warehouse.remove',{id,version:finished.version})
 const pausedId=createUlid()
 return {tick,async ownerProbe(session){await commit('warehouse.save',{...input,id:pausedId,name:'Owner-loss probe'},[],session)},async paused(){const paused=(await list()).exports.find(item=>item.id===pausedId);assert.equal(paused.state,'paused','Losing ownership pauses the configuring owner’s export');await commit('warehouse.remove',{id:paused.id,version:paused.version})},async erased() { assert.deepEqual(await keys(), [], 'Erasure confirmation leaves no managed warehouse objects containing the person’s values') } }
}
