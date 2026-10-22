import type {AdmissionPort} from '../../admission/ports'
import type {RequestContext,AuthorityPermit} from '../../authority/ports'
import {viewTable,formTable} from '../metadata.server'
import {RECORD_VIEW_ENTITY_ID,RECORD_FORM_ENTITY_ID} from '../contracts'
import {trustedPredicate} from '../../admission/sql.server'
import {canonicalHash} from '../../admission/canonical'
import {createUlid} from '../../../core/shared/ids'
export function metadataTrashPurge(db:D1Database,admission:AdmissionPort,clock=()=>new Date()){
 return async()=>{
  const now=clock().getTime(),claimed=await db.prepare("INSERT INTO record_trash_maintenance(id,last_hour) VALUES('metadata',?) ON CONFLICT(id) DO UPDATE SET last_hour=excluded.last_hour WHERE last_hour<excluded.last_hour RETURNING id").bind(Math.floor(now/3600000)).first();if(!claimed)return
  for(const [table,entityId,kind] of [[viewTable,RECORD_VIEW_ENTITY_ID,'view'],[formTable,RECORD_FORM_ENTITY_ID,'form']] as const){
   const rows=await db.prepare(`SELECT id,app_id,version FROM ${table.tableId} WHERE deleted_at IS NOT NULL AND expires_at<=? ORDER BY expires_at,id LIMIT 100`).bind(now).all<{id:string;app_id:string;version:number}>()
   for(const row of rows.results){const at=new Date(now).toISOString(),ctx:RequestContext={principal:{id:'00000000000000000000000947',kind:'system',humanId:null,sessionId:null,credentialId:null,authenticationEpoch:1,issuedAt:at,expiresAt:new Date(Math.max(now,Date.now())+60000).toISOString()},requestId:createUlid(),now:at,ingress:'schedule'},action=kind+'.trash.purge',guard=trustedPredicate(`EXISTS(SELECT 1 FROM ${table.tableId} WHERE id=? AND version=? AND deleted_at IS NOT NULL AND expires_at<=?)`,[row.id,row.version,now]),permit:AuthorityPermit={actor:{id:ctx.principal.id,kind:'system'},action,appId:row.app_id,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]}
    try{await admission.commit(ctx,{commandId:createUlid(),action,appId:row.app_id,canonicalInputHash:await canonicalHash(row),permit,guards:[],mutations:[{kind:'delete',table,where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1}],audit:[{action,subject:{appId:row.app_id,entityId,recordId:row.id},changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{purged:true}})}catch(error){await db.prepare(`UPDATE ${table.tableId} SET purge_state='purge_failed' WHERE id=?`).bind(row.id).run();throw error}
   }
  }
 }
}
