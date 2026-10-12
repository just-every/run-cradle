import type { SqlMutation, SqlPredicate } from '../admission/ports'
import { registerTable, trustedPredicate } from '../admission/sql.server'
import type { PolicyPort, RequestContext } from './ports'
import { candidateEntityId,sourceEntityId } from '../construction/contracts'
import { createUlid } from '../../core/shared/ids'
import { canonicalJson } from './grants.server'
import { digest } from './crypto.server'
import { denied } from './errors'
export const INSTALLATION_AUTHORITY_APP='00000000000000000000000100'
const policies=registerTable('authority_policies',['id','app_id','name','rules_json','version','created_at','updated_at'])
const memberships=registerTable('authority_memberships',['principal_id','app_id','policy_id','legacy','state','version'])
/** No implicit install/upgrade call: installation application.prepare permission must already be explicitly adopted. */
export const preparePendingApplication=async(db:D1Database,policy:PolicyPort,ctx:RequestContext,input:{appId:string;newCandidateId:string;installationAppId:string}):Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}>=>{
 if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||input.installationAppId!==INSTALLATION_AUTHORITY_APP)return denied('A current installation-authorized human must prepare a new app.')
 const permit=await policy.authorize(ctx,{appId:input.installationAppId,action:'application.prepare',expected:[],cost:[],inputHash:await digest(canonicalJson(input))}),id=createUlid(),now=Date.parse(ctx.now)
 if(await db.prepare('SELECT 1 FROM authority_memberships WHERE app_id=?').bind(input.appId).first())return denied('Pending app authority cannot replace existing membership.')
 const base={principals:[{id:ctx.principal.id,kind:'human' as const}],rows:{kind:'all' as const,conditions:[]},readableFields:[],writableFields:[],effect:'allow' as const,purposes:['read' as const]}
 const rules=[{...base,id:createUlid(),entityId:candidateEntityId,actions:['candidate.prepare','candidate.build','candidate.cancel','candidate.read','candidate.revise','candidate.evaluate','candidate.reject','evaluation.read']},{...base,id:createUlid(),entityId:sourceEntityId,actions:['source.prepare','source.read','source.edit']}]
 return {guards:[...permit.guards,trustedPredicate('NOT EXISTS(SELECT 1 FROM authority_memberships WHERE app_id=?)',[input.appId])],mutations:[{kind:'insert',table:policies,row:{id,app_id:input.appId,name:'Pending app construction access',rules_json:canonicalJson(rules),version:1,created_at:now,updated_at:now}},{kind:'insert',table:memberships,row:{principal_id:ctx.principal.id,app_id:input.appId,policy_id:id,legacy:0,state:'active',version:1}}]}
}
