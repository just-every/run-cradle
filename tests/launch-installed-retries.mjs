import test from 'node:test'
import assert from 'node:assert/strict'
import {setup,value,campaign,waitFor,expected} from './helpers/launch-installed.mjs'
const {launchEntities}=await import('../src/apps/launch/contracts.ts')

test('[AUTO-007/009] installed ordered actions retry transport failures at absolute offsets, preserve completed effects and link manual retry',async()=>{
 for(const provider of ['sendgrid','rer']) {
 const attempts=[];let response=202
 const relay='https://mail.rer.example.test/api/managed-mail/send'
 const h=await setup({inspectMailRedirects:true,configuration:{MAIL_PROVIDER:provider,MAIL_FROM:'sender@example.test',MAIL_PROVIDER_API_KEY:provider==='sendgrid'?'test-network-edge-only':undefined,MAIL_API_KEY:provider==='rer'?'synthetic-relay-credential':undefined,MAIL_RELAY_URL:provider==='rer'?relay:undefined},providerFetch:async request=>{
  assert.equal(request.url,provider==='rer'?relay:'https://api.sendgrid.com/v3/mail/send')
  assert.equal(request.headers.get('x-test-redirect-mode'),'manual')
  assert.equal(request.headers.get('authorization'),'Bearer '+(provider==='rer'?'synthetic-relay-credential':'test-network-edge-only'))
  const body=await request.json();attempts.push(body)
  if(provider==='rer'){
   assert.deepEqual(Object.keys(body).sort(),body.html?['html','subject','text','to']:['subject','text','to'])
   assert.equal(body.to,'owner@example.test');assert.ok(body.subject&&body.text)
   assert.equal(request.headers.get('auto-submitted'),null)
  }
  return new Response(null,{status:response,headers:response===202?{'x-message-id':'accepted-network-edge'}:response===429?{'Retry-After':'60'}:response===302?{Location:'https://refused.example.test/steal'}:{}})
 }})
 try{
  const hinted=await h.request('/signin?login_hint=owner%40example.test')
  assert.equal(hinted.status,200);assert.match(await hinted.text(),/type="email"[^>]*value="owner@example.test"/)
  assert.equal(attempts.length,0,'A login hint cannot submit mail')
  assert.equal((await h.post('/auth/magic-link',{email:'owner@example.test',returnTo:'/app'})).status,202)
  assert.equal(attempts.length,1,'Base sign-in mail used the configured network edge')
  attempts.length=0;response=429
  // These transport outcomes require an open delivery window at every test-run time.
  const settings=(await h.read('/api/v1/settings')).data
  assert.equal((await h.command('settings.update',{version:settings.version,changes:{quietHoursStart:'00:00',quietHoursEnd:'00:00'}})).data.state,'committed')
  const c=await campaign(h,'RETRY'),operator=(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  const definition=value(await h.command('launch.automation.save',{definition:{name:'Ordered delivery',enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'add-activity',input:{campaignId:c.id,message:'Exactly one completed action'}},{command:'notify-operator',input:{operatorId:operator,subjectId:c.id,title:'Ordered action notice',body:'Recorded before transport'}},{command:'create-decision',input:{campaignId:c.id,riskId:null,supersedesId:null,title:'Ordered action decision',requesterId:operator,assigneeId:null,priority:'High',dueAt:new Date(Date.now()+86400000).toISOString(),recommendation:'Review',impact:'Delivery proof'}},{command:'send-email',input:{operatorId:operator,subjectId:c.id,title:'Launch update',body:'Actual configured transport'}}]}}))
  await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Trigger transport'}},expected(launchEntities.campaign,c))
  const observation=await waitFor(()=>h.db.prepare('SELECT a.*,r.first_failed_at,r.run_id FROM automation_runs a LEFT JOIN launch_automation_retries r ON a.id=r.run_id WHERE a.automation_id=?').bind(definition.id).first(),r=>r?.run_id||r?.state==='Failed');assert.ok(observation.run_id,JSON.stringify(observation));const retry=observation
  assert.equal(attempts.length,1)
  const readRun=()=>h.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(retry.run_id).first()
  const readActions=async()=>(await h.db.prepare('SELECT * FROM launch_automation_actions WHERE run_id=? ORDER BY position').bind(retry.run_id).all()).results
  const originalActions=await readActions();assert.equal(originalActions[0].state,'Complete');const firstAction={...originalActions[0]},completedActions=originalActions.slice(0,3);assert.ok(completedActions.every(a=>a.state==='Complete'));assert.equal((await h.db.prepare("SELECT count(*) n FROM decisions WHERE title='Ordered action decision'").first()).n,1);assert.equal((await h.db.prepare("SELECT count(*) n FROM notifications WHERE title='Ordered action notice'").first()).n,1)
  for(const [index,minute]of[1,5,15,30,60].entries()){
   await h.tick(retry.first_failed_at+minute*60000-1);assert.equal(attempts.length,index+1,'Retry ran before absolute due time')
   await h.tick(retry.first_failed_at+minute*60000);assert.equal(attempts.length,index+2,'Due retry did not use configured mail transport')
   assert.deepEqual((await readActions()).slice(0,3),completedActions,'Completed actions were rewritten by a retry')
  }
  const failed=await readRun(),failedActions=await readActions();assert.equal(failed.state,'Failed');assert.equal(failed.error_code,'rate_limited');assert.equal(failedActions[3].state,'Failed')
  assert.equal((await h.db.prepare("SELECT count(*) n FROM activity_entries WHERE message='Exactly one completed action'").first()).n,1)
  const original=JSON.stringify(failed),keys=failedActions.map(a=>a.idempotency_key)
  response=202
  const retried=value(await h.command('launch.automation.retry',{runId:failed.id}));assert.equal(retried.retryOf,failed.id)
  await waitFor(()=>h.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(retried.runId).first(),r=>r?.state==='Succeeded')
  assert.equal(JSON.stringify(await readRun()),original);assert.deepEqual(await readActions(),failedActions)
  const copied=(await h.db.prepare('SELECT * FROM launch_automation_actions WHERE run_id=? ORDER BY position').bind(retried.runId).all()).results
  assert.deepEqual(copied.map(a=>a.idempotency_key),keys);assert.deepEqual(copied.slice(0,3).map(a=>({key:a.idempotency_key,state:a.state,result:a.result_json,finishedAt:a.finished_at})),completedActions.map(a=>({key:a.idempotency_key,state:a.state,result:a.result_json,finishedAt:a.finished_at})));assert.equal(copied[3].state,'Complete');assert.equal(attempts.length,7)
  assert.equal((await h.db.prepare("SELECT count(*) n FROM activity_entries WHERE message='Exactly one completed action'").first()).n,1)
  // A definitive provider refusal never schedules a transport retry.
  let previousRefusal=failed.id
  for(const refusal of (provider==='rer'?[400,302,401]:[400,401])){
  response=refusal
  const current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(c.id).first();await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Permanent refusal '+refusal}},expected(launchEntities.campaign,current))
  const refused=await waitFor(()=>h.db.prepare("SELECT * FROM automation_runs WHERE automation_id=? AND retry_of IS NULL AND id<>? ORDER BY created_at DESC LIMIT 1").bind(definition.id,failed.id).first(),r=>r?.state==='Failed'&&r?.id!==previousRefusal)
  previousRefusal=refused.id
  assert.equal(refused.error_code,'provider_refused');assert.equal(await h.db.prepare('SELECT 1 FROM launch_automation_retries WHERE run_id=?').bind(refused.id).first(),null)
  const visible=(await h.read('/api/automations')).automations.find(a=>a.id===definition.id)
  assert.equal(visible.lastRunStatus,'Failed');assert.match(visible.failure.message,/Mail provider rejected/)
  assert.doesNotMatch(visible.failure.message,/synthetic-relay-credential|Bearer|stack|TypeError/)
  }
  if(provider==='rer'){
   await h.reconfigure({MAIL_API_KEY:undefined})
   assert.equal((await h.request('/health')).status,503)
   assert.equal((await h.post('/auth/magic-link',{email:'owner@example.test'})).status,503)
  }
 }finally{await h.close()}
 }
})

