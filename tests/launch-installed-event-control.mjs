import test from 'node:test'
import assert from 'node:assert/strict'
import {setup,value,campaign,expected} from './helpers/launch-installed.mjs'
const {launchEntities}=await import('../src/apps/launch/contracts.ts')

test('[AUTO-003/004] disable after actual event queue admission cancels queued work before any product effect',async()=>{
 const h=await setup({automaticQueues:false});try{
  const c=await campaign(h,'CANCEL'),owner=(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  const created=await h.command('launch.risk.create',{fields:{campaignId:c.id,ownerId:owner,title:'Queued critical risk',severity:'Critical',signal:'Known',mitigation:'Review',dueDate:null}}),risk=value(created),worker=await h.runtime.getWorker()
  await worker.queue('cradle-work',[{id:'admit-event',timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:created.data.commandId}}])
  const run=await h.db.prepare('SELECT * FROM automation_runs WHERE subject_id=?').bind(risk.id).first();assert.equal(run.state,'Queued');assert.equal((await h.db.prepare('SELECT state FROM risks WHERE id=?').bind(risk.id).first()).state,'Watching')
  const definition=await h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(run.automation_id).first();await h.command('launch.automation.disable',{id:definition.id},expected(launchEntities.automation,definition));await h.tick()
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(run.id).first()).state,'Cancelled');assert.equal((await h.db.prepare('SELECT state FROM risks WHERE id=?').bind(risk.id).first()).state,'Watching');assert.equal((await h.db.prepare('SELECT count(*) n FROM decisions WHERE risk_id=?').bind(risk.id).first()).n,0)
  const disabledRisk=value(await h.command('launch.risk.create',{fields:{campaignId:c.id,ownerId:owner,title:'Committed while disabled',severity:'Critical',signal:'Known',mitigation:'Review',dueDate:null}}));const disabledDefinition=await h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(definition.id).first();await h.command('launch.automation.enable',{id:definition.id},expected(launchEntities.automation,disabledDefinition));await h.tick();assert.equal((await h.db.prepare('SELECT state FROM risks WHERE id=?').bind(disabledRisk.id).first()).state,'Watching');assert.equal((await h.db.prepare('SELECT count(*) n FROM automation_runs WHERE subject_id=?').bind(disabledRisk.id).first()).n,0)
 }finally{await h.close()}
})

test('[AUTO-005/011] emitted campaign brief runs at most once per hour and skips unchanged allowed context',async()=>{
 const contexts=[],h=await setup({automaticQueues:false,configuration:{AI_PROVIDER_API_KEY:'network-edge-only',AI_MODEL:'edge-model'},providerFetch:async request=>{assert.equal(request.url,'https://api.openai.com/v1/responses');contexts.push((await request.json()).input[0].content[0].text);return Response.json({id:'edge-'+contexts.length,model:'edge-model',status:'completed',usage:{input_tokens:7,output_tokens:4},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Immutable campaign brief',proposedLens:null})}]}]})}})
 try{
  const settings=(await h.read('/api/v1/settings')).data;await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:10}})
  const c=await campaign(h,'BRIEF'),start=Date.now();await h.tick(start)
  const count=async()=>Number((await h.db.prepare("SELECT count(*) n FROM automation_runs a JOIN automations d ON d.id=a.automation_id WHERE d.shipped_key='campaign-brief'").first()).n)
  assert.equal(await count(),1);assert.equal(contexts.length,1)
  let current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(c.id).first();await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Manual'}},expected(launchEntities.campaign,current));await h.tick(start+3599999);assert.equal(await count(),1);assert.equal(contexts.length,1)
  const field=value(await h.command('launch.custom-field.save',{field:{name:'Excluded from brief',type:'text'}}));current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(c.id).first();await h.command('launch.campaign.patch',{id:c.id,changes:{customFields:{[field.id]:'DO_NOT_SEND_CUSTOM'}}},expected(launchEntities.campaign,current));await h.tick(start+3600001)
  assert.equal(await count(),2);assert.equal(contexts.length,1);assert.ok((await h.db.prepare("SELECT result_json FROM launch_automation_actions WHERE result_json LIKE '%unchanged-context%'").first()))
  current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(c.id).first();await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'A meaningful changed launch context'}},expected(launchEntities.campaign,current));await h.tick(start+7200002)
  assert.equal(await count(),3);assert.equal(contexts.length,2);assert.doesNotMatch(contexts.join('\n'),/DO_NOT_SEND_CUSTOM/)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analysis_requests WHERE automation_run_id IS NOT NULL').first()).n,2)
 }finally{await h.close()}
})

