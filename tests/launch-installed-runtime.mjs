import test from 'node:test'
import assert from 'node:assert/strict'
import {launchBaseAuthorityRuntime} from './helpers/launch-base-authority-runtime.mjs'
const {createUlid}=await import('../src/core/shared/ids.ts')
const {LAUNCH_APP_ID:appId,launchEntities}=await import('../src/apps/launch/contracts.ts')
const campaignEntity=launchEntities.campaign,riskEntity=launchEntities.risk
import {setup,value,campaign,waitFor,expected} from './helpers/launch-installed.mjs'
import {usageReceipts,usageClock,providerPause,assertUsageCalls,usageTotals} from './helpers/launch-usage-proof.mjs'

test('[AUTO-002/003/004/011] emitted queue escalates committed Critical risk within ten seconds; replay, rollback and disable make no duplicate effects',async()=>{
 const automaticBriefs=[],h=await setup({automaticQueues:true,configuration:{AI_PROVIDER_API_KEY:'edge-only',AI_MODEL:'edge-model'},providerFetch:async request=>{assert.equal(request.url,'https://api.openai.com/v1/responses');automaticBriefs.push(await request.json());return Response.json({id:'automatic-brief',model:'edge-model',status:'completed',usage:{input_tokens:5,output_tokens:3},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Automatically dispatched immutable brief',proposedLens:null})}]}]})}});try{
  const c=await campaign(h),owner=c.ownerId??(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  const r=value(await h.command('launch.risk.create',{fields:{campaignId:c.id,ownerId:owner,title:'Risk',severity:'High',signal:'Signal',mitigation:'Mitigation',dueDate:null}}))
  const failed=await h.command('launch.risk.patch',{id:r.id,changes:{severity:'Critical'}},expected(riskEntity,{...r,version:r.version+1}),409);assert.ok(failed.error)
  assert.equal((await h.db.prepare("SELECT count(*) n FROM automation_runs WHERE automation_id IN (SELECT id FROM automations WHERE shipped_key='critical-risk')").first()).n,0)
  const committed=await h.command('launch.risk.patch',{id:r.id,changes:{severity:'Critical'}},expected(riskEntity,r)),start=Date.now()
  await waitFor(()=>h.db.prepare('SELECT state FROM risks WHERE id=?').bind(r.id).first(),row=>row.state==='Escalated');assert.ok(Date.now()-start<10000)
  const counts=async()=>({runs:(await h.db.prepare("SELECT count(*) n FROM automation_runs WHERE automation_id IN (SELECT id FROM automations WHERE shipped_key='critical-risk')").first()).n,decisions:(await h.db.prepare('SELECT count(*) n FROM decisions').first()).n})
  const before=await counts(),worker=await h.runtime.getWorker();await worker.queue('cradle-work',[{id:'duplicate',timestamp:Date.now(),attempts:2,body:{kind:'cradle.launch.events.v1',commandId:committed.data.commandId}}]);assert.deepEqual(await counts(),before)
  const definition=await h.db.prepare("SELECT id,version FROM automations WHERE shipped_key='critical-risk'").first();await h.command('launch.automation.disable',{id:definition.id},expected(launchEntities.automation,definition))
  const r2=value(await h.command('launch.risk.create',{fields:{campaignId:c.id,ownerId:owner,title:'Disabled risk',severity:'High',signal:'',mitigation:'',dueDate:null}}));await h.command('launch.risk.patch',{id:r2.id,changes:{severity:'Critical'}},expected(riskEntity,r2));await h.tick();assert.equal((await h.db.prepare('SELECT state FROM risks WHERE id=?').bind(r2.id).first()).state,'Watching');assert.deepEqual(await counts(),before)
  const settings=(await h.read('/api/v1/settings')).data;await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true}})
  const campaignStart=Date.now(),automatic=await campaign(h,'AUTOMATIC')
  await waitFor(()=>h.db.prepare('SELECT state FROM automation_runs WHERE subject_id=?').bind(automatic.id).first(),row=>row?.state==='Succeeded')
  assert.ok(Date.now()-campaignStart<10000);assert.equal(automaticBriefs.length,1);assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analyses WHERE subject_id=?').bind(automatic.id).first()).n,1)
 }finally{await h.close()}
})

test('[AI-001/002/003/004/005/006 SET-002] actual commands execute three immutable analyses, exclude private context, record usage and enforce one concurrent daily budget',async()=>{
 const calls=[],receipts=[],clock=usageClock(),h=await setup({automaticQueues:false,configuration:{AI_PROVIDER_API_KEY:'synthetic-cradle-1',AI_MODEL:'synthetic-cradle-2'},providerFetch:async request=>{
  assert.equal(request.url,'https://api.openai.com/v1/responses');const body=await request.json();calls.push(body)
  const feature=JSON.parse(body.input[0].content[0].text).feature,receipt=usageReceipts[feature]
  receipts.push({...receipt,edge:await providerPause()})
  const proposal=feature==='lens-proposal'?{name:'Draft risk lens',description:'Review',recordType:'Risk',conditions:[],sort:{field:'severity',direction:'desc'},fields:['title','severity'],display:'Cards'}:null
  return Response.json({id:'response-'+calls.length,model:receipt.model,status:'completed',usage:{input_tokens:receipt.inputTokens,output_tokens:receipt.outputTokens},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Read-only evidence analysis',proposedLens:proposal})}]}]})
 }});try{
  const c=await campaign(h,'AI'),disabled=await h.command('launch.analysis.request',{feature:'campaign-brief',campaignId:c.id},[],400);assert.match(disabled.error.message,/disabled/i);assert.equal(calls.length,0)
  const owner=(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  await h.command('launch.deliverable.create',{fields:{campaignId:c.id,title:'Launch deliverable',ownerId:owner,dueDate:null}})
  await h.command('launch.milestone.create',{fields:{campaignId:c.id,title:'Launch milestone',ownerId:owner,type:'Review',status:'Not started',startDate:'2026-10-01',endDate:null,conflictReason:null}})
  await h.command('launch.risk.create',{fields:{campaignId:c.id,title:'Launch risk',ownerId:owner,severity:'High',dueDate:null,signal:'Evidence',mitigation:'Review'}})
  await h.command('launch.decision.create',{fields:{campaignId:c.id,riskId:null,supersedesId:null,title:'Launch decision',requesterId:owner,assigneeId:null,priority:'High',dueAt:new Date(Date.now()+86400000).toISOString(),recommendation:'Review',impact:'Launch readiness'}})
  let settings=(await h.read('/api/v1/settings')).data;assert.equal(settings.capabilities.find(c=>c.id==='ai.provider.v1').state,'ready');await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:4,timezone:clock.timezone}})
  const lens=await h.db.prepare("SELECT id FROM lenses WHERE shipped_key='risks'").first(),before=await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first()
  const csrf=(await (await h.request('/auth/csrf',{headers:{cookie:h.owner.cookie}})).json()).csrfToken,proofs=[]
  for(const input of [{feature:'campaign-brief',campaignId:c.id},{feature:'risk-readout',lensId:lens.id},{feature:'lens-proposal',prompt:'Find risky launches'}]){
   const id=createUlid(),response=await h.post('/api/v1/commands/launch.analysis.request',{commandId:id,input,expected:[]},{cookie:h.owner.cookie,'x-csrf-token':csrf})
   assert.equal(response.status,200);assert.equal(value(await response.json()).requestId,id)
   const started=Date.now();await h.tick(clock.at);await waitFor(()=>h.read('/api/v1/launch/analysis-requests/'+id),x=>['Complete','Failed'].includes(x.data.state));const done=(await h.read('/api/v1/launch/analysis-requests/'+id)).data,finished=Date.now();assert.equal(done.state,'Complete',JSON.stringify(done));assert.equal(done.analysis.aiGenerated,true);assert.equal(done.analysis.feature,input.feature)
   assert.equal(done.analysis.modelCallId,id)
   proofs.push({id,day:clock.day,feature:'launch.'+input.feature,subject:input.campaignId??input.lensId??null,state:'succeeded',started,finished,...receipts.at(-1)})
   if(input.feature!=='lens-proposal')assert.ok(done.analysis.inputVersions.length);if(input.feature==='campaign-brief')assert.equal(new Set(done.analysis.inputVersions.map(v=>v.ref.entityId)).size,5)
  }
  const detailed=(await h.read('/api/v1/launch/usage')).data
  assertUsageCalls(detailed.calls,proofs,h.owner.owner)
  assert.deepEqual(detailed.usage,usageTotals(proofs))
  assert.deepEqual((await h.read('/api/v1/settings')).data.usage,usageTotals(proofs))
  console.log('PROBE AI-005 1: three known command identities -> complete attributed call readback with bounded duration and null cost')
  assert.deepEqual(await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),before)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM lenses').first()).n,2)
  for(const call of calls){assert.equal(call.store,false);assert.doesNotMatch(call.input[0].content[0].text,/customFields|comments/)}
  const queued=await Promise.all(['campaign-brief','lens-proposal'].map(feature=>h.command('launch.analysis.request',{feature,...feature==='campaign-brief'?{campaignId:c.id}:{prompt:'Budget concurrent'}})))
  await h.tick(clock.at);const outcomes=await Promise.all(queued.map(async q=>(await h.read('/api/v1/launch/analysis-requests/'+value(q).requestId)).data));assert.equal(outcomes.filter(x=>x.state==='Complete').length,1);assert.equal(outcomes.filter(x=>x.error?.code==='budget_exhausted').length,1)
  assert.equal(calls.length,4);settings=(await h.read('/api/v1/settings')).data;const usage=settings.usage.filter(u=>u.day);assert.equal(usage.reduce((n,u)=>n+u.requests,0),4);assert.equal(usage.reduce((n,u)=>n+u.inputTokens,0),receipts.reduce((n,u)=>n+u.inputTokens,0));assert.ok(usage.every(u=>u.cost===null))
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analysis_requests WHERE authority_json IS NOT NULL').first()).n,0)
 }finally{await h.close()}
})
