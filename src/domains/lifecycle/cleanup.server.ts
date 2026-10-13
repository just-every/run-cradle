import {AuthorityError} from '../authority/errors'
import type {RequestContext,PolicyPort} from '../authority/ports'
import {registerTable} from '../admission/sql.server'
import type {Effects} from './changes.server'
import {finishMemberErasure} from './finish-member-erasure.server'
const receipts=registerTable('lifecycle_erasures',['id','app_id','subject_kind','subject_id','anonymous_label','state','requested_at','completed_at'])
const blobs=registerTable('lifecycle_erasure_blobs',['erasure_id','object_key','deleted_at'])
export function retainCleanup(change:Effects,input:{id:string;appId:string;kind:string;subjectId:string;label:string;now:string;keys:string[]}){
 change.mutations.push({kind:'insert',table:receipts,row:{id:input.id,app_id:input.appId,subject_kind:input.kind,subject_id:input.subjectId,anonymous_label:input.label,state:'pending',requested_at:input.now,completed_at:null}})
 for(const key of new Set(input.keys))change.mutations.push({kind:'insert',table:blobs,row:{erasure_id:input.id,object_key:key,deleted_at:null}})
}
export function createLifecycleCleanup(db:D1Database,bucket:R2Bucket){
 async function advance(id:string){
  const job=await db.prepare('SELECT state,subject_kind FROM lifecycle_erasures WHERE id=?').bind(id).first<{state:string;subject_kind:string}>()
  if(!job)throw new AuthorityError('not_found','Erasure receipt not found.',404)
  if(job.state==='complete')return {id,state:'complete' as const}
  const rows=(await db.prepare('SELECT object_key FROM lifecycle_erasure_blobs WHERE erasure_id=? AND deleted_at IS NULL ORDER BY object_key LIMIT 100').bind(id).all<{object_key:string}>()).results
  for(const row of rows){await bucket.delete(row.object_key);if(await bucket.head(row.object_key))throw new Error('Erasure blob deletion is not confirmed');await db.prepare('UPDATE lifecycle_erasure_blobs SET deleted_at=? WHERE erasure_id=? AND object_key=?').bind(new Date().toISOString(),id,row.object_key).run()}
  if(await db.prepare('SELECT 1 FROM lifecycle_erasure_blobs WHERE erasure_id=? AND deleted_at IS NULL LIMIT 1').bind(id).first())return {id,state:'pending' as const}
  if(job.subject_kind==='member')await finishMemberErasure(db,id)
  else{
  await db.prepare("UPDATE lifecycle_erasures SET state='complete',completed_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM lifecycle_erasure_blobs WHERE erasure_id=? AND deleted_at IS NULL)").bind(new Date().toISOString(),id,id).run()
  await db.prepare("DELETE FROM lifecycle_erasure_blobs WHERE erasure_id=? AND EXISTS(SELECT 1 FROM lifecycle_erasures WHERE id=? AND state='complete')").bind(id,id).run()
  }
  const current=await db.prepare('SELECT state FROM lifecycle_erasures WHERE id=?').bind(id).first<{state:'pending'|'complete'}>()
  return {id,state:current!.state}
 }
 return {advance,async maintain(){for(const job of (await db.prepare("SELECT id FROM lifecycle_erasures WHERE state='pending' ORDER BY requested_at LIMIT 20").all<{id:string}>()).results)await advance(job.id)},async status(ctx:RequestContext,policy:PolicyPort,id:string){const row=await db.prepare('SELECT app_id,subject_kind,state,requested_at,completed_at,anonymous_label FROM lifecycle_erasures WHERE id=?').bind(id).first<{app_id:string;subject_kind:string;state:string;requested_at:string;completed_at:string|null;anonymous_label:string}>();if(!row)throw new AuthorityError('not_found','Erasure receipt not found.',404);await policy.authorize(ctx,{appId:row.app_id,action:row.subject_kind==='member'?'member.erase':'launch.campaign.delete',expected:[],cost:[],inputHash:''});return row}}
}
