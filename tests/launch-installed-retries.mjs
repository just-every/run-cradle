import test from 'node:test'
import assert from 'node:assert/strict'
import {setup,value,campaign,waitFor,expected} from './helpers/launch-installed.mjs'
const {launchEntities}=await import('../src/apps/launch/contracts.ts')

test('[AUTO-007/009] installed ordered actions retry transport failures at absolute offsets, preserve completed effects and link manual retry',async()=>{
 const attempts=[];let response=429
 const h=await setup({configuration:{MAIL_PROVIDER:'sendgrid',MAIL_FROM:'sender@example.test',MAIL_PROVIDER_API_KEY:'test-network-edge-only'},providerFetch:async request=>{assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');attempts.push(await request.json());return new Response(null,{status:response,headers:response===202?{'x-message-id':'accepted-network-edge'}:{}})}})
 try{
  const c=await campaign(h,'RETRY'),operator=(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  const definition=value(await h.command('launch.automation.save',{definition:{name:'Ordered delivery',enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'add-activity',input:{campaignId:c.id,message:'Exactly one completed action'}},{command:'send-email',input:{operatorId:operator,subjectId:c.id,title:'Launch update',body:'Actual configured transport'}}]}}))
  await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Trigger transport'}},expected(launchEntities.campaign,c))
  const retry=await waitFor(()=>h.db.prepare('SELECT r.* FROM launch_automation_retries r JOIN automation_runs a ON a.id=r.run_id WHERE a.automation_id=?').bind(definition.id).first(),Boolean)
  assert.equal(attempts.length,1)
  const readRun=()=>h.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(retry.run_id).first()
  const readActions=async()=>(await h.db.prepare('SELECT * FROM launch_automation_actions WHERE run_id=? ORDER BY position').bind(retry.run_id).all()).results
  const originalActions=await readActions();assert.equal(originalActions[0].state,'Complete');const firstAction={...originalActions[0]}
  for(const [index,minute]of[1,5,15,30,60].entries()){
   await h.tick(retry.first_failed_at+minute*60000-1);assert.equal(attempts.length,index+1,'Retry ran before absolute due time')
   await h.tick(retry.first_failed_at+minute*60000);assert.equal(attempts.length,index+2,'Due retry did not use configured mail transport')
   assert.deepEqual((await readActions())[0],firstAction,'Completed action was rewritten by a retry')
  }
  const failed=await readRun(),failedActions=await readActions();assert.equal(failed.state,'Failed');assert.equal(failed.error_code,'rate_limited');assert.equal(failedActions[1].state,'Failed')
  assert.equal((await h.db.prepare("SELECT count(*) n FROM activity_entries WHERE message='Exactly one completed action'").first()).n,1)
  const original=JSON.stringify(failed),keys=failedActions.map(a=>a.idempotency_key)
  response=202
  const retried=value(await h.command('launch.automation.retry',{runId:failed.id}));assert.equal(retried.retryOf,failed.id)
  await waitFor(()=>h.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(retried.runId).first(),r=>r?.state==='Succeeded')
  assert.equal(JSON.stringify(await readRun()),original);assert.deepEqual(await readActions(),failedActions)
  const copied=(await h.db.prepare('SELECT * FROM launch_automation_actions WHERE run_id=? ORDER BY position').bind(retried.runId).all()).results
  assert.deepEqual(copied.map(a=>a.idempotency_key),keys);assert.equal(copied[0].finished_at,firstAction.finished_at);assert.equal(copied[1].state,'Complete');assert.equal(attempts.length,7)
  assert.equal((await h.db.prepare("SELECT count(*) n FROM activity_entries WHERE message='Exactly one completed action'").first()).n,1)
  // A definitive provider refusal never schedules a transport retry.
  response=400
  const current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(c.id).first();await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Permanent refusal'}},expected(launchEntities.campaign,current))
  const refused=await waitFor(()=>h.db.prepare("SELECT * FROM automation_runs WHERE automation_id=? AND retry_of IS NULL AND id<>? ORDER BY created_at DESC LIMIT 1").bind(definition.id,failed.id).first(),r=>r?.state==='Failed')
  assert.equal(refused.error_code,'provider_refused');assert.equal(await h.db.prepare('SELECT 1 FROM launch_automation_retries WHERE run_id=?').bind(refused.id).first(),null)
 }finally{await h.close()}
})
