import test from 'node:test'
import assert from 'node:assert/strict'
import {launchBaseAuthorityRuntime} from './helpers/launch-base-authority-runtime.mjs'
const {createUlid}=await import('../src/core/shared/ids.ts')
const {LAUNCH_APP_ID:appId,launchEntities}=await import('../src/apps/launch/contracts.ts')
const campaignEntity=launchEntities.campaign,riskEntity=launchEntities.risk
import {setup,value,campaign,waitFor,expected} from './helpers/launch-installed.mjs'

test('[AUTO-002/003/004/011] emitted queue escalates committed Critical risk within ten seconds; replay, rollback and disable make no duplicate effects',async t=>{
 const automaticBriefs=[],h=await setup({automaticQueues:true,configuration:{AI_PROVIDER_API_KEY:'edge-only',AI_MODEL:'edge-model'},providerFetch:async request=>{assert.equal(request.url,'https://api.openai.com/v1/responses');automaticBriefs.push(await request.json());return Response.json({id:'automatic-brief',model:'edge-model',status:'completed',usage:{input_tokens:5,output_tokens:3},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Automatically dispatched immutable brief',proposedLens:null})}]}]})}});try{
  // Read the installed definitions before any fixture or settings command can change them.
  const definitions=async()=>(await h.read('/api/automations')).automations
  const shipped=await definitions()
  assert.equal(shipped.length,4,'A fresh install exposes exactly the four shipped automations')
  const declared=rows=>rows.map(({name,trigger,actions,enabled})=>({name,trigger,actions,enabled})).sort((a,b)=>a.name.localeCompare(b.name))
  assert.deepEqual(declared(shipped),[
   {name:'Campaign brief',trigger:'campaign created or campaign updated',actions:['request-ai-analysis'],enabled:true},
   {name:'Critical risk escalation',trigger:'risk updated',actions:['escalate-risk'],enabled:true},
   {name:'Launch readiness',trigger:'Every day at 08:00 workspace time, 5 days before launch',actions:['readiness'],enabled:true},
   {name:'Weekly portfolio digest',trigger:'Every Monday at 09:00 workspace time',actions:['digest'],enabled:false},
  ])
  const initialSettings=(await h.read('/api/v1/settings')).data
  assert.deepEqual([initialSettings.readinessLeadDays,initialSettings.readinessHour],[5,8])
  t.diagnostic('PROBE AUTO-011 1-5: fresh Monitor and Settings -> four declared names, triggers, actions and enabled defaults; readiness five days at 08:00, Monday 09:00 digest disabled')
  const effects=async()=>({
   definitions:(await h.db.prepare('SELECT * FROM automations ORDER BY id').all()).results,
   runs:(await h.read('/api/automations/runs')).runs,
   records:(await h.db.batch(['activity_entries','decisions','launch_readiness','notifications','channel_deliveries','launch_analyses','launch_analysis_requests'].map(table=>h.db.prepare(`SELECT * FROM ${table} ORDER BY id`)))).map(result=>result.results),
  })
  async function refuseShippedEdits(){
   const before=await effects(),visible=await definitions(),subject=createUlid()
   for(const installed of visible){
    // These are well-formed save payloads, so the refusal must come from the shipped-definition rule.
    const definition={name:installed.name,enabled:installed.enabled,trigger:{kind:'event',event:'risk.updated.v1'},actions:[{command:'add-activity',input:{campaignId:subject,message:'Must never be committed'}}]}
    for(const [parameter,change] of [
     ['name',{name:'Forbidden replacement'}],
     ['trigger',{trigger:{kind:'event',event:'campaign.created.v1'}}],
     ['actions',{actions:[{command:'request-ai-analysis',input:{campaignId:subject}}]}],
    ]){
     const refused=await h.command('launch.automation.save',{id:installed.id,definition:{...definition,...change}},expected(launchEntities.automation,installed),400)
     assert.equal(refused.error.code,'validation',`${installed.name} ${parameter} must be a validation refusal`)
     assert.match(refused.error.message,/Shipped automations only permit/)
     assert.deepEqual(await definitions(),visible,`${installed.name} ${parameter} refusal preserves every public definition and version`)
     assert.deepEqual(await effects(),before,`${installed.name} ${parameter} refusal preserves definitions and effects`)
    }
   }
  }
  await refuseShippedEdits()
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
  // Repeat against populated execution history, then exercise every shipped disable door.
  await refuseShippedEdits()
  t.diagnostic('PROBE AUTO-011 6: name, trigger and action save attempts for all four current versions -> validation refusal; public definitions and populated effects unchanged')
  for(let installed of await definitions()){
   if(!installed.enabled)installed=value(await h.command('launch.automation.enable',{id:installed.id},expected(launchEntities.automation,installed)))
   const disabled=value(await h.command('launch.automation.disable',{id:installed.id},expected(launchEntities.automation,installed)))
   const after=(await definitions()).find(row=>row.id===installed.id)
   assert.equal(disabled.enabled,false);assert.equal(after.enabled,false)
   assert.equal(after.version,installed.version+1);assert.equal(after.definitionVersion,installed.definitionVersion+1)
   assert.deepEqual({name:after.name,trigger:after.trigger,actions:after.actions},{name:installed.name,trigger:shipped.find(row=>row.id===installed.id).trigger,actions:shipped.find(row=>row.id===installed.id).actions})
  }
  const disabledEffects=await effects()
  const noBrief=await campaign(h,'DISABLED')
  await h.tick()
  assert.equal(automaticBriefs.length,1)
  assert.deepEqual((await h.read('/api/automations/runs')).runs,disabledEffects.runs,'Disabled shipped definitions admit no new run')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analyses WHERE subject_id=?').bind(noBrief.id).first()).n,0)
  t.diagnostic('PROBE AUTO-011 6: native disable commands -> all four read back disabled with advanced versions and preserved names, triggers and actions; later campaign creates no brief')

 }finally{await h.close()}
})

test('[AI-001/002/003/004/005/006 SET-002] actual commands execute three immutable analyses, exclude private context, record usage and enforce one concurrent daily budget',async()=>{
 const calls=[],h=await setup({configuration:{AI_PROVIDER_API_KEY:'test-network-edge-only',AI_MODEL:'test-model'},providerFetch:async request=>{
  assert.equal(request.url,'https://api.openai.com/v1/responses');const body=await request.json();calls.push(body)
  const proposal=body.input[0].content[0].text.includes('lens-proposal')?{name:'Draft risk lens',description:'Review',recordType:'Risk',conditions:[],sort:{field:'severity',direction:'desc'},fields:['title','severity'],display:'Cards'}:null
  return Response.json({id:'response-'+calls.length,model:'test-model',status:'completed',usage:{input_tokens:13,output_tokens:7},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Read-only evidence analysis',proposedLens:proposal})}]}]})
 }});try{
  const c=await campaign(h,'AI'),disabled=await h.command('launch.analysis.request',{feature:'campaign-brief',campaignId:c.id},[],400);assert.match(disabled.error.message,/disabled/i);assert.equal(calls.length,0)
  const owner=(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
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
 }finally{await h.close()}
})
