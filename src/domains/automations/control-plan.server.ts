import type {RequestContext,PolicyPort} from '../authority/ports'
import type {createRecordReader} from '../records/query.server'
import type {RecordAutomationDefinition,RecordAutomationAction} from './contracts'
import type {AutomationRun} from './run-store.server'
import type {Filter} from '../records/contracts'
import {delegationCommandId} from '../authority/user-delegation.server'
import {AdmissionError} from '../admission/errors'
export type PlannedAction={recordId:string;step:number;action:number;path?:number;item?:string;when?:Filter}
export type ControlSnapshot={plan:PlannedAction[];choices?:Record<string,number>;definition:RecordAutomationDefinition;event:{ref:{appId:string;entityId:string;recordId:string};event:string;version:number;commandId:string}}
export function plannedAction(saved:ControlSnapshot,entry:PlannedAction):RecordAutomationAction{
 if(entry.step===-1)return saved.definition.actions[entry.action]
 const step=saved.definition.steps![entry.step]
 return step.kind==='action'?step.action:step.kind==='branch'?(entry.path===-1?step.otherwise!:step.paths[entry.path!].actions)[entry.action]:step.actions[entry.action]
}
/** Resolve every bounded find before the first effect. The immutable selected
 * IDs and action keys survive Worker restart; later records join the next run. */
export async function prepareControlPlan(db:D1Database,policy:PolicyPort,reader:ReturnType<typeof createRecordReader>,ctx:RequestContext,run:AutomationRun):Promise<ControlSnapshot>{
 let saved=JSON.parse(run.definition_json) as ControlSnapshot
 if(!saved.plan){
  const plan:PlannedAction[]=[],ref=saved.event.ref,scope=await policy.scope(ctx,{...ref,purpose:'read'})
  await reader.record(ctx,scope,ref)
  let items=0
  if(!saved.definition.steps)for(let action=0;action<saved.definition.actions.length;action++)plan.push({recordId:ref.recordId,step:-1,action})
  for(const [index,step]of (saved.definition.steps??[]).entries()){
   if(step.kind==='repeat'){
    let cursor:string|undefined
    do{
     const page=await reader.query(ctx,scope,{filter:step.find,limit:100,...(cursor?{cursor}:{})})
     if(items+page.total.value>1000)throw new AdmissionError('capacity_limit',`Repeat finds ${page.total.kind==='at_least'?'at least ':''}${items+page.total.value} records; no action ran. Select at most 1,000 records per run.`)
     for(const row of page.items)for(let action=0;action<step.actions.length;action++)plan.push({recordId:row.id,step:index,action,item:row.id})
     cursor=page.nextCursor??undefined
     if(!cursor)items+=page.total.value
    }while(cursor)
   }else if(step.kind==='branch'){
    for(const [path,branch]of step.paths.entries())for(let action=0;action<branch.actions.length;action++)plan.push({recordId:ref.recordId,step:index,action,path})
    for(let action=0;action<(step.otherwise?.length??0);action++)plan.push({recordId:ref.recordId,step:index,action,path:-1})
   }else for(let action=0;action<(step.kind==='action'?1:step.actions.length);action++)plan.push({recordId:ref.recordId,step:index,action,...(step.kind==='condition'?{when:step.when}:{})})
  }
  const json=JSON.stringify({...saved,plan,choices:{}})
  await db.prepare("UPDATE automation_runs SET definition_json=? WHERE id=? AND state='Queued' AND definition_json=?").bind(json,run.id,run.definition_json).run()
  const current=await db.prepare('SELECT definition_json FROM automation_runs WHERE id=?').bind(run.id).first<{definition_json:string}>()
  saved=JSON.parse(current!.definition_json) as ControlSnapshot
 }
 // A partial staging transaction resumes inserts without changing any key.
 const staged=await db.prepare('SELECT count(*) AS n FROM launch_automation_actions WHERE run_id=?').bind(run.id).first<{n:number}>()
 for(let offset=staged!.n;offset<Math.min(staged!.n+50,saved.plan.length);offset+=50){
  const statements=[]
  for(let position=offset;position<Math.min(offset+50,saved.plan.length);position++){
   const entry=saved.plan[position],id=await delegationCommandId(run.id,`control:${entry.step}:${entry.path??''}:${entry.item??entry.recordId}:${entry.action}`)
   statements.push(db.prepare("INSERT INTO launch_automation_actions(id,run_id,position,idempotency_key,state) SELECT ?,?,?,?,'Pending' WHERE EXISTS(SELECT 1 FROM automation_runs WHERE id=? AND state IN ('Queued','Running')) ON CONFLICT(run_id,position) DO NOTHING").bind(id,run.id,position,id,run.id))
  }
  await db.batch(statements)
 }
 return saved
}
