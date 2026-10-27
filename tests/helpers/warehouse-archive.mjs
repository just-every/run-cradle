import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fileRecords} from '@runeditrun/rer/modules/portability/files'
import {createUlid} from '../../src/core/shared/ids.ts'

const hour=()=>Math.ceil(Date.now()/3600000)*3600000
const writeCount=edge=>edge.calls.filter(call=>['PUT','POST','DELETE'].includes(call.method)).length
const scheduleColumns=['state','sealed_json','running_id','running_started_at','running_at','running_slot','running_revision','watermark_json','last_slot','running_stopped_slot']
function assertCleared(schedule){
 assert.equal(schedule.state,'paused','Every restored schedule needs a fresh owner save')
 for(const column of scheduleColumns.filter(column=>!['state','watermark_json'].includes(column)))assert.equal(schedule[column],null,'No retained schedule authority or invocation: '+column)
 assert.equal(schedule.watermark_json,'{}','A restored export starts with no inherited watermark')
 for(const column of ['running_failures','running_stalls','running_objects'])assert.equal(schedule[column],0,'No inherited recovery accounting: '+column)
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
   h.db.prepare('UPDATE warehouse_exports SET running_id=?,running_started_at=?,running_at=?,running_slot=?,running_revision=?,running_failures=3,running_stalls=1,running_objects=1,running_stopped_slot=? WHERE id=?').bind(runId,startedAt,new Date(at+3600000).toISOString(),new Date(at+3600000).toISOString().slice(0,13),revision,new Date(at+3600000).toISOString().slice(0,13),input.id),
  ])
  pending.push({key,uploadId,transfer})
 }
 assert.equal((await h.db.prepare("SELECT count(*) n FROM warehouse_exports WHERE running_id IS NOT NULL AND watermark_json<>'{}'").first()).n,configurations.length,'The export source contains populated schedules and interrupted invocations')
 assert.equal((await h.db.prepare("SELECT count(*) n FROM warehouse_objects WHERE transfer_json<>'{}'").first()).n,pending.length)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM warehouse_exports WHERE running_failures>0 AND running_stalls>0 AND running_objects>0 AND running_stopped_slot IS NOT NULL AND running_id IS NOT NULL').first()).n,configurations.length,'The source positively contains every populated recovery field and retained claim')
 const importing=await liveImportArchiveState(h)
 const sourcePolicy=await h.db.prepare("SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id='00000000000000000000000700'").bind(h.operator).first()
 assert.ok(sourcePolicy)
 return {edge,configurations,pending,completedKeys:completed.map(row=>row.object_key),at,sourceOwnerId:h.operator,sourcePolicy,importing}
}

/** A real bounded native apply commits records, then a refused settlement leaves
 * its actual journal live. This is synthetic D1 fault injection at persistence,
 * not a replacement importer or a fabricated progress attempt. */
async function liveImportArchiveState(h){
 const filename='synthetic-cradle-archive-import.csv',text='Name\n'+Array.from({length:25},(_,i)=>'synthetic-cradle-'+(5100+i)).join('\n')+'\n',options={name:'Synthetic archive import',tables:{[filename]:{columns:{'column-1':{type:'text'}}}}},prefix='/api/v1/records/base-import'
 const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
 const upload=async(route,preview)=>{
  const body=new FormData();body.append('files',new Blob([text],{type:'text/csv'}),filename);body.set('options',JSON.stringify(options))
  if(preview){body.set('identities',JSON.stringify(preview.identities));body.set('fingerprint',preview.fingerprint);body.set('acceptLoss','true')}
  const response=await fetch(h.origin+prefix+route,{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf},body}),value=await response.json()
  assert.equal(response.status,200,JSON.stringify(value));return value.data
 }
 const preview=await upload('/preview'),review=await upload('/review',preview),job=(await h.request(prefix+'/adopt',{method:'POST',body:{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true}})).data
 await h.db.prepare("CREATE TRIGGER synthetic_cradle_archive_settlement BEFORE DELETE ON channel_progress_attempts BEGIN SELECT RAISE(ABORT,'synthetic-cradle-archive-settlement'); END").run()
 try{await h.request(prefix+'/jobs/'+job.id+'/resume',{method:'POST',body:{},status:500})}
 finally{await h.db.prepare('DROP TRIGGER synthetic_cradle_archive_settlement').run()}
 const status=(await h.request(prefix+'/jobs/'+job.id)).data
 assert.equal(status.job.state,'applying','Archive source has a real incomplete native import')
 assert.ok(status.progress.appliedRecords>0&&status.progress.appliedRecords<status.progress.plannedRecords,'Archive source positively retains a bounded partial import')
 const event='base-import:'+job.id+':failed',attempt=await h.db.prepare('SELECT token,live_until FROM channel_progress_attempts WHERE event_id=?').bind(event).first()
 assert.ok(attempt?.token,'Archive source retains its actual import attempt')
 assert.ok(Date.parse(attempt.live_until)>Date.now(),'Archive creation exercises a live native import attempt')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE event_id=? AND subject_id=? AND starter_id=?').bind(event,job.id,h.operator).first()).n,1,'The live import positively has its own write-ahead progress debt')
 console.log('ARCHIVE_RECOVERY_SOURCE '+JSON.stringify({exportRecoveryFields:4,liveImportAttempts:1,owedImportOutcomes:1,appliedRecords:status.progress.appliedRecords,plannedRecords:status.progress.plannedRecords}))
 const applied=(await h.db.prepare('SELECT count(*) n FROM ik_provenance WHERE job_id=?').bind(job.id).first()).n
 return {id:job.id,applied}
}

