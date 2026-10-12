import type { AuthorityPermit, PolicyPort, RequestContext } from './ports'
import type { SqlPredicate } from '../admission/ports'
import { and, trustedPredicate } from '../admission/sql.server'
import { principalGuards } from './guards.server'
import { denied } from './errors'
import { LAUNCH_APP_ID } from '../../apps/launch/contracts'
import { policyRuleSchema } from './validators'

const actions=new Set(['member.read','member.invite','member.remove','member.erase'])
export type OperatorManagementPolicy=(ctx:RequestContext,input:{appId:string;action:string})=>Promise<{allowed:boolean;guards:SqlPredicate[]}>
/** operator.management.v1: eligible operators may manage collaborators by default.
 * A deployment can supply a restrictive policy; durable conditions belong in guards. */
export const operatorManagementV1:OperatorManagementPolicy=async()=>({allowed:true,guards:[]})

/** Management changes no data-read policy and installs no app memberships or grants. */
export function createMemberManagementPolicy(db:D1Database,ordinary:PolicyPort,management=operatorManagementV1):PolicyPort {
 return {scope:ordinary.scope,async authorize(ctx,request){
  if(!actions.has(request.action))return ordinary.authorize(ctx,request)
  if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||!ctx.principal.baseSessionId)
   return denied('Collaborator management requires a current operator session.')
  const row=await db.prepare(`SELECT m.version AS membership_version,m.legacy,p.id AS policy_id,p.version AS policy_version,p.rules_json,
   o.id AS base_id,o.version AS base_version,o.role
   FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id AND p.app_id=m.app_id
   JOIN cradle_base_operators projection ON projection.principal_id=m.principal_id
   JOIN oa_operators o ON o.id=projection.base_id
   WHERE m.principal_id=? AND m.app_id=? AND m.state='active' AND o.status='active'`)
   .bind(ctx.principal.id,request.appId).first<{membership_version:number;legacy:number;policy_id:string;policy_version:number;rules_json:string;base_id:string;base_version:number;role:string}>()
  if(row&&policyRuleSchema.array().parse(JSON.parse(row.rules_json)).some(rule=>rule.actions.includes(request.action)&&rule.principals.some(principal=>principal.id===ctx.principal.id&&principal.kind==='human')))
   return ordinary.authorize(ctx,request)
  if(!row||!(request.appId===LAUNCH_APP_ID&&row.legacy===1||row.role==='owner'))
   return denied('Current management authority for this app is required.')
  const selected=await management(ctx,{appId:request.appId,action:request.action})
  if(!selected.allowed)return denied('The operator management policy forbids this action.')
  const guard=trustedPredicate(`EXISTS(SELECT 1 FROM authority_memberships m
   JOIN authority_policies p ON p.id=m.policy_id AND p.app_id=m.app_id
   JOIN cradle_base_operators projection ON projection.principal_id=m.principal_id
   JOIN oa_operators o ON o.id=projection.base_id
   WHERE m.principal_id=? AND m.app_id=? AND m.state='active' AND m.version=?
    AND p.id=? AND p.version=? AND o.id=? AND o.version=? AND o.status='active'
    AND ((m.app_id=? AND m.legacy=1) OR o.role='owner'))`,
   [ctx.principal.id,request.appId,row.membership_version,row.policy_id,row.policy_version,row.base_id,row.base_version,LAUNCH_APP_ID])
  const guards=[...principalGuards(ctx),guard,...selected.guards],current=and(...guards)
  if(!await db.prepare(`SELECT 1 WHERE ${current.sql}`).bind(...current.values).first())return denied()
  const permit:AuthorityPermit={actor:{id:ctx.principal.id,kind:'human'},action:request.action,appId:request.appId,
   policyVersion:row.policy_version,grantId:null,grantVersion:null,validUntil:ctx.principal.expiresAt,
   guards,reservationMutations:[],reservationIds:[]}
  return permit
 }}
}
