import { requireBaseAuthor } from '../records/manual/base-access.server'
import { createProductAuth } from './product-auth.server'
import { resolveMachinePrincipal } from './machine.server'
import { createUlid } from '../../core/shared/ids'
import type { AuthConfiguration, PolicyPort, RequestContext } from './ports'
import { AuthorityError } from './errors'
import { principalGuards } from './guards.server'
import { and } from '../admission/sql.server'
import type { EntityRegistry } from './scope.server'
import { createReferenceAccess } from './reference.server'
import { isProposalDoor, proposalAudience, refuseOutsideDoor } from './proposer.server'
import type { Ref } from '../../contracts/primitives'
import { authorizeInvitationReplay } from './member-replay.server'
export const createRequestContextFactory=(db:D1Database,configuration:AuthConfiguration)=>{
 return async(request:Request,ingress:RequestContext['ingress']='http'):Promise<RequestContext>=>{
  // Resolve each request against Base authentication and current application authority.
  const auth=createProductAuth(db,configuration)
  const machine=ingress==='mcp'||request.headers.has('authorization')
  const principal=machine?await resolveMachinePrincipal(db,request,[`${configuration.appOrigin}${ingress==='mcp'?'/mcp':'/api/v1'}`,proposalAudience(configuration.appOrigin)],configuration.devCredentialGate):(await auth.current(request))?.principal
  if(!principal)throw new AuthorityError('signed_out','Sign in to continue.',401)
  // A proposing key reaches only its own door; elsewhere it gets the answer for a missing route.
  if(principal.proposer&&!isProposalDoor(new URL(request.url).pathname))await refuseOutsideDoor(request)
  if(!machine&&!['GET','HEAD','OPTIONS'].includes(request.method))await auth.requireCsrf(request)
  return {principal,requestId:createUlid(),now:new Date().toISOString(),ingress}
 }
}
export const createReplayAccess=(db:D1Database,policy:PolicyPort,registry:EntityRegistry)=>({async authorizeReplay(ctx:RequestContext,command:{appId:string;action:string;actorId:string;commandId:string;result?:unknown;provenance?:{policyVersion:number;grantId:string|null;grantVersion:number|null;subjects:{ref:Ref;fieldIds:string[]}[]}}){
 if(command.actorId!==ctx.principal.id)throw new AuthorityError('not_found','Command not found.',404)
 const guards=and(...principalGuards(ctx));if(!await db.prepare(`SELECT 1 WHERE ${guards.sql}`).bind(...guards.values).first())throw new AuthorityError('signed_out','Current authentication is required.',401)
 // A proposing key replays only its own proposal commands; it holds no membership.
 if(ctx.principal.proposer){if(command.appId!==ctx.principal.proposer.appId||!['schema.propose','schema.withdraw'].includes(command.action))throw new AuthorityError('not_found','Command not found.',404);return}
 const membership=await db.prepare(`SELECT p.version FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=? AND m.state='active'`).bind(ctx.principal.id,command.appId).first<{version:number}>()
 if(!membership||!command.provenance)throw new AuthorityError('not_found','Command is not visible under current policy.',404)
 const savedButton=command.result&&typeof command.result==='object'&&'value'in command.result?command.result.value:null
 if(command.action==='record.template-button-save'&&savedButton&&typeof savedButton==='object'&&'kind'in savedButton&&savedButton.kind==='update-field'){
  const result=savedButton as unknown as {id:string;appId:string;entityId:string;fieldId:string;version:number};
  if(!await db.prepare('SELECT 1 FROM record_update_buttons WHERE id=? AND app_id=? AND entity_id=? AND version=?').bind(result.id,result.appId,result.entityId,result.version).first())throw new AuthorityError('not_found','The button configuration is no longer current.',404)
  if(!await requireBaseAuthor(db,ctx,result.appId))throw new AuthorityError('forbidden','Current base authorship is required.',403)
  const scope=await policy.scope(ctx,{appId:result.appId,entityId:result.entityId,purpose:'read'})
  if(!scope.readableFieldIds.includes(result.fieldId)||!scope.writableFieldIds.includes(result.fieldId))throw new AuthorityError('forbidden','The configured field is unavailable.',403)
 }
 if(command.action==='member.invite')await authorizeInvitationReplay(db,ctx,command.appId,command.result)
 const check=createReferenceAccess(db,policy,registry)
 for(const subject of command.provenance.subjects)await check(ctx,subject.ref,subject.fieldIds,'read')
 if(command.provenance.grantId){const grant=await db.prepare(`SELECT 1 FROM authority_grants WHERE id=? AND delegate_id=? AND state='active' AND restore_hold=0 AND version=? AND expires_at>?`).bind(command.provenance.grantId,ctx.principal.id,command.provenance.grantVersion,Date.parse(ctx.now)).first();if(!grant)await policy.authorize(ctx,{appId:command.appId,action:'execution.read',expected:[],cost:[],inputHash:''})}
}})