/** Inspect the actual emitted archive, rather than invoking exportRow directly. */
export async function assertWarehouseArchive(path,fixture){
 const items=[]
 for await(const record of fileRecords(path))if(record.kind==='part')items.push(...record.items)
 const schedules=items.filter(item=>item.kind==='row'&&item.table==='warehouse_exports').map(item=>item.row),objects=items.filter(item=>item.kind==='row'&&item.table==='warehouse_objects').map(item=>item.row)
 assert.deepEqual(schedules.map(row=>row.id).sort(),fixture.configurations.map(row=>row.id).sort())
 for(const schedule of schedules)assertCleared(schedule)
 for(const table of ['channel_progress_attempts','channel_progress_owed'])assert.deepEqual(items.filter(item=>item.kind==='row'&&item.table===table),[],'Archive excludes live progress custody: '+table)
 const imported=items.find(item=>item.kind==='row'&&item.table==='ik_jobs'&&item.row.id===fixture.importing.id)?.row
 assert.ok(imported,'Archive retains the real incomplete import job as history')
 assert.deepEqual({hold:imported.cradle_restore_hold,token:imported.lease_token,expires:imported.lease_expires},{hold:1,token:null,expires:null},'Archive independently clears import execution authority')
 assert.deepEqual(objects.map(row=>row.object_key).sort(),[...fixture.completedKeys,...fixture.pending.map(row=>row.key)].sort(),'All completed and interrupted object custody remains portable')
 for(const object of objects){assert.equal(object.transfer_json,'{}','Archive clears every live upload session');assert.equal(object.sealed_json,null,'Archive clears every destination credential snapshot')}
 const serialized=JSON.stringify(items)
 for(const secret of [...Object.values(fixture.edge.access),...fixture.pending.map(row=>row.uploadId)])assert.ok(!serialized.includes(secret),'No source credential or live transfer identity enters the archive')
}
/** Runs inside the real installation after rer import and fresh native-owner
 * bootstrap. Cron and queue wake are public runtime doors, not policy calls. */
