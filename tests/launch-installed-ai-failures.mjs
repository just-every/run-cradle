import test from 'node:test'
import assert from 'node:assert/strict'
import {setup,value,campaign,expected} from './helpers/launch-installed.mjs'
const {launchEntities}=await import('../src/apps/launch/contracts.ts')
const completed=(output)=>Response.json({id:'edge-response',model:'edge-model',status:'completed',usage:{input_tokens:9,output_tokens:4},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]})

async function enable(h,ceiling){
 const brief=await h.db.prepare("SELECT id,version FROM automations WHERE shipped_key='campaign-brief'").first();await h.command('launch.automation.disable',{id:brief.id},expected(launchEntities.automation,brief))
 const settings=(await h.read('/api/v1/settings')).data;await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:ceiling,timezone:'Pacific/Kiritimati'}})
}

test('[AI-004/005/006] emitted worker retains failed-call usage, preserves records, resets shared quota at local midnight and rechecks queued authority',async()=>{
 let mode='invalid',calls=0;const contexts=[]
 const h=await setup({automaticQueues:false,configuration:{AI_PROVIDER_API_KEY:'network-edge-only',AI_MODEL:'edge-model'},providerFetch:async request=>{assert.equal(request.url,'https://api.openai.com/v1/responses');calls++;contexts.push((await request.json()).input[0].content[0].text);if(mode==='refused')return new Response('{}',{status:403});if(mode==='unavailable')return new Response('{}',{status:503});return completed(mode==='invalid'?{unexpected:'invalid schema'}:{content:'Immutable authorised readout',proposedLens:null})}})
 try{
  const c=await campaign(h,'FAILURE');await h.command('launch.comment.create',{campaignId:c.id,body:'COMMENT_SECRET_MUST_NOT_LEAVE',mentions:[]})
  const field=value(await h.command('launch.custom-field.save',{field:{name:'Private operational detail',type:'text'}}));const patched=value(await h.command('launch.campaign.patch',{id:c.id,changes:{customFields:{[field.id]:'CUSTOM_SECRET_MUST_NOT_LEAVE'}}},expected(launchEntities.campaign,c)))
  await enable(h,3)
  const now=Date.now(),midnight=Math.floor((now+14*3600000)/86400000)*86400000+86400000-14*3600000,before=midnight-1000
  const request=async(feature='campaign-brief')=>value(await h.command('launch.analysis.request',{feature,...feature==='campaign-brief'?{campaignId:c.id}:{prompt:'Draft a risk lens'}}))
  for(const next of ['invalid','refused','unavailable']){mode=next;const accepted=await request();await h.tick(before);const row=(await h.read('/api/v1/launch/analysis-requests/'+accepted.requestId)).data;assert.equal(row.state,'Failed');assert.ok(row.error?.message);assert.equal(row.analysis,null)}
  assert.equal(calls,3);assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analyses').first()).n,0)
  mode='valid';const capped=await request();await h.tick(before);assert.equal((await h.read('/api/v1/launch/analysis-requests/'+capped.requestId)).data.error.code,'budget_exhausted');assert.equal(calls,3)
  const next=await request();await h.tick(midnight);assert.equal((await h.read('/api/v1/launch/analysis-requests/'+next.requestId)).data.state,'Complete');assert.equal(calls,4)
  const usage=(await h.read('/api/v1/settings')).data.usage.filter(x=>x.day);assert.equal(new Set(usage.map(x=>x.day)).size,2);assert.equal(usage.reduce((n,x)=>n+x.requests,0),4)
  for(const context of contexts)assert.doesNotMatch(context,/COMMENT_SECRET_MUST_NOT_LEAVE|CUSTOM_SECRET_MUST_NOT_LEAVE/)
  assert.equal((await h.db.prepare('SELECT version FROM campaigns WHERE id=?').bind(c.id).first()).version,patched.version)
  const queued=await request();const current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(c.id).first();await h.command('launch.campaign.archive',{id:c.id},expected(launchEntities.campaign,current));await h.tick(midnight+1000)
  assert.equal((await h.read('/api/v1/launch/analysis-requests/'+queued.requestId)).data.state,'Failed');assert.equal(calls,4,'Archived source reached the provider')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analysis_requests WHERE authority_json IS NOT NULL').first()).n,0)
 }finally{await h.close()}
})

test('[AI-004] actual provider timeout records an unavailable result without persisting analysis',{timeout:85000},async()=>{
 let timer,calls=0
 const h=await setup({automaticQueues:false,configuration:{AI_PROVIDER_API_KEY:'network-edge-only',AI_MODEL:'edge-model'},providerFetch:async request=>{assert.equal(request.url,'https://api.openai.com/v1/responses');calls++;return new Promise(resolve=>{timer=setTimeout(()=>resolve(completed({content:'Too late',proposedLens:null})),65000)})}})
 try{const c=await campaign(h,'TIMEOUT');await enable(h,2);const accepted=value(await h.command('launch.analysis.request',{feature:'campaign-brief',campaignId:c.id})),started=Date.now();await h.tick();const elapsed=Date.now()-started,row=(await h.read('/api/v1/launch/analysis-requests/'+accepted.requestId)).data;assert.ok(elapsed>=59000&&elapsed<64000,`deadline elapsed ${elapsed}`);assert.equal(calls,1);assert.equal(row.state,'Failed');assert.equal(row.error.code,'provider_unavailable');assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analyses').first()).n,0)}finally{clearTimeout(timer);await h.close()}
})
