import type {NotificationInput} from './ports'
import {trustedPredicate,and,or,identifier} from '../admission/sql.server'
import {compileFilter} from '../authority/scope.server'
import type {PolicyEntity} from '../authority/scope.server'
import type {Policy} from '../authority/contracts'
import {launchDescriptors,launchTables} from '../../apps/launch/descriptors.server'
import type {LaunchKind} from '../../apps/launch/descriptors.server'
import {launchEntities,LAUNCH_APP_ID} from '../../apps/launch/contracts'
/** Recipient access is evaluated without inventing a login or delegating the event actor's rights. */
export async function legacyRecipientGuards(db:D1Database,input:NotificationInput,now:string){
 if(input.kind==='progress'&&input.subjectType==='progress-receipt'){
  const guard=trustedPredicate(`EXISTS(SELECT 1 FROM command_admissions c JOIN authority_principals p ON p.id=c.actor_id JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=c.app_id AND m.state='active' WHERE c.command_id=? AND c.state='committed' AND c.action IN ('import.progress.result','export.progress.result') AND p.human_id=? AND p.state='active')`,[input.subjectId,input.operatorId])
  return await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()?[guard]:null
 }
 if(input.kind==='outage'&&input.subjectType==='connection'){
  const guard=trustedPredicate(`EXISTS(SELECT 1 FROM provider_connections c WHERE c.id=? AND c.revoked_at IS NULL AND (EXISTS(SELECT 1 FROM authority_principals p WHERE p.id=c.owner_id AND p.human_id=? AND p.state='active') OR (c.owner_id IS NULL AND EXISTS(SELECT 1 FROM cradle_base_operators m JOIN oa_operators o ON o.id=m.base_id JOIN authority_principals p ON p.id=m.principal_id WHERE p.human_id=? AND p.state='active' AND o.role='owner' AND o.status='active'))))`,[input.subjectId,input.operatorId,input.operatorId])
  return await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()?[guard]:null
 }
 if(input.kind==='outage'&&input.subjectType==='automation-stop'){
  const guard=trustedPredicate(`EXISTS(SELECT 1 FROM automation_runs r JOIN record_automation_bindings b ON b.automation_id=r.automation_id JOIN authority_principals p ON p.id=b.owner_id WHERE r.id=? AND p.human_id=? AND p.state='active')`,[input.subjectId,input.operatorId])
  return await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()?[guard]:null
 }
 const row=await db.prepare("SELECT p.id,p.version,p.rules_json,m.version AS member_version,m.principal_id FROM authority_memberships m JOIN authority_principals a ON a.id=m.principal_id JOIN authority_policies p ON p.id=m.policy_id WHERE a.human_id=? AND a.state='active' AND m.app_id=? AND m.state='active'").bind(input.operatorId,LAUNCH_APP_ID).first<{id:string;version:number;rules_json:string;member_version:number;principal_id:string}>();if(!row)return null
 const kind:LaunchKind=input.kind==='decision-assigned'||input.kind==='decision-overdue'?'decision':input.kind==='critical-risk-escalated'?'risk':input.kind==='readiness'?'milestone':'campaign',subject=kind==='campaign'?input.campaignId:input.subjectId
 const guards=[trustedPredicate("EXISTS(SELECT 1 FROM authority_memberships m JOIN authority_principals a ON a.id=m.principal_id JOIN authority_policies p ON p.id=m.policy_id WHERE a.human_id=? AND a.state='active' AND m.app_id=? AND m.state='active' AND m.version=? AND p.id=? AND p.version=?)",[input.operatorId,LAUNCH_APP_ID,row.member_version,row.id,row.version])]
 // Campaignless automation failures/digests use a source-specific projector and reveal no new app fields here.
 if(!subject)return guards
 const descriptor=launchDescriptors.find(d=>d.schema.id===launchEntities[kind])!,entity:PolicyEntity={id:launchEntities[kind],table:launchTables[kind],idColumn:'id',fields:descriptor.schema.fields.map(f=>({id:f.id,column:descriptor.fields.get(f.id)!.column,type:f.type==='number'?'number':f.type==='date'?'date':f.type==='boolean'?'boolean':'text',nullable:true}))}
 const rules=(JSON.parse(row.rules_json) as Policy['rules']).filter(r=>r.entityId===entity.id&&r.principals.some(p=>p.id===row.principal_id&&p.kind==='human')&&(r.purposes??['read']).includes('read')),allowed=rules.filter(r=>r.effect==='allow'),denied=rules.filter(r=>r.effect==='deny');if(!allowed.length)return null
 const rows=and(or(...allowed.map(r=>compileFilter(r.rows,entity,now))),trustedPredicate(`NOT (${or(...denied.map(r=>compileFilter(r.rows,entity,now))).sql})`,or(...denied.map(r=>compileFilter(r.rows,entity,now))).values)),read=trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table)} WHERE id=? AND ${rows.sql})`,[subject,...rows.values])

 if(allowed.some(r=>r.rows.kind==='all'&&r.rows.conditions.length===0)&&denied.length===0)return guards
 if(!await db.prepare(`SELECT 1 WHERE ${read.sql}`).bind(...read.values).first())return null
 guards.push(read);return guards
}
