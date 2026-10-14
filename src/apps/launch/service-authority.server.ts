import {automationDelegation} from './automation-delegation.server'
import { campaignOwnerScope } from './service-scope.server'
import { retainedRiskWriteGuards } from './service-write.server'
import type { RequestContext,AuthorityPermit,PolicyPort } from '../../domains/authority/ports'
import type { SqlPredicate } from '../../domains/admission/ports'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { canonicalHash } from '../../domains/admission/canonical'
import { AdmissionError } from '../../domains/admission/errors'
import { createUlid } from '../../core/shared/ids'
import { LAUNCH_APP_ID,launchEntities } from './contracts'
import { launchFieldIds,type LaunchKind } from './descriptors.server'
import type { LegacyAutomationRun,LegacyAutomationPorts } from './automation-runtime.server'
import type { LaunchContext } from './domain.server'
import { localDate,shiftDate } from './milestones.server'
export const LEGACY_LAUNCH_SERVICE_ID='00000000000000000000000798'
const actorId=LEGACY_LAUNCH_SERVICE_ID
const denied=(message:string):never=>{throw new AdmissionError('forbidden',message)}
/** Server-only capability for the two retained deterministic shipped automations. Never accepts a caller identity. */
export function createLegacyAutomationAuthority(base:LaunchContext,clock=()=>new Date()){
 const issued=new WeakMap<RequestContext,{eventId?:string;runId?:string;schedule?:true}>()
 function issue(binding:{eventId?:string;runId?:string;schedule?:true}):RequestContext{const now=clock().toISOString(),ctx:RequestContext={principal:{id:actorId,kind:'system',humanId:null,sessionId:null,credentialId:binding.runId??null,issuedAt:now,expiresAt:new Date(Date.parse(now)+60000).toISOString(),authenticationEpoch:1},requestId:createUlid(),now,ingress:binding.schedule?'schedule':'queue'};issued.set(ctx,binding);return ctx}
 async function verify(ctx:RequestContext,run:LegacyAutomationRun,trigger=false,replay=false,terminalFailure=false):Promise<SqlPredicate[]>{
  const binding=issued.get(ctx);if(!binding||ctx.principal.id!==actorId||ctx.principal.kind!=='system'||ctx.principal.expiresAt<=clock().toISOString())return denied('Only a live internal launch service context may use retained automation authority')
  if(run.definition.shipped_key&&!['critical-risk','launch-readiness','campaign-brief','weekly-digest'].includes(String(run.definition.shipped_key)))return denied('This definition has no retained deterministic service capability')
  const definition=await base.db.prepare('SELECT * FROM automations WHERE id=?').bind(run.automationId).first<Record<string,unknown>>()
  if(!definition||replay&&!definition.enabled||definition.shipped_key!==run.definition.shipped_key||trigger&&(!definition.enabled||Number(definition.definition_version)!==run.definitionVersion||await canonicalHash(definition)!==await canonicalHash(run.definition)))return denied('Shipped definition changed, was disabled, or was substituted')
  const key=String(definition.shipped_key),actions=JSON.parse(String(run.definition.actions_json));if(definition.shipped_key&&JSON.stringify(actions)!==JSON.stringify([{command:({'critical-risk':'escalate-risk','launch-readiness':'readiness','campaign-brief':'request-ai-analysis','weekly-digest':'digest'} as Record<string,string>)[key]}]))return denied('The retained service action was substituted and cannot be changed')
  const guards=[trustedPredicate('EXISTS(SELECT 1 FROM automations WHERE id=? AND version=?)',[run.automationId,Number(definition.version)])]
  if(!definition.shipped_key&&!terminalFailure)guards.push(...(await automationDelegation(base,ctx,run)).guards)
  if(trigger){
   if(!definition.shipped_key){if(definition.trigger_type==='event'){if(binding.eventId!==run.triggerKey||!await base.db.prepare('SELECT 1 FROM admission_events WHERE id=? AND app_id=?').bind(binding.eventId,LAUNCH_APP_ID).first())return denied('Automation requires its committed source event')}else if(!binding.schedule)return denied('Automation requires its saved schedule')}
   else
   if(key==='critical-risk'||key==='campaign-brief'){
    if(binding.eventId!==run.triggerKey)return denied('Run must originate from the bound durable risk event')
    const event=await base.db.prepare("SELECT subject_json,payload_json,cause_run_ids_json FROM admission_events WHERE id=? AND app_id=? AND name IN ('risk.updated','risk.created','campaign.created','campaign.updated','bulk.updated','import.committed')").bind(binding.eventId,LAUNCH_APP_ID).first<{subject_json:string|null;payload_json:string;cause_run_ids_json:string}>();if(!event)return denied('A committed launch risk event is required')
    const payload=JSON.parse(event!.payload_json),subject=event!.subject_json?JSON.parse(event!.subject_json):null,ids=payload.ids??payload.recordIds??(subject?[subject.recordId]:[])
    if(run.subjectIds.some(id=>!ids.includes(id))||JSON.stringify(run.causeRunIds)!==event!.cause_run_ids_json)return denied('Run lineage or subjects differ from the committed event')
    guards.push(trustedPredicate('EXISTS(SELECT 1 FROM admission_events WHERE id=? AND app_id=?)',[binding.eventId!,LAUNCH_APP_ID]))
   }else{if(!binding.schedule||run.subjectIds.length)return denied('Readiness requires the internal workspace scheduler');const settings=await base.db.prepare('SELECT version,timezone FROM workspace_settings LIMIT 1').first<{version:number;timezone:string}>();if(!settings)return denied('Workspace schedule is unavailable');const config=JSON.parse(String(definition.trigger_config_json)),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:settings!.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(clock()).map(p=>[p.type,p.value]));if(Number(parts.hour)!==(key==='weekly-digest'?9:Number(config.hour))||Number(parts.minute)>=15||run.triggerKey!==`schedule:${localDate(ctx.now,settings!.timezone)}`)return denied('Readiness is outside its configured local schedule');guards.push(trustedPredicate('EXISTS(SELECT 1 FROM workspace_settings WHERE version=? AND timezone=?)',[settings!.version,settings!.timezone]))}
  }else{
   if(binding.runId!==run.id&&!(replay&&binding.eventId===run.triggerKey))return denied('Dispatch must be bound to this exact saved run')
   const saved=await base.db.prepare('SELECT definition_json,cause_run_ids_json,trigger_key,definition_version,state,version FROM automation_runs WHERE id=? AND automation_id=?').bind(run.id,run.automationId).first<Record<string,unknown>>()
   if(!saved||!(replay?['Queued','Running','Unknown','Succeeded','Failed','Cancelled','Suppressed']:['Queued','Running','Unknown']).includes(String(saved.state))||Number(saved.definition_version)!==run.definitionVersion||saved.trigger_key!==run.triggerKey||await canonicalHash(JSON.parse(String(saved.definition_json)))!==await canonicalHash({definition:run.definition,subjectIds:run.subjectIds})||String(saved.cause_run_ids_json)!==JSON.stringify(run.causeRunIds))return denied('Dispatch differs from the durable run or its lineage')
   guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND version=?)',[run.id,Number(saved.version)]))
  }
  return guards
 }
 const permit=(ctx:RequestContext,action:string,guards:SqlPredicate[]):AuthorityPermit=>({actor:{id:actorId,kind:'system'},action,appId:LAUNCH_APP_ID,grantId:null,grantVersion:null,policyVersion:1,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]})
 const authority:LegacyAutomationPorts['authority']=async(ctx,input)=>permit(ctx,input.action,await verify(ctx,input.run,input.action==='launch.automation.trigger',false,input.terminalFailure===true))
 const context:LegacyAutomationPorts['context']=async(ctx,run,subjectId)=>{
  await verify(ctx,run)
  if(!run.definition.shipped_key){
   const policy:PolicyPort={async scope(inner,request){await verify(inner,run);const source=await automationDelegation(base,inner,run);return base.policy.scope(source.human,request)},async authorize(inner,request){await verify(inner,run);const source=await automationDelegation(base,inner,run),approved=await base.policy.authorize(source.human,request);return{...approved,actor:{id:actorId,kind:'system'},guards:[...source.guards,...approved.guards],validUntil:inner.principal.expiresAt}}}
   return{...base,policy}
  }
  if(run.definition.shipped_key==='campaign-brief'){
   const campaignId=subjectId??run.subjectIds[0];if(!campaignId||!run.subjectIds.includes(campaignId))return denied('A campaign brief requires its saved campaign')
   const policy:PolicyPort={async scope(inner,request){await verify(inner,run);return campaignOwnerScope(base.db,inner,campaignId,request.entityId,request.purpose)},async authorize(inner,request){if(request.appId!==LAUNCH_APP_ID||request.action!=='launch.analysis.request'||request.cost.length)return denied('Brief capability is read-only');const scope=await campaignOwnerScope(base.db,inner,campaignId,launchEntities.campaign,'provider_context');return permit(inner,request.action,[...await verify(inner,run),...scope.currentAuthorityGuards])}}
   return{...base,policy}
  }
  const policy:PolicyPort={async authorize(inner,request){const guards=[...await verify(inner,run),...await retainedRiskWriteGuards(base.db,inner,run,request)];return permit(inner,request.action,guards)},async scope(){return denied('Retained deterministic capability cannot read provider context or other records')}}
  const notification=async(inner:RequestContext,input:Parameters<NonNullable<LaunchContext['integration']['notification']>>[1])=>{
   const guards=await verify(inner,run)
   if(run.definition.shipped_key==='critical-risk'){
    if(input.kind!=='critical-risk-escalated'||!run.subjectIds.includes(input.subjectId))return denied('Unexpected risk notification')
    const row=await base.db.prepare('SELECT c.owner_id,c.id,c.version FROM risks r JOIN campaigns c ON c.id=r.campaign_id WHERE r.id=? AND c.archived_at IS NULL').bind(input.subjectId).first<{owner_id:string;id:string;version:number}>();if(!row||row.owner_id!==input.operatorId||row.id!==input.campaignId)return denied('Risk recipient or campaign changed');guards.push(trustedPredicate('EXISTS(SELECT 1 FROM campaigns WHERE id=? AND owner_id=? AND version=? AND archived_at IS NULL)',[row.id,row.owner_id,row.version]))
   }else{
    if(input.kind!=='readiness')return denied('Unexpected readiness notification');const settings=await base.db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first<{timezone:string}>(),config=JSON.parse(String(run.definition.trigger_config_json)),today=localDate(inner.now,settings!.timezone),row=await base.db.prepare("SELECT m.version FROM milestones m JOIN campaigns c ON c.id=m.campaign_id WHERE m.id=? AND m.owner_id=? AND m.campaign_id=? AND m.type='Launch' AND m.status!='Complete' AND m.start_date BETWEEN ? AND ? AND c.archived_at IS NULL").bind(input.subjectId,input.operatorId,input.campaignId,today,shiftDate(today,Number(config.leadDays))).first<{version:number}>();if(!row)return denied('Readiness subject, recipient or context changed');guards.push(trustedPredicate('EXISTS(SELECT 1 FROM milestones WHERE id=? AND owner_id=? AND version=?)',[input.subjectId,input.operatorId,row.version]))
   }
   if(!base.integration.notification)return denied('Real notification integration is unavailable');const result=await base.integration.notification(inner,input);return{...result,guards:[...guards,...result.guards]}
  }
  return{db:base.db,policy,integration:{notification}}
 }
 async function authorizeReplay(ctx:RequestContext,command:{appId:string;action:string;actorId:string;result:unknown}){
  if(command.appId!==LAUNCH_APP_ID||command.actorId!==actorId||!['launch.automation.trigger','launch.automation.execute'].includes(command.action))return denied('Stored command is outside the retained service surface')
  const result=command.result as {value?:{runId?:string};runId?:string},runId=result.value?.runId??result.runId;if(!runId)return denied('Stored command lacks its exact run identity')
  const row=await base.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(runId).first<Record<string,unknown>>();if(!row)return denied('Stored run is unavailable');const data=JSON.parse(String(row.definition_json))
  await verify(ctx,{id:runId,automationId:String(row.automation_id),definitionVersion:Number(row.definition_version),definition:data.definition,subjectIds:data.subjectIds,causeRunIds:JSON.parse(String(row.cause_run_ids_json)),triggerKey:String(row.trigger_key),retryOf:row.retry_of?String(row.retry_of):null},false,true)
 }
 return{authority,context,authorizeReplay,eventContext:(eventId:string)=>issue({eventId}),scheduleContext:()=>issue({schedule:true}),dispatchContext:(runId:string)=>issue({runId})}
}
