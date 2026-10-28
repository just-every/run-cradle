import { dueSchedule } from './schedule'
import { automationEmailDue } from '../../domains/automations/email-timing.server'
import type { Json } from '../../contracts/primitives'
import type { RequestContext,AuthorityPermit } from '../../domains/authority/ports'
import type { AdmissionPort,AdmissionPlan,DomainEvent,SqlMutation,SqlPredicate,OutboxCommand } from '../../domains/admission/ports'
import { eq,trustedPredicate } from '../../domains/admission/sql.server'
import { canonicalHash } from '../../domains/admission/canonical'
import { createUlid } from '../../core/shared/ids'
import { runTable,actionTable } from './automations.server'
import { tables,type LaunchRow } from './storage.server'
import { LAUNCH_APP_ID } from './contracts'
import { integration,emptyChange,load,ref,type LaunchContext,type ChangeSet } from './domain.server'
import { prepareTransition } from './transitions.server'
import { localDate } from './milestones.server'
import { registerTable } from '../../domains/admission/sql.server'
import { prepareReadinessEvaluation } from './readiness.server'
export type LegacyAutomationRun={id:string;automationId:string;definitionVersion:number;definition:LaunchRow;subjectIds:string[];causeRunIds:string[];triggerKey:string;retryOf:string|null}
export interface LegacyAutomationPorts {
 releaseId:string
 /** A verifies the persisted enabled definition/current run and exact bounded action; never an ambient grant. */
 authority(ctx:RequestContext,input:{commandId:string;action:'launch.automation.trigger'|'launch.automation.execute';run:LegacyAutomationRun;inputHash:string;terminalFailure?:boolean}):Promise<AuthorityPermit>
 /** A policy scoped to this saved run and one declared command, with current archive/definition guards. */
 context(ctx:RequestContext,run:LegacyAutomationRun,subjectId?:string):Promise<LaunchContext>
 /** N/X returns only actual prepared effects/outbox. Confirmation is durable and queried by original key. */
 external(ctx:RequestContext,input:{run:LegacyAutomationRun;action:string;input:Json;idempotencyKey:string}):Promise<{guards:SqlPredicate[];mutations:SqlMutation[];outbox:OutboxCommand[];state:'Complete'|'Waiting'|'Unknown';result:Json;events?:ChangeSet['events'];audit?:ChangeSet['audit'];changed?:ChangeSet['changed']}>
}
function storedRun(row:Record<string,unknown>):LegacyAutomationRun{const data=JSON.parse(String(row.definition_json)) as {definition:LaunchRow;subjectIds:string[]};return{id:String(row.id),automationId:String(row.automation_id),definitionVersion:Number(row.definition_version),definition:data.definition,subjectIds:data.subjectIds,causeRunIds:JSON.parse(String(row.cause_run_ids_json)),triggerKey:String(row.trigger_key),retryOf:row.retry_of?String(row.retry_of):null}}
const retryTable=registerTable('launch_automation_retries',['run_id','first_failed_at','retries','next_at','error_code','error_message'])
export function createLegacyAutomationRuntime(context:LaunchContext,admission:AdmissionPort,ports:LegacyAutomationPorts){
 async function makePlan(ctx:RequestContext,run:LegacyAutomationRun,set:ChangeSet,action:'launch.automation.trigger'|'launch.automation.execute',result:Json,outbox:OutboxCommand[]=[]):Promise<AdmissionPlan<Json>>{const commandId=createUlid(),inputHash=await canonicalHash({runId:run.id,action,result}),permit=await ports.authority(ctx,{commandId,action,run,inputHash,terminalFailure:result!==null&&typeof result==='object'&&!Array.isArray(result)&&result.state==='Failed'});return{commandId,action,appId:LAUNCH_APP_ID,canonicalInputHash:inputHash,permit,guards:set.guards,mutations:set.mutations,audit:set.audit,events:set.events,outbox,committedResult:result,changed:set.changed}}
 async function trigger(ctx:RequestContext,definition:LaunchRow,triggerKey:string,subjectIds:string[],causeRunIds:string[]=[],eventGuard?:SqlPredicate){
  if(!definition.enabled)return null
  const prior=await context.db.prepare('SELECT id FROM automation_runs WHERE automation_id=? AND definition_version=? AND trigger_key=? AND retry_of IS NULL').bind(definition.id,Number(definition.definition_version),triggerKey).first<{id:string}>();if(prior)return prior.id
  const causes=causeRunIds.length?await context.db.prepare(`SELECT automation_id FROM automation_runs WHERE id IN (${causeRunIds.map(()=>'?').join(',')})`).bind(...causeRunIds).all<{automation_id:string}>():{results:[]};const suppressed=causeRunIds.length>=10||causes.results.some(r=>r.automation_id===definition.id)
  const now=Date.parse(ctx.now),id=createUlid(),run:LegacyAutomationRun={id,automationId:definition.id,definitionVersion:Number(definition.definition_version),definition,subjectIds,causeRunIds,triggerKey,retryOf:null},set=emptyChange();set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automations WHERE id=? AND version=? AND enabled=1)',[definition.id,definition.version]));set.mutations.push({kind:'insert',table:runTable,row:{id,created_at:now,updated_at:now,version:1,automation_id:definition.id,definition_version:run.definitionVersion,subject_id:subjectIds.length===1?subjectIds[0]!:null,state:suppressed?'Suppressed':'Queued',queued_at:now,started_at:null,finished_at:suppressed?now:null,affected_count:0,error_code:suppressed?'loop_suppressed':null,error_message:suppressed?'Automation already in cause chain or depth exceeds10':null,trigger_key:triggerKey,definition_json:JSON.stringify({definition,subjectIds}),cause_run_ids_json:JSON.stringify(causeRunIds),retry_of:null}})
  for(const subjectId of subjectIds){const predicate=trustedPredicate('EXISTS(SELECT 1 FROM campaigns WHERE id=? AND archived_at IS NULL UNION ALL SELECT 1 FROM risks r JOIN campaigns c ON c.id=r.campaign_id WHERE r.id=? AND c.archived_at IS NULL UNION ALL SELECT 1 FROM milestones m JOIN campaigns c ON c.id=m.campaign_id WHERE m.id=? AND c.archived_at IS NULL UNION ALL SELECT 1 FROM deliverables d JOIN campaigns c ON c.id=d.campaign_id WHERE d.id=? AND c.archived_at IS NULL UNION ALL SELECT 1 FROM decisions d JOIN campaigns c ON c.id=d.campaign_id WHERE d.id=? AND c.archived_at IS NULL)',[subjectId,subjectId,subjectId,subjectId,subjectId]);if(!await context.db.prepare(`SELECT 1 WHERE ${predicate.sql}`).bind(...predicate.values).first())return null;set.guards.push(predicate)}
  if(eventGuard)set.guards.push(eventGuard)
  if(definition.shipped_key==='campaign-brief')for(const id of subjectIds)set.guards.push(trustedPredicate("NOT EXISTS(SELECT 1 FROM automation_runs a,json_each(json_extract(a.definition_json,'$.subjectIds')) s WHERE a.automation_id=? AND a.queued_at>? AND a.state<>'Suppressed' AND s.value=?)",[definition.id,now-3600000,id]))
  if(!suppressed){const actions=JSON.parse(String(definition.actions_json)) as unknown[];for(const [position]of actions.entries())set.mutations.push({kind:'insert',table:actionTable,row:{id:createUlid(),run_id:id,position,idempotency_key:`${id}:${position}`,state:'Pending',result_json:null,error_code:null,error_message:null,started_at:null,finished_at:null}})}
  await admission.commit(ctx,await makePlan(ctx,run,set,'launch.automation.trigger',{runId:id,state:suppressed?'Suppressed':'Queued'},suppressed?[]:[{action:'launch.automation.execute',version:1,input:{runId:id},notBefore:ctx.now,grantId:null,subject:null,sourceReleaseId:ports.releaseId,causeRunIds:[...causeRunIds,id]}]));return id
 }
 async function event(ctx:RequestContext,eventId:string,event:DomainEvent,eventGuard?:SqlPredicate){
  const defs=await context.db.prepare("SELECT * FROM automations WHERE enabled=1 AND trigger_type='event' ORDER BY id").all<LaunchRow>(),results=[]
  for(const d of defs.results){const admitted=(event.payload as Record<string,Json>).launchAutomationDefinitions;if(admitted&&typeof admitted==='object'&&!Array.isArray(admitted)&&admitted[d.id]!==d.definition_version)continue;const config=JSON.parse(String(d.trigger_config_json));const name=event.name.endsWith('.v1')?event.name:event.name+'.v1';if(!(d.shipped_key==='critical-risk'&&event.name==='risk.created')&&!['bulk.updated','import.committed'].includes(event.name)&&config.event!==name&&!(config.events??[]).includes(name)&&config.event!==event.name&&!(config.events??[]).includes(event.name))continue;const payload=event.payload as Record<string,Json>,ids=Array.isArray(payload.ids??payload.recordIds)?((payload.ids??payload.recordIds) as Json[]).map(String):event.subject?[event.subject.recordId]:[]
   if(d.shipped_key==='critical-risk'){if(['risk.created','risk.updated'].includes(event.name)&&(payload.severity!=='Critical'||payload.previousSeverity==='Critical'))continue;const eligible=[];for(const id of ids){const risk=await context.db.prepare("SELECT r.id FROM risks r JOIN campaigns c ON c.id=r.campaign_id WHERE r.id=? AND r.severity='Critical' AND r.state NOT IN ('Resolved','Escalated') AND c.archived_at IS NULL").bind(id).first();if(risk)eligible.push(id)}if(!eligible.length)continue;results.push(await trigger(ctx,d,eventId,eligible,event.causeRunIds,eventGuard));continue}
   if(d.shipped_key==='campaign-brief'){const settings=await context.db.prepare('SELECT ai_enabled FROM workspace_settings LIMIT 1').first<{ai_enabled:number}>();if(!settings?.ai_enabled)continue;const eligible=[];for(const id of ids){if(!await context.db.prepare('SELECT 1 FROM campaigns WHERE id=? AND archived_at IS NULL').bind(id).first())continue;const recent=await context.db.prepare("SELECT 1 FROM automation_runs WHERE automation_id=? AND (subject_id=? OR EXISTS(SELECT 1 FROM json_each(json_extract(automation_runs.definition_json,'$.subjectIds')) WHERE value=?)) AND queued_at>? AND state!='Suppressed'").bind(d.id,id,id,Date.parse(ctx.now)-3600000).first();if(!recent)eligible.push(id)}if(!eligible.length)continue;results.push(await trigger(ctx,d,eventId,eligible,event.causeRunIds,eventGuard));continue}
   results.push(await trigger(ctx,d,eventId,ids,event.causeRunIds,eventGuard))
  }return results
 }
 async function schedule(ctx:RequestContext){
  const settings=await context.db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first<{timezone:string}>();if(!settings)throw new Error('Workspace timezone is required');const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:settings.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(new Date(ctx.now)).map(p=>[p.type,p.value]));const date=localDate(ctx.now,settings.timezone),hour=Number(parts.hour),minute=Number(parts.minute),definitions=await context.db.prepare("SELECT * FROM automations WHERE enabled=1 AND trigger_type='schedule' ORDER BY id").all<LaunchRow>(),runs=[]
  for(const d of definitions.results){const config=JSON.parse(String(d.trigger_config_json));let due=false,key=date
   if(d.shipped_key==='launch-readiness')due=hour===Number(config.hour??8)&&minute<15
   else if(d.shipped_key==='weekly-digest')due=parts.weekday==='Mon'&&hour===9&&minute<15
   // OPS-003: future Launch occurrences follow the workspace; retained run snapshots stay unchanged.
   else{const scheduled=dueSchedule(Date.parse(ctx.now),settings.timezone,String(config.localRule));due=scheduled!==null;if(scheduled)key=scheduled}
   if(due&&['launch-readiness','weekly-digest'].includes(String(d.shipped_key))&&await context.db.prepare('SELECT 1 FROM automation_runs WHERE automation_id=? AND trigger_key=? LIMIT 1').bind(d.id,`schedule:${key}`).first())continue
   if(due)runs.push(await trigger(ctx,d,`schedule:${key}`,[]))
  }return runs
 }
 async function executeOne(ctx:RequestContext,runId:string,nextContext:()=>RequestContext){
  const row=await context.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(runId).first<Record<string,unknown>>();if(!row)throw new Error('Automation run was not found');if(['Succeeded','Failed','Cancelled','Suppressed'].includes(String(row.state)))return{runId,state:row.state};const run=storedRun(row),current=await load(context.db,'automation',run.automationId),set=emptyChange(),startedAt=Date.parse(ctx.now);let now=startedAt
  if(!current.enabled||await archived(run)){set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND version=?)',[runId,Number(row.version)]));set.mutations.push({kind:'update',table:runTable,set:{state:'Cancelled',version:Number(row.version)+1,finished_at:now,updated_at:now},where:eq(runTable,'id',runId),expectedRows:1});return admission.commit(ctx,await makePlan(ctx,run,set,'launch.automation.execute',{runId,state:'Cancelled'}))}
  const retry=await context.db.prepare('SELECT next_at FROM launch_automation_retries WHERE run_id=?').bind(runId).first<{next_at:number|null}>();if(retry?.next_at&&retry.next_at>now)return{runId,state:'Waiting',retryAt:new Date(retry.next_at).toISOString()}
  const pending=await context.db.prepare("SELECT * FROM launch_automation_actions WHERE run_id=? AND state!='Complete' ORDER BY position LIMIT 1").bind(runId).first<Record<string,unknown>>();if(!pending){set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND version=?)',[runId,Number(row.version)]));set.mutations.push({kind:'update',table:runTable,set:{state:'Succeeded',version:Number(row.version)+1,finished_at:now,updated_at:now},where:eq(runTable,'id',runId),expectedRows:1});return admission.commit(ctx,await makePlan(ctx,run,set,'launch.automation.execute',{runId,state:'Succeeded'}))}
  const saved=JSON.parse(String(run.definition.actions_json)) as {command:string;input?:Json}[],action=saved[Number(pending.position)]!,scoped=await ports.context(ctx,run);let state:'Complete'|'Waiting'|'Unknown'='Complete',result:Json=null,outbox:OutboxCommand[]=[]
  if(action.command==='send-email'&&!await context.db.prepare('SELECT 1 FROM launch_action_effects WHERE effect_key=?').bind(String(pending.idempotency_key)).first()) {
   const due=await automationEmailDue(context.db,now)
   if(due>now){await context.db.prepare("UPDATE launch_automation_actions SET result_json=? WHERE id=? AND state='Pending'")
    .bind(JSON.stringify({heldUntil:new Date(due).toISOString()}),String(pending.id)).run();return {runId,state:'Waiting'}}
  }
  if(row.state==='Queued'&&['request-ai-analysis','send-email'].includes(action.command)){
   const start=emptyChange();start.guards.push(trustedPredicate("EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND version=? AND state='Queued')",[runId,Number(row.version)]))
   start.mutations.push({kind:'update',table:runTable,set:{state:'Running',version:Number(row.version)+1,started_at:now,updated_at:now},where:eq(runTable,'id',runId),expectedRows:1})
   await admission.commit(ctx,await makePlan(ctx,run,start,'launch.automation.execute',{runId,state:'Running'}))
   row.version=Number(row.version)+1;row.state='Running';row.started_at=now
  }
  if(action.command==='readiness'){result={affected:await prepareReadinessEvaluation(scoped,ctx,set,Number(JSON.parse(String(run.definition.trigger_config_json)).leadDays??5))}}
  else if(action.command==='escalate-risk'){for(const id of run.definition.shipped_key?run.subjectIds:[String((action.input as Record<string,Json>).id)]){const risk=await load(context.db,'risk',id);if(risk.state==='Escalated'||risk.state==='Resolved'||run.definition.shipped_key==='critical-risk'&&risk.severity!=='Critical')continue;const p=await prepareTransition(scoped,ctx,{commandId:createUlid(),expected:[{ref:ref('risk',id),version:risk.version}],input:{id,reason:'Critical severity automation'}},'risk','escalate');set.guards.push(...p.guards);set.mutations.push(...p.mutations);set.audit.push(...p.audit);set.events.push(...p.events);set.changed.push(...p.changed??[])}result={affected:run.subjectIds.length}}
  else{const p=await ports.external(ctx,{run,action:action.command,input:action.input??{subjectIds:run.subjectIds},idempotencyKey:String(pending.idempotency_key)});set.guards.push(...p.guards);set.mutations.push(...p.mutations);set.events.push(...p.events??[]);set.audit.push(...p.audit??[]);set.changed.push(...p.changed??[]);outbox=p.outbox;state=p.state;result=p.result}
  // Another executor owns an in-flight effect. Keep its version and durable wake-up intact.
  if(state==='Waiting')return{runId,state:'Waiting'}
  ctx=nextContext();now=Date.parse(ctx.now)
  if(state==='Complete'&&retry)set.mutations.push({kind:'update',table:retryTable,set:{next_at:null},where:eq(retryTable,'run_id',runId),expectedRows:1})
  for(const mutation of set.mutations)if(mutation.kind==='insert'&&mutation.table.tableId==='activity_entries')mutation.row={...mutation.row,actor_id:null,automation_run_id:runId}
  // An uncertain outcome is final for the run (AUTO-007): it finishes Unknown, keeping its first finish time.
  const error_code=state==='Unknown'?'unknown_outcome':null,error_message=state==='Unknown'?'The external delivery outcome is uncertain. Reconcile the original delivery before retrying.':null
  set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND version=?)',[runId,Number(row.version)]),trustedPredicate('EXISTS(SELECT 1 FROM launch_automation_actions WHERE id=? AND state=?)',[String(pending.id),String(pending.state)]));set.mutations.push({kind:'update',table:actionTable,set:{state,error_code,error_message,result_json:JSON.stringify(result),started_at:pending.started_at?Number(pending.started_at):startedAt,finished_at:state==='Complete'?now:null},where:eq(actionTable,'id',String(pending.id)),expectedRows:1});const finished=state==='Complete'&&Number(pending.position)===saved.length-1;set.mutations.push({kind:'update',table:runTable,set:{state:finished?'Succeeded':state==='Unknown'?'Unknown':'Running',version:Number(row.version)+1,updated_at:now,started_at:row.started_at?Number(row.started_at):startedAt,finished_at:finished?now:state==='Unknown'?Number(row.finished_at??now):null,affected_count:Number(row.affected_count)+set.changed.length,error_code,error_message},where:eq(runTable,'id',runId),expectedRows:1});for(const e of set.events)e.causeRunIds=[...run.causeRunIds,runId]
  if(state==='Complete'&&!finished)outbox.push({action:'launch.automation.execute',version:1,input:{runId},notBefore:ctx.now,grantId:null,subject:null,sourceReleaseId:ports.releaseId,causeRunIds:[...run.causeRunIds,runId]});return admission.commit(ctx,await makePlan(ctx,run,set,'launch.automation.execute',{runId,state:finished?'Succeeded':state},outbox))
 }
 // Installed dispatch supplies a factory so external work cannot exhaust the next commit
 // context. Direct callers retain their original authority, including its expiry.
 async function execute(source:RequestContext|(()=>RequestContext),runId:string){const nextContext=typeof source==='function'?source:()=>source;let ctx=nextContext();try{return await executeOne(ctx,runId,nextContext)}catch(error){
  if(error instanceof Error&&'code'in error&&error.code==='version_conflict')throw error
  ctx=nextContext()
  const row=await context.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(runId).first<Record<string,unknown>>();if(!row||['Succeeded','Failed','Cancelled','Unknown'].includes(String(row.state)))throw error
  const run=storedRun(row),set=emptyChange(),now=Date.parse(ctx.now),code=error instanceof Error&&'code'in error?String(error.code):'internal',message=error instanceof Error?error.message:'Automation execution failed'
  const previous=await context.db.prepare('SELECT * FROM launch_automation_retries WHERE run_id=?').bind(runId).first<{first_failed_at:number;retries:number;next_at:number|null}>()
  const failedAction=await context.db.prepare("SELECT position FROM launch_automation_actions WHERE run_id=? AND state!='Complete' ORDER BY position LIMIT 1").bind(runId).first<{position:number}>()
  const modelAction=failedAction&&JSON.parse(String(run.definition.actions_json))[failedAction.position]?.command==='request-ai-analysis'
  const transport=['transport_error','transport_lost','rate_limited','provider_unavailable'].includes(code)
  if(transport&&!modelAction&&(!previous||previous.retries<4)){
   const retries=previous?previous.retries+1:0,first=previous?.first_failed_at??now,next=first+[1,5,15,30,60][retries]!*60000
   set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND version=?)',[runId,Number(row.version)]))
   set.mutations.push(previous?{kind:'update',table:retryTable,set:{retries,next_at:next,error_code:code,error_message:message},where:eq(retryTable,'run_id',runId),expectedRows:1}:{kind:'insert',table:retryTable,row:{run_id:runId,first_failed_at:first,retries,next_at:next,error_code:code,error_message:message}})
   set.mutations.push({kind:'update',table:runTable,set:{state:'Running',version:Number(row.version)+1,updated_at:now,started_at:row.started_at?Number(row.started_at):now,error_code:code,error_message:message},where:eq(runTable,'id',runId),expectedRows:1})
   await admission.commit(ctx,await makePlan(ctx,run,set,'launch.automation.execute',{runId,state:'Waiting',retryAt:new Date(next).toISOString()},[{action:'launch.automation.execute',version:1,input:{runId},notBefore:new Date(next).toISOString(),grantId:null,subject:null,sourceReleaseId:ports.releaseId,causeRunIds:[...run.causeRunIds,runId]}]));return{runId,state:'Waiting'}
  }
  set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND version=?)',[runId,Number(row.version)]));set.mutations.push({kind:'update',table:runTable,set:{state:'Failed',version:Number(row.version)+1,updated_at:now,finished_at:now,error_code:code,error_message:message},where:eq(runTable,'id',runId),expectedRows:1})
  const pending=await context.db.prepare("SELECT id FROM launch_automation_actions WHERE run_id=? AND state NOT IN ('Complete','Unknown') ORDER BY position LIMIT 1").bind(runId).first<{id:string}>();if(pending)set.mutations.push({kind:'update',table:actionTable,set:{state:'Failed',finished_at:now,error_code:code,error_message:message},where:eq(actionTable,'id',pending.id),expectedRows:1})
  const campaign=run.subjectIds.length?await context.db.prepare('SELECT id,owner_id FROM campaigns WHERE id=? UNION ALL SELECT c.id,c.owner_id FROM campaigns c JOIN risks r ON r.campaign_id=c.id WHERE r.id=? LIMIT 1').bind(run.subjectIds[0]!,run.subjectIds[0]!).first<{id:string;owner_id:string}>():null
  const recipients=row.initiated_by_id?[String(row.initiated_by_id)]:campaign?[campaign.owner_id]:(await context.db.prepare('SELECT id FROM operators WHERE active=1').all<{id:string}>()).results.map(o=>o.id)
  for(const operatorId of recipients){const effect=await integration(context,'notification')(ctx,{kind:'automation-failed',operatorId,campaignId:campaign?.id??null,subjectId:runId,eventId:runId,runId});set.guards.push(...effect.guards);set.mutations.push(...effect.mutations)}
  await admission.commit(ctx,await makePlan(ctx,run,set,'launch.automation.execute',{runId,state:'Failed',code,message}));throw error
 }}
 async function archived(run:LegacyAutomationRun){for(const id of run.subjectIds){const row=await context.db.prepare('SELECT archived_at FROM campaigns WHERE id=? UNION ALL SELECT c.archived_at FROM campaigns c JOIN risks r ON r.campaign_id=c.id WHERE r.id=? UNION ALL SELECT c.archived_at FROM campaigns c JOIN milestones m ON m.campaign_id=c.id WHERE m.id=?').bind(id,id,id).all<{archived_at:number|null}>();if(row.results.some(r=>r.archived_at!==null))return true}return false}
 return{trigger,event,schedule,execute}
}
