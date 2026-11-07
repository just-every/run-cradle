import assert from 'node:assert/strict'
import {value,expected,campaign} from './launch-installed.mjs'
const {launchEntities}=await import('../../src/apps/launch/contracts.ts')

// AUTO-001 through the emitted Worker's command door: one definition holding every built-in
// action and the jobs.commands.v1 contribution, its version on every edit, and each refusal.
const count=async(h,sql,...values)=>Number((await h.db.prepare(sql).bind(...values).first()).n)
const current=(h,id)=>h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(id).first()

export async function verifyDefinitions(h,{campaign,owner,risk}){
 const actions=[
  {command:'escalate-risk',input:{id:risk.id,reason:'Escalate from the definition journey'}},
  {command:'create-decision',input:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Definition decision',requesterId:owner,assigneeId:null,priority:'High',dueAt:new Date(Date.now()+86400000).toISOString(),recommendation:'Review',impact:'Definition'}},
  {command:'notify-operator',input:{operatorId:owner,subjectId:campaign.id,title:'Definition notice',body:'Notice body'}},
  {command:'send-email',input:{operatorId:owner,subjectId:campaign.id,title:'Definition email',body:'Email body'}},
  {command:'request-ai-analysis',input:{campaignId:campaign.id}},
  {command:'add-activity',input:{campaignId:campaign.id,message:'Definition activity'}},
  {command:'launch.deliverable.create',input:{fields:{campaignId:campaign.id,title:'Definition deliverable',ownerId:owner,dueDate:null}}},
 ]
 const definition={name:'Every action',enabled:false,trigger:{kind:'event',event:'decision.resolved.v1'},actions}
 const saved=value(await h.command('launch.automation.save',{definition}))
 const monitor=async()=>(await h.read('/api/automations')).automations.find(item=>item.id===saved.id)
 const first=await monitor()
 assert.deepEqual({saved:saved.definitionVersion,name:first.name,enabled:first.enabled,listed:first.definitionVersion,actions:first.actions},{saved:1,name:'Every action',enabled:false,listed:1,actions:actions.map(action=>action.command)})
 const edited=value(await h.command('launch.automation.save',{id:saved.id,definition:{...definition,name:'Every action, edited'}},expected(launchEntities.automation,await current(h,saved.id))))
 const enabled=value(await h.command('launch.automation.enable',{id:saved.id},expected(launchEntities.automation,await current(h,saved.id))))
 const disabled=value(await h.command('launch.automation.disable',{id:saved.id},expected(launchEntities.automation,await current(h,saved.id))))
 assert.deepEqual([edited.definitionVersion,enabled.definitionVersion,disabled.definitionVersion],[2,3,4],'Every edit, enable and disable increments the definition version')
 const listed=await monitor();assert.deepEqual({name:listed.name,enabled:listed.enabled,definitionVersion:listed.definitionVersion},{name:'Every action, edited',enabled:false,definitionVersion:4})
 const stored=async()=>({automations:await count(h,'SELECT count(*) n FROM automations'),authorities:await count(h,'SELECT count(*) n FROM launch_automation_authorities'),events:await count(h,'SELECT count(*) n FROM admission_events')})
 const before=await stored()
 for(const [name,changes,message] of [
  ['Undeclared event',{trigger:{kind:'event',event:'campaign.launched.v1'}},/Undeclared product event campaign\.launched\.v1/],
  ['Every half hour',{trigger:{kind:'schedule',localRule:'every 30 minutes',timezone:'UTC'}},/more than hourly is forbidden/],
  ['Quarter-hour cron',{trigger:{kind:'schedule',localRule:'*/15 * * * *',timezone:'UTC'}},/more than hourly is forbidden/],
  ['Uncontributed command',{actions:[{command:'launch.campaign.delete',input:{id:campaign.id,confirmationCode:campaign.code}}]},/Automation action launch\.campaign\.delete is not a built-in action or a command contributed through jobs\.commands\.v1/],
  ['Unregistered command',{actions:[{command:'launch.rocket.launch',input:{}}]},/Automation action launch\.rocket\.launch is not a built-in action or a command contributed through jobs\.commands\.v1/],
  ['Invalid contributed input',{actions:[{command:'launch.deliverable.create',input:{fields:{campaignId:campaign.id,title:'',ownerId:owner,dueDate:null}}}]},/Automation action launch\.deliverable\.create input does not match its command schema: input\.fields\.title/],
 ]){
  const refused=await h.command('launch.automation.save',{definition:{...definition,name,...changes}},[],400)
  assert.equal(refused.error.code,'validation');assert.match(refused.error.message,message)
 }
 assert.deepEqual(await stored(),before,'A refused definition stores nothing')
 const hourly=value(await h.command('launch.automation.save',{definition:{...definition,name:'Once an hour',trigger:{kind:'schedule',localRule:'hourly',timezone:'UTC'}}}))
 assert.equal(hourly.definitionVersion,1,'An hourly schedule, the most frequent allowed, saves')
}

// The contributed command runs from a committed event through the emitted queue under the run's
// saved authority, is visible through its own campaign read, and a redelivery repeats nothing.
export async function verifyContributedRun(h,{campaign,owner}){
 const worker=await h.runtime.getWorker()
 const definition=value(await h.command('launch.automation.save',{definition:{name:'Mitigation plan',enabled:true,trigger:{kind:'event',event:'risk.created.v1'},actions:[{command:'launch.deliverable.create',input:{fields:{campaignId:campaign.id,title:'Mitigation plan',ownerId:owner,dueDate:null}}}]}}))
 const risk=await h.command('launch.risk.create',{fields:{campaignId:campaign.id,ownerId:owner,title:'Supplier slip',severity:'High',signal:'Late parts',mitigation:'Plan',dueDate:null}})
 const event=[{id:'contributed-event',timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:risk.data.commandId}}]
 await worker.queue('cradle-work',event)
 const run=await h.db.prepare('SELECT * FROM automation_runs WHERE automation_id=?').bind(definition.id).first();assert.equal(run.state,'Queued')
 const outbox=await h.db.prepare("SELECT id FROM admission_outbox WHERE action='launch.automation.execute' AND json_extract(input_json,'$.runId')=?").bind(run.id).first()
 const execute=[{id:'contributed-execute',timestamp:Date.now(),attempts:1,body:{kind:'cradle.outbox.v1',outboxId:outbox.id}}]
 await worker.queue('cradle-work',execute)
 const plans=async()=>(await h.read(`/api/campaigns/${campaign.id}`)).deliverables.filter(item=>item.title==='Mitigation plan')
 const created=await plans();assert.equal(created.length,1,'The contributed command created its deliverable');assert.deepEqual({owner:created[0].owner.id,state:created[0].state},{owner,state:'Open'})
 for(let delivery=0;delivery<2;delivery++){await worker.queue('cradle-work',event);await worker.queue('cradle-work',execute)}
 await h.tick()
 assert.deepEqual(await plans(),created,'Redelivered event and execution messages repeat nothing')
 assert.equal(await count(h,'SELECT count(*) n FROM automation_runs WHERE automation_id=?',definition.id),1)
 const action=await h.db.prepare('SELECT * FROM launch_automation_actions WHERE run_id=?').bind(run.id).first()
 assert.deepEqual({state:action.state,key:action.idempotency_key,deliverable:JSON.parse(action.result_json).id},{state:'Complete',key:`${run.id}:0`,deliverable:created[0].id})
 // AUTO-005: the contributed command's mutation and event carry the run that made them.
 const raised=await h.db.prepare("SELECT cause_run_ids_json FROM admission_events WHERE name='deliverable.created' AND json_extract(subject_json,'$.recordId')=?").bind(created[0].id).first()
 assert.deepEqual(JSON.parse(raised.cause_run_ids_json),[run.id])
 assert.ok(await count(h,'SELECT count(*) n FROM activity_entries WHERE subject_id=? AND automation_run_id=? AND actor_id IS NULL',created[0].id,run.id))
 // AUTO-006: run history names the trigger event, the record the command affected and the action's result.
 const [listed]=(await h.read(`/api/automations/${definition.id}/runs`)).runs
 assert.deepEqual({id:listed.id,state:listed.state,affected:listed.affectedCount,definitionVersion:listed.definitionVersion,trigger:listed.trigger,actions:listed.actions.map(step=>({position:step.position,command:step.command,state:step.state,deliverable:step.result.id,errorCode:step.errorCode}))},
  {id:run.id,state:'Succeeded',affected:1,definitionVersion:1,trigger:{kind:'event',key:run.trigger_key,event:'risk.created.v1'},actions:[{position:0,command:'launch.deliverable.create',state:'Complete',deliverable:created[0].id,errorCode:null}]})
 return {definition,run,risk:value(risk)}
}

