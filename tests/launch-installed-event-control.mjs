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
  await h.command('launch.automation.save',{definition:{name:'Retained event effect',enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'add-activity',input:{campaignId:c.id,message:'Erased event must never run'}}]}})
  const erased=await campaign(h,'ERASED'),pending=await h.command('launch.campaign.patch',{id:erased.id,changes:{statusSummary:'Erase before dispatch'}},expected(launchEntities.campaign,erased))
  const current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(erased.id).first()
  await h.command('launch.campaign.delete',{id:erased.id,confirmationCode:erased.code},expected(launchEntities.campaign,current))
  const redacted=(await h.db.prepare("SELECT * FROM admission_events WHERE subject_json='null' AND payload_json='null' ORDER BY id").all()).results,ids=JSON.stringify(redacted.map(e=>e.id))
  const history=async()=>({events:(await h.db.prepare('SELECT * FROM admission_events WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(ids).all()).results,audit:(await h.db.prepare('SELECT * FROM admission_audit ORDER BY id').all()).results,erasures:(await h.db.prepare('SELECT * FROM lifecycle_erasures ORDER BY id').all()).results})
  const before=await history(),outcomes=[]
  for(let i=0;i<2;i++){outcomes.push((await h.tick()).outcome);await worker.queue('cradle-work',[{id:'erased-event-'+i,timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:pending.data.commandId}}])}
  assert.deepEqual({redacted:redacted.length>0,outcomes,history:await history(),receipts:(await h.db.prepare('SELECT count(*) n FROM launch_event_dispatches WHERE event_id IN (SELECT value FROM json_each(?))').bind(ids).first()).n,runs:(await h.db.prepare('SELECT id FROM automation_runs WHERE trigger_key IN (SELECT value FROM json_each(?))').bind(ids).all()).results,campaign:await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(erased.id).first(),activity:(await h.db.prepare('SELECT * FROM activity_entries WHERE campaign_id=?').bind(erased.id).all()).results},{redacted:true,outcomes:['ok','ok'],history:before,receipts:redacted.length,runs:[],campaign:null,activity:[]},'Repeated scheduled and queue delivery consumes erased events without effects or rewriting erasure history')
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

test('[AUTO-005/011 AI-002] a mixed bulk brief skips unchanged campaigns without spending quota or losing the bulk run',async()=>{
 let failCampaign=null
 const contexts=[],h=await setup({automaticQueues:false,configuration:{AI_PROVIDER_API_KEY:'network-edge-only',AI_MODEL:'edge-model'},providerFetch:async request=>{
  assert.equal(request.url,'https://api.openai.com/v1/responses');contexts.push(JSON.parse((await request.json()).input[0].content[0].text))
  if(contexts.at(-1).campaign.id===failCampaign)return new Response(null,{status:503})
  return Response.json({id:'bulk-brief-'+contexts.length,model:'edge-model',status:'completed',usage:{input_tokens:7,output_tokens:4},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Immutable bulk brief',proposedLens:null})}]}]})
 }})
 try{
  const settings=(await h.read('/api/v1/settings')).data;await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:10}})
  const a=await campaign(h,'BULK-A'),b=await campaign(h,'BULK-B')
  await h.command('launch.campaign.patch',{id:a.id,changes:{status:'Watch'}},expected(launchEntities.campaign,a))
  const at=Date.now();await h.tick(at);assert.equal(contexts.length,2)
  const readContexts=async()=>(await h.db.prepare('SELECT * FROM launch_brief_context ORDER BY campaign_id').all()).results
  const before=await readContexts(),bulk=async(status='Watch')=>{
   const rows=(await h.db.prepare('SELECT id,version FROM campaigns WHERE id IN (?,?) ORDER BY id').bind(a.id,b.id).all()).results
   return h.command('launch.bulk.apply',{recordType:'Campaign',ids:[a.id,b.id],change:{kind:'field',field:'status',value:status}},rows.flatMap(row=>expected(launchEntities.campaign,row)))
  }
  const change=await bulk(),records=(await h.db.prepare('SELECT * FROM campaigns ORDER BY id').all()).results
  await h.tick(at+3600001)
  assert.deepEqual(contexts.map(c=>c.campaign.id),[a.id,b.id,b.id]);assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_model_calls').first()).n,3)
  const run=await h.db.prepare("SELECT * FROM automation_runs WHERE trigger_key IN (SELECT id FROM admission_events WHERE command_id=?) AND automation_id IN (SELECT id FROM automations WHERE shipped_key='campaign-brief')").bind(change.data.commandId).first()
  assert.equal(run.state,'Succeeded');assert.deepEqual(JSON.parse(run.definition_json).subjectIds,[a.id,b.id]);assert.equal(run.subject_id,null)
  const action=await h.db.prepare('SELECT state,result_json FROM launch_automation_actions WHERE run_id=?').bind(run.id).first(),result=JSON.parse(action.result_json)
  assert.equal(action.state,'Complete');assert.deepEqual(result.campaignIds,[b.id]);assert.deepEqual(result.skippedCampaignIds,[a.id])
  assert.deepEqual((await readContexts()).find(r=>r.campaign_id===a.id),before.find(r=>r.campaign_id===a.id));assert.notEqual((await readContexts()).find(r=>r.campaign_id===b.id).context_hash,before.find(r=>r.campaign_id===b.id).context_hash)
  assert.deepEqual((await h.db.prepare('SELECT * FROM campaigns ORDER BY id').all()).results,records)
  const priorContexts=await readContexts(),unchanged=await bulk();await h.tick(at+7200002)
  assert.equal(contexts.length,3);assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_model_calls').first()).n,3);assert.deepEqual(await readContexts(),priorContexts)
  const skipped=await h.db.prepare("SELECT r.state,a.state action_state,a.result_json FROM automation_runs r JOIN launch_automation_actions a ON a.run_id=r.id WHERE r.trigger_key IN (SELECT id FROM admission_events WHERE command_id=?) AND r.automation_id IN (SELECT id FROM automations WHERE shipped_key='campaign-brief')").bind(unchanged.data.commandId).first()
  assert.equal(skipped.state,'Succeeded');assert.equal(skipped.action_state,'Complete');assert.equal(JSON.parse(skipped.result_json).analyses,0);assert.deepEqual(JSON.parse(skipped.result_json).skippedCampaignIds,[a.id,b.id])
  failCampaign=b.id;const partial=await bulk('On track');await h.tick(at+10800003)
  const failed=await h.db.prepare("SELECT * FROM automation_runs WHERE trigger_key IN (SELECT id FROM admission_events WHERE command_id=?) AND automation_id IN (SELECT id FROM automations WHERE shipped_key='campaign-brief')").bind(partial.data.commandId).first()
  assert.equal(failed.state,'Failed');assert.deepEqual(contexts.slice(3).map(c=>c.campaign.id),[a.id,b.id])
  const completedA=await h.db.prepare("SELECT * FROM launch_analysis_requests WHERE automation_run_id=? AND state='Complete'").bind(failed.id).first();assert.ok(completedA)
  failCampaign=null;const retried=value(await h.command('launch.automation.retry',{runId:failed.id}));await h.tick(at+10800004)
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(retried.runId).first()).state,'Succeeded');assert.equal(contexts.length,6);assert.equal(contexts.at(-1).campaign.id,b.id)
  assert.deepEqual(await h.db.prepare('SELECT * FROM launch_analysis_requests WHERE id=?').bind(completedA.id).first(),completedA)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_model_calls').first()).n,6)
 }finally{await h.close()}
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