test('[AUTO-007/009 AUTO-USER-001] uncertain SendGrid delivery stays visible without unsafe automatic or manual resend',async()=>{
 let calls=0
 const h=await setup({automaticQueues:false,configuration:{MAIL_PROVIDER:'sendgrid',MAIL_FROM:'sender@example.test',MAIL_PROVIDER_API_KEY:'network-edge-only'},providerFetch:async request=>{assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');calls++;return new Response(null,{status:503})}})
 try{
  const settings=(await h.read('/api/v1/settings')).data
  assert.equal((await h.command('settings.update',{version:settings.version,changes:{quietHoursStart:'00:00',quietHoursEnd:'00:00'}})).data.state,'committed')
  const c=await campaign(h,'UNCERTAIN'),owner=(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  const definition=value(await h.command('launch.automation.save',{definition:{name:'Uncertain delivery',enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'add-activity',input:{campaignId:c.id,message:'Completed before uncertainty'}},{command:'send-email',input:{operatorId:owner,subjectId:c.id,title:'Uncertain launch mail',body:'Retain original delivery'}}]}}))
  await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Trigger uncertain delivery'}},expected(launchEntities.campaign,c))
  const at=Date.now();await h.tick(at);await h.tick(at)
  const run=await h.db.prepare('SELECT * FROM automation_runs WHERE automation_id=?').bind(definition.id).first(),readActions=async()=>(await h.db.prepare('SELECT * FROM launch_automation_actions WHERE run_id=? ORDER BY position').bind(run.id).all()).results,actions=await readActions()
  assert.equal(run.state,'Unknown');assert.equal(run.error_code,'unknown_outcome');assert.ok(run.error_message);assert.equal(actions[0].state,'Complete');assert.equal(actions[1].state,'Unknown');assert.equal(actions[1].error_code,run.error_code);assert.ok(actions[1].error_message)
  for(const minute of[1,5,15,30,60])await h.tick(at+minute*60000)
  assert.equal(calls,1);assert.deepEqual(await readActions(),actions);assert.equal(await h.db.prepare('SELECT 1 FROM launch_automation_retries WHERE run_id=?').bind(run.id).first(),null)
  const visible=(await h.read('/api/automations')).automations.find(a=>a.id===definition.id)
  assert.equal(visible.lastRunStatus,'Unknown');assert.equal(visible.failure.code,run.error_code);assert.equal(visible.failure.message,run.error_message)
  await h.command('launch.automation.retry',{runId:run.id},[],400)
  assert.equal(calls,1);assert.equal((await h.db.prepare('SELECT count(*) n FROM automation_runs WHERE retry_of=?').bind(run.id).first()).n,0)
  assert.equal((await h.db.prepare("SELECT count(*) n FROM activity_entries WHERE message='Completed before uncertainty'").first()).n,1)
 }finally{await h.close()}
})
