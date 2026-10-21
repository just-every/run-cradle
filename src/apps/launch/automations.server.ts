import { prepareAutomationRetry } from './automation-retry.server'
import { parseSchedule } from './schedule'
import type { CommandInput,Json } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { registerTable,eq,trustedPredicate } from '../../domains/admission/sql.server'
import { createUlid } from '../../core/shared/ids'
import seed from '../../../seed.json' with { type: 'json' }
import { automationDefinition,builtInAutomationActions } from './contracts'
import { tables } from './storage.server'
import { emptyChange,load,versionGuard,plan,fail,toWire,recordChange,type LaunchContext } from './domain.server'
const authorities=registerTable('launch_automation_authorities',['automation_id','definition_version','principal_json'])
export const runTable=registerTable('automation_runs',['id','created_at','updated_at','version','automation_id','definition_version','subject_id','state','queued_at','started_at','finished_at','affected_count','error_code','error_message','trigger_key','definition_json','cause_run_ids_json','retry_of','initiated_by_id'])
export const actionTable=registerTable('launch_automation_actions',['id','run_id','position','idempotency_key','state','result_json','error_code','error_message','started_at','finished_at'])
/** AUTO-001: an event trigger names a product event declared in seed.json extensionPoints.events. */
export const declaredEvents:readonly string[]=seed.extensionPoints.events
/** Any other action must be a command contributed through jobs.commands.v1, with input its own schema accepts. */
function validateActions(context:LaunchContext,actions:{command:string;input?:unknown}[]){
 for(const action of actions)if(!(builtInAutomationActions as readonly string[]).includes(action.command)){
  if(!context.automationCommands)fail(`Automation action ${action.command} is not a built-in action or a command contributed through jobs.commands.v1`)
  context.automationCommands!.validate(action.command,action.input)
 }
}
const knownZone=(zone:string)=>{try{new Intl.DateTimeFormat('en',{timeZone:zone});return true}catch{return false}}
export async function prepareAutomation(context:LaunchContext,ctx:RequestContext,input:CommandInput<Record<string,unknown>>,operation:string){
 const set=emptyChange(),now=Date.parse(ctx.now)
 if(operation==='retry')return prepareAutomationRetry(context,ctx,input)
 const id=String(input.input.id??createUlid()),before=input.input.id?await load(context.db,'automation',id):null;if(before)versionGuard(set,'automation',before,input.expected)
 if(operation==='enable'||operation==='disable'){
  if(!before)fail('Automation was not found');
  if(operation==='enable') {
   const config=JSON.parse(String(before!.trigger_config_json))
   const events=[config.event,...(Array.isArray(config.events)?config.events:[])].filter(Boolean)
   if(before!.trigger_type==='event'&&(!events.length||events.some(event=>!declaredEvents.includes(String(event).endsWith('.v1')?String(event):String(event)+'.v1'))))fail('Configure a declared product event before enabling this automation')
   if(before!.trigger_type==='schedule'&&!before!.shipped_key&&!parseSchedule(String(config.localRule)))fail('Configure a daily, weekly or hourly schedule before enabling this automation')
   if(!before!.shipped_key)validateActions(context,JSON.parse(String(before!.actions_json)))
  }
  const enabled=operation==='enable'?1:0;set.mutations.push({kind:'update',table:tables.automation,set:{enabled,version:before!.version+1,definition_version:Number(before!.definition_version)+1,updated_at:now},where:eq(tables.automation,'id',id),expectedRows:1})
  if(enabled&&!before!.shipped_key)set.mutations.push({kind:'insert',table:authorities,row:{automation_id:id,definition_version:Number(before!.definition_version)+1,principal_json:JSON.stringify(ctx.principal)}})
  if(!enabled){const runs=await context.db.prepare("SELECT id,version FROM automation_runs WHERE automation_id=? AND state='Queued'").bind(id).all<{id:string;version:number}>();set.guards.push(trustedPredicate("(SELECT COUNT(*) FROM automation_runs WHERE automation_id=? AND state='Queued')=?",[id,runs.results.length]));for(const run of runs.results)set.mutations.push({kind:'update',table:runTable,set:{state:'Cancelled',version:run.version+1,updated_at:now,finished_at:now},where:eq(runTable,'id',run.id),expectedRows:1})}
  recordChange(set,ctx,'automation',before,{...before!,enabled,version:before!.version+1,updated_at:now},`automation.${operation}`)
  return plan(context,ctx,input,`launch.automation.${operation}`,set,{...toWire(before!),enabled:Boolean(enabled),version:before!.version+1,definitionVersion:Number(before!.definition_version)+1},'automation')
 }
 if(before?.shipped_key)fail('Shipped automations only permit enable/disable; readiness lead time/hour are workspace settings')
 const definition=automationDefinition.parse(input.input.definition);if(definition.trigger.kind==='event'&&!declaredEvents.includes(definition.trigger.event))fail(`Undeclared product event ${definition.trigger.event}`);if(definition.trigger.kind==='schedule'){if(!knownZone(definition.trigger.timezone))fail(`Unknown timezone ${definition.trigger.timezone}`);if(!parseSchedule(definition.trigger.localRule))fail('Schedule must be hourly, daily HH:mm or weekly d HH:mm; more than hourly is forbidden')}
 validateActions(context,definition.actions)
 const row={id,created_at:before?.created_at??now,updated_at:now,version:(before?.version??0)+1,name:definition.name,trigger_type:definition.trigger.kind,trigger_config_json:JSON.stringify(definition.trigger),actions_json:JSON.stringify(definition.actions),enabled:Number(definition.enabled),definition_version:Number(before?.definition_version??0)+1,shipped_key:null};set.mutations.push(before?{kind:'update',table:tables.automation,set:row,where:eq(tables.automation,'id',id),expectedRows:1}:{kind:'insert',table:tables.automation,row});set.mutations.push({kind:'insert',table:authorities,row:{automation_id:id,definition_version:row.definition_version,principal_json:JSON.stringify(ctx.principal)}});recordChange(set,ctx,'automation',before,row,'automation.saved');return plan(context,ctx,input,'launch.automation.save',set,{...definition,id,version:row.version,definitionVersion:row.definition_version,createdAt:new Date(row.created_at).toISOString(),updatedAt:ctx.now} as Json,'automation')
}