test('[AUTO-003 AI-003] duplicate emitted queue delivery during an in-flight brief preserves its wake-up and completes once',async()=>{
 let release,seen,calls=0
 const held=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{seen=resolve})
 const h=await setup({automaticQueues:false,configuration:{AI_PROVIDER_API_KEY:'network-edge-only',AI_MODEL:'edge-model'},providerFetch:async request=>{assert.equal(request.url,'https://api.openai.com/v1/responses');calls++;seen();await held;return Response.json({id:'controlled-brief',model:'edge-model',status:'completed',usage:{input_tokens:7,output_tokens:4},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'A single immutable brief',proposedLens:null})}]}]})}})
 let first
 try{
  const settings=(await h.read('/api/v1/settings')).data;await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:10}})
  const c=await campaign(h,'DUPLICATE'),before=await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),worker=await h.runtime.getWorker()
  const event=await h.db.prepare("SELECT command_id FROM admission_events WHERE name='campaign.created' AND json_extract(subject_json,'$.recordId')=?").bind(c.id).first()
  await worker.queue('cradle-work',[{id:'brief-event',timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:event.command_id}}])
  const run=await h.db.prepare('SELECT id FROM automation_runs WHERE subject_id=?').bind(c.id).first(),outbox=await h.db.prepare("SELECT id FROM admission_outbox WHERE action='launch.automation.execute' AND json_extract(input_json,'$.runId')=?").bind(run.id).first()
  const message=id=>[{id,timestamp:Date.now(),attempts:1,body:{kind:'cradle.outbox.v1',outboxId:outbox.id}}]
  first=worker.queue('cradle-work',message('original'));await Promise.race([started,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Provider edge never started')),8000);started.finally(()=>clearTimeout(timer))})])
  await worker.queue('cradle-work',message('duplicate'))
  assert.equal((await h.db.prepare('SELECT state FROM admission_outbox WHERE id=?').bind(outbox.id).first()).state,'pending')
  release();await first;await h.tick();await worker.queue('cradle-work',message('replay'))
  assert.equal(calls,1);assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(run.id).first()).state,'Succeeded')
  assert.equal((await h.db.prepare('SELECT state FROM launch_automation_actions WHERE run_id=?').bind(run.id).first()).state,'Complete')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analyses WHERE subject_id=?').bind(c.id).first()).n,1)
  assert.equal((await h.db.prepare('SELECT state FROM admission_outbox WHERE id=?').bind(outbox.id).first()).state,'dispatched')
  assert.deepEqual(await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),before)
 }finally{release();await first?.catch(()=>{});await h.close()}
})

test('[AUTO-008] revoked saved automation authority fails queued work visibly without a business effect',async()=>{
 const h=await setup({automaticQueues:false});try{
  const c=await campaign(h,'REVOKED'),definition=value(await h.command('launch.automation.save',{definition:{name:'Revocable activity',enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'add-activity',input:{campaignId:c.id,message:'Revoked action must never run'}}]}}))
  const changed=await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Admit queued work'}},expected(launchEntities.campaign,c)),worker=await h.runtime.getWorker()
  await worker.queue('cradle-work',[{id:'admit-revocable',timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:changed.data.commandId}}])
  const run=await h.db.prepare('SELECT id,state FROM automation_runs WHERE automation_id=?').bind(definition.id).first();assert.equal(run.state,'Queued')
  await h.db.prepare("UPDATE authority_principals SET state='removed' WHERE id=?").bind(h.owner.owner).run()
  await h.tick()
  const failed=await h.db.prepare('SELECT state,error_code,error_message FROM automation_runs WHERE id=?').bind(run.id).first();assert.equal(failed.state,'Failed');assert.equal(failed.error_code,'forbidden');assert.ok(failed.error_message)
  assert.equal((await h.db.prepare('SELECT state FROM launch_automation_actions WHERE run_id=?').bind(run.id).first()).state,'Failed')
  assert.equal((await h.db.prepare("SELECT count(*) n FROM activity_entries WHERE message='Revoked action must never run'").first()).n,0)
 }finally{await h.close()}
})
