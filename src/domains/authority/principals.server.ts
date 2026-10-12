import { createUlid } from '../../core/shared/ids'
import type { AdmissionPlan } from '../admission/ports'
import { registerTable } from '../admission/sql.server'
import type { PolicyPort, RequestContext } from './ports'
import { canonicalJson } from './grants.server'
import { digest } from './crypto.server'
import { denied } from './errors'
const principals=registerTable('authority_principals',['id','kind','human_id','state','authentication_epoch','initial_owner','created_at','updated_at','version'])
/** Actor provisioning is explicit human authority; creation itself adds no membership or grant. */
export const prepareMachinePrincipal=async(policy:PolicyPort,ctx:RequestContext,commandId:string,input:{appId:string;kind:'agent'|'connector'}):Promise<AdmissionPlan<{id:string;kind:'agent'|'connector'}>>=>{
 if(ctx.principal.kind!=='human'||!['agent','connector'].includes(input.kind))return denied()
 const hash=await digest(canonicalJson(input)),permit=await policy.authorize(ctx,{appId:input.appId,action:'principal.create',expected:[],cost:[],inputHash:hash}),id=createUlid(),now=Date.parse(ctx.now)
 return {commandId,action:'principal.create',appId:input.appId,canonicalInputHash:hash,permit,guards:[],mutations:[{kind:'insert',table:principals,row:{id,kind:input.kind,human_id:null,state:'active',authentication_epoch:1,initial_owner:0,created_at:now,updated_at:now,version:1}}],audit:[{action:'principal.create',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id,kind:input.kind}}
}
