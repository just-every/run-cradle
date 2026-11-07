import test from 'node:test'
import assert from 'node:assert/strict'
import {launchBaseAuthorityRuntime} from './helpers/launch-base-authority-runtime.mjs'
const {createUlid}=await import('../src/core/shared/ids.ts')
const {LAUNCH_APP_ID:appId,launchEntities}=await import('../src/apps/launch/contracts.ts')
const campaignEntity=launchEntities.campaign,riskEntity=launchEntities.risk
import {setup,value,campaign,waitFor,expected} from './helpers/launch-installed.mjs'

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

test('[AI-001/002/003/004/005/006 SET-002] actual commands retain campaign brief provenance across source edits, execute three analysis features, exclude private context, record usage and enforce one concurrent daily budget',async()=>{
 const calls=[],completedAt=[],h=await setup({configuration:{AI_PROVIDER_API_KEY:'synthetic-cradle-1',AI_MODEL:'synthetic-cradle-2'},providerFetch:async request=>{
  assert.equal(request.url,'https://api.openai.com/v1/responses');const body=await request.json();calls.push(body)
  const proposal=body.input[0].content[0].text.includes('lens-proposal')?{name:'Draft risk lens',description:'Review',recordType:'Risk',conditions:[],sort:{field:'severity',direction:'desc'},fields:['title','severity'],display:'Cards'}:null
  // Hold only the provider edge so the produced timestamp cannot be the execution start.
  await new Promise(resolve=>setTimeout(resolve,25));completedAt.push(Date.now())
  return Response.json({id:'response-'+calls.length,model:'synthetic-cradle-2',status:'completed',usage:{input_tokens:13,output_tokens:7},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Read-only evidence analysis '+calls.length,proposedLens:proposal})}]}]})
 }});try{
  const automaticBrief=await h.db.prepare("SELECT id,version FROM automations WHERE shipped_key='campaign-brief'").first()
  await h.command('launch.automation.disable',{id:automaticBrief.id},expected(launchEntities.automation,automaticBrief))
  const c=await campaign(h,'AI'),disabled=await h.command('launch.analysis.request',{feature:'campaign-brief',campaignId:c.id},[],400);assert.match(disabled.error.message,/disabled/i);assert.equal(calls.length,0)
  const owner=(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  const deliverable=value(await h.command('launch.deliverable.create',{fields:{campaignId:c.id,title:'Launch deliverable',ownerId:owner,dueDate:null}}))
  const secondDeliverable=value(await h.command('launch.deliverable.create',{fields:{campaignId:c.id,title:'Publish notes',ownerId:owner,dueDate:null}}))
  const milestone=value(await h.command('launch.milestone.create',{fields:{campaignId:c.id,title:'Launch milestone',ownerId:owner,type:'Review',status:'Not started',startDate:'2026-10-01',endDate:null,conflictReason:null}}))
  const risk=value(await h.command('launch.risk.create',{fields:{campaignId:c.id,title:'Launch risk',ownerId:owner,severity:'High',dueDate:null,signal:'Evidence',mitigation:'Review'}}))
  const decision=value(await h.command('launch.decision.create',{fields:{campaignId:c.id,riskId:null,supersedesId:null,title:'Launch decision',requesterId:owner,assigneeId:null,priority:'High',dueAt:new Date(Date.now()+86400000).toISOString(),recommendation:'Review',impact:'Launch readiness'}}))
  // Expected provenance comes from committed command receipts, never the analysis or provider input.
  const inputs=[['campaign',c],['deliverable',deliverable],['deliverable',secondDeliverable],['milestone',milestone],['risk',risk],['decision',decision]]
  const revisions=rows=>rows.flatMap(([kind,row])=>expected(launchEntities[kind],row)).sort((a,b)=>a.ref.recordId.localeCompare(b.ref.recordId))
  const initialRevisions=revisions(inputs)
  const readInputs=async()=>Promise.all(inputs.map(async([kind,row])=>(await h.read(`/api/v1/apps/${appId}/entities/${launchEntities[kind]}/records/${row.id}`)).data.record))
  const initialInputs=await readInputs()
  let settings=(await h.read('/api/v1/settings')).data;assert.equal(settings.capabilities.find(c=>c.id==='ai.provider.v1').state,'ready');await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:5}})
  const lens=await h.db.prepare("SELECT id FROM lenses WHERE shipped_key='risks'").first(),before=await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first()
  const complete=async input=>{
   const accepted=value(await h.command('launch.analysis.request',input)),started=Date.now()
   await h.tick()
   const done=(await waitFor(()=>h.read('/api/v1/launch/analysis-requests/'+accepted.requestId),x=>['Complete','Failed'].includes(x.data.state))).data
   assert.equal(done.state,'Complete',JSON.stringify(done));assert.equal(done.analysis.aiGenerated,true);assert.equal(done.analysis.feature,input.feature)
   return{requestId:accepted.requestId,analysis:done.analysis,started,finished:Date.now(),providerFinished:completedAt.at(-1)}
  }
  const assertBrief=(result,expectedRevisions)=>{
   assert.equal(result.analysis.campaignId,c.id)
   assert.equal(result.analysis.lensId,null)
   const produced=Date.parse(result.analysis.createdAt)
   assert.ok(produced>=result.started&&produced>=result.providerFinished&&produced<=result.finished,`Produced timestamp ${result.analysis.createdAt} outside completion bounds ${result.providerFinished}..${result.finished}`)
   assert.deepEqual([...result.analysis.inputVersions].sort((a,b)=>a.ref.recordId.localeCompare(b.ref.recordId)),expectedRevisions)
  }
  let firstBrief
  for(const input of [{feature:'campaign-brief',campaignId:c.id},{feature:'risk-readout',lensId:lens.id},{feature:'lens-proposal',prompt:'Find risky launches'}]){
   const result=await complete(input),done=result.analysis
   if(input.feature!=='lens-proposal')assert.ok(done.inputVersions.length)
   if(input.feature==='campaign-brief'){
    assert.equal(new Set(done.inputVersions.map(v=>v.ref.entityId)).size,5)
    assertBrief(result,initialRevisions);firstBrief=result
    assert.deepEqual((await h.read('/api/v1/launch/analyses/'+done.id)).data,done)
   }
  }
  assert.deepEqual(await readInputs(),initialInputs,'Analysis requests leave every included business input unchanged')
  assert.deepEqual(await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),before)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM lenses').first()).n,2)
  for(const call of calls){assert.equal(call.store,false);assert.doesNotMatch(call.input[0].content[0].text,/customFields|comments/)}
  const current=[]
  for(const [kind,row] of inputs){
   const changes=kind==='campaign'?{objective:'Reviewed launch objective'}:kind==='risk'?{signal:'New risk evidence'}:kind==='decision'?{recommendation:'Revised recommendation'}:{title:'Reviewed '+row.title}
   const updated=value(await h.command('launch.'+kind+'.patch',{id:row.id,changes},expected(launchEntities[kind],row)))
   assert.equal(updated.id,row.id);assert.equal(updated.version,row.version+1)
   current.push([kind,updated])
  }
  const currentInputs=await readInputs()
  const later=await complete({feature:'campaign-brief',campaignId:c.id})
  assertBrief(later,revisions(current))
  assert.notEqual(later.analysis.id,firstBrief.analysis.id);assert.notEqual(later.analysis.content,firstBrief.analysis.content)
  assert.ok(Date.parse(later.analysis.createdAt)>Date.parse(firstBrief.analysis.createdAt))
  const laterContext=JSON.parse(calls[3].input[0].content[0].text)
  assert.equal(laterContext.campaign.objective,'Reviewed launch objective');assert.equal(laterContext.risk[0].signal,'New risk evidence');assert.equal(laterContext.decision[0].recommendation,'Revised recommendation')
  assert.deepEqual(await readInputs(),currentInputs,'The later brief leaves revised business inputs unchanged')
  for(const result of [firstBrief,later]){
   assert.deepEqual((await h.read('/api/v1/launch/analyses/'+result.analysis.id)).data,result.analysis,'Public analysis read retains content and provenance')
   const retained=(await h.read('/api/v1/launch/analysis-requests/'+result.requestId)).data
   assert.equal(retained.state,'Complete');assert.deepEqual(retained.analysis,result.analysis,'Completed request retains its original analysis')
  }
  const queued=await Promise.all(['campaign-brief','lens-proposal'].map(feature=>h.command('launch.analysis.request',{feature,...feature==='campaign-brief'?{campaignId:c.id}:{prompt:'Budget concurrent'}})))
  await h.tick();const outcomes=await Promise.all(queued.map(async q=>(await h.read('/api/v1/launch/analysis-requests/'+value(q).requestId)).data));assert.equal(outcomes.filter(x=>x.state==='Complete').length,1);assert.equal(outcomes.filter(x=>x.error?.code==='budget_exhausted').length,1)
  assert.equal(calls.length,5);settings=(await h.read('/api/v1/settings')).data;const usage=settings.usage.filter(u=>u.day);assert.equal(usage.reduce((n,u)=>n+u.requests,0),5);assert.equal(usage.reduce((n,u)=>n+u.inputTokens,0),65);assert.ok(usage.every(u=>u.cost===null))
  for(const call of calls){assert.equal(call.store,false);assert.doesNotMatch(call.input[0].content[0].text,/customFields|comments/)}
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analysis_requests WHERE authority_json IS NOT NULL').first()).n,0)
 }finally{await h.close()}
})
