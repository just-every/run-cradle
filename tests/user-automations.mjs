import {automationCreateTargetJourney} from './helpers/automation-create-target-journey.mjs'
import {automationCreateJourney} from './helpers/automation-create-journey.mjs'
import {recordTemplateButtons} from './helpers/record-template-buttons.mjs'
import {recordTemplateAutomation} from './helpers/record-template-automation.mjs'
import {smsJourney} from './helpers/sms-journey.mjs'
import {automationTriggerJourney} from './helpers/automation-trigger-journey.mjs'
import {automationControlJourney} from './helpers/automation-control-journey.mjs'
import {automationFailureJourney} from './helpers/automation-failure-journey.mjs'
import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {userAutomationRuntime} from './helpers/user-automation-runtime.mjs'
import {automationTestJourney} from './helpers/automation-test-journey.mjs'
import {automationQuietHours} from './helpers/automation-quiet-hours.mjs'
import {createUlid} from '../src/core/shared/ids.ts'

contract('AUTO-USER-001','[RECORDS-009] [AUTO-USER-003] [AUTO-USER-005] [AUTO-USER-006] [AUTO-USER-004] [AUTO-USER-002] real admitted record triggers run notify/email/update once, retain history, and stop disabled or revoked work',async()=>{
 await smsJourney()
 const relay='https://mail.rer.example.test/api/managed-mail/send',delivered=[],receiverCalls=[];let testMailStatus=202,receiverStatus=200
 const h=await userAutomationRuntime(0,{outbound:async request=>{
  if(request.url==='https://relay.example.com/v1/deliver'){const wire=await request.json();receiverCalls.push(wire);const status=typeof receiverStatus==='function'?await receiverStatus(wire):receiverStatus;return status===503?new Response(null,{status:503}):Response.json({status,headers:{},body:''})}
  assert.equal(request.url,relay);assert.equal(request.headers.get('authorization'),'Bearer synthetic-record-relay-key')
  delivered.push(await request.json());return new Response(null,{status:testMailStatus})
 }})
 const providerMessages=h.mailMessages
 h.mailMessages=async()=>[...await providerMessages(),...delivered]
 try {
  await h.restart({MAIL_PROVIDER:'rer',MAIL_PROVIDER_API_KEY:undefined,MAIL_API_KEY:'synthetic-record-relay-key',MAIL_RELAY_URL:relay,EGRESS_RELAY_URL:'https://relay.example.com/v1/deliver',EGRESS_RELAY_SECRET:'synthetic-cradle-71-relay-secret-0000000000'})
  const settings=(await h.request('/api/v1/settings')).data
  await h.request('/api/v1/commands/settings.update',{method:'POST',body:{commandId:createUlid(),expected:[],input:{version:settings.version,changes:{quietHoursStart:'00:00',quietHoursEnd:'00:00'}}}})
  await recordTemplateButtons(h)
  await recordTemplateAutomation(h)
  await automationCreateJourney(h)
  await automationTestJourney(h,delivered,status=>{testMailStatus=status})
  await automationFailureJourney(h,delivered,status=>{receiverStatus=status},receiverCalls)
  await automationControlJourney(h,receiverCalls,status=>{receiverStatus=status})
  await automationTriggerJourney(h)
  delivered.length=0
  const save={commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{
   name:'Welcome record',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[
    {kind:'notify',operatorId:h.operator,title:'A new item needs review'},
    {kind:'email',operatorId:h.operator,subject:'New item',text:'Open Cradle to review the new item.'},
    {kind:'update',fieldId:h.statusId,value:'review'},
   ]}}
  await h.request('/api/user-automations',{method:'POST',status:400,body:{...save,definition:{...save.definition,event:''}}})
  const automation=(await h.request('/api/user-automations',{method:'POST',status:201,body:save})).data.result.value
  const created=await h.create('Automation item')
  await h.tick(created.commandId);await h.tick(created.commandId)
  const runs=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs
  assert.equal(runs.length,1);assert.equal(runs[0].state,'Complete');assert.deepEqual(runs[0].actions.map(action=>action.state),['Complete','Complete','Complete'])
  const record=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${created.record.ref.recordId}`)).data.record
  assert.equal(record.fields[h.statusId].value,'review')
  assert.equal((await h.db.prepare('SELECT count(*) AS n FROM channel_events WHERE event_id IN (SELECT id FROM launch_automation_actions WHERE run_id=?)').bind(runs[0].id).first()).n,1)
  assert.deepEqual(delivered,[{to:'import-owner@example.test',subject:'New item',text:'Open Cradle to review the new item.'}])
  const beforeDisable=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.length
  await h.request(`/api/user-automations/${automation.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:automation.version}})
  await automationQuietHours(h,save.definition)
  const loop=(await h.request('/api/user-automations',{method:'POST',status:201,body:{...save,commandId:createUlid(),definition:{...save.definition,name:'One update per chain',event:'updated',actions:[{kind:'update',fieldId:h.statusId,value:'loop-safe'}]}}})).data.result.value
  const changed=await h.patch(record,{[h.statusId]:'start'})
  await h.tick(changed.data.commandId)
  const worker=await h.runtime.getWorker();await worker.scheduled({cron:'* * * * *'})
  const loopRuns=(await h.request(`/api/user-automations/${loop.id}/runs`)).data.runs
  assert.ok(loopRuns.some(run=>run.state==='Complete'));assert.ok(loopRuns.some(run=>run.state==='Suppressed'))
  const afterDisable=await h.create('Disabled item');await h.tick(afterDisable.commandId)
  assert.equal((await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.length,beforeDisable)
  await h.db.prepare('UPDATE authority_delegations SET revoked_at=? WHERE automation_id=?').bind(Date.now(),loop.id).run()
  const pending=await h.patch((await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${afterDisable.record.ref.recordId}`)).data.record,{[h.statusId]:'after revocation'})
  await h.tick(pending.data.commandId)
  // Real queue delivery may still be executing the run; wait (bounded) until no run is in flight.
  let revoked=[]
  for(let attempt=0;attempt<40;attempt++){revoked=(await h.request(`/api/user-automations/${loop.id}/runs`)).data.runs;if(!revoked.some(run=>['Queued','Running'].includes(run.state)))break;await new Promise(resolve=>setTimeout(resolve,250))}
  assert.ok(revoked.some(run=>run.state==='Cancelled'))
  await automationCreateTargetJourney(h)
 }finally{await h.close()}
})
