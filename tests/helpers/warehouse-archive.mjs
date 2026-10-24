import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fileRecords} from '@runeditrun/rer/modules/portability/files'
import {createUlid} from '../../src/core/shared/ids.ts'

const hour=()=>Math.ceil(Date.now()/3600000)*3600000
const writeCount=edge=>edge.calls.filter(call=>['PUT','POST','DELETE'].includes(call.method)).length
const scheduleColumns=['state','sealed_json','running_id','running_started_at','running_at','running_slot','running_revision','watermark_json','last_slot']
function assertCleared(schedule){
 assert.equal(schedule.state,'paused','Every restored schedule needs a fresh owner save')
 for(const column of scheduleColumns.filter(column=>!['state','watermark_json'].includes(column)))assert.equal(schedule[column],null,'No retained schedule authority or invocation: '+column)
 assert.equal(schedule.watermark_json,'{}','A restored export starts with no inherited watermark')
}
/** Public owner commands and a scheduled Worker produce actual completed R2/S3
 * transfers. The interrupted lease and accepted R2 part are a crash fixture,
 * matching custody written before an invocation loses its acknowledgement. */
export async function addWarehouseArchiveState(h,edge){
 const configurations=[]
 for(const destination of [{kind:'r2'},edge.destination]){
  const input={id:createUlid(),name:'synthetic-cradle-archive-'+destination.kind,bases:[h.appId],mode:'incremental',format:'csv',destination,localRule:'hourly',timezone:'UTC',version:0,...(destination.kind==='s3'?{access:edge.access}:{})}
  const result=(await h.request('/api/v1/commands/warehouse.save',{method:'POST',body:{commandId:createUlid(),expected:[],input}})).data
  assert.equal(result.state,'committed');configurations.push(input)
 }
 const worker=await h.runtime.getWorker(),at=hour()
 assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:at})).outcome,'ok')
 const completed=(await h.db.prepare('SELECT * FROM warehouse_objects ORDER BY object_key').all()).results
 for(const input of configurations){
  const objects=completed.filter(row=>row.export_id===input.id)
  assert.ok(objects.some(row=>row.object_key.endsWith('.csv'))&&objects.some(row=>row.object_key.endsWith('-manifest.json')),'The scheduled '+input.destination.kind+' export has completed files and its read-back manifest')
  assert.ok(objects.every(row=>row.transfer_json==='{}'),'Completed transfers have retired upload custody')
  const schedule=await h.db.prepare('SELECT * FROM warehouse_exports WHERE id=?').bind(input.id).first()
  assert.notEqual(schedule.watermark_json,'{}');assert.ok(schedule.last_slot);assert.equal(schedule.running_id,null)
 }
 assert.ok(writeCount(edge)>0,'The real HTTP S3 edge observed the original completed exports')
 const bucket=await h.runtime.getR2Bucket('WAREHOUSE'),pending=[],revision=(await h.db.prepare("SELECT COALESCE(MAX(rowid),0) n FROM command_admissions WHERE state='committed'").first()).n
 for(const input of configurations){
  const runId=createUlid(),startedAt=new Date(Date.now()-300001).toISOString(),key=input.id+'/synthetic-cradle-interrupted.csv',body=new TextEncoder().encode('synthetic-cradle-interrupted-transfer'),sha256=createHash('sha256').update(body).digest('hex')
  let uploadId='synthetic-cradle-interrupted-s3-upload'
  if(input.destination.kind==='r2'){
   const upload=await bucket.createMultipartUpload(key,{httpMetadata:{contentType:'text/csv'}});uploadId=upload.uploadId;await upload.uploadPart(1,body)
   assert.equal(await bucket.head(key),null,'An accepted R2 part remains in-flight, not a completed object')
  }
  const schedule=await h.db.prepare('SELECT * FROM warehouse_exports WHERE id=?').bind(input.id).first()
  const transfer=JSON.stringify({[input.destination.kind]:{uploadId,sha256}})
  await h.db.batch([
   h.db.prepare("INSERT INTO warehouse_objects(object_key,export_id,run_id,created_at,destination_json,sealed_json,metadata_json,dispatch_state,transfer_json) VALUES(?,?,?,?,?,?,NULL,'prepared',?)").bind(key,input.id,runId,startedAt,schedule.destination_json,schedule.sealed_json,transfer),
   h.db.prepare('UPDATE warehouse_exports SET running_id=?,running_started_at=?,running_at=?,running_slot=?,running_revision=? WHERE id=?').bind(runId,startedAt,new Date(at+3600000).toISOString(),new Date(at+3600000).toISOString().slice(0,13),revision,input.id),
  ])
  pending.push({key,uploadId,transfer})
 }
 assert.equal((await h.db.prepare("SELECT count(*) n FROM warehouse_exports WHERE running_id IS NOT NULL AND watermark_json<>'{}'").first()).n,configurations.length,'The export source contains populated schedules and interrupted invocations')
 assert.equal((await h.db.prepare("SELECT count(*) n FROM warehouse_objects WHERE transfer_json<>'{}'").first()).n,pending.length)
 return {edge,configurations,pending,completedKeys:completed.map(row=>row.object_key),at,sourceOwnerId:h.operator}
}
/** Inspect the actual emitted archive, rather than invoking exportRow directly. */
export async function assertWarehouseArchive(path,fixture){
 const items=[]
 for await(const record of fileRecords(path))if(record.kind==='part')items.push(...record.items)
 const schedules=items.filter(item=>item.kind==='row'&&item.table==='warehouse_exports').map(item=>item.row),objects=items.filter(item=>item.kind==='row'&&item.table==='warehouse_objects').map(item=>item.row)
 assert.deepEqual(schedules.map(row=>row.id).sort(),fixture.configurations.map(row=>row.id).sort())
 for(const schedule of schedules)assertCleared(schedule)
 assert.deepEqual(objects.map(row=>row.object_key).sort(),[...fixture.completedKeys,...fixture.pending.map(row=>row.key)].sort(),'All completed and interrupted object custody remains portable')
 for(const object of objects){assert.equal(object.transfer_json,'{}','Archive clears every live upload session');assert.equal(object.sealed_json,null,'Archive clears every destination credential snapshot')}
 const serialized=JSON.stringify(items)
 for(const secret of [...Object.values(fixture.edge.access),...fixture.pending.map(row=>row.uploadId)])assert.ok(!serialized.includes(secret),'No source credential or live transfer identity enters the archive')
}
/** Runs inside the real installation after rer import and fresh native-owner
 * bootstrap. Cron and queue wake are public runtime doors, not policy calls. */
