import test from 'node:test'
import assert from 'node:assert/strict'
import {launchBaseAuthorityRuntime} from './helpers/launch-base-authority-runtime.mjs'
const {createUlid}=await import('../src/core/shared/ids.ts')
const {LAUNCH_APP_ID:appId,launchEntities}=await import('../src/apps/launch/contracts.ts')
const campaignEntity=launchEntities.campaign,riskEntity=launchEntities.risk
async function setup(options){const h=await launchBaseAuthorityRuntime(options),owner=await h.bootstrap(),csrf=await h.request('/auth/csrf',{headers:{cookie:owner.cookie}}),token=(await csrf.json()).csrfToken;return Object.assign(h,{owner,async command(action,input,expected=[],status=200){const response=await h.post('/api/v1/commands/'+action,{commandId:createUlid(),input,expected},{cookie:owner.cookie,'x-csrf-token':token});assert.equal(response.status,status,await response.clone().text());return response.json()},async read(path){const response=await h.request(path,{headers:{cookie:owner.cookie}});assert.equal(response.status,200,await response.clone().text());return response.json()},async tick(at=Date.now()){return(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at})}})}
const value=response=>response.data.value
async function campaign(h,code='WORK'){const operator=(await h.db.prepare('SELECT human_id FROM authority_principals WHERE id=?').bind(h.owner.owner).first()).human_id;return value(await h.command('launch.campaign.create',{fields:{code,name:'Launch '+code,ownerId:operator,startDate:'2026-01-01',launchDate:'2027-01-01',objective:'Launch safely',statusSummary:'Manual',phase:'Planning',status:'On track',health:50,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}}))}
async function waitFor(read,predicate){for(let n=0;n<40;n++){const result=await read();if(predicate(result))return result;await new Promise(r=>setTimeout(r,200))}assert.fail('Committed work did not finish within eight seconds')}
const expected=(entity,row)=>[{ref:{appId,entityId:entity,recordId:row.id},version:row.version}]

test('[AUTO-002/003/004/011] emitted queue escalates committed Critical risk within ten seconds; replay, rollback and disable make no duplicate effects',async()=>{
 const h=await setup();try{
  const c=await campaign(h),owner=c.ownerId??(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  const r=value(await h.command('launch.risk.create',{fields:{campaignId:c.id,ownerId:owner,title:'Risk',severity:'High',signal:'Signal',mitigation:'Mitigation',dueDate:null}}))
  const failed=await h.command('launch.risk.patch',{id:r.id,changes:{severity:'Critical'}},expected(riskEntity,{...r,version:r.version+1}),409);assert.ok(failed.error)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM automation_runs').first()).n,0)
  const committed=await h.command('launch.risk.patch',{id:r.id,changes:{severity:'Critical'}},expected(riskEntity,r)),start=Date.now()
  await waitFor(()=>h.db.prepare('SELECT state FROM risks WHERE id=?').bind(r.id).first(),row=>row.state==='Escalated');assert.ok(Date.now()-start<10000)
  const counts=async()=>({runs:(await h.db.prepare('SELECT count(*) n FROM automation_runs').first()).n,decisions:(await h.db.prepare('SELECT count(*) n FROM decisions').first()).n})
  const before=await counts(),worker=await h.runtime.getWorker();await worker.queue('cradle-work',[{id:'duplicate',timestamp:Date.now(),attempts:2,body:{kind:'cradle.launch.events.v1',commandId:committed.data.commandId}}]);assert.deepEqual(await counts(),before)
  const definition=await h.db.prepare("SELECT id,version FROM automations WHERE shipped_key='critical-risk'").first();await h.command('launch.automation.disable',{id:definition.id},expected(launchEntities.automation,definition))
  const r2=value(await h.command('launch.risk.create',{fields:{campaignId:c.id,ownerId:owner,title:'Disabled risk',severity:'High',signal:'',mitigation:'',dueDate:null}}));await h.command('launch.risk.patch',{id:r2.id,changes:{severity:'Critical'}},expected(riskEntity,r2));await h.tick();assert.equal((await h.db.prepare('SELECT state FROM risks WHERE id=?').bind(r2.id).first()).state,'Watching');assert.deepEqual(await counts(),before)
 }finally{await h.close()}
})

test('[AI-001/002/003/004/005/006 SET-002] actual commands execute three immutable analyses, exclude private context, record usage and enforce one concurrent daily budget',async()=>{
 const calls=[],h=await setup({configuration:{AI_PROVIDER_API_KEY:'test-network-edge-only',AI_MODEL:'test-model'},providerFetch:async request=>{
  assert.equal(request.url,'https://api.openai.com/v1/responses');const body=await request.json();calls.push(body)
  const proposal=body.input[0].content[0].text.includes('lens-proposal')?{name:'Draft risk lens',description:'Review',recordType:'Risk',conditions:[],sort:{field:'severity',direction:'desc'},fields:['title','severity'],display:'Cards'}:null
  return Response.json({id:'response-'+calls.length,model:'test-model',status:'completed',usage:{input_tokens:13,output_tokens:7},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Read-only evidence analysis',proposedLens:proposal})}]}]})
 }});try{
  const c=await campaign(h,'AI'),disabled=await h.command('launch.analysis.request',{feature:'campaign-brief',campaignId:c.id},[],400);assert.match(disabled.error.message,/disabled/i);assert.equal(calls.length,0)
  let settings=(await h.read('/api/v1/settings')).data;assert.equal(settings.capabilities.find(c=>c.id==='ai.provider.v1').state,'ready');await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:4}})
  const lens=await h.db.prepare("SELECT id FROM lenses WHERE shipped_key='risks'").first(),before=await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first()
  for(const input of [{feature:'campaign-brief',campaignId:c.id},{feature:'risk-readout',lensId:lens.id},{feature:'lens-proposal',prompt:'Find risky launches'}]){
   const accepted=value(await h.command('launch.analysis.request',input));await h.tick();const done=(await h.read('/api/v1/launch/analysis-requests/'+accepted.requestId)).data;assert.equal(done.state,'Complete',JSON.stringify(done));assert.equal(done.analysis.aiGenerated,true);assert.equal(done.analysis.feature,input.feature)
   if(input.feature!=='lens-proposal')assert.ok(done.analysis.inputVersions.length)
  }
  assert.deepEqual(await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),before)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM lenses').first()).n,2)
  for(const call of calls){assert.equal(call.store,false);assert.doesNotMatch(call.input[0].content[0].text,/customFields|comments/)}
  const queued=await Promise.all(['campaign-brief','lens-proposal'].map(feature=>h.command('launch.analysis.request',{feature,...feature==='campaign-brief'?{campaignId:c.id}:{prompt:'Budget concurrent'}})))
  await h.tick();const outcomes=await Promise.all(queued.map(async q=>(await h.read('/api/v1/launch/analysis-requests/'+value(q).requestId)).data));assert.equal(outcomes.filter(x=>x.state==='Complete').length,1);assert.equal(outcomes.filter(x=>x.error?.code==='budget_exhausted').length,1)
  assert.equal(calls.length,4);settings=(await h.read('/api/v1/settings')).data;const usage=settings.usage.filter(u=>u.day);assert.equal(usage.reduce((n,u)=>n+u.requests,0),4);assert.equal(usage.reduce((n,u)=>n+u.inputTokens,0),52);assert.ok(usage.every(u=>u.cost===null))
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analysis_requests WHERE authority_json IS NOT NULL').first()).n,0)
 }finally{await h.close()}
})
