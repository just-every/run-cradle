import type { PolicyPort, RequestContext, AuthorityPermit } from './ports'
import type { AdmissionPort, AdmissionPlan } from '../admission/ports'
import type { Policy } from './contracts'
import { registerTable } from '../admission/sql.server'
import { principalGuards } from './guards.server'
import { ownerDelegationSnapshot } from './delegation.server'
import { prepareMachinePrincipal } from './principals.server'
import { digest } from './crypto.server'
import { canonicalJson } from './grants.server'
import { policyRuleSchema } from './validators'
import { AuthorityError } from './errors'
import { createUlid } from '../../core/shared/ids'

const policies=registerTable('authority_policies',['id','app_id','name','rules_json','version','created_at','updated_at'])
const memberships=registerTable('authority_memberships',['principal_id','app_id','policy_id','state','legacy','version'])
const bindings=registerTable('authority_delegations',['principal_id','issuer_id','issuer_epoch','app_id','issuer_membership_version','issuer_policy_id','issuer_policy_version','base_operator_id','base_operator_version','label','kind','grant_id','automation_id','created_at','revoked_at'])

/** Stable subcommands let an interrupted issuance resume without creating extra delegates. */
export async function delegationCommandId(commandId:string,step:string) {
 const hash=await digest(canonicalJson({commandId,step})),alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
 let value=BigInt('0x'+hash.slice(0,32)),id=''
 for(let n=0;n<26;n++){id=alphabet[Number(value&31n)]+id;value>>=5n}
 return id
}

export type DelegationInput={appId:string;entityId:string;name:string;permissions:'read'|'write';allowDelete?:boolean;expiresAt:string;automationCreateEntityIds?:string[];automationReadEntityIds?:string[];automationPatch?:boolean}

/** Adds explicit owner administration without changing the owner's data rules. */
export async function userDelegationPolicy(db:D1Database,ordinary:PolicyPort,ctx:RequestContext,input:DelegationInput) {
 const snapshot=await ownerDelegationSnapshot(db,ctx,input.appId)
 const scope=await ordinary.scope(ctx,{appId:input.appId,entityId:input.entityId,purpose:'read'})
 const guards=[...principalGuards(ctx),snapshot.guard,...scope.currentAuthorityGuards]
 const permit=(action:string):AuthorityPermit=>({actor:{id:ctx.principal.id,kind:'human'},action,appId:input.appId,
  grantId:null,grantVersion:null,policyVersion:scope.policyVersion,validUntil:ctx.principal.expiresAt,
  guards,reservationMutations:[],reservationIds:[]})
 const administration=new Set(['principal.create','credential.issue','credential.revoke','grant.prepare','grant.issue','grant.revoke'])
 const policy:PolicyPort={scope:ordinary.scope,async authorize(current,request){
  if(current.principal.id===ctx.principal.id&&request.appId===input.appId&&administration.has(request.action))return permit(request.action)
  if(request.action==='record.read'&&current.principal.id===ctx.principal.id&&request.appId===input.appId)return permit(request.action)
  return ordinary.authorize(current,request)
 }}
 return {policy,snapshot,scope,guards,permit}
}

export async function provisionUserDelegate(db:D1Database,ordinary:PolicyPort,admission:AdmissionPort,ctx:RequestContext,
 commandId:string,input:DelegationInput,kind:'api-key'|'automation') {
 if(input.allowDelete&&(kind!=='api-key'||input.permissions!=='write'))throw new AuthorityError('validation','Delete access requires an explicit writable API key.',400)
 if((input.automationCreateEntityIds?.length||input.automationReadEntityIds?.length)&&(kind!=='automation'||input.permissions!=='write'))throw new AuthorityError('validation','Record creation scopes require a writable automation.',400)
 const createEntities=new Set(input.automationCreateEntityIds??[]),entities=new Set([input.entityId,...createEntities,...(input.automationReadEntityIds??[])])
 const expiry=Date.parse(input.expiresAt),now=Date.parse(ctx.now)
 if(!Number.isFinite(expiry)||expiry<=now||expiry>now+2592000000)
  throw new AuthorityError('validation','Choose an expiry within 30 days.',400)
 const own=await userDelegationPolicy(db,ordinary,ctx,input)
 const prepared=await prepareMachinePrincipal(own.policy,ctx,await delegationCommandId(commandId,'principal'),
  {appId:input.appId,kind:kind==='automation'?'agent':'connector'})
 const principalId=prepared.committedResult.id,policyId=await delegationCommandId(commandId,'policy')
 const source=policyRuleSchema.array().parse(JSON.parse(own.snapshot.row.rules_json)) as Policy['rules']
 const actions=input.permissions==='write'?(kind==='automation'?['record.read',...(input.automationPatch===false?[]:['record.patch']),...(createEntities.size?['record.create']:[])]:['record.read','record.create','record.patch',...(input.allowDelete?['record.delete']:[])]):['record.read']
 const rules=source.filter(rule=>entities.has(rule.entityId)&&rule.principals.some(p=>p.id===ctx.principal.id&&p.kind==='human'))
  .map(rule=>({...rule,id:createUlid(),principals:[{id:principalId,kind:kind==='automation'?'agent' as const:'connector' as const}],
   purposes:(rule.purposes??['read']).filter(p=>p==='read'||kind==='automation'&&p==='export'),
   actions:actions.filter(action=>(action==='record.read'||rule.actions.includes(action))&&(kind!=='automation'||action==='record.read'||action==='record.create'&&createEntities.has(rule.entityId)||action==='record.patch'&&rule.entityId===input.entityId)),
   writableFields:input.permissions==='write'&&(kind!=='automation'||createEntities.has(rule.entityId)||input.automationPatch!==false&&rule.entityId===input.entityId)?rule.writableFields:[]}))
 if([...entities].some(entityId=>!rules.some(rule=>rule.entityId===entityId&&rule.effect==='allow'&&rule.readableFields.length)))
  throw new AuthorityError('forbidden','This entity has no readable fields.')
 const row=own.snapshot.row
 const plan:AdmissionPlan<{id:string;kind:'agent'|'connector'}>={...prepared,
  canonicalInputHash:await digest(canonicalJson({input,kind})),guards:own.guards,
  mutations:[...prepared.mutations,
   {kind:'insert',table:policies,row:{id:policyId,app_id:input.appId,name:input.name,rules_json:canonicalJson(rules),version:1,created_at:now,updated_at:now}},
   {kind:'insert',table:memberships,row:{principal_id:principalId,app_id:input.appId,policy_id:policyId,state:'active',legacy:0,version:1}},
   {kind:'insert',table:bindings,row:{principal_id:principalId,issuer_id:ctx.principal.id,issuer_epoch:ctx.principal.authenticationEpoch,
    app_id:input.appId,issuer_membership_version:row.membership_version,issuer_policy_id:row.policy_id,issuer_policy_version:row.policy_version,
    base_operator_id:row.base_id,base_operator_version:row.base_version,label:input.name,kind,grant_id:null,automation_id:null,created_at:now,revoked_at:null}}]}
 const receipt=await admission.commit(ctx,plan)
 if(receipt.result.state!=='committed')throw new AuthorityError('version_conflict','Delegation has not committed.',409)
 return {...own,principalId:receipt.result.value.id,actions}
}
