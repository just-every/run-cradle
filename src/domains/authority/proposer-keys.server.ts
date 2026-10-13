import type { AuthorityPermit, PolicyPort, RequestContext } from './ports'
import type { AdmissionPort, SqlMutation, SqlPredicate } from '../admission/ports'
import { registerTable, trustedPredicate, and } from '../admission/sql.server'
import { createMachineService } from './machine.server'
import { prepareMachinePrincipal } from './principals.server'
import { delegationCommandId } from './user-delegation.server'
import { principalGuards } from './guards.server'
import { proposalAudience } from './proposer.server'
import { AuthorityError } from './errors'

const binding=registerTable('authority_schema_proposers',['principal_id','issuer_id','issuer_epoch','base_operator_id','base_operator_version','app_id','label','created_at','revoked_at'])
const principals=registerTable('authority_principals',['id','authentication_epoch','version','updated_at'])
export type ProposerKeyInput={appId?:string;name:string;expiresAt:string}

/** Proposing keys are machine credentials with one scope, `schema.propose`, for one manual base. */
export function createProposerKeyService(db:D1Database,ordinary:PolicyPort,admission:AdmissionPort,appOrigin:string){
 /** Only the installation owner, as current Base owner, administers proposing keys. */
 async function currentOwner(ctx:RequestContext){
  if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||!ctx.principal.baseSessionId)throw new AuthorityError('forbidden','A current workspace owner session is required.')
  const row=await db.prepare(`SELECT o.id,o.version FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
   JOIN cradle_base_operators projection ON projection.base_id=o.id JOIN authority_principals p ON p.id=projection.principal_id
   JOIN operators legacy ON legacy.id=p.human_id
   WHERE s.id=? AND p.id=? AND p.initial_owner=1 AND p.state='active' AND legacy.active=1 AND o.role='owner' AND o.status='active'
    AND s.operator_version=o.version AND s.revoked_at IS NULL AND s.expires_at>unixepoch('subsec')*1000`).bind(ctx.principal.baseSessionId,ctx.principal.id).first<{id:string;version:number}>()
  if(!row)throw new AuthorityError('forbidden','Current installation owner authority is required.')
  return row
 }
 async function owner(ctx:RequestContext,appId:string){
  const row=await currentOwner(ctx)
  const base=await db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first<{owner_id:string}>()
  const guards:SqlPredicate[]=[...principalGuards(ctx),trustedPredicate("EXISTS(SELECT 1 FROM authority_principals p JOIN operators o ON o.id=p.human_id WHERE p.id=? AND p.initial_owner=1 AND o.active=1)",[ctx.principal.id]),
   trustedPredicate("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role='owner' AND status='active')",[row.id,row.version]),
   base?trustedPredicate('EXISTS(SELECT 1 FROM manual_record_bases WHERE id=? AND owner_id=?)',[appId,ctx.principal.id]):trustedPredicate('NOT EXISTS(SELECT 1 FROM record_schemas WHERE app_id=?)',[appId])]
  const permit=(action:string):AuthorityPermit=>({actor:{id:ctx.principal.id,kind:'human'},action,appId,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]})
  const administration=new Set(['principal.create','credential.issue','credential.revoke','schema.propose'])
  const policy:PolicyPort={scope:ordinary.scope,async authorize(current,request){
   if(current.principal.id===ctx.principal.id&&request.appId===appId&&administration.has(request.action))return permit(request.action)
   return ordinary.authorize(current,request)
  }}
  return {operator:row,base,guards,policy,permit}
 }
 return {
  async issue(ctx:RequestContext,commandId:string,input:ProposerKeyInput){
   const expiry=Date.parse(input.expiresAt),now=Date.parse(ctx.now)
   if(!Number.isFinite(expiry)||expiry<=now||expiry>now+2592000000)throw new AuthorityError('validation','Choose an expiry within 30 days.',400)
   const appId=input.appId??await delegationCommandId(commandId,'proposal-base')
   if(input.appId&&!await db.prepare('SELECT 1 FROM manual_record_bases WHERE id=? AND owner_id=?').bind(appId,ctx.principal.id).first())throw new AuthorityError('not_found','Base not found.',404)
   const own=await owner(ctx,appId)
   const prepared=await prepareMachinePrincipal(own.policy,ctx,await delegationCommandId(commandId,'principal'),{appId,kind:'connector'})
   const principalId=prepared.committedResult.id
   const receipt=await admission.commit(ctx,{...prepared,guards:own.guards,mutations:[...prepared.mutations,{kind:'insert',table:binding,row:{principal_id:principalId,issuer_id:ctx.principal.id,issuer_epoch:ctx.principal.authenticationEpoch,base_operator_id:own.operator.id,base_operator_version:own.operator.version,app_id:appId,label:input.name,created_at:now,revoked_at:null}}]})
   if(receipt.result.state!=='committed')throw new AuthorityError('version_conflict','Proposing key has not committed.',409)
   const key=await createMachineService(db,own.policy,admission).issue(ctx,commandId,{principalId:receipt.result.value.id,audience:proposalAudience(appOrigin),expiresAt:input.expiresAt,scopes:[{appId,actions:['schema.propose'],purposes:[]}]})
   return {...key,name:input.name,appId,baseName:own.base?(await db.prepare('SELECT name FROM manual_record_bases WHERE id=?').bind(appId).first<{name:string}>())!.name:null,endpoint:`${appOrigin}/mcp`,api:`${appOrigin}/api/v1/proposals`}
  },
  /** Safe metadata only: never a secret or digest. */
  async list(ctx:RequestContext){
   await currentOwner(ctx)
   const rows=await db.prepare(`SELECT c.id,b.label AS name,b.app_id,base.name AS base_name,b.created_at,c.expires_at,COALESCE(c.revoked_at,b.revoked_at) AS revoked_at
    FROM authority_schema_proposers b JOIN authority_credentials c ON c.principal_id=b.principal_id LEFT JOIN manual_record_bases base ON base.id=b.app_id
    WHERE b.issuer_id=? ORDER BY b.created_at DESC LIMIT 100`).bind(ctx.principal.id).all<{id:string;name:string;app_id:string;base_name:string|null;created_at:number;expires_at:number;revoked_at:number|null}>()
   const bases=await db.prepare('SELECT id,name FROM manual_record_bases WHERE owner_id=? ORDER BY name,id').bind(ctx.principal.id).all<{id:string;name:string}>()
   return {bases:bases.results,keys:rows.results.map(row=>({id:row.id,name:row.name,appId:row.app_id,baseName:row.base_name,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),revokedAt:row.revoked_at===null?null:new Date(row.revoked_at).toISOString()}))}
  },
  async revoke(ctx:RequestContext,commandId:string,id:string){
   const row=await db.prepare(`SELECT b.principal_id,b.app_id,p.authentication_epoch,p.version FROM authority_credentials c JOIN authority_schema_proposers b ON b.principal_id=c.principal_id
    JOIN authority_principals p ON p.id=b.principal_id WHERE c.id=? AND b.issuer_id=?`).bind(id,ctx.principal.id).first<{principal_id:string;app_id:string;authentication_epoch:number;version:number}>()
   if(!row)throw new AuthorityError('not_found','Proposing key not found.',404)
   const own=await owner(ctx,row.app_id),guard=and(...own.guards)
   const service=createMachineService(db,own.policy,admission,async()=>({guards:[guard],mutations:[
    {kind:'update',table:binding,set:{revoked_at:Date.parse(ctx.now)},where:trustedPredicate('principal_id=? AND revoked_at IS NULL',[row.principal_id]),expectedRows:1},
    {kind:'update',table:principals,set:{authentication_epoch:row.authentication_epoch+1,version:row.version+1,updated_at:Date.parse(ctx.now)},where:trustedPredicate('id=? AND version=? AND authentication_epoch=?',[row.principal_id,row.version,row.authentication_epoch]),expectedRows:1},
   ] as SqlMutation[]}))
   return service.revoke(ctx,commandId,row.app_id,id)
  },
 }
}
