import type {AdmissionPort,SqlMutation} from '../../admission/ports'
import type {RequestContext,AuthorityPermit} from '../../authority/ports'
import type {DescriptorRegistry} from '../descriptors.server'
import {purgeExpiredSchema} from './schema-purge.server'
import {trashTable,type TrashRow} from './storage.server'
import {trustedPredicate,identifier} from '../../admission/sql.server'
import {canonicalHash} from '../../admission/canonical'
import {createUlid} from '../../../core/shared/ids'
/** Only the scheduled seam supplies this service's clock. Purge never invents
 * authority for an active record: the original tombstone and version fence it. */
export function recordTrashPurge(db:D1Database,descriptors:DescriptorRegistry,admission:AdmissionPort,clock=()=>new Date()){
 return async()=>{
  const now=clock().getTime(),hour=Math.floor(now/3600000)
  const claimed=await db.prepare("INSERT INTO record_trash_maintenance(id,last_hour) VALUES('records',?) ON CONFLICT(id) DO UPDATE SET last_hour=excluded.last_hour WHERE last_hour<excluded.last_hour RETURNING id").bind(hour).first()
  if(!claimed)return
  await purgeExpiredSchema(db,admission,now)
  const rows=await db.prepare("SELECT * FROM record_trash WHERE kind='record' AND expires_at<=? ORDER BY expires_at,app_id,entity_id,record_id LIMIT 100").bind(now).all<TrashRow>()
  for(const row of rows.results){
   const group=(await db.prepare('SELECT count(*) n FROM record_trash WHERE group_id=?').bind(row.group_id).first<{n:number}>())!.n
   if(group>1){await db.prepare("UPDATE record_trash SET purge_state='blocked_dependency_group' WHERE group_id=?").bind(row.group_id).run();continue}
   const d=descriptors.get(row.app_id,row.entity_id)
   // Files and source custody need their full erasure machinery, never a row-only purge.
   const attached=await db.prepare('SELECT 1 FROM evidence_files WHERE app_id=? AND entity_id=? AND record_id=? UNION ALL SELECT 1 FROM evidence_sources WHERE app_id=? AND entity_id=? AND record_id=? LIMIT 1').bind(row.app_id,row.entity_id,row.record_id,row.app_id,row.entity_id,row.record_id).first()
   if(attached){await db.prepare("UPDATE record_trash SET purge_state='blocked_source_custody' WHERE app_id=? AND entity_id=? AND record_id=?").bind(row.app_id,row.entity_id,row.record_id).run();continue}
   const ctx:RequestContext={principal:{id:'00000000000000000000000946',kind:'system',humanId:null,sessionId:null,credentialId:null,authenticationEpoch:1,issuedAt:new Date(now).toISOString(),expiresAt:new Date(Math.max(now,Date.now())+60000).toISOString()},requestId:createUlid(),now:new Date(now).toISOString(),ingress:'schedule'}
   const guard=trustedPredicate(`EXISTS(SELECT 1 FROM record_trash t JOIN ${identifier(d.table.tableId)} r ON r.${identifier(d.idColumn)}=t.record_id WHERE t.app_id=? AND t.entity_id=? AND t.record_id=? AND t.expires_at<=? AND t.record_version=? AND r.${identifier(d.versionColumn)}=t.record_version AND r.${identifier(d.lifecycleColumn)}='deleted')`,[row.app_id,row.entity_id,row.record_id,now,row.record_version])
   const action='record.trash.purge',permit:AuthorityPermit={actor:{id:ctx.principal.id,kind:'system'},action,appId:row.app_id,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]}
   const mutations:SqlMutation[]=[{kind:'delete',table:d.table,where:trustedPredicate(`${identifier(d.idColumn)}=? AND ${identifier(d.versionColumn)}=?`,[row.record_id,row.record_version]),expectedRows:1},{kind:'delete',table:trashTable,where:trustedPredicate('app_id=? AND entity_id=? AND record_id=?',[row.app_id,row.entity_id,row.record_id]),expectedRows:1}]
   try{await admission.commit(ctx,{commandId:createUlid(),action,appId:row.app_id,canonicalInputHash:await canonicalHash(row),permit,guards:[],mutations,audit:[{action,subject:{appId:row.app_id,entityId:row.entity_id,recordId:row.record_id},changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{purged:true}})}catch(error){await db.prepare("UPDATE record_trash SET purge_state='purge_failed' WHERE app_id=? AND entity_id=? AND record_id=?").bind(row.app_id,row.entity_id,row.record_id).run();throw error}
  }
 }
}
