import type { PolicyPort,RequestContext } from '../authority/ports'
import type { DescriptorRegistry } from '../records/descriptors.server'
import { ownerDelegationSnapshot } from '../authority/delegation.server'
import { principalGuards } from '../authority/guards.server'
import { and,identifier,trustedPredicate } from '../admission/sql.server'
import { AuthorityError } from '../authority/errors'
import { recordAutomationDefinition } from './contracts'

export function createRecordAutomationHistory(db:D1Database,policy:PolicyPort,descriptors:DescriptorRegistry) {
 return {
  async list(ctx:RequestContext,appId:string) {
   const owner=await ownerDelegationSnapshot(db,ctx,appId),guard=and(...principalGuards(ctx),owner.guard)
   const rows=await db.prepare(`SELECT a.id,a.version,a.definition_version,a.enabled,v.definition_json,c.expires_at
    FROM automations a JOIN record_automation_bindings b ON b.automation_id=a.id
    JOIN record_automation_versions v ON v.automation_id=a.id AND v.definition_version=a.definition_version
    LEFT JOIN authority_credentials c ON c.id=v.credential_id
    WHERE b.app_id=? AND b.owner_id=? AND (${guard.sql}) ORDER BY a.created_at DESC LIMIT 100`)
    .bind(appId,ctx.principal.id,...guard.values).all<{id:string;version:number;definition_version:number;enabled:number;definition_json:string;expires_at:number|null}>()
   const result=[]
   for(const row of rows.results){
    const definition=recordAutomationDefinition.parse(JSON.parse(row.definition_json))
    const scope=await policy.scope(ctx,{appId,entityId:definition.entityId,purpose:'read'})
    if(definition.actions.some(action=>action.kind==='update'&&!scope.writableFieldIds.includes(action.fieldId)))continue
    const current=and(...scope.currentAuthorityGuards)
    if(!await db.prepare(`SELECT 1 WHERE ${current.sql}`).bind(...current.values).first())continue
    result.push({id:row.id,version:row.version,definitionVersion:row.definition_version,
     definition:{...definition,enabled:Boolean(row.enabled)},expiresAt:row.expires_at===null?null:new Date(row.expires_at).toISOString()})
   }
   return result
  },
  async runs(ctx:RequestContext,id:string) {
   const binding=await db.prepare('SELECT app_id,entity_id,owner_id FROM record_automation_bindings WHERE automation_id=?').bind(id)
    .first<{app_id:string;entity_id:string;owner_id:string}>()
   if(!binding||binding.owner_id!==ctx.principal.id)throw new AuthorityError('not_found','Automation is unavailable.',404)
   const owner=await ownerDelegationSnapshot(db,ctx,binding.app_id),scope=await policy.scope(ctx,{appId:binding.app_id,entityId:binding.entity_id,purpose:'read'})
   const descriptor=descriptors.get(binding.app_id,binding.entity_id),guard=and(owner.guard,...principalGuards(ctx),...scope.currentAuthorityGuards)
   const subject=trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(descriptor.table.tableId)} WHERE ${identifier(descriptor.idColumn)}=run.subject_id AND (${scope.rowPredicate.sql}))`,scope.rowPredicate.values)
   const rows=await db.prepare(`SELECT run.id,run.definition_version,run.subject_id,run.state,run.queued_at,run.started_at,run.finished_at,run.error_code
    FROM automation_runs run WHERE run.automation_id=? AND (${guard.sql}) AND (${subject.sql}) ORDER BY run.queued_at DESC LIMIT 100`)
    .bind(id,...guard.values,...subject.values).all<{id:string;definition_version:number;subject_id:string;state:string;queued_at:number;started_at:number|null;finished_at:number|null;error_code:string|null}>()
   const result=[]
   for(const run of rows.results){
    const actions=await db.prepare(`SELECT position,state,error_code FROM launch_automation_actions WHERE run_id=? AND (${guard.sql}) ORDER BY position`)
     .bind(run.id,...guard.values).all<{position:number;state:string;error_code:string|null}>()
    if(!await db.prepare(`SELECT 1 FROM automation_runs run WHERE run.id=? AND (${guard.sql}) AND (${subject.sql})`)
     .bind(run.id,...guard.values,...subject.values).first())continue
    result.push({id:run.id,definitionVersion:run.definition_version,recordId:run.subject_id,state:run.state,
     queuedAt:new Date(run.queued_at).toISOString(),startedAt:run.started_at===null?null:new Date(run.started_at).toISOString(),
     finishedAt:run.finished_at===null?null:new Date(run.finished_at).toISOString(),errorCode:run.error_code,actions:actions.results})
   }
   return result
  },
 }
}
