import type {RequestContext} from '../authority/ports'
import type {ServerFoundation} from '../../core/app/foundation.server'
import type {createRecordServices} from '../records/service.server'
import type {createRecordsCsv} from '../records/csv.server'
import type {ExportRow} from './configuration.server'
import {createUlid} from '../../core/shared/ids'
import {canonicalHash} from '../admission/canonical'
import {identifier,trustedPredicate} from '../admission/sql.server'
import {assertGuards} from '../records/fence.server'
import {encodeCsv} from '../portability/csv'
import {dueSchedule} from '../../apps/launch/schedule'
import {reserveFileWrite,finishFileWrite} from '../lifecycle/file-writes.server'
import {AuthorityError} from '../authority/errors'

type Mark={version:number;updatedAt:string;hash:string}
type Watermark=Record<string,{schemaHash:string;rows:Record<string,Mark>;at:string}>
/** Every table and object is read under current owner policy. Custody is durable before R2. */
export function warehouseRuntime(db:D1Database,bucket:R2Bucket,foundation:ServerFoundation,services:ReturnType<typeof createRecordServices>,csv:ReturnType<typeof createRecordsCsv>,clock=()=>new Date()){
 async function owner(id:string){return db.prepare(`SELECT p.id,p.human_id,p.authentication_epoch,o.version FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.state='active' AND p.kind='human' AND o.role='owner' AND o.status='active'`).bind(id).first<{id:string;human_id:string;authentication_epoch:number;version:number}>()}
 async function pause(row:ExportRow){
  const now=Date.now(),message='A scheduled bucket export paused because its configuring owner no longer has ownership. A current owner can review and save the schedule.'
  const recipients=(await db.prepare(`SELECT p.id,p.human_id,o.id AS base_id,o.version FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.state='active' AND p.kind='human' AND o.role='owner' AND o.status='active'`).all<{id:string;human_id:string;base_id:string;version:number}>()).results
  const eventId=row.id+':paused:'+row.version
  await db.batch([
   db.prepare("UPDATE warehouse_exports SET state='paused',version=version+1 WHERE id=? AND version=? AND state='active'").bind(row.id,row.version),
   ...recipients.flatMap(recipient=>{const id=createUlid(now);return [
    db.prepare(`INSERT INTO notifications(id,created_at,updated_at,version,operator_id,kind,subject_id,title,body,unavailable)
     SELECT ?,?,?,1,?,'warehouse-paused',NULL,'Bucket export paused',?,0
     WHERE EXISTS(SELECT 1 FROM warehouse_exports WHERE id=? AND state='paused' AND version=?)
      AND EXISTS(SELECT 1 FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.state='active' AND o.id=? AND o.role='owner' AND o.status='active' AND o.version=?)
      AND NOT EXISTS(SELECT 1 FROM channel_events WHERE event_id=? AND operator_id=?)`).bind(id,now,now,recipient.human_id,message,row.id,row.version+1,recipient.id,recipient.base_id,recipient.version,eventId,recipient.human_id),
    db.prepare('INSERT OR IGNORE INTO channel_events(event_id,operator_id,notification_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM notifications WHERE id=?)').bind(eventId,recipient.human_id,id,id),
   ]}),
  ])
 }
 async function run(row:ExportRow,slot:string){
  const actor=await owner(row.owner_id);if(!actor){await pause(row);return}
  const runId=createUlid(),startedAt=new Date().toISOString(),credential=createUlid(),expiresAt=new Date(Date.now()+300000).toISOString()
  const acquired=await db.prepare("UPDATE warehouse_exports SET running_id=? WHERE id=? AND version=? AND state='active' AND running_id IS NULL AND (last_slot IS NULL OR last_slot<>?) RETURNING id").bind(runId,row.id,row.version,slot).first<{id:string}>()
  if(!acquired)return
  let reservation:string|undefined,committed=false
  const keys:string[]=[]
  try{
   reservation=await reserveFileWrite(db,'warehouse:'+row.id,startedAt)
   const bases=JSON.parse(row.bases_json) as string[]
   // A fresh, unguessable, non-disclosed credential lasts only for this invocation.
   // It authenticates as the configuring human; it grants no policy permission.
   await db.prepare('INSERT INTO authority_credentials(id,principal_id,token_hash,audience,scopes_json,created_at,expires_at,authentication_epoch) VALUES(?,?,?,?,?,?,?,?)').bind(credential,actor.id,await canonicalHash({nonce:crypto.randomUUID()}),'warehouse-internal',JSON.stringify(bases.map(appId=>({appId,actions:['record.read'],purposes:['read','export']}))),Date.now(),Date.parse(expiresAt),actor.authentication_epoch).run()
   const ctx:RequestContext={requestId:runId,now:startedAt,ingress:'schedule',principal:{id:actor.id,kind:'human',humanId:actor.human_id,sessionId:null,credentialId:credential,issuedAt:startedAt,expiresAt,authenticationEpoch:actor.authentication_epoch}}
   const ownership=trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.state='active' AND p.authentication_epoch=? AND o.status='active' AND o.role='owner' AND o.version=?)`,[actor.id,actor.authentication_epoch,actor.version])
   const guards=[ownership],before=JSON.parse(row.watermark_json) as Watermark,after:Watermark={},files:{key:string;rows:number;schemaHash:string;watermarkBefore:unknown;watermarkAfter:unknown}[]=[],omitted:{appId:string;tableId:string;reason:string}[]=[],revision=await services.reader.revision()
   const at=clock().toISOString(),full=row.mode==='full'||Object.keys(before).length===0
   async function put(key:string,body:string){
    await db.prepare('INSERT INTO warehouse_objects(object_key,export_id,run_id,created_at) VALUES(?,?,?,?)').bind(key,row.id,runId,startedAt).run();keys.push(key)
    await assertGuards(db,guards)
    await bucket.put(key,body,{httpMetadata:{contentType:key.endsWith('.csv')?'text/csv; charset=utf-8':'application/json'}})
    const read=await bucket.get(key);if(!read||await read.text()!==body)throw new Error('Bucket export readback differs; watermark unchanged.')
    await assertGuards(db,guards)
   }
   for(const appId of bases){
    const tables=foundation.descriptors.list(appId).filter(d=>d.schema.physicalRevision==='launch-retained-v1'||d.schema.physicalRevision.startsWith('manual_'))
    if(!tables.length)throw new Error('Chosen base no longer has adopted tables.')
    for(const d of tables){
     let scope:Awaited<ReturnType<typeof foundation.policy.scope>>
     try{scope=await foundation.policy.scope(ctx,{appId,entityId:d.schema.id,purpose:'export'})}catch(error){if(error instanceof AuthorityError&&error.code==='forbidden'){omitted.push({appId,tableId:d.schema.id,reason:'export_not_permitted'});continue;}throw error}
     guards.push(...scope.currentAuthorityGuards)
     const fields=d.schema.fields.filter(f=>scope.readableFieldIds.includes(f.id)).map(f=>f.id)
     if(!fields.length){omitted.push({appId,tableId:d.schema.id,reason:'no_readable_fields'});continue}
     const snapshot:{rows:import('../records/contracts').RecordRow[];headers?:string[];values?:string[][]}={rows:[]}
     await csv.exportCsv(ctx,{appId,entityId:d.schema.id,query:{fields,includeArchived:true}},snapshot)
     if(!snapshot.headers||!snapshot.values)throw new Error('CSV export did not return its verified capture.')
     const parsed={headers:snapshot.headers,rows:snapshot.values}
     if(parsed.headers.includes('_record_id')||parsed.headers.includes('_operation'))throw new Error('Export field labels conflict with reserved _record_id or _operation metadata.')
     const schemaHash=await canonicalHash(d.schema.fields.filter(f=>fields.includes(f.id))),tableId=appId+'/'+d.schema.id,prior=before[tableId],rows:Record<string,Mark>={},changed:string[][]=[]
     for(let i=0;i<snapshot.rows.length;i++){
      const record=snapshot.rows[i]!,values=parsed.rows[i]!,hash=await canonicalHash(values)
      rows[record.id]={version:record.version,updatedAt:record.updatedAt,hash}
      const old=prior?.rows[record.id]
      if(full||!old||old.version!==record.version||old.updatedAt!==record.updatedAt||old.hash!==hash||prior?.schemaHash!==schemaHash)changed.push([record.id,'upsert',...values])
     }
     for(const id of Object.keys(prior?.rows??{}))if(!rows[id]){
      // A policy-hidden row is not a deletion. Never disclose its current values.
      const exists=await db.prepare(`SELECT 1 FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)}=?`).bind(id).first()
      if(!exists&&!full)changed.push([id,'delete',...fields.map(()=>'')])
     }
     after[tableId]={schemaHash,rows,at}
     if(full||changed.length){const key=`${row.id}/${appId}/${d.schema.id}/${at}-${full?'full':'incr'}.csv`;await put(key,encodeCsv(['_record_id','_operation',...parsed.headers],changed));files.push({key,rows:changed.length,schemaHash,watermarkBefore:prior?{at:prior.at,digest:await canonicalHash(prior)}:null,watermarkAfter:{at,digest:await canonicalHash(after[tableId])}})}
    }
   }
   if(await services.reader.revision()!==revision)throw new Error('Records changed during bucket export; watermark unchanged.')
   await put(`${row.id}/${at}-manifest.json`,JSON.stringify({exportId:row.id,runId,at,mode:full?'full':'incremental',files,omitted,watermarkBefore:{at:row.updated_at,digest:await canonicalHash(before)},watermarkAfter:{at,digest:await canonicalHash(after)}}))
   await assertGuards(db,guards)
   if(await services.reader.revision()!==revision)throw new Error('Records changed before bucket export commit.')
   const nonce=createUlid(),unique=[...new Map(guards.map(guard=>[JSON.stringify(guard),guard])).values()]
   unique.push(trustedPredicate("EXISTS(SELECT 1 FROM warehouse_exports WHERE id=? AND running_id=? AND version=? AND state='active')",[row.id,runId,row.version]))
   unique.push(trustedPredicate("(SELECT COALESCE(MAX(rowid),0) FROM command_admissions WHERE state='committed')=?",[revision]))
   await db.batch([
    ...unique.map((guard,index)=>db.prepare(`INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,?,CASE WHEN (${guard.sql}) THEN 1 ELSE 0 END`).bind(nonce,index,...guard.values)),
    db.prepare("UPDATE warehouse_exports SET watermark_json=?,last_slot=?,running_id=NULL,updated_at=? WHERE id=? AND running_id=?").bind(JSON.stringify(after),slot,startedAt,row.id,runId),
    db.prepare('DELETE FROM admission_assertions WHERE nonce=?').bind(nonce),
   ])
   committed=true
  }finally{
   if(!committed)for(const key of keys){await bucket.delete(key);if(await bucket.head(key))throw new Error('Failed bucket export cleanup is unconfirmed.');await db.prepare('DELETE FROM warehouse_objects WHERE object_key=?').bind(key).run()}
   await db.prepare('DELETE FROM authority_credentials WHERE id=?').bind(credential).run()
   if(reservation)await finishFileWrite(db,reservation)
   await db.prepare('UPDATE warehouse_exports SET running_id=NULL WHERE id=? AND running_id=?').bind(row.id,runId).run()
  }
 }
 return {async scheduled(){
  const rows=await db.prepare("SELECT * FROM warehouse_exports WHERE state='active' ORDER BY id").all<ExportRow>()
  for(const row of rows.results){if(!await owner(row.owner_id)){await pause(row);continue}const slot=dueSchedule(clock().getTime(),row.timezone,row.local_rule);if(slot&&slot!==row.last_slot){try{await run(row,slot)}catch(error){if(!await owner(row.owner_id)){await pause(row);continue}throw error}}}
 }}
}
