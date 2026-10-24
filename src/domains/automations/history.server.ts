import {automationItemHistory} from './control-history.server'
import {automationDefinitionActions} from './control-contracts'
import {automationFailureCause,automationRunLink,safeAutomationRetry} from './failure-details'
import type { PolicyPort,RequestContext } from '../authority/ports'
import type { DescriptorRegistry } from '../records/descriptors.server'
import { ownerDelegationSnapshot } from '../authority/delegation.server'
import { principalGuards } from '../authority/guards.server'
import { and,identifier,trustedPredicate } from '../admission/sql.server'
import { AuthorityError } from '../authority/errors'
import {automationTestHistory} from './test-history.server'
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
    if(automationDefinitionActions(definition).some(action=>action.kind==='update'&&!scope.writableFieldIds.includes(action.fieldId)))continue
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
   const rows=await db.prepare(`SELECT run.id,run.definition_version,run.subject_id,run.state,run.queued_at,run.started_at,run.finished_at,run.error_code,run.error_message,run.definition_json
    FROM automation_runs run WHERE run.automation_id=? AND (${guard.sql}) AND (${subject.sql}) ORDER BY run.queued_at DESC LIMIT 100`)
    .bind(id,...guard.values,...subject.values).all<{id:string;definition_version:number;subject_id:string;state:string;queued_at:number;started_at:number|null;finished_at:number|null;error_code:string|null;error_message:string|null;definition_json:string}>()
   const result=[]
   for(const run of rows.results){
    const actions=await db.prepare(`SELECT position,state,error_code,result_json,(SELECT status FROM sms_messages WHERE id=launch_automation_actions.id) AS sms_status,(SELECT field_id FROM sms_messages WHERE id=launch_automation_actions.id) AS sms_field_id FROM launch_automation_actions WHERE run_id=? AND (${guard.sql}) ORDER BY position`)
     .bind(run.id,...guard.values).all<{position:number;state:string;error_code:string|null;result_json:string|null;sms_status:string|null;sms_field_id:string|null}>()
    if(!await db.prepare(`SELECT 1 FROM automation_runs run WHERE run.id=? AND (${guard.sql}) AND (${subject.sql})`)
     .bind(run.id,...guard.values,...subject.values).first())continue
    const primary=descriptor.schema.primaryFieldId??descriptor.schema.fields.find(field=>field.type==='text')?.id
    const storage=primary&&scope.readableFieldIds.includes(primary)?descriptor.fields.get(primary):undefined
    const label=storage?.column?await db.prepare(`SELECT ${identifier(storage.column)} AS label FROM ${identifier(descriptor.table.tableId)}
     WHERE ${identifier(descriptor.idColumn)}=? AND (${guard.sql}) AND (${scope.rowPredicate.sql})`)
     .bind(run.subject_id,...guard.values,...scope.rowPredicate.values).first<{label:string|number|null}>():null
    const recordLabel=label?.label===null||label?.label===undefined?'Untitled record':
     storage?.field.options?.find(option=>option.id===label.label)?.label??String(label.label)
    const visibleActions=actions.results.map(action=>{
     const heldUntil=action.state==='Pending'&&action.result_json?JSON.parse(action.result_json).heldUntil:null
     const sms=action.result_json?JSON.parse(action.result_json):null
     return {position:action.position,state:heldUntil?'Held':action.state,error_code:action.error_code,heldUntil:heldUntil??null,...((action.sms_status??sms?.smsStatus)?{smsStatus:action.sms_status??sms.smsStatus,skipped:Boolean(sms?.skipped),...(sms?.smsError&&action.sms_field_id&&scope.readableFieldIds.includes(action.sms_field_id)?{smsError:sms.smsError}:{})}:{})}
    })
    const held=visibleActions.find(action=>action.heldUntil)
    const items=await automationItemHistory(db,ctx,scope,descriptor,guard,run.definition_json,visibleActions)
    const retryable=safeAutomationRetry(run.state,run.error_code)&&!!await db.prepare('SELECT 1 FROM automations WHERE id=? AND enabled=1').bind(id).first()&&(run.error_code!=='delivery_retryable'||!!await db.prepare("SELECT 1 FROM integration_deliveries d JOIN launch_automation_actions a ON a.id=d.id WHERE a.run_id=? AND a.state='Failed' AND d.state='rejected' AND d.attempts<6").bind(run.id).first())
    result.push({items,cause:run.error_message??automationFailureCause(run.error_code),href:automationRunLink(binding.app_id,id,run.id),retryable,id:run.id,definitionVersion:run.definition_version,recordId:run.subject_id,recordLabel,state:held&&['Queued','Running'].includes(run.state)?'Held':run.state,
     heldUntil:held?.heldUntil??null,
     queuedAt:new Date(run.queued_at).toISOString(),startedAt:run.started_at===null?null:new Date(run.started_at).toISOString(),
     finishedAt:run.finished_at===null?null:new Date(run.finished_at).toISOString(),errorCode:run.error_code,actions:visibleActions})
   }
   return [...result,...await automationTestHistory(db,policy,descriptors,ctx,id,binding,guard)].sort((a,b)=>b.queuedAt.localeCompare(a.queuedAt)||b.id.localeCompare(a.id)).slice(0,100)
  },
 }
}
