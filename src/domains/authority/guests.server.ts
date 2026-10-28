import { z } from 'zod'
import { createUlid } from '../../core/shared/ids'
import { canonical, canonicalHash } from '../admission/canonical'
import { and, registerTable, trustedPredicate } from '../admission/sql.server'
import { principalGuards } from './guards.server'
import { AuthorityError } from './errors'
import { idSchema } from './validators'
import type { AdmissionPort } from '../admission/ports'
import type { RequestContext, PolicyPort } from './ports'
import type { DescriptorRegistry } from '../records/descriptors.server'

export const guestInvitation = z.object({commandId:idSchema,appId:idSchema,name:z.string().trim().min(1).max(120),email:z.email().max(254)}).strict()
const guests=registerTable('authority_guests',['principal_id','app_id','invitation_delivered','created_at'])
const operators=registerTable('operators',['id','name','email','active','created_at','updated_at','version'])
const principals=registerTable('authority_principals',['id','kind','human_id','state','authentication_epoch','initial_owner','created_at','updated_at','version'])
const native=registerTable('oa_operators',['id','email','display_name','role','status','version','created_at'])
const policies=registerTable('authority_policies',['id','app_id','name','rules_json','version','created_at','updated_at'])
const memberships=registerTable('authority_memberships',['principal_id','app_id','policy_id','legacy','state','version'])

export async function guestScope(db:D1Database,principalId:string){
 return db.prepare('SELECT app_id AS appId FROM authority_guests WHERE principal_id=?').bind(principalId).first<{appId:string}>()
}
export async function guestOwnerGuards(db:D1Database,ctx:RequestContext){
 if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||!ctx.principal.baseSessionId||ctx.principal.credentialId)throw new AuthorityError('forbidden','A current owner session is required.')
 const guards=[...principalGuards(ctx),trustedPredicate("EXISTS(SELECT 1 FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.initial_owner=1 AND p.state='active' AND o.status='active' AND o.role='owner')",[ctx.principal.id])]
 const check=and(...guards)
 if(!await db.prepare(`SELECT 1 WHERE ${check.sql}`).bind(...check.values).first())throw new AuthorityError('forbidden','Only the installation owner can invite guests.')
 return guards
}
export function createGuestInvitations(db:D1Database,policy:PolicyPort,admission:AdmissionPort,descriptors:DescriptorRegistry){
 return async(ctx:RequestContext,value:unknown)=>{
  const input=guestInvitation.parse(value),owner=await guestOwnerGuards(db,ctx),hash=await canonicalHash(input)
  const replay=await admission.replay<{id:string;appId:string;licenseCount:number}>(ctx,input.commandId,'guest.invite',input.appId,hash)
  if(replay)return replay
  const schemas=descriptors.list(input.appId).filter(d=>d.schema.label!=='Private source intake').map(d=>d.schema)
  if(!schemas.length)throw new AuthorityError('not_found','Base not found.',404)
  const guards=[...owner]
  for(const schema of schemas){
   const scope=await policy.scope(ctx,{appId:input.appId,entityId:schema.id,purpose:'read'})
   if(!scope.unrestrictedRows||schema.fields.some(field=>!scope.readableFieldIds.includes(field.id)))throw new AuthorityError('forbidden','Inviting a guest requires current access to the whole base.')
   guards.push(...scope.currentAuthorityGuards)
  }
  const email=input.email.toLowerCase(),id=createUlid(),policyId=createUlid(),now=Date.parse(ctx.now)
  if(await db.prepare('SELECT 1 FROM operators WHERE lower(email)=?').bind(email).first())throw new AuthorityError('validation','This email already belongs to a person. Use their existing access controls.',409)
  guards.push(trustedPredicate('NOT EXISTS(SELECT 1 FROM operators WHERE lower(email)=?)',[email]))
  const rules=schemas.map(schema=>({id:createUlid(),principals:[{id,kind:'human'}],entityId:schema.id,effect:'allow',rows:{kind:'all',conditions:[]},readableFields:schema.fields.map(field=>field.id),writableFields:[],actions:[],purposes:['read']}))
  const permit={actor:{id:ctx.principal.id,kind:'human' as const},action:'guest.invite',appId:input.appId,policyVersion:0,grantId:null,grantVersion:null,validUntil:ctx.principal.expiresAt,guards:owner,reservationMutations:[],reservationIds:[]}
  return admission.commit(ctx,{commandId:input.commandId,action:'guest.invite',appId:input.appId,canonicalInputHash:hash,permit,guards,mutations:[
   {kind:'insert',table:operators,row:{id,name:input.name,email,active:0,created_at:now,updated_at:now,version:1}},
   {kind:'insert',table:principals,row:{id,kind:'human',human_id:id,state:'invited',authentication_epoch:1,initial_owner:0,created_at:now,updated_at:now,version:1}},
   {kind:'insert',table:native,row:{id:createUlid(),email,display_name:input.name,role:'member',status:'invited',version:1,created_at:now}},
   {kind:'insert',table:guests,row:{principal_id:id,app_id:input.appId,invitation_delivered:0,created_at:now}},
   {kind:'insert',table:policies,row:{id:policyId,app_id:input.appId,name:'Guest read access',rules_json:canonical(rules),version:1,created_at:now,updated_at:now}},
   {kind:'insert',table:memberships,row:{principal_id:id,app_id:input.appId,policy_id:policyId,legacy:0,state:'active',version:1}},
  ],audit:[{action:'guest.invite',subject:null,changes:[],sourceIds:[],personalContentRefs:[id]}],events:[],outbox:[],committedResult:{id,appId:input.appId,licenseCount:0}})
 }
}
