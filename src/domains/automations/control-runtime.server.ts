import type {PolicyPort,RequestContext} from '../authority/ports'
import type {createRecordReader} from '../records/query.server'
import type {DescriptorRegistry} from '../records/descriptors.server'
import type {Filter} from '../records/contracts'
import type {createAutomationEffects} from './effects.server'
import {prepareControlPlan,plannedAction,type ControlSnapshot,type PlannedAction} from './control-plan.server'
import {createAutomationRunStore,type AutomationRun} from './run-store.server'
import {matchesFilter} from '../records/evaluated-query'
import {resolveBackgroundContext} from '../authority/background.server'
import {and,identifier,trustedPredicate} from '../admission/sql.server'
import {AuthorityError} from '../authority/errors'
import {AdmissionError} from '../admission/errors'
import {automationEmailDue} from './email-timing.server'

export function createAutomationControlRuntime(deps:{db:D1Database;appOrigin:string;policy:PolicyPort;reader:ReturnType<typeof createRecordReader>;descriptors:DescriptorRegistry;effects:ReturnType<typeof createAutomationEffects>;clock?:()=>Date}){
 const {db,policy,reader,descriptors,effects}=deps,store=createAutomationRunStore(db,deps.clock)
 async function context(run:AutomationRun,ingress:'queue'|'schedule'){
  if(!run.credential_id)throw new AuthorityError('grant_revoked','Automation approval is unavailable.')
  const ctx=await resolveBackgroundContext(db,{credentialId:run.credential_id,principalId:run.principal_id,requestId:run.id,audience:`${deps.appOrigin}/api/v1`,ingress})
  return {...ctx,causeRunIds:[...JSON.parse(run.cause_run_ids_json),run.id]}
 }
 async function matches(ctx:RequestContext,saved:ControlSnapshot,filter:Filter|undefined){
  if(!filter)return true
  const ref=saved.event.ref,scope=await policy.scope(ctx,{...ref,purpose:'read'}),record=await reader.record(ctx,scope,ref),d=descriptors.get(ref.appId,ref.entityId)
  return matchesFilter(record,filter,new Set(d.schema.fields.filter(field=>field.type==='number'||field.type==='computed'&&field.resultType==='number').map(field=>field.id)),(deps.clock?.()??new Date()).toISOString())
 }
 async function branch(ctx:RequestContext,run:AutomationRun,saved:ControlSnapshot,entry:PlannedAction){
  if(entry.path===undefined)return true
  const key=String(entry.step),step=saved.definition.steps![entry.step]
  if(step.kind!=='branch')throw new Error('Stored branch is unavailable')
  if(saved.choices?.[key]===undefined){
   let chosen=-1
   for(const [index,path]of step.paths.entries())if(await matches(ctx,saved,path.when)){chosen=index;break}
   await db.prepare("UPDATE automation_runs SET definition_json=json_set(definition_json,?,?) WHERE id=? AND json_type(definition_json,?) IS NULL").bind(`$.choices.\"${key}\"`,chosen,run.id,`$.choices.\"${key}\"`).run()
   const current=await db.prepare('SELECT definition_json FROM automation_runs WHERE id=?').bind(run.id).first<{definition_json:string}>()
   saved.choices=JSON.parse(current!.definition_json).choices
  }
  return saved.choices![key]===entry.path
 }
 return async(run:AutomationRun,ingress:'queue'|'schedule')=>{
  let saved:ControlSnapshot
  try{saved=await prepareControlPlan(db,policy,reader,await context(run,ingress),run)}catch(error){await store.finish(run.id,error instanceof AuthorityError?'Cancelled':'Failed',error instanceof AdmissionError?error.code:'control_plan_failed',error instanceof AdmissionError?error.message:'The control plan could not be prepared.');return}
  const actions=await store.actions(run.id);if(actions.length<saved.plan.length)return
  const failedItems=new Set<string>();let partial=false,processed=0
  for(const step of actions){
   const entry=saved.plan[step.position],action=plannedAction(saved,entry),item=entry.item?`${entry.step}:${entry.item}`:null
   if(step.state==='Complete'||step.state==='Skipped')continue
   if(step.state==='Unknown'){await store.finish(run.id,'Unknown','effect_unknown');return}
   if(step.state==='Failed'){if(item){partial=true;failedItems.add(item);continue}await store.finish(run.id,'Failed','action_failed');return}
   if(item&&failedItems.has(item)){await store.markSkipped(step.id,'An earlier action on this item failed.');continue}
   if(processed++>=20)return
   const ref={...saved.event.ref,recordId:entry.recordId},itemRun={...run,definition_json:JSON.stringify({...saved,event:{...saved.event,ref}})}
   if(step.state==='Running'){
    const result=await effects.recover(itemRun,step,action);if(!result)return
    await store.actionFinished(step.id,result.state,result.result,result.errorCode??null)
    if(result.state==='Complete')continue
    if(result.state==='Unknown'){await store.finish(run.id,'Unknown',result.errorCode??null);return}
    if(item){partial=true;failedItems.add(item);continue}await store.finish(run.id,'Failed',result.errorCode??null);return
   }
   let claimed=false
   try{
    const ctx=await context(run,ingress)
    if(!await branch(ctx,run,saved,entry)||!await matches(ctx,saved,entry.when)||!await matches(ctx,saved,action.when)){await store.markSkipped(step.id,'The step condition did not match.');continue}
    const scope=await policy.scope(ctx,{...ref,purpose:['email','webhook','slack'].includes(action.kind)?'export':'read'}),d=descriptors.get(ref.appId,ref.entityId)
    let record
    try{record=await reader.record(ctx,scope,ref)}catch(error){if(item&&error instanceof AdmissionError&&['not_found','forbidden'].includes(error.code)){await store.markSkipped(step.id,'The item is no longer readable.');continue}throw error}
    const subject=trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)}=? AND (${scope.rowPredicate.sql}))`,[ref.recordId,...scope.rowPredicate.values])
    const guard=and(...scope.currentAuthorityGuards,subject,trustedPredicate('EXISTS(SELECT 1 FROM automations WHERE id=? AND enabled=1)',[run.automation_id]))
    const authorize=async()=>{if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new AuthorityError('grant_revoked','Automation authority changed before dispatch.')}
    if(action.kind==='update'&&!scope.writableFieldIds.includes(action.fieldId))throw new AuthorityError('forbidden','The item field is no longer writable.')
    if(action.kind==='email'){const now=(deps.clock?.()??new Date()).getTime(),due=await automationEmailDue(db,now);if(due>now){await store.hold(step.id,due);return}}
    claimed=await store.claim(run,step,guard);if(!claimed)return
    itemRun.definition_json=JSON.stringify({...saved,event:{...saved.event,ref,version:record.version}})
    const result=await effects.execute(ctx,itemRun,step,action,scope,subject,record.version,authorize)
    await store.actionFinished(step.id,result.state,result.result,result.errorCode??null)
    if(result.state==='Complete')continue
    if(result.state==='Unknown'){await store.finish(run.id,'Unknown',result.errorCode??null);return}
    if(item){partial=true;failedItems.add(item);continue}await store.finish(run.id,'Failed',result.errorCode??null);return
   }catch(error){
    const code=error instanceof AuthorityError||error instanceof AdmissionError?error.code:'automation_effect_failed',unknown=claimed&&!(error instanceof AuthorityError)&&!(error instanceof AdmissionError)&&['email','webhook','slack'].includes(action.kind)
    if(claimed)await store.actionFinished(step.id,unknown?'Unknown':'Failed',{},code)
    if(unknown){await store.finish(run.id,'Unknown',code);return}
    if(item&&!(error instanceof AuthorityError)){partial=true;failedItems.add(item);if(!claimed)await store.reject(step.id,code);continue}
    await store.finish(run.id,error instanceof AuthorityError?'Cancelled':'Failed',code);return
   }
  }
  await store.finish(run.id,partial?'Partial':'Complete',partial?'repeat_items_failed':null)
 }
}
