import {createLaunchUsage} from '../../../apps/launch/usage.server'
import {createLaunchAutomationEffects} from '../../../apps/launch/automation-effects.server'
import {launchSourceRelease} from '../../../apps/launch/source-release.server'
import { z } from 'zod'
import type { Platform } from '../../platform'
import type { ServerFoundation } from '../foundation.server'
import type { Json,CommandInput } from '../../../contracts/primitives'
import type { RequestContext,Principal } from '../../../domains/authority/ports'
import { createLegacyAutomationRuntime,type LegacyAutomationRun } from '../../../apps/launch/automation-runtime.server'
import { createLegacyAutomationAuthority } from '../../../apps/launch/service-authority.server'
import { createChannelsIntegration } from '../../../domains/channels/integration.server'
import { createChannelSchedules } from '../../../domains/channels/schedules.server'
import { createLegacyDigestProjection } from '../../../domains/channels/digest.server'
import { prepareAnalysisRequest,executeAnalysisRequest } from '../../../apps/launch/analysis-requests.server'
import { createLaunchModelProvider } from '../../../apps/launch/model-provider.server'
import { createLaunchAnalysisReader } from '../../../apps/launch/analysis-reader.server'
import { launchCommandSchema,LAUNCH_APP_ID } from '../../../apps/launch/contracts'
import { canonicalHash } from '../../../domains/admission/canonical'
import { createUlid } from '../../shared/ids'
import { ApiError } from '../../registry/errors'
import type { DomainEvent } from '../../../domains/admission/ports'

