import assert from 'node:assert/strict'
import {value,expected} from './launch-installed.mjs'
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
