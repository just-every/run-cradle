import type { Principal, RequestContext, PolicyPort } from './ports'
import type { AdmissionPort, SqlMutation, SqlPredicate } from '../admission/ports'
import { registerTable, trustedPredicate } from '../admission/sql.server'
import { digest, randomSecret } from './crypto.server'
import { createUlid } from '../../core/shared/ids'
import { denied, AuthorityError } from './errors'
import { canonicalJson } from './grants.server'
import { z } from 'zod'
import { delegatedPrincipal } from './delegation.server'
import { bindProposer } from './proposer.server'
import { DEV_CREDENTIAL_KIND, devCredentials, isDevMinted, mintedInDevSession } from './dev-credentials.server'
const scopeSchema=z.array(z.object({appId:z.string(),actions:z.array(z.string()).min(1).max(100),purposes:z.array(z.string()).max(100)}).strict()).min(1).max(100)
const subscriptions=registerTable('record_change_subscriptions',['credential_id'])
const credentials=registerTable('authority_credentials',['id','principal_id','token_hash','audience','scopes_json','created_at','expires_at','revoked_at','version','authentication_epoch'])
/** `devGate` admits a request holding the local dev key; a deployed Worker has none, so dev-minted credentials are refused there. */
/** `audiences[0]` is the door; a later audience is a key confined to a narrower door (a proposing key). */
export const resolveMachinePrincipal=async(db:D1Database,request:Request,audience:string|readonly [string,...string[]],devGate?:(request:Request)=>Promise<boolean>):Promise<Principal>=>{
  const audiences=typeof audience==='string'?[audience]:[...audience]
  const auth=request.headers.get('authorization');if(!auth||!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth))throw new AuthorityError('signed_out','A machine credential is required.',401)
  const now=Date.now(),row=await db.prepare(`SELECT c.id,c.principal_id,c.created_at,c.expires_at,c.audience,p.kind,p.human_id,p.authentication_epoch FROM authority_credentials c JOIN authority_principals p ON p.id=c.principal_id WHERE c.token_hash=? AND c.audience IN (${audiences.map(()=>'?').join(',')}) AND c.revoked_at IS NULL AND c.expires_at>? AND p.state='active' AND p.authentication_epoch=c.authentication_epoch`).bind(await digest(auth.slice(7)),...audiences,now).first<{id:string;principal_id:string;created_at:number;expires_at:number;audience:string;kind:Principal['kind'];human_id:string|null;authentication_epoch:number}>()
  if(!row||(await isDevMinted(db,row.id)&&!await devGate?.(request)))throw new AuthorityError('signed_out','The machine credential is invalid or expired.',401)
  return bindProposer(db,await delegatedPrincipal(db,{id:row.principal_id,kind:row.kind,humanId:row.human_id,sessionId:null,credentialId:row.id,issuedAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),authenticationEpoch:row.authentication_epoch}),row.audience!==audiences[0])
}
export const createMachineService=(db:D1Database,policy:PolicyPort,admission:AdmissionPort,
 revocationEffects?: (ctx:RequestContext,appId:string,id:string)=>Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}>)=>({
  async issue(ctx:RequestContext,commandId:string,input:{principalId:string;audience:string;expiresAt:string;scopes:z.infer<typeof scopeSchema>}){
    if(ctx.principal.kind!=='human'||!ctx.principal.sessionId)return denied('A human session must issue machine credentials.')
    const scopes=scopeSchema.parse(input.scopes),expiry=Date.parse(input.expiresAt),now=Date.parse(ctx.now)
    if(!Number.isFinite(expiry)||expiry<=now||expiry>now+2592000000||!input.audience||input.audience.length>2048)return denied('Credential audience and bounded expiry are required.')
    const guards=[];let permit
    for(const scope of scopes){permit=await policy.authorize(ctx,{appId:scope.appId,action:'credential.issue',expected:[],cost:[],inputHash:''});guards.push(...permit.guards);for(const action of scope.actions){if(/^(grant\.|policy\.|credential\.|member\.)/.test(action))return denied();const p=await policy.authorize(ctx,{appId:scope.appId,action,expected:[],cost:[],inputHash:''});guards.push(...p.guards)}}
    if(!permit)return denied()
    const target=await db.prepare("SELECT authentication_epoch FROM authority_principals WHERE id=? AND state='active'").bind(input.principalId).first<{authentication_epoch:number}>();if(!target)return denied()
    const id=createUlid(now),secret=randomSecret(),hash=await digest(canonicalJson(input));guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND state='active' AND kind<>'human')`,[input.principalId]))
    const receipt=await admission.commit(ctx,{commandId,action:'credential.issue',appId:permit.appId,canonicalInputHash:hash,permit,guards,mutations:[{kind:'insert',table:credentials,row:{id,principal_id:input.principalId,token_hash:await digest(secret),audience:input.audience,scopes_json:JSON.stringify(scopes),created_at:now,expires_at:expiry,revoked_at:null,version:1,authentication_epoch:target.authentication_epoch}},...(await mintedInDevSession(db,ctx)?[{kind:'insert' as const,table:devCredentials,row:{credential:DEV_CREDENTIAL_KIND,id,created_at:now}}]:[])],audit:[{action:'credential.issue',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id,expiresAt:input.expiresAt,audience:input.audience}})
    // Secret is returned once, never persisted in admission result or audit.
    if(receipt.replay)throw new AuthorityError('version_conflict','Credential was already issued; its secret is not recoverable. Revoke it before issuing another.',409)
    return {id,secret,expiresAt:input.expiresAt}
  },
  /** Keep the delegated principal and its authority lifetime; replace only this credential. */
  async rotate(ctx:RequestContext,commandId:string,appId:string,oldId:string,kind:'api-key'|'proposing-key'){
   if(ctx.principal.kind!=='human'||!ctx.principal.sessionId)return denied('A current human session must rotate credentials.')
   const action=kind+'.rotate',hash=await digest(canonicalJson({oldId,kind}))
   const permit=await policy.authorize(ctx,{appId,action:'credential.issue',expected:[],cost:[],inputHash:hash})
   const revoke=await policy.authorize(ctx,{appId,action:'credential.revoke',expected:[],cost:[],inputHash:hash})
   // Proposing a new base has no ordinary record authority yet. Owner key
   // administration above authorizes this metadata-only replay refusal.
   if(await db.prepare('SELECT 1 FROM command_admissions WHERE command_id=? AND actor_id=? AND actor_kind=? AND app_id=? AND action=? AND input_hash=? AND state=\'committed\'').bind(commandId,ctx.principal.id,ctx.principal.kind,appId,action,hash).first())throw new AuthorityError('version_conflict','Rotation already committed; its secret cannot be recovered.',409)
   const old=await db.prepare("SELECT * FROM authority_credentials WHERE id=? AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM json_each(scopes_json) WHERE json_extract(value,'$.appId')=?)")
    .bind(oldId,Date.parse(ctx.now),appId).first<{principal_id:string;audience:string;scopes_json:string;expires_at:number;authentication_epoch:number;version:number}>()
   if(!old)throw new AuthorityError('not_found','Active key not found.',404)
   const id=createUlid(),secret=randomSecret(),now=Date.parse(ctx.now)
   const subscriptionCount=kind==='api-key'?Number(await db.prepare('SELECT count(*) AS n FROM record_change_subscriptions WHERE credential_id=?').bind(oldId).first('n')):0
   const receipt=await admission.commit(ctx,{commandId,action,appId,canonicalInputHash:hash,permit:{...permit,action},guards:[...revoke.guards,trustedPredicate("EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND state='active' AND authentication_epoch=?)",[old.principal_id,old.authentication_epoch])],mutations:[
    {kind:'update',table:credentials,set:{revoked_at:now,version:old.version+1},where:trustedPredicate('id=? AND version=? AND revoked_at IS NULL AND expires_at>?',[oldId,old.version,now]),expectedRows:1},
    {kind:'insert',table:credentials,row:{id,principal_id:old.principal_id,token_hash:await digest(secret),audience:old.audience,scopes_json:old.scopes_json,created_at:now,expires_at:old.expires_at,revoked_at:null,version:1,authentication_epoch:old.authentication_epoch}},
    ...(subscriptionCount?[{kind:'update' as const,table:subscriptions,set:{credential_id:id},where:trustedPredicate('credential_id=?',[oldId]),expectedRows:subscriptionCount}]:[]),
    ...(await isDevMinted(db,oldId)?[{kind:'insert' as const,table:devCredentials,row:{credential:DEV_CREDENTIAL_KIND,id,created_at:now}}]:[])
   ],audit:[{action,subject:null,changes:[],sourceIds:[oldId,id],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id,oldId,expiresAt:new Date(old.expires_at).toISOString()}})
   if(receipt.replay||receipt.result.state!=='committed')throw new AuthorityError('version_conflict','Rotation secret is unavailable.',409)
   return {id,oldId,secret,expiresAt:new Date(old.expires_at).toISOString()}
  },
  async revoke(ctx:RequestContext,commandId:string,appId:string,id:string){
   if(ctx.principal.kind!=='human')return denied()
   const hash=await digest(id),permit=await policy.authorize(ctx,{appId,action:'credential.revoke',expected:[],cost:[],inputHash:hash})
   const effects=await revocationEffects?.(ctx,appId,id)
   return admission.commit(ctx,{commandId,action:'credential.revoke',appId,canonicalInputHash:hash,permit,
    guards:effects?.guards??[],mutations:[{kind:'update',table:credentials,set:{revoked_at:Date.parse(ctx.now)},
     where:trustedPredicate(`id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM json_each(scopes_json) WHERE json_extract(value,'$.appId')=?)`,[id,appId]),expectedRows:1},...(effects?.mutations??[])],
    audit:[{action:'credential.revoke',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id,revoked:true}})
  },
})
