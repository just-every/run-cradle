import type { ReleaseAuthorityPort } from '../releases/ports'
import type { PolicyPort, RequestContext } from './ports'
import type { SqlPredicate } from '../admission/ports'
import { trustedPredicate } from '../admission/sql.server'
import { digest } from './crypto.server'
import { canonicalJson } from './grants.server'
import { denied } from './errors'
export type ReleaseDecisionPort={confirm(ctx:RequestContext,input:{decisionId:string;inputHash:string}):Promise<{guards:SqlPredicate[];issuerId:string;allowsAccessChange:boolean;allowsEgressChange:boolean}>}
export const createReleaseAuthority=(db:D1Database,policy:PolicyPort,decisions:ReleaseDecisionPort):ReleaseAuthorityPort=>({async assert(ctx,input){
 const inputHash=await digest(canonicalJson({appId:input.appId,candidateId:input.candidateId,sourceHash:input.sourceHash,parentReleaseId:input.parentReleaseId,recoveryPlanId:input.recoveryPlanId,action:input.action}))
 if(input.decisionId){const decision=await decisions.confirm(ctx,{decisionId:input.decisionId,inputHash});if(!decision.guards.length)return denied('Release decision needs current atomic predicates.');const permit=await policy.authorize(ctx,{appId:input.appId,action:input.action,expected:[],cost:[],inputHash});return {...decision,issuerKind:'human',guards:[...permit.guards,...decision.guards]}}
 if(!input.grantId)return denied('Release needs an exact human decision or existing scoped release grant.')
 const grant=await db.prepare(`SELECT issuer_id,version,spec_json FROM authority_grants WHERE id=? AND delegate_id=? AND app_id=? AND state='active'`).bind(input.grantId,ctx.principal.id,input.appId).first<{issuer_id:string;version:number;spec_json:string}>();if(!grant)return denied()
 const spec=JSON.parse(grant.spec_json) as import('./contracts').GrantSpec
 // A standing release grant must explicitly name this candidate; source/parent remain release guards.
 if(!spec.scope.some(s=>s.recordIds?.includes(input.candidateId)))return denied('The release grant does not name this candidate.')
 const subject=input.subject;if(!subject||subject.ref.recordId!==input.candidateId||subject.ref.appId!==input.appId)return denied('The current candidate subject is required.')
 const permit=await policy.authorize(ctx,{appId:input.appId,action:input.action,expected:[subject],cost:[],inputHash,grantId:input.grantId,grantVersion:grant.version,commandId:ctx.requestId})
 return {guards:[...permit.guards,trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND kind='human' AND state='active')`,[grant.issuer_id])],issuerId:grant.issuer_id,issuerKind:'human',allowsAccessChange:false,allowsEgressChange:false}
}})
