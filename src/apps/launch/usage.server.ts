import type {PolicyPort,RequestContext} from '../../domains/authority/ports'
import {launchAnalysisContext} from './analysis.server'
import {createLaunchAnalysisReader} from './analysis-reader.server'
import type {Money} from '../../contracts/primitives'
type Row={id:string;request_id:string|null;created_at:number;local_day:string;feature:string;model:string;state:string;input_tokens:number|null;output_tokens:number|null;reported_cost_json:string|null;duration_ms:number|null;actor_id:string|null;automation_run_id:string|null;input_json:string|null;analysis_id:string|null}
/** Usage follows current source visibility; metric storage contains no copied record text or identities. */
export function createLaunchUsage(db:D1Database,policy:PolicyPort){return async(ctx:RequestContext)=>{
 const rows=await db.prepare('SELECT c.*,r.actor_id,r.automation_run_id,r.input_json,r.analysis_id FROM launch_model_calls c LEFT JOIN launch_analysis_requests r ON r.id=c.request_id ORDER BY c.created_at DESC,c.id DESC LIMIT 1000').all<Row>(),reader=createLaunchAnalysisReader(db,policy),calls=[]
 for(const row of rows.results){
  if(!row.input_json)continue
  const input=JSON.parse(row.input_json)
  try{if(row.analysis_id)await reader.get(ctx,row.analysis_id);else{if(input.feature==='lens-proposal'&&row.actor_id!==ctx.principal.id)continue;await launchAnalysisContext({db,policy,integration:{}},ctx,input)}}catch{continue}
  calls.push({id:row.id,day:row.local_day,feature:row.feature,model:row.model,state:row.state,inputTokens:row.input_tokens,outputTokens:row.output_tokens,reportedCost:row.reported_cost_json?JSON.parse(row.reported_cost_json) as Money:null,durationMs:row.duration_ms,createdAt:new Date(row.created_at).toISOString(),subject:input.campaignId??input.lensId??null,operatorId:row.automation_run_id?null:row.actor_id,runId:row.automation_run_id})
 }
 const groups=new Map<string,{day:string;purpose:string;requests:number;inputTokens:number|null;outputTokens:number|null;cost:Money[]|null}>()
 for(const call of calls){const key=call.day+':'+call.feature,group=groups.get(key)??{day:call.day,purpose:call.feature,requests:0,inputTokens:0,outputTokens:0,cost:[]};group.requests++;group.inputTokens=group.inputTokens===null||call.inputTokens===null?null:group.inputTokens+call.inputTokens;group.outputTokens=group.outputTokens===null||call.outputTokens===null?null:group.outputTokens+call.outputTokens;group.cost=group.cost===null||call.reportedCost===null?null:[...group.cost,call.reportedCost];groups.set(key,group)}
 return{calls,usage:[...groups.values()]}
}}
