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