export function createInstalledLaunch(platform:Platform,foundation:ServerFoundation,clock=()=>new Date()){
 const db=platform.bindings.DB,channels=createChannelsIntegration(db),context={db,policy:foundation.policy,integration:channels,releaseId:launchSourceRelease(platform.bindings.INSTALLATION_RELEASE_ID)}
 const release=()=>{if(!context.releaseId)throw new ApiError('unconfigured','INSTALLATION_RELEASE_ID is required for launch background work');return context.releaseId}
 const service=createLegacyAutomationAuthority(context,clock),schedules=createChannelSchedules(db,channels),project=createLegacyDigestProjection(db)
 const analysis=createLaunchAnalysisReader(db,foundation.policy)
 async function executeAnalysis(id:string,provided?:{ctx:RequestContext;context:typeof context}){
  const row=await db.prepare('SELECT authority_json,state,updated_at FROM launch_analysis_requests WHERE id=?').bind(id).first<{authority_json:string|null;state:string;updated_at:number}>()
  if(row?.state==='Complete')return
  if(row?.state==='Running')return{state:'Running'}
  if(!row?.authority_json)throw new ApiError('forbidden','Original analysis requesting authority is unavailable')
  const ctx=provided?.ctx??{principal:JSON.parse(row.authority_json) as Principal,requestId:id,now:clock().toISOString(),ingress:'queue' as const}
  const source=provided?.context??context
  try{return await executeAnalysisRequest(source,createLaunchModelProvider(source,platform.bindings),foundation.admission,ctx,id)}catch(error){await db.prepare("UPDATE launch_analysis_requests SET state='Failed',error_code=?,error_message=?,updated_at=?,version=version+1 WHERE id=? AND state IN ('Queued','Running')").bind(error instanceof Error&&'code'in error?String(error.code):'provider_failure',error instanceof Error?error.message:'Analysis failed',clock().getTime(),id).run();throw error}
 }
 const customEffects=createLaunchAutomationEffects(platform.bindings,service.context)
 const automation=createLegacyAutomationRuntime(context,foundation.admission,{releaseId:context.releaseId??'',authority:service.authority,context:service.context,async external(ctx,input){
  if(input.action==='digest'&&input.run.definition.shipped_key==='weekly-digest')return{...await schedules.digest(ctx,project),state:'Complete',result:{delivered:'weekly-digest'} as Json,outbox:[]}
  if(input.action!=='request-ai-analysis')return customEffects(ctx,input)
  for(const campaignId of input.run.definition.shipped_key?input.run.subjectIds:[String((input.input as Record<string,unknown>).campaignId)]){
   const scoped=await service.context(ctx,input.run,campaignId)
   const id=(await canonicalHash({key:input.idempotencyKey,campaignId,retryRun:input.run.retryOf?input.run.id:null})).slice(0,26).toUpperCase(),old=await db.prepare('SELECT state,error_code,error_message FROM launch_analysis_requests WHERE id=?').bind(id).first<{state:string;error_code:string|null;error_message:string|null}>()
   if(old?.state==='Complete')continue
   if(old?.state==='Failed')throw new ApiError('provider_unavailable',old.error_message??'Analysis failed')
   if(!old){const p=await prepareAnalysisRequest(scoped,ctx,{commandId:id,expected:[],input:{...(input.run.definition.shipped_key==='campaign-brief'?{feature:'campaign-brief',campaignId}:{feature:'campaign-brief',...input.input as Record<string,unknown>})}},release());p.outbox=[];await foundation.admission.commit(ctx,p)}
   await executeAnalysis(id,{ctx,context:scoped as typeof context})
   const outcome=await db.prepare('SELECT state FROM launch_analysis_requests WHERE id=?').bind(id).first<{state:string}>();if(outcome?.state!=='Complete')return{guards:[],mutations:[],outbox:[],state:'Waiting',result:{requestId:id,state:outcome?.state??'Unknown'} as Json}
  }
  return{guards:[],mutations:[],outbox:[],state:'Complete',result:{analyses:input.run.subjectIds.length} as Json}
 }})
 const schema=launchCommandSchema('analysis.request')
 foundation.commands.register({action:'launch.analysis.request',description:'Request a read-only launch analysis',inputSchema:z.toJSONSchema(schema) as Json,input:schema,
  visible:async ctx=>{try{await foundation.policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId:'00000000000000000000000701',purpose:'read'});return true}catch{return false}},
  replayIdentity:async(_ctx,input)=>({appId:LAUNCH_APP_ID,canonicalInputHash:await canonicalHash({input:input.input,expected:input.expected})}),
  prepare:(ctx,input)=>prepareAnalysisRequest(context,ctx,input as CommandInput<Record<string,unknown>>,release())})
 async function events(commandId?:string){release();const rows=await db.prepare(`SELECT * FROM admission_events e WHERE app_id=? AND NOT EXISTS(SELECT 1 FROM launch_event_dispatches d WHERE d.event_id=e.id) ${commandId?'AND command_id=?':''} ORDER BY created_at,id LIMIT 200`).bind(LAUNCH_APP_ID,...commandId?[commandId]:[]).all<{id:string;name:string;version:number;subject_json:string|null;payload_json:string;cause_run_ids_json:string}>()
  for(const e of rows.results){await automation.event(service.eventContext(e.id),e.id,{name:e.name,version:e.version,subject:e.subject_json?JSON.parse(e.subject_json):null,payload:JSON.parse(e.payload_json),causeRunIds:JSON.parse(e.cause_run_ids_json)} as DomainEvent);await db.prepare('INSERT OR IGNORE INTO launch_event_dispatches(event_id,processed_at) VALUES(?,?)').bind(e.id,clock().toISOString()).run()}
 }
 async function dispatch(entry:{id:string;action:string;input:Json}){
  release();const input=entry.input as {runId?:string;requestId?:string}
  if(entry.action==='launch.automation.execute'&&input.runId){try{const outcome=await automation.execute(service.dispatchContext(input.runId),input.runId);if('state'in outcome&&outcome.state==='Waiting'&&!('retryAt'in outcome))return}catch(error){const row=await db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(input.runId).first<{state:string}>();if(!row||row.state!=='Failed')throw error}}
  else if(entry.action==='launch.analysis.execute'&&input.requestId){try{const outcome=await executeAnalysis(input.requestId);if(outcome&&'state'in outcome&&outcome.state==='Running')return}catch(error){const row=await db.prepare('SELECT state FROM launch_analysis_requests WHERE id=?').bind(input.requestId).first<{state:string}>();if(!row||!['Failed','Unknown'].includes(row.state))throw error}}
  else throw new ApiError('validation','Invalid launch queue lineage')
  await db.prepare("UPDATE admission_outbox SET state='dispatched',updated_at=? WHERE id=? AND state='pending'").bind(clock().toISOString(),entry.id).run()
 }
 async function scheduled(){release();await db.prepare("UPDATE launch_analysis_requests SET state='Unknown',error_code='provider_unavailable',error_message='Provider outcome was lost after the 60-second deadline; no analysis was stored',updated_at=?,version=version+1 WHERE state='Running' AND updated_at<?").bind(clock().getTime(),clock().getTime()-60000).run();await db.prepare("UPDATE launch_model_calls SET state='unavailable',error_code='provider_unavailable',error_message='Provider outcome was lost after its deadline',updated_at=? WHERE state='running' AND request_id IN (SELECT id FROM launch_analysis_requests WHERE state='Unknown')").bind(clock().getTime()).run();await events();await automation.schedule(service.scheduleContext());const ctx=service.scheduleContext(),effects=await schedules.overdue(ctx)
  if(effects.mutations.length){const action='launch.notification.schedule';await foundation.admission.commit(ctx,{commandId:createUlid(),action,appId:LAUNCH_APP_ID,canonicalInputHash:await canonicalHash({at:ctx.now,effects}),permit:{actor:{id:ctx.principal.id,kind:'system'},action,appId:LAUNCH_APP_ID,grantId:null,grantVersion:null,policyVersion:1,validUntil:ctx.principal.expiresAt,guards:effects.guards,reservationMutations:[],reservationIds:[]},guards:[],mutations:effects.mutations,audit:[],events:[],outbox:[],committedResult:{scheduled:true}})}
  const due=await db.prepare("SELECT id,action,input_json FROM admission_outbox WHERE state='pending' AND action IN ('launch.automation.execute','launch.analysis.execute') AND not_before<=? ORDER BY not_before,id LIMIT 200").bind(clock().toISOString()).all<{id:string;action:string;input_json:string}>();for(const row of due.results)await dispatch({...row,input:JSON.parse(row.input_json)})
 }
 return{events,dispatch,scheduled,analysis,usage:createLaunchUsage(db,foundation.policy)}
}
