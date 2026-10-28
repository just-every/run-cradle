import type { RequestContext, PolicyPort } from './ports'
import type { AdmissionPort } from '../admission/ports'
import { registerTable, trustedPredicate } from '../admission/sql.server'
import { createMachineService } from './machine.server'
import { createGrantService, canonicalJson } from './grants.server'
import { delegationCommandId, provisionUserDelegate, type DelegationInput } from './user-delegation.server'
import { AuthorityError } from './errors'
import { digest } from './crypto.server'
import { delegationGuard } from './delegation.server'
const bindings=registerTable('authority_delegations',['principal_id','grant_id','revoked_at'])

export async function issueUserCredential(db:D1Database,ordinary:PolicyPort,admission:AdmissionPort,appOrigin:string,ctx:RequestContext,commandId:string,input:DelegationInput,kind:'api-key'|'automation') {
   const delegated=await provisionUserDelegate(db,ordinary,admission,ctx,commandId,input,kind)
   const {principalId,policy,actions}=delegated
   const bound=delegationGuard(principalId)
   if(!await db.prepare(`SELECT 1 WHERE ${bound.sql}`).bind(...bound.values).first())
    throw new AuthorityError('grant_revoked','The prepared delegation is no longer current.')
   const stored=await db.prepare('SELECT created_at FROM authority_delegations WHERE principal_id=?').bind(principalId).first<{created_at:number}>()
   const startsAt=new Date(stored!.created_at).toISOString()
   if(input.permissions==='write'){
    const grants=createGrantService(db,policy)
    const spec={delegate:{id:principalId,kind:kind==='automation'?'agent':'connector'},appId:input.appId,
     actions:actions.filter(a=>a!=='record.read'),scope:[...new Set([...(kind==='automation'&&input.automationPatch===false?[]:[input.entityId]),...(input.automationCreateEntityIds??[])])].map(entityId=>({entityId})),allowedTransitions:[],
     perAction:[],perActionQuantity:0,period:{startsAt,endsAt:input.expiresAt,ceiling:[],modelCalls:0,wallSeconds:0,quantity:0},
     providerScopes:[],startsAt,expiresAt:input.expiresAt,decisionRules:[]}
    const prepared=await grants.prepare(ctx,await delegationCommandId(commandId,'grant-prepare'),spec)
    const proposed=await admission.commit(ctx,prepared)
    if(proposed.result.state!=='committed')throw new AuthorityError('version_conflict','Grant proposal has not committed.',409)
    const grant=proposed.result.value
    const issueCommand=await delegationCommandId(commandId,'grant-issue')
    const issueHash=await digest(canonicalJson({grantId:grant.id,expectedVersion:grant.version,confirmedImpactHash:grant.impactHash}))
    if(!await admission.replay(ctx,issueCommand,'grant.issue',input.appId,issueHash))
     await admission.commit(ctx,await grants.issue(ctx,issueCommand,grant.id,grant.version,grant.impactHash))
    await admission.commit(ctx,{commandId:await delegationCommandId(commandId,'grant-bind'),action:'credential.issue',appId:input.appId,
     canonicalInputHash:await digest(canonicalJson({principalId,grantId:grant.id})),permit:delegated.permit('credential.issue'),guards:delegated.guards,
     mutations:[{kind:'update',table:bindings,set:{grant_id:grant.id},where:trustedPredicate('principal_id=? AND grant_id IS NULL',[principalId]),expectedRows:1}],
     audit:[],events:[],outbox:[],committedResult:{principalId,grantId:grant.id}})
   }
   const service=createMachineService(db,policy,admission)
   const credential={principalId,audience:`${appOrigin}/api/v1`,expiresAt:input.expiresAt,
    scopes:[{appId:input.appId,actions,purposes:kind==='automation'?['read','export']:['read']}]}
   if(kind==='automation'){
    const prior=await admission.replay<{id:string;expiresAt:string;audience:string}>(ctx,commandId,'credential.issue',input.appId,await digest(canonicalJson(credential)))
    if(prior?.result.state==='committed')return {...prior.result.value,principalId,name:input.name,appId:input.appId,entityId:input.entityId,permissions:input.permissions}
   }
   const key=await service.issue(ctx,commandId,credential)
   return {...key,principalId,name:input.name,appId:input.appId,entityId:input.entityId,permissions:input.permissions}
}