// An admitted run keeps its original action and authority when the owner edits the definition.
// Read versions and actions through public history, and distinguish effects on two campaigns.
export async function verifyRetainedDefinition(h){
 const oldCampaign=await campaign(h,'RETAINED'),newCampaign=await campaign(h,'LATER'),worker=await h.runtime.getWorker()
 const oldMessage='Activity from the retained definition',newMessage='Activity from the later definition'
 const oldAction={command:'add-activity',input:{campaignId:oldCampaign.id,message:oldMessage}}
 const newAction={command:'add-activity',input:{campaignId:newCampaign.id,message:newMessage}}
 const definition={name:'Retained definition journey',enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[oldAction]}
 const saved=value(await h.command('launch.automation.save',{definition}))
 assert.deepEqual({version:saved.definitionVersion,actions:saved.actions},{version:1,actions:[oldAction]})
 const history=async()=>(await h.read(`/api/automations/${saved.id}/runs`)).runs
 const monitor=async()=>{
  const item=(await h.read('/api/automations')).automations.find(item=>item.id===saved.id)
  return {version:item.version,definitionVersion:item.definitionVersion,enabled:item.enabled,actions:item.actions}
 }
 assert.deepEqual(await monitor(),{version:saved.version,definitionVersion:1,enabled:true,actions:['add-activity']})
 const effects=async()=>{
  const read=async id=>(await h.read(`/api/campaigns/${id}`)).activity.filter(entry=>[oldMessage,newMessage].includes(entry.description))
  return {old:await read(oldCampaign.id),later:await read(newCampaign.id)}
 }
 assert.deepEqual(await effects(),{old:[],later:[]})
 const eventMessage=response=>[{id:`retained-event-${response.data.commandId}`,timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:response.data.commandId}}]
 const patch=record=>h.command('launch.campaign.patch',{id:record.id,changes:{statusSummary:'Trigger the saved definition'}},expected(launchEntities.campaign,record))
 const oldEvent=eventMessage(await patch(oldCampaign))
 await worker.queue('cradle-work',oldEvent)
 const queued=await history();assert.equal(queued.length,1)
 const original=queued[0]
 const step=run=>({id:run.id,definitionVersion:run.definitionVersion,state:run.state,subjectId:run.subjectId,event:run.trigger.event,actions:run.actions.map(action=>({command:action.command,state:action.state,result:action.result}))})
 const oldQueued={id:original.id,definitionVersion:1,state:'Queued',subjectId:oldCampaign.id,event:'campaign.updated.v1',actions:[{command:'add-activity',state:'Pending',result:null}]}
 assert.deepEqual(step(original),oldQueued,'The committed event admits an original-version run before the edit')
 const edited=value(await h.command('launch.automation.save',{id:saved.id,definition:{...definition,actions:[newAction]}},expected(launchEntities.automation,saved)))
 assert.deepEqual({version:edited.definitionVersion,actions:edited.actions},{version:2,actions:[newAction]})
 assert.deepEqual(await monitor(),{version:edited.version,definitionVersion:2,enabled:true,actions:['add-activity']})
 assert.deepEqual((await history()).map(step),[oldQueued],'Saving a new action leaves the queued original version intact')
 assert.deepEqual(await effects(),{old:[],later:[]},'Admission and editing execute neither action')
 const execution=async run=>{
  const outbox=await h.db.prepare("SELECT id FROM admission_outbox WHERE action='launch.automation.execute' AND json_extract(input_json,'$.runId')=?").bind(run.id).first()
  assert.ok(outbox,'The admitted run has a durable execution message')
  return [{id:`retained-execute-${run.id}`,timestamp:Date.now(),attempts:1,body:{kind:'cradle.outbox.v1',outboxId:outbox.id}}]
 }
 const oldExecute=await execution(original)
 await worker.queue('cradle-work',oldExecute)
 for(let delivery=0;delivery<2;delivery++){await worker.queue('cradle-work',oldEvent);await worker.queue('cradle-work',oldExecute)}
 const completed={command:'add-activity',state:'Complete',result:{activity:true}}
 const oldSucceeded={...oldQueued,state:'Succeeded',actions:[completed]}
 assert.deepEqual((await history()).map(step),[oldSucceeded])
 const retained=await effects()
 assert.deepEqual({old:retained.old.map(entry=>entry.description),later:retained.later},{old:[oldMessage],later:[]},'The retained execution uses only its original target and message, exactly once')
 const newEvent=eventMessage(await patch(newCampaign))
 await worker.queue('cradle-work',newEvent)
 const admitted=await history();assert.equal(admitted.length,2)
 const later=admitted.find(run=>run.id!==original.id)
 const newQueued={id:later.id,definitionVersion:2,state:'Queued',subjectId:newCampaign.id,event:'campaign.updated.v1',actions:[{command:'add-activity',state:'Pending',result:null}]}
 assert.deepEqual(step(later),newQueued,'A later committed trigger uses the edited definition version')
 assert.deepEqual(step(admitted.find(run=>run.id===original.id)),oldSucceeded)
 assert.notEqual(later.trigger.key,original.trigger.key)
 assert.deepEqual(await effects(),retained,'The later trigger also waits for execution')
 const newExecute=await execution(later)
 await worker.queue('cradle-work',newExecute)
 for(let delivery=0;delivery<2;delivery++)for(const message of [oldEvent,newEvent,oldExecute,newExecute])await worker.queue('cradle-work',message)
 const finished=await history();assert.equal(finished.length,2,'Event redelivery creates no additional run after editing')
 assert.deepEqual(step(finished.find(run=>run.id===original.id)),oldSucceeded)
 assert.deepEqual(step(finished.find(run=>run.id===later.id)),{...newQueued,state:'Succeeded',actions:[completed]})
 const result=await effects()
 assert.deepEqual(result.old,retained.old,'Later work and duplicate delivery preserve the original effect unchanged')
 assert.deepEqual(result.later.map(entry=>entry.description),[newMessage],'Only the new target receives the new action, exactly once')
}
