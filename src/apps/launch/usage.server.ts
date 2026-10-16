import {sharedBindings} from './sql-bindings.server'
import type {PolicyPort,RequestContext} from '../../domains/authority/ports'
import type {Money} from '../../contracts/primitives'
import {LAUNCH_APP_ID,launchEntities} from './contracts'
import {launchFieldIds} from './descriptors.server'
import {and} from '../../domains/admission/sql.server'
type Row={id:string;request_id:string|null;created_at:number;local_day:string;feature:string;model:string;state:string;input_tokens:number|null;output_tokens:number|null;reported_cost_json:string|null;duration_ms:number|null;actor_id:string|null;automation_run_id:string|null;input_json:string}
type Group={day:string;purpose:string;requests:number;inputTokens:number|null;outputTokens:number|null;cost:string|null}
const sourceTables={campaign:'campaigns',deliverable:'deliverables',milestone:'milestones',risk:'risks',decision:'decisions',lens:'lenses'} as const
const callsLimit=100
/** Shared current scopes authorize all history in SQL; only the recent call detail is bounded. */
export function createLaunchUsage(db:D1Database,policy:PolicyPort){return async(ctx:RequestContext)=>{
 try{await policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,purpose:'read'})}catch{return{calls:[],usage:[],callsLimit}}
 const allowed:string[]=[],bindings=sharedBindings(),{values,bind:parameter}=bindings
 const actor=parameter(ctx.principal.id)
 for(const [kind,table]of Object.entries(sourceTables) as [keyof typeof sourceTables,string][]){
  try{
   const scope=await policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],purpose:'read'})
   if(Object.values(launchFieldIds[kind]).some(field=>!scope.readableFieldIds.includes(field)))continue
   const guard=and(scope.rowPredicate,...scope.currentAuthorityGuards),predicate=bindings.predicate(guard)
   allowed.push(`(json_extract(source.value,'$.ref.appId')=${parameter(LAUNCH_APP_ID)} AND json_extract(source.value,'$.ref.entityId')=${parameter(launchEntities[kind])} AND EXISTS(SELECT 1 FROM ${table} WHERE id=json_extract(source.value,'$.ref.recordId') AND (${predicate})))`)
  }catch{/* An inaccessible source never contributes its call or metrics. */}
 }
 const cte=`WITH visible AS (
  SELECT c.*,r.actor_id,r.automation_run_id,r.input_json FROM launch_model_calls c
  JOIN launch_analysis_requests r ON r.id=c.request_id LEFT JOIN launch_analyses a ON a.id=r.analysis_id
  WHERE r.task_json IS NOT NULL AND (json_extract(r.input_json,'$.feature')<>'lens-proposal' OR r.actor_id=${actor})
  AND NOT EXISTS(SELECT 1 FROM json_each(COALESCE(a.input_versions_json,json_extract(r.task_json,'$.source.versions'),'[]')) source WHERE NOT (${allowed.join(' OR ')||'0'}))
 )`
 const [recent,aggregate]=await db.batch([
  db.prepare(`${cte} SELECT * FROM visible ORDER BY created_at DESC,id DESC LIMIT ${callsLimit}`).bind(...values),
  db.prepare(`${cte} SELECT local_day AS day,feature AS purpose,count(*) AS requests,
   CASE WHEN count(input_tokens)=count(*) THEN sum(input_tokens) END AS inputTokens,
   CASE WHEN count(output_tokens)=count(*) THEN sum(output_tokens) END AS outputTokens,
   CASE WHEN count(reported_cost_json)=count(*) THEN json_group_array(reported_cost_json) END AS cost
   FROM visible GROUP BY local_day,feature ORDER BY local_day DESC,feature`).bind(...values),
 ])
 const calls=(recent!.results as Row[]).map(row=>{const input=JSON.parse(row.input_json);return{id:row.id,day:row.local_day,feature:row.feature,model:row.model,state:row.state,inputTokens:row.input_tokens,outputTokens:row.output_tokens,reportedCost:row.reported_cost_json?JSON.parse(row.reported_cost_json) as Money:null,durationMs:row.duration_ms,createdAt:new Date(row.created_at).toISOString(),subject:input.campaignId??input.lensId??null,operatorId:row.automation_run_id?null:row.actor_id,runId:row.automation_run_id}})
 return{calls,usage:(aggregate!.results as Group[]).map(group=>({...group,cost:group.cost?JSON.parse(group.cost).map((value:string)=>JSON.parse(value) as Money):null})),callsLimit}
}}
