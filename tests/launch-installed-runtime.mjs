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

test('[AI-001/002/003/004/005/006 SET-002] unconfigured AI refuses enabling and requests naming what is missing while other work runs; configured commands execute three immutable analyses, exclude private context, record usage and enforce one concurrent daily budget',async()=>{
 const calls=[],mail=[],h=await setup({configuration:{AI_PROVIDER_API_KEY:undefined,AI_MODEL:undefined},providerFetch:async request=>{
  if(request.url==='https://api.sendgrid.com/v3/mail/send'){mail.push(await request.json());return new Response(null,{status:202,headers:{'x-message-id':'synthetic-cradle-mail-'+mail.length}})}
  assert.equal(request.url,'https://api.openai.com/v1/responses');const body=await request.json();calls.push(body)
  const proposal=body.input[0].content[0].text.includes('lens-proposal')?{name:'Draft risk lens',description:'Review',recordType:'Risk',conditions:[],sort:{field:'severity',direction:'desc'},fields:['title','severity'],display:'Cards'}:null
  return Response.json({id:'response-'+calls.length,model:'test-model',status:'completed',usage:{input_tokens:13,output_tokens:7},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Read-only evidence analysis',proposedLens:proposal})}]}]})
 }});try{
  const brief=(await h.db.prepare("SELECT id FROM automations WHERE shipped_key='campaign-brief'").first()).id,critical=(await h.db.prepare("SELECT id FROM automations WHERE shipped_key='critical-risk'").first()).id
  const briefRuns=async()=>(await h.read(`/api/automations/${brief}/runs`)).runs
  const noBrief=async()=>{assert.deepEqual(await briefRuns(),[]);assert.deepEqual({...await h.db.prepare("SELECT (SELECT count(*) FROM admission_outbox WHERE action='launch.analysis.execute') outbox,(SELECT count(*) FROM launch_analysis_requests) requests,(SELECT count(*) FROM launch_model_calls) calls").first()},{outbox:0,requests:0,calls:0});assert.equal(calls.length,0)}
  const c=await campaign(h,'AI')
  // The installation omits or blanks declared values: enabling and AI requests are refused naming exactly what is missing, and nothing changes.
  const refuse=async missing=>{
   const before=(await h.read('/api/v1/settings')).data,capability=before.capabilities.find(x=>x.id==='ai.provider.v1');assert.deepEqual([capability.state,capability.missing],['unconfigured',missing])
   assert.equal((await h.command('settings.update',{version:before.version,changes:{aiEnabled:true,aiDailyCeiling:9}},[],400)).error.message,'AI cannot be enabled: missing '+missing.join(', '))
   const after=(await h.read('/api/v1/settings')).data;assert.deepEqual([after.aiEnabled,after.version,after.aiDailyCeiling],[false,before.version,before.aiDailyCeiling])
   assert.equal((await h.command('launch.analysis.request',{feature:'campaign-brief',campaignId:c.id},[],400)).error.message,`AI is disabled; configure ${missing.join(' and ')} on the installation, then enable AI in Settings`)
  }
  await refuse(['AI_PROVIDER_API_KEY','AI_MODEL'])
  // While AI is off, the campaign create and update drain with no brief; an ordinary mutation, read and automation still succeed.
  const owner=(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Updated while AI is off'}},expected(campaignEntity,c))
  const r=value(await h.command('launch.risk.create',{fields:{campaignId:c.id,ownerId:owner,title:'Unconfigured risk',severity:'High',signal:'Signal',mitigation:'Mitigation',dueDate:null}}));await h.command('launch.risk.patch',{id:r.id,changes:{severity:'Critical'}},expected(riskEntity,r))
  await h.tick();assert.deepEqual((await h.db.prepare("SELECT e.name,EXISTS(SELECT 1 FROM launch_event_dispatches d WHERE d.event_id=e.id) dispatched FROM admission_events e WHERE e.app_id=? AND json_extract(e.subject_json,'$.recordId')=? ORDER BY e.created_at,e.id").bind(appId,c.id).all()).results.map(e=>({...e})),[{name:'campaign.created',dispatched:1},{name:'campaign.updated',dispatched:1}])
  assert.equal((await h.read('/api/campaigns/'+c.id)).campaign.summary,'Updated while AI is off');assert.equal((await h.read('/api/risks/'+r.id)).risk.state,'Escalated');assert.deepEqual((await h.read(`/api/automations/${critical}/runs`)).runs.map(run=>run.state),['Succeeded'])
  await noBrief()
  for(const [changes,missing] of [[{AI_MODEL:'test-model'},['AI_PROVIDER_API_KEY']],[{AI_PROVIDER_API_KEY:'synthetic-cradle-1'},['AI_MODEL']],[{AI_PROVIDER_API_KEY:'',AI_MODEL:'  '},['AI_PROVIDER_API_KEY','AI_MODEL']]]){await h.reconfigure(changes);await refuse(missing)}
  await noBrief();await h.reconfigure({AI_PROVIDER_API_KEY:'test-network-edge-only',AI_MODEL:'test-model'})
  const disabled=await h.command('launch.analysis.request',{feature:'campaign-brief',campaignId:c.id},[],400);assert.match(disabled.error.message,/disabled/i);assert.equal(calls.length,0)
  await h.command('launch.deliverable.create',{fields:{campaignId:c.id,title:'Launch deliverable',ownerId:owner,dueDate:null}})
  await h.command('launch.milestone.create',{fields:{campaignId:c.id,title:'Launch milestone',ownerId:owner,type:'Review',status:'Not started',startDate:'2026-10-01',endDate:null,conflictReason:null}})
  await h.command('launch.risk.create',{fields:{campaignId:c.id,title:'Launch risk',ownerId:owner,severity:'High',dueDate:null,signal:'Evidence',mitigation:'Review'}})
  await h.command('launch.decision.create',{fields:{campaignId:c.id,riskId:null,supersedesId:null,title:'Launch decision',requesterId:owner,assigneeId:null,priority:'High',dueAt:new Date(Date.now()+86400000).toISOString(),recommendation:'Review',impact:'Launch readiness'}})
  let settings=(await h.read('/api/v1/settings')).data;assert.equal(settings.capabilities.find(c=>c.id==='ai.provider.v1').state,'ready');await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:4}})
  const lens=await h.db.prepare("SELECT id FROM lenses WHERE shipped_key='risks'").first(),before=await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first()
  for(const input of [{feature:'campaign-brief',campaignId:c.id},{feature:'risk-readout',lensId:lens.id},{feature:'lens-proposal',prompt:'Find risky launches'}]){
   const accepted=value(await h.command('launch.analysis.request',input));await h.tick();await waitFor(()=>h.read('/api/v1/launch/analysis-requests/'+accepted.requestId),x=>['Complete','Failed'].includes(x.data.state));const done=(await h.read('/api/v1/launch/analysis-requests/'+accepted.requestId)).data;assert.equal(done.state,'Complete',JSON.stringify(done));assert.equal(done.analysis.aiGenerated,true);assert.equal(done.analysis.feature,input.feature)
   if(input.feature!=='lens-proposal')assert.ok(done.analysis.inputVersions.length);if(input.feature==='campaign-brief')assert.equal(new Set(done.analysis.inputVersions.map(v=>v.ref.entityId)).size,5)
  }
  assert.deepEqual(await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),before)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM lenses').first()).n,2)
  for(const call of calls){assert.equal(call.store,false);assert.doesNotMatch(call.input[0].content[0].text,/customFields|comments/)}
  const queued=await Promise.all(['campaign-brief','lens-proposal'].map(feature=>h.command('launch.analysis.request',{feature,...feature==='campaign-brief'?{campaignId:c.id}:{prompt:'Budget concurrent'}})))
  await h.tick();const outcomes=await Promise.all(queued.map(async q=>(await h.read('/api/v1/launch/analysis-requests/'+value(q).requestId)).data));assert.equal(outcomes.filter(x=>x.state==='Complete').length,1);assert.equal(outcomes.filter(x=>x.error?.code==='budget_exhausted').length,1)
  assert.equal(calls.length,4);settings=(await h.read('/api/v1/settings')).data;const usage=settings.usage.filter(u=>u.day);assert.equal(usage.reduce((n,u)=>n+u.requests,0),4);assert.equal(usage.reduce((n,u)=>n+u.inputTokens,0),52);assert.ok(usage.every(u=>u.cost===null))
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analysis_requests WHERE authority_json IS NOT NULL').first()).n,0)
  // A value removed after enabling turns AI off again: requests name it and a campaign update dispatches no brief.
  await h.reconfigure({AI_PROVIDER_API_KEY:'test-network-edge-only',AI_MODEL:undefined})
  assert.equal((await h.command('launch.analysis.request',{feature:'risk-readout',lensId:lens.id},[],400)).error.message,'AI is unavailable; configure AI_MODEL on the installation')
  await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Updated after the model was removed'}},expected(campaignEntity,await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(c.id).first()));await h.tick()
  assert.deepEqual(await briefRuns(),[]);assert.equal(calls.length,4)
 }finally{await h.close()}
})
