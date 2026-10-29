import type {AdmissionPort} from '../../admission/ports'
import type {RequestContext,AuthorityPermit} from '../../authority/ports'
import {canonicalHash} from '../../admission/canonical'
import {trustedPredicate} from '../../admission/sql.server'
import {createUlid} from '../../../core/shared/ids'
import {interfaces,interfaceVersions} from './storage.server'

/** Expired interface layouts and their retained versions are disposed together. */
export function interfaceTrashPurge(db:D1Database,admission:AdmissionPort,clock=()=>new Date()){
 return async()=>{
  const now=clock().getTime(),claimed=await db.prepare("INSERT INTO record_trash_maintenance(id,last_hour) VALUES('interfaces',?) ON CONFLICT(id) DO UPDATE SET last_hour=excluded.last_hour WHERE last_hour<excluded.last_hour RETURNING id").bind(Math.floor(now/3600000)).first();if(!claimed)return
  const rows=await db.prepare('SELECT id,app_id,version FROM record_interfaces WHERE deleted_at IS NOT NULL AND expires_at<=? ORDER BY expires_at,id LIMIT 100').bind(now).all<{id:string;app_id:string;version:number}>()
  for(const row of rows.results){
   const at=new Date(now).toISOString(),ctx:RequestContext={principal:{id:'00000000000000000000000947',kind:'system',humanId:null,sessionId:null,credentialId:null,authenticationEpoch:1,issuedAt:at,expiresAt:new Date(Math.max(now,Date.now())+60000).toISOString()},requestId:createUlid(),now:at,ingress:'schedule'},action='interface.trash.purge'
   const versions=await db.prepare('SELECT COUNT(*) n FROM record_interface_versions WHERE interface_id=?').bind(row.id).first<{n:number}>(),guard=trustedPredicate('EXISTS(SELECT 1 FROM record_interfaces WHERE id=? AND version=? AND deleted_at IS NOT NULL AND expires_at<=?)',[row.id,row.version,now])
   const permit:AuthorityPermit={actor:{id:ctx.principal.id,kind:'system'},action,appId:row.app_id,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]}
   await admission.commit(ctx,{commandId:createUlid(),action,appId:row.app_id,canonicalInputHash:await canonicalHash({...row}),permit,guards:[],mutations:[{kind:'delete',table:interfaceVersions,where:trustedPredicate('interface_id=?',[row.id]),expectedRows:versions!.n},{kind:'delete',table:interfaces,where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1}],audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[row.id]}],events:[],outbox:[],committedResult:{purged:true}})
  }
 }
}
