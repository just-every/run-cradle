import {mapReviewedLaunchOperator} from './helpers/explicit-launch-member.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {environment} from './launch-support.mjs'
test('[AUTO-LEGACY-AUTH] saved shipped capability cannot become caller, arbitrary definition or model authority',async()=>{
 const e=await environment();try{
 const {r,db,actor,context}=e,other=r.createUlid();await db.prepare('INSERT INTO operators VALUES(?,?,?,1,?,?,1)').bind(other,Date.now(),Date.now(),'Other','other@example.test').run();await db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',1,1)").bind(other,other).run();await db.batch(await r.prepareLaunchSetup(db,actor));await mapReviewedLaunchOperator(e,other);const c=await e.campaign('BOUND',other),risk=await e.commit('risk.create',{fields:{campaignId:c.id,title:'Critical issue',ownerId:actor,severity:'Critical',dueDate:null,signal:'Verified',mitigation:'Review'}})
 const event=await db.prepare("SELECT * FROM admission_events WHERE name='risk.created' ORDER BY created_at DESC LIMIT 1").first(),definition=await db.prepare("SELECT * FROM automations WHERE shipped_key='critical-risk'").first(),service=r.createLegacyAutomationAuthority(context),ports={releaseId:r.createUlid(),authority:service.authority,context:service.context,external:async()=>{throw Error('Unexpected external')}}
 const serviceAdmission=r.createAdmissionService(db,{authorizeReplay:service.authorizeReplay}),runtime=r.createLegacyAutomationRuntime(context,serviceAdmission,ports),ctx=service.eventContext(event.id),runId=await runtime.trigger(ctx,definition,event.id,[risk.id]),dispatch=service.dispatchContext(runId)
 const saved=await db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(runId).first(),run={id:runId,automationId:definition.id,definitionVersion:definition.definition_version,definition,subjectIds:[risk.id],causeRunIds:[],triggerKey:event.id,retryOf:null}
 await assert.rejects(()=>service.context(e.ctx,run),/internal/)
 await assert.rejects(()=>service.context(dispatch,{...run,id:r.createUlid()}),/bound/)
 await assert.rejects(()=>service.context(dispatch,{...run,definition:{...definition,actions_json:'[{"command":"send-email"}]'}}),/substituted/)
 const scoped=await service.context(dispatch,run)
 await assert.rejects(()=>scoped.policy.authorize(dispatch,{appId:r.LAUNCH_APP_ID,action:'model.generate',expected:[],cost:[],inputHash:'x'}),/another business or provider action/)
 await assert.rejects(()=>scoped.integration.notification(dispatch,{kind:'critical-risk-escalated',operatorId:actor,campaignId:c.id,subjectId:risk.id,eventId:r.createUlid()}),/recipient/)
 await runtime.execute(dispatch,runId);const receipt=await db.prepare("SELECT command_id FROM command_admissions WHERE actor_id=? AND action='launch.automation.execute' ORDER BY created_at DESC LIMIT 1").bind(r.LEGACY_LAUNCH_SERVICE_ID).first();await serviceAdmission.status(dispatch,receipt.command_id);await assert.rejects(()=>serviceAdmission.status(e.ctx,receipt.command_id),/internal/);assert.equal((await db.prepare('SELECT state FROM risks WHERE id=?').bind(risk.id).first()).state,'Escalated')
 await db.prepare('UPDATE automations SET enabled=0 WHERE id=?').bind(definition.id).run();await assert.rejects(()=>service.authority(service.eventContext(event.id),{commandId:r.createUlid(),action:'launch.automation.trigger',run,inputHash:'x'}),/disabled/)
 }finally{await e.close()}
})
