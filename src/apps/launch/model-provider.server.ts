import {sharedBindings} from './sql-bindings.server'
import {analysisSourceGuards} from './analysis-source.server'
import type { LegacyAnalysisPorts } from './analysis.server'
import { launchAnalysisSchema } from './analysis.server'
import type { LaunchContext } from './domain.server'
import type { Json } from '../../contracts/primitives'
import type { ModelContextArtifact } from '../../domains/execution/model-ports'
import {ProviderTransport} from '../../adapters/transport.server'
import { openaiAdapter } from '../../adapters/openai.server'
import { canonicalHash } from '../../domains/admission/canonical'
import { ApiError } from '../../core/registry/errors'
import { localDate } from './milestones.server'
import type { ModelCall } from '../../domains/execution/contracts'
import { and } from '../../domains/admission/sql.server'
import { launchEntities, LAUNCH_APP_ID } from './contracts'
import { launchFieldIds } from './descriptors.server'

type Context=ModelContextArtifact & {text:string;versions:import('../../contracts/primitives').RevisionRef[]}
/** Optional installer-configured AI; one durable call admission is shared across features. */
export function createLaunchModelProvider(context:LaunchContext,env:{AI_PROVIDER_API_KEY?:string;AI_MODEL?:string}):LegacyAnalysisPorts{
 env={AI_PROVIDER_API_KEY:env.AI_PROVIDER_API_KEY?.trim(),AI_MODEL:env.AI_MODEL?.trim()}
 const adapter=openaiAdapter({async resolve(){if(!env.AI_PROVIDER_API_KEY)throw new ApiError('unconfigured','AI_PROVIDER_API_KEY is required');return{token:env.AI_PROVIDER_API_KEY,accountId:'installation',scopes:['responses']}}},value=>launchAnalysisSchema.validate(value,[]),new ProviderTransport((input,init)=>fetch(input,init)))
 return{
  async profile(){if(!env.AI_PROVIDER_API_KEY||!env.AI_MODEL)throw new ApiError('unconfigured','AI_PROVIDER_API_KEY and AI_MODEL are required');return{profileId:'installation-launch',maximumCost:{currency:'USD',scale:6,minor:'0'}}},
  async context(_ctx,input){const text=JSON.stringify(input.data),sha256=await canonicalHash(input.data);return{id:sha256,sha256,purpose:input.purpose,sourceRefs:[],fieldIds:input.fieldIds,expiresAt:input.expiresAt,providerDestination:'https://api.openai.com/v1/responses',text,versions:input.versions} as Context},
  model:{async generate(ctx,task,validate){
   if(!env.AI_MODEL||!env.AI_PROVIDER_API_KEY)throw new ApiError('unconfigured','AI_PROVIDER_API_KEY and AI_MODEL are required')
   const artifact=task.context as Context
   if(!artifact.text||await canonicalHash(JSON.parse(artifact.text))!==artifact.sha256)throw new ApiError('validation','Analysis context integrity failed')
   const id=task.requestId!,prior=await context.db.prepare('SELECT state FROM launch_model_calls WHERE id=?').bind(id).first()
   if(prior)throw new ApiError('unknown_outcome','This AI call has already started; its original outcome is retained and will not be sent twice')
   const settings=await context.db.prepare('SELECT ai_enabled,ai_daily_ceiling,timezone,version FROM workspace_settings LIMIT 1').first<{ai_enabled:number;ai_daily_ceiling:number;timezone:string;version:number}>()
   if(!settings?.ai_enabled)throw new ApiError('unconfigured','AI is disabled; enable a configured provider in settings')
   const permit=await context.policy.authorize(ctx,{appId:LAUNCH_APP_ID,action:'launch.analysis.request',expected:[],cost:[],inputHash:artifact.sha256,commandId:id,targetEntityId:launchEntities.campaign,fieldIds:Object.values(launchFieldIds.campaign)}),guard=and(...permit.guards,...await analysisSourceGuards(context,ctx,artifact.versions))
   const started=Date.now(),day=localDate(ctx.now,settings.timezone),bindings=sharedBindings(),p=bindings.bind
   const admitted=await context.db.prepare(`INSERT INTO launch_model_calls(id,created_at,updated_at,local_day,feature,model,request_id,state)
    SELECT ${p(id)},${p(started)},${p(started)},${p(day)},${p(task.purpose)},${p(env.AI_MODEL)},${p(id)}, 'running' WHERE (SELECT count(*) FROM launch_model_calls WHERE local_day=${p(day)})<${p(settings.ai_daily_ceiling)}
    AND EXISTS(SELECT 1 FROM workspace_settings WHERE version=${p(settings.version)} AND ai_enabled=1) AND (${bindings.predicate(guard)})`)
    .bind(...bindings.values).run()
   if(!admitted.meta.changes)throw new ApiError('budget_exhausted',`AI daily ceiling of ${settings.ai_daily_ceiling} calls reached, or current authority changed`)
   const call:ModelCall={id,version:1,createdAt:new Date(started).toISOString(),updatedAt:new Date(started).toISOString(),profileId:'installation-launch',model:env.AI_MODEL,feature:task.purpose,subject:null,sourceVersions:[],state:'running',inputTokens:null,outputTokens:null,reportedCost:null,durationMs:null,providerRequestId:null,outputArtifactId:null}
   let code:string|null=null,message:string|null=null
   try{
    const result=await adapter.execute({attemptId:id,commandId:id,connectionId:'installation-launch',idempotencyKey:id,canonicalInputHash:artifact.sha256,deadline:new Date(started+60000).toISOString(),firstPossibleEffectAt:new Date(started).toISOString(),externalId:null,input:{model:env.AI_MODEL,purpose:task.purpose,instructions:launchAnalysisSchema.instructions,context:artifact.text,schemaName:'launch_analysis_v1',schema:launchAnalysisSchema.schema,maxOutputTokens:8000,authorizedSourceIds:[]} as Json})
    const value=('value'in result?result.value:null) as {usage?:{inputTokens:number;outputTokens:number};model?:string;output?:unknown;reportedCost?:import('../../contracts/primitives').Money|null}|null
    call.reportedCost=value?.reportedCost??null;call.inputTokens=value?.usage?.inputTokens??null;call.outputTokens=value?.usage?.outputTokens??null;call.model=value?.model??env.AI_MODEL
    if(result.state!=='confirmed'){call.state=result.state==='partial'?'invalid':result.state==='refused'?'refused':'unavailable';throw new ApiError(result.state==='refused'?(result.code==='rate_limited'?'rate_limited':'provider_refused'):result.state==='partial'?'invalid_provider_output':'provider_unavailable',result.message)}
    const output=validate(value?.output);call.state='succeeded';call.providerRequestId=result.requestId
    return{value:output,call,sourceRefs:task.context.sourceRefs}
   }catch(error){if(call.state==='running')call.state='failed';code=error instanceof Error&&'code'in error?String(error.code):'invalid_provider_output';message=error instanceof Error?error.message:'AI provider failed';throw error}
   finally{call.durationMs=Date.now()-started;call.updatedAt=new Date().toISOString();await context.db.prepare('UPDATE launch_model_calls SET updated_at=?,state=?,model=?,input_tokens=?,output_tokens=?,duration_ms=?,reported_cost_json=?,error_code=?,error_message=? WHERE id=?').bind(Date.now(),call.state,call.model,call.inputTokens,call.outputTokens,call.durationMs,call.reportedCost?JSON.stringify(call.reportedCost):null,code,message,id).run()}
  }},
 }
}
