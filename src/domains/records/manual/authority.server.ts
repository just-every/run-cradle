import type { AuthorityPermit, PolicyPort, RequestContext } from '../../authority/ports'
import { principalGuards } from '../../authority/guards.server'
import { AdmissionError } from '../../admission/errors'
import { and, trustedPredicate, registerTable } from '../../admission/sql.server'
import type { EntitySchema } from '../contracts'
import { RECORD_SCHEMA_ENTITY_ID, RECORD_VIEW_ENTITY_ID, RECORD_FORM_ENTITY_ID } from '../contracts'
import { stagingPolicyRules } from '../../evidence/staging.server'
import { createUlid } from '../../../core/shared/ids'
import type { Policy } from '../../authority/contracts'
export const bases = registerTable('manual_record_bases', ['id','owner_id','name','version','release_id','created_at','updated_at'])
export const policies = registerTable('authority_policies',['id','app_id','name','rules_json','version','created_at','updated_at'])
export const memberships = registerTable('authority_memberships',['principal_id','app_id','policy_id','legacy','state','version'])
export const manualOwnerGuards=(ctx:RequestContext)=>[...principalGuards(ctx),trustedPredicate("EXISTS(SELECT 1 FROM authority_principals p JOIN operators o ON o.id=p.human_id WHERE p.id=? AND p.initial_owner=1 AND o.active=1)",[ctx.principal.id])]
export const manualBaseOwnerGuard=(ctx:RequestContext,appId:string)=>trustedPredicate('EXISTS(SELECT 1 FROM manual_record_bases WHERE id=? AND owner_id=?)',[appId,ctx.principal.id])
export async function manualAuthority(db:D1Database, policy:PolicyPort, ctx:RequestContext, appId:string, inputHash:string):Promise<AuthorityPermit> {
 if(ctx.principal.kind!=='human'||!ctx.principal.sessionId)throw new AdmissionError('forbidden','A current owner session is required to change a base.')
 const owner=manualOwnerGuards(ctx)
 const base=await db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first<{owner_id:string}>()
 let permit:AuthorityPermit
 if(base){
  if(base.owner_id!==ctx.principal.id)throw new AdmissionError('forbidden','Only this base owner can change its schema.')
  permit=await policy.authorize(ctx,{appId,action:'release.adopt',expected:[],cost:[],inputHash})
  owner.push(manualBaseOwnerGuard(ctx,appId))
 }else{
  owner.push(trustedPredicate('NOT EXISTS(SELECT 1 FROM record_schemas WHERE app_id=?) AND NOT EXISTS(SELECT 1 FROM authority_memberships WHERE app_id=?)',[appId,appId]))
  permit={actor:{id:ctx.principal.id,kind:'human'},action:'release.adopt',appId,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards:[],reservationMutations:[],reservationIds:[]}
 }
 const check=and(...owner)
 if(!await db.prepare(`SELECT 1 WHERE ${check.sql}`).bind(...check.values).first())throw new AdmissionError('forbidden','Current installation owner authority is required.')
 return {...permit,guards:[...permit.guards,...owner]}
}
export function ownerRules(ownerId:string,schemas:EntitySchema[]):Policy['rules'] {
 const base={principals:[{id:ownerId,kind:'human' as const}],rows:{kind:'all' as const,conditions:[]},effect:'allow' as const,purposes:['read' as const,'export' as const]}
 const actions=['record.create','record.patch','record.delete','record.bulk-preview','record.bulk-commit','record.undo','view.preview','import.preview','import.commit','form.submit']
 return [...schemas.map(s=>({...base,id:createUlid(),entityId:s.id,readableFields:s.fields.map(f=>f.id),writableFields:s.fields.filter(f=>f.type!=='computed').map(f=>f.id),actions})),...[RECORD_SCHEMA_ENTITY_ID,RECORD_VIEW_ENTITY_ID,RECORD_FORM_ENTITY_ID].map(entityId=>({...base,id:createUlid(),entityId,readableFields:[],writableFields:[],actions:['release.adopt','view.save','view.delete','view.restore','form.save']})),...stagingPolicyRules(ownerId,createUlid(),createUlid())]
}