export async function restoredWarehouseArchive(runtime,db,request,fixture,readMail){
 const freshOwner=(await db.prepare('SELECT id FROM authority_principals WHERE initial_owner=1').first()).id
 const sourcePolicy=await db.prepare('SELECT rules_json FROM authority_policies WHERE id=?').bind(fixture.sourcePolicy.id).first()
 assert.equal(sourcePolicy.rules_json,fixture.sourcePolicy.rules_json,'Restore preserves the archived owner policy as history')
 const restoredPolicy=await db.prepare("SELECT p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id='00000000000000000000000700'").bind(freshOwner).first()
 const originalRules=JSON.parse(sourcePolicy.rules_json),freshRules=JSON.parse(restoredPolicy.rules_json)
 assert.equal(freshRules.length,originalRules.length)
 for(const original of originalRules){
  const fresh=freshRules.find(rule=>rule.id===original.id);assert.ok(fresh)
  if(['00000000000000000000001211','00000000000000000000001212'].includes(original.entityId)){
   assert.equal(original.rows.value,fixture.sourceOwnerId)
   assert.deepEqual(fresh.rows,{...original.rows,value:freshOwner},'The fresh owner receives only their own personal channel rows')
  }else assert.deepEqual(fresh.rows,original.rows,'Restore never rewrites business row predicates to the fresh owner')
 }
 const mailBefore=(await readMail()).length
 assert.equal((await db.prepare('SELECT active FROM channel_mail_authority').first()).active,0,'Restore leaves mail authority inactive')
 const {edge,configurations,at}=fixture,bucket=await runtime.getR2Bucket('WAREHOUSE'),beforeWrites=writeCount(edge),beforeKeys=(await bucket.list()).objects.map(row=>row.key).sort(),beforeAudits=(await db.prepare("SELECT count(*) n FROM operation_audit WHERE action='warehouse.export'").first()).n
 const restored=(await db.prepare('SELECT * FROM warehouse_exports ORDER BY id').all()).results
 assert.deepEqual(restored.map(row=>row.id).sort(),configurations.map(row=>row.id).sort())
 for(const schedule of restored)assertCleared(schedule)
 const importState=async()=>({job:await db.prepare('SELECT cradle_restore_hold,lease_token,lease_expires FROM ik_jobs WHERE id=?').bind(fixture.importing.id).first(),applied:(await db.prepare('SELECT count(*) n FROM ik_provenance WHERE job_id=?').bind(fixture.importing.id).first()).n})
 const retainedImport=await importState()
 assert.deepEqual(retainedImport.job,{cradle_restore_hold:1,lease_token:null,lease_expires:null},'Restored import requires current owner authority and has no old execution lease')
 assert.equal(retainedImport.applied,fixture.importing.applied,'Restore retains the actual partially applied import without continuing it')
 for(const table of ['channel_progress_attempts','channel_progress_owed'])assert.equal((await db.prepare('SELECT count(*) n FROM '+table).first()).n,0,'Restore contains no old progress custody: '+table)
 const objects=(await db.prepare('SELECT * FROM warehouse_objects').all()).results
 assert.ok(objects.length>fixture.pending.length,'Restore retains completed and interrupted destination custody')
 for(const object of objects){assert.equal(object.transfer_json,'{}');assert.equal(object.sealed_json,null)}
 const list=await request('/api/v1/warehouse-exports')
 for(const input of configurations){const schedule=list.exports.find(row=>row.id===input.id);assert.ok(schedule);assert.equal(schedule.state,'paused');assert.equal(schedule.credentialsConfigured,false)}
 const worker=await runtime.getWorker()
 assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:at+7200000})).outcome,'ok')
 assert.equal((await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.warehouse.wake.v1'}}])).outcome,'ok')
 assert.deepEqual(await importState(),retainedImport,'Scheduled and queue wake never resume the restored import')
 for(const table of ['channel_progress_attempts','channel_progress_owed'])assert.equal((await db.prepare('SELECT count(*) n FROM '+table).first()).n,0,'Runtime wake never revives old progress custody: '+table)
 assert.equal((await db.prepare("SELECT count(*) n FROM notifications WHERE kind='progress' AND subject_id=?").bind(fixture.importing.id).first()).n,0,'Runtime wake never publishes an old import outcome')
 assert.equal((await readMail()).length,mailBefore,'Restoration and runtime wake send no old progress mail')
 console.log('ARCHIVE_RECOVERY_RESTORED '+JSON.stringify({exportClaims:0,recoveryCounters:0,importAttempts:0,owedOutcomes:0,importRestoreHold:retainedImport.job.cradle_restore_hold,newProviderMail:0}))
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
 assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:at+10800000})).outcome,'ok','Reauthorized export completion publishes in-app progress independently of inactive mail authority')
 assert.equal((await db.prepare('SELECT active FROM channel_mail_authority').first()).active,0,'Export completion never reactivates mail authority')
 assert.equal((await readMail()).length,mailBefore,'Reauthorized export sends no provider-edge mail after restore')
 assert.ok(writeCount(edge)>beforeWrites,'Freshly authorized remote export sends a new transfer')
 for(const input of configurations){const schedule=await db.prepare('SELECT running_id,watermark_json FROM warehouse_exports WHERE id=?').bind(input.id).first();assert.equal(schedule.running_id,null);assert.notEqual(schedule.watermark_json,'{}','Each freshly authorized schedule completes its own new export')}
}

