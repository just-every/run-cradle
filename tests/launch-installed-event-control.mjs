import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {setup,value,campaign,expected} from './helpers/launch-installed.mjs'
import {verifyDefinitions,verifyContributedRun,verifyRetainedDefinition} from './helpers/launch-automation-definitions.mjs'
import {historyMailEdge,verifyRunHistory} from './helpers/launch-run-history.mjs'
import {verifyPublicQueuedCampaignArchive} from './helpers/launch-queued-campaign-archive.mjs'
const {LAUNCH_APP_ID,launchEntities}=await import('../src/apps/launch/contracts.ts')
const {createUlid}=await import('../src/core/shared/ids.ts')

test('[CAMP-009] [AUTO-001] [AUTO-003/004] [AUTO-006] definitions version every edit and refuse undeclared events, sub-hourly schedules and uncontributed commands; a jobs.commands.v1 action runs once from the emitted queue; archive and disable cancel queued work before any effect; full run history pages with each attempted action and a 30-day success rate',async()=>{
 const mail=historyMailEdge(),h=await setup({automaticQueues:false,providerFetch:mail.fetch});try{
  await verifyPublicQueuedCampaignArchive(h)
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
  await verifyDefinitions(h,{campaign:c,owner,risk})
  await verifyRetainedDefinition(h)
  const contributed=await verifyContributedRun(h,{campaign:c,owner})
  await verifyRunHistory(h,{campaign:c,owner,risk:contributed.risk,mail})
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

test('[AUTO-005/011 AI-002 AI-004] [AUTO-010] bulk edits and committed imports fan out once per automation while mixed briefs preserve skips, quota and retry progress',async()=>{
 let failCampaign=null
 const contexts=[],deliveries=[],h=await setup({automaticQueues:false,configuration:{AI_PROVIDER_API_KEY:'synthetic-cradle-144',AI_MODEL:'synthetic-cradle-144-model'},providerFetch:async request=>{
  if(request.url==='https://api.sendgrid.com/v3/mail/send'){deliveries.push(await request.json());return new Response(null,{status:202,headers:{'x-message-id':'synthetic-cradle-144-mail'}})}
  assert.equal(request.url,'https://api.openai.com/v1/responses');contexts.push(JSON.parse((await request.json()).input[0].content[0].text))
  if(contexts.at(-1).campaign.id===failCampaign)return new Response(null,{status:503})
  return Response.json({id:'bulk-brief-'+contexts.length,model:'edge-model',status:'completed',usage:{input_tokens:7,output_tokens:4},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Immutable bulk brief',proposedLens:null})}]}]})
 }})
 try{
  const settings=(await h.read('/api/v1/settings')).data;await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:10,quietHoursStart:'00:00',quietHoursEnd:'00:00'}})
  const a=await campaign(h,'BULK-A'),b=await campaign(h,'BULK-B')
  await h.command('launch.campaign.patch',{id:a.id,changes:{status:'Watch'}},expected(launchEntities.campaign,a))
  const at=Date.now();await h.tick(at);assert.equal(contexts.length,2)
  const observer=value(await h.command('launch.automation.save',{definition:{name:'Batch activity',enabled:true,trigger:{kind:'event',event:'import.committed.v1'},actions:[{command:'add-activity',input:{campaignId:a.id,message:'One activity for the committed batch'}}]}}))
  const brief=await h.db.prepare("SELECT id,definition_version FROM automations WHERE shipped_key='campaign-brief' AND enabled=1").first()
  const fanOut=async(commandId,name,ids)=>{
   const events=(await h.db.prepare('SELECT id,name,payload_json FROM admission_events WHERE command_id=? ORDER BY id').bind(commandId).all()).results
   assert.equal(events.length,1,'A batch mutation emits one trigger event, rather than a trigger per record');assert.equal(events[0].name,name)
   const payload=JSON.parse(events[0].payload_json);assert.deepEqual(payload.ids??payload.recordIds,ids)
   const runs=(await h.db.prepare('SELECT * FROM automation_runs WHERE trigger_key IN (SELECT id FROM admission_events WHERE command_id=?) ORDER BY automation_id').bind(commandId).all()).results
   assert.deepEqual(runs.map(run=>({automationId:run.automation_id,version:run.definition_version,trigger:run.trigger_key,state:run.state,subject:run.subject_id,ids:JSON.parse(run.definition_json).subjectIds})),[
    {automationId:brief.id,version:brief.definition_version,trigger:events[0].id,state:'Succeeded',subject:null,ids},
    {automationId:observer.id,version:observer.definitionVersion,trigger:events[0].id,state:'Succeeded',subject:null,ids},
   ].sort((a,b)=>a.automationId.localeCompare(b.automationId)),'Each enabled applicable automation has exactly one run carrying exactly the batch record IDs')
   assert.equal((await h.db.prepare('SELECT count(*) n FROM activity_entries WHERE automation_run_id IN (SELECT id FROM automation_runs WHERE automation_id=? AND trigger_key=?)').bind(observer.id,events[0].id).first()).n,1)
  }
  const readContexts=async()=>(await h.db.prepare('SELECT * FROM launch_brief_context ORDER BY campaign_id').all()).results
  const before=await readContexts(),bulk=async(status='Watch')=>{
   const rows=(await h.db.prepare('SELECT id,version FROM campaigns WHERE id IN (?,?) ORDER BY id').bind(a.id,b.id).all()).results
   return h.command('launch.bulk.apply',{recordType:'Campaign',ids:[a.id,b.id],change:{kind:'field',field:'status',value:status}},rows.flatMap(row=>expected(launchEntities.campaign,row)))
  }
  const change=await bulk(),records=(await h.db.prepare('SELECT * FROM campaigns ORDER BY id').all()).results
  await h.tick(at+3600001)
  await fanOut(change.data.commandId,'bulk.updated',[a.id,b.id])
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
  // Keep the provider refusal active until unrelated public work and delivery finish.
  failCampaign=b.id;const partial=await bulk('On track')
  const beforeFailure=(await h.db.prepare('SELECT * FROM campaigns ORDER BY id').all()).results
  const analysesB=async()=>(await h.db.prepare('SELECT * FROM launch_analyses WHERE subject_id=? ORDER BY id').bind(b.id).all()).results
  const retainedB=await analysesB()
  assert.ok(retainedB.length>0,'The failed campaign already has completed analysis to preserve')
  await h.tick(at+10800003)
  const failed=await h.db.prepare("SELECT * FROM automation_runs WHERE trigger_key IN (SELECT id FROM admission_events WHERE command_id=?) AND automation_id IN (SELECT id FROM automations WHERE shipped_key='campaign-brief')").bind(partial.data.commandId).first()
  assert.equal(failed.state,'Failed');assert.deepEqual(contexts.slice(3).map(c=>c.campaign.id),[a.id,b.id])
  const completedA=await h.db.prepare("SELECT * FROM launch_analysis_requests WHERE automation_run_id=? AND state='Complete'").bind(failed.id).first();assert.ok(completedA)
  const failure={code:'provider_unavailable',message:'Provider outcome is unresolved (HTTP 503).'}
  const history=(await h.read(`/api/automations/${brief.id}/runs`)).runs.find(run=>run.id===failed.id)
  assert.ok(history,'Run history exposes the failed batch')
  assert.deepEqual({state:history.state,subjectIds:history.subjectIds,code:history.errorCode,message:history.errorMessage},{state:'Failed',subjectIds:[a.id,b.id],...failure})
  assert.deepEqual(history.actions.map(action=>({position:action.position,command:action.command,state:action.state,result:action.result,code:action.errorCode,message:action.errorMessage})),[{position:0,command:'request-ai-analysis',state:'Failed',result:null,...failure}],'The attempted AI action exposes the exact provider error')
  const monitor=(await h.read('/api/automations')).automations.find(automation=>automation.id===brief.id)
  assert.equal(monitor.lastRunStatus,'Failed');assert.deepEqual(monitor.failure,failure,'Automation Monitor exposes the same provider error')
  const failedB=await h.db.prepare("SELECT state,analysis_id,error_code,error_message FROM launch_analysis_requests WHERE automation_run_id=? AND json_extract(input_json,'$.campaignId')=?").bind(failed.id,b.id).first()
  assert.deepEqual(failedB,{state:'Failed',analysis_id:null,error_code:failure.code,error_message:failure.message})
  assert.deepEqual(await analysesB(),retainedB,'A refused campaign stores no new analysis and preserves its earlier analyses')
  assert.deepEqual((await h.db.prepare('SELECT * FROM campaigns ORDER BY id').all()).results,beforeFailure,'Neither successful nor failed analysis changes campaign fields')
  const analysisPath=`/api/v1/launch/analyses/${completedA.analysis_id}`,completedAnalysis=(await h.read(analysisPath)).data
  assert.equal(completedAnalysis.campaignId,a.id);assert.equal(completedAnalysis.content,'Immutable bulk brief')

  const owner=(await h.read(`/api/campaigns/${b.id}`)).campaign.owner.id
  const isolated=value(await h.command('launch.automation.save',{definition:{name:'Work during AI refusal',enabled:true,trigger:{kind:'event',event:'risk.created.v1'},actions:[
   {command:'add-activity',input:{campaignId:b.id,message:'Unrelated automation completed during AI refusal'}},
   {command:'notify-operator',input:{operatorId:owner,subjectId:b.id,title:'Unrelated notification during AI refusal',body:'Non-AI work remains available'}},
   {command:'send-email',input:{operatorId:owner,subjectId:b.id,title:'Unrelated mail during AI refusal',body:'Permitted non-AI delivery'}},
  ]}}))
  const createdRisk=await h.command('launch.risk.create',{fields:{campaignId:b.id,ownerId:owner,title:'Non-AI risk during provider refusal',severity:'Critical',signal:'Known',mitigation:'Review',dueDate:null}}),risk=value(createdRisk)
  assert.equal((await h.read(`/api/risks/${risk.id}`)).risk.state,'Watching','A non-AI mutation and read work while AI refuses')
  for(let step=0;step<3;step++)await h.tick(at+10800004+step)
  const afterRisk=await h.read(`/api/risks/${risk.id}`)
  assert.equal(afterRisk.risk.state,'Escalated');assert.equal(afterRisk.decision.priority,'Critical');assert.equal(afterRisk.decision.state,'Awaiting approval','The shipped non-AI automation completes its business effect')
  const isolatedRun=(await h.read(`/api/automations/${isolated.id}/runs`)).runs.find(run=>run.subjectId===risk.id)
  assert.equal(isolatedRun.state,'Succeeded');assert.deepEqual(isolatedRun.actions.map(action=>({command:action.command,state:action.state})),[{command:'add-activity',state:'Complete'},{command:'notify-operator',state:'Complete'},{command:'send-email',state:'Complete'}])
  assert.ok((await h.read(`/api/campaigns/${b.id}`)).activity.some(entry=>entry.description==='Unrelated automation completed during AI refusal'))
  const notice=(await h.read('/api/notifications')).notifications.find(notice=>notice.title==='Unrelated notification during AI refusal')
  assert.ok(notice);assert.equal(notice.subject.id,b.id);assert.equal(notice.subject.available,true)
  const sent=deliveries.filter(message=>message.subject==='Unrelated mail during AI refusal')
  assert.equal(sent.length,1);assert.equal(sent[0].personalizations[0].to.length,1);assert.equal(sent[0].personalizations[0].to[0].email,(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(owner).first()).email)
  assert.equal(contexts.length,5,'Non-AI work neither retries nor calls the unavailable AI provider')
  assert.deepEqual((await h.read(analysisPath)).data,completedAnalysis,'Unrelated work preserves the completed analysis')
  assert.deepEqual(await analysesB(),retainedB)
  assert.deepEqual((await h.read(`/api/automations/${brief.id}/runs`)).runs.find(run=>run.id===failed.id),history,'Non-AI progress leaves the failed run available and unchanged')
  const currentIsolation=(await h.read('/api/automations')).automations.find(automation=>automation.id===isolated.id)
  await h.command('launch.automation.disable',{id:isolated.id},expected(launchEntities.automation,currentIsolation))
  failCampaign=null;const retried=value(await h.command('launch.automation.retry',{runId:failed.id,version:failed.version}));await h.tick(at+10800007)
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(retried.runId).first()).state,'Succeeded');assert.equal(contexts.length,6);assert.equal(contexts.at(-1).campaign.id,b.id)
  assert.deepEqual(await h.db.prepare('SELECT * FROM launch_analysis_requests WHERE id=?').bind(completedA.id).first(),completedA)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_model_calls').first()).n,6)
  const afterRetry=(await h.read(`/api/automations/${brief.id}/runs`)).runs,recovered=afterRetry.find(run=>run.id===retried.runId)
  assert.equal(recovered.state,'Succeeded');assert.equal(recovered.retryOf,failed.id);assert.equal(recovered.actions[0].state,'Complete')
  assert.deepEqual(afterRetry.find(run=>run.id===failed.id),history,'Explicit retry retains the original public failure and attempted action')
  assert.deepEqual((await h.read(analysisPath)).data,completedAnalysis,'Explicit retry preserves the completed peer analysis')
  const {csrfToken}=await h.read('/auth/csrf'),headers={cookie:h.owner.cookie,'x-csrf-token':csrfToken}
  const post=async(path,input,commandId=createUlid())=>{
   const response=await h.post(path,{commandId,expected:[],input},headers);assert.equal(response.status,200,await response.clone().text());return response.json()
  }
  const staged=value(await h.command('source.stage',{appId:LAUNCH_APP_ID,purpose:'import'})),csv=`Code,Summary\r\n${a.code},Imported campaign A context\r\n${b.code},Imported campaign B context\r\n`
  const upload=value(await h.command('upload.begin',{appId:LAUNCH_APP_ID,subject:staged.subject,filename:'batch-campaigns.csv',mediaType:'text/csv',bytes:Buffer.byteLength(csv),sha256:createHash('sha256').update(csv).digest('hex')}))
  const uploaded=await h.request(upload.uploadUrl,{method:'PUT',headers:{...headers,origin:h.origin,'content-type':'text/csv'},body:csv});assert.equal(uploaded.status,200,await uploaded.text())
  const preview=value(await post('/api/v1/launch/imports/preview',{kind:'campaign',fileId:upload.file.id,mapping:[{column:'Code',field:'code'},{column:'Summary',field:'statusSummary'}]}))
  assert.deepEqual({state:preview.state,creates:preview.creates,updates:preview.updates,unchanged:preview.unchanged,errors:preview.errors},{state:'valid',creates:0,updates:2,unchanged:0,errors:[]})
  const importCommandId=createUlid(),committed=await post(`/api/v1/launch/imports/${preview.id}/commit`,{token:preview.token},importCommandId)
  assert.deepEqual(value(committed),{id:preview.id,rows:2})
  assert.deepEqual((await h.db.prepare('SELECT id,status_summary FROM campaigns WHERE id IN (?,?) ORDER BY id').bind(a.id,b.id).all()).results,[{id:a.id,status_summary:'Imported campaign A context'},{id:b.id,status_summary:'Imported campaign B context'}].sort((a,b)=>a.id.localeCompare(b.id)))
  await h.tick(at+14400005)
  await fanOut(importCommandId,'import.committed',[a.id,b.id])
  assert.deepEqual(contexts.slice(6).map(c=>c.campaign.id),[a.id,b.id])
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