export async function restoredWarehouseArchive(runtime,db,request,fixture){
 const {edge,configurations,at}=fixture,bucket=await runtime.getR2Bucket('WAREHOUSE'),beforeWrites=writeCount(edge),beforeKeys=(await bucket.list()).objects.map(row=>row.key).sort(),beforeAudits=(await db.prepare("SELECT count(*) n FROM operation_audit WHERE action='warehouse.export'").first()).n
 const restored=(await db.prepare('SELECT * FROM warehouse_exports ORDER BY id').all()).results
 assert.deepEqual(restored.map(row=>row.id).sort(),configurations.map(row=>row.id).sort())
 for(const schedule of restored)assertCleared(schedule)
 const objects=(await db.prepare('SELECT * FROM warehouse_objects').all()).results
 assert.ok(objects.length>fixture.pending.length,'Restore retains completed and interrupted destination custody')
 for(const object of objects){assert.equal(object.transfer_json,'{}');assert.equal(object.sealed_json,null)}
 const list=await request('/api/v1/warehouse-exports')
 for(const input of configurations){const schedule=list.exports.find(row=>row.id===input.id);assert.ok(schedule);assert.equal(schedule.state,'paused');assert.equal(schedule.credentialsConfigured,false)}
 const worker=await runtime.getWorker()
 assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:at+7200000})).outcome,'ok')
 assert.equal((await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.warehouse.wake.v1'}}])).outcome,'ok')
 assert.equal(writeCount(edge),beforeWrites,'Restore, cron and queue wake start zero old remote transfers')
 assert.deepEqual((await bucket.list()).objects.map(row=>row.key).sort(),beforeKeys,'Restore, cron and queue wake create zero old R2 objects')
 assert.equal((await db.prepare("SELECT count(*) n FROM warehouse_exports WHERE state='active' OR running_id IS NOT NULL OR watermark_json<>'{}'").first()).n,0,'Fresh owner sign-in alone supplies no schedule authority')
 assert.equal((await db.prepare("SELECT count(*) n FROM operation_audit WHERE action='warehouse.export'").first()).n,beforeAudits,'Restoration starts no new export operation')
 // Each schedule independently needs a new owner command. Remote schedules also
 // need new destination credentials; reconnecting one never activates another.
 for(const input of configurations){
  const current=(await request('/api/v1/warehouse-exports')).exports.find(row=>row.id===input.id),body={commandId:createUlid(),expected:[],input:{...input,version:current.version}}
  if(input.destination.kind==='s3'){
   const withoutAccess={...body,input:{...body.input}};delete withoutAccess.input.access
   await request('/api/v1/commands/warehouse.save',withoutAccess,400)
   assert.equal((await db.prepare('SELECT state FROM warehouse_exports WHERE id=?').bind(input.id).first()).state,'paused','Remote export refuses inherited destination authority')
  }
  await request('/api/v1/commands/warehouse.save',body)
  const authorized=await db.prepare('SELECT state,owner_id FROM warehouse_exports WHERE id=?').bind(input.id).first()
  assert.equal(authorized.state,'active','A fresh owner save explicitly reauthorizes this schedule');assert.notEqual(authorized.owner_id,fixture.sourceOwnerId,'The restored schedule runs under the fresh owner, not its source authority')
 }
 assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:at+10800000})).outcome,'ok')
 assert.ok(writeCount(edge)>beforeWrites,'Freshly authorized remote export sends a new transfer')
 for(const input of configurations){const schedule=await db.prepare('SELECT running_id,watermark_json FROM warehouse_exports WHERE id=?').bind(input.id).first();assert.equal(schedule.running_id,null);assert.notEqual(schedule.watermark_json,'{}','Each freshly authorized schedule completes its own new export')}
}