/** A real provider refusal must still publish the default failed-export notice
 * to the fresh starter after actual restore. Repeating it exercises admission
 * replay with inactive mail authority, while preserving the provider failure. */
export async function restoredWarehouseFailure(runtime,db,request,fixture,readMail){
 const {edge,at}=fixture,remote=fixture.configurations.find(input=>input.destination.kind==='s3')
 const current=(await request('/api/v1/warehouse-exports')).exports.find(row=>row.id===remote.id)
 await request('/api/v1/commands/warehouse.save',{commandId:createUlid(),expected:[],input:{...remote,mode:'full',version:current.version}})
 const owner=(await db.prepare('SELECT owner_id FROM warehouse_exports WHERE id=?').bind(remote.id).first()).owner_id
 const starter=(await db.prepare('SELECT human_id FROM authority_principals WHERE id=?').bind(owner).first()).human_id
 assert.equal((await request('/api/v1/preferences')).progressEnabled,false,'Restored starter has not opted into successful completion notices')
 const settings=await request('/api/v1/settings')
 await request('/api/v1/commands/settings.update',{commandId:createUlid(),expected:[],input:{version:settings.version,changes:{timezone:'UTC',quietHoursStart:new Date(Date.now()+10800000).toISOString().slice(11,16),quietHoursEnd:new Date(Date.now()+14400000).toISOString().slice(11,16)}}})
 const before=(await readMail()).length,worker=await runtime.getWorker(),tick=()=>worker.scheduled({cron:'* * * * *',scheduledTime:at+14400000})
 const notices=async()=>(await db.prepare("SELECT n.id,n.operator_id,n.title,n.version FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.subject_id=? AND c.subject_type='warehouse-export' AND c.event_kind='progress' ORDER BY n.id").bind(remote.id).all()).results
 edge.refusePut(true)
 try{
  assert.equal((await tick()).outcome,'exception','A provider-refused export remains an actual failed scheduled invocation')
  const failed=await notices()
  assert.equal(failed.length,1,'An owed failed-export in-app notice survives inactive mail authority')
  assert.equal(failed[0].operator_id,starter,'Only the retained fresh starter receives the failed-export notice')
  assert.equal(failed[0].title,'Export needs attention')
  const inbox=await request('/api/v1/notifications')
  assert.ok(inbox.items.some(notice=>notice.id===failed[0].id),'The fresh starter reads the owed notice through the public inbox')
  assert.equal((await tick()).outcome,'exception','Repeated provider failure is not swallowed by notification replay')
  assert.deepEqual(await notices(),failed,'Replaying the same failed-export event never duplicates or updates its notice')
  assert.equal((await db.prepare('SELECT active FROM channel_mail_authority').first()).active,0)
  const pendingBefore=(await db.prepare('SELECT id,state,attempts,group_id FROM channel_deliveries WHERE notification_id=?').bind(failed[0].id).all()).results
  assert.equal(pendingBefore.length,1);assert.equal(pendingBefore[0].state,'queued','The restored failed notice positively owes immediately due email')
  const wakeId=createUlid(),wake=await worker.queue('cradle-work',[{id:wakeId,timestamp:Date.now(),attempts:1,body:{kind:'cradle.channels.wake.v1'}}])
  assert.deepEqual(wake.retryMessages,[{msgId:wakeId,delaySeconds:30}],'Inactive mail authority refuses dispatch and the actual queue requests its bounded retry')
  assert.deepEqual(wake.explicitAcks,[],'The refused mail wake is never acknowledged')
  assert.deepEqual((await db.prepare('SELECT id,state,attempts,group_id FROM channel_deliveries WHERE notification_id=?').bind(failed[0].id).all()).results,pendingBefore,'Mail refusal preserves pending custody without a dispatch claim')
  assert.equal((await readMail()).length,before,'No provider-edge mail is sent for the restored failed export')
  console.log('RESTORED_NOTIFICATION '+JSON.stringify({mailActive:0,failedNotices:failed.length,repeatedNotices:(await notices()).length,newProviderMail:0}))
 }finally{edge.refusePut(false)}
}
