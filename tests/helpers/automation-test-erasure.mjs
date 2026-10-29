import assert from 'node:assert/strict'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {baseHttpSession} from './base-http-session.mjs'
import {populateAutomationTestHistory,assertAutomationTestHistory} from './automation-test-history.mjs'
import {automationTestAudit} from './automation-test-audit.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

/** Transfer ownership, then remove and erase a real test author through native commands. */
export async function automationTestErasure(){
 const mail=[];let mailStatus=202
 const h=await userAutomationRuntime(0,{outbound:async request=>{assert.equal(new URL(request.url).hostname,'automation-test-mail.example.test');mail.push(await request.json());return new Response(null,{status:mailStatus})}})
 try{
  const mailBindings={MAIL_PROVIDER:'rer',MAIL_PROVIDER_API_KEY:undefined,MAIL_API_KEY:'synthetic-cradle-5105',MAIL_RELAY_URL:'https://automation-test-mail.example.test/send'}
  await h.restart(mailBindings)
  const fixture=await populateAutomationTestHistory(h,mail,status=>{mailStatus=status})
  const policy=(await h.request('/api/v1/authority/invite-policies?appId='+h.appId)).data[0]
  const email=['synthetic-cradle-5108','example.test'].join('@')
  const successor=(await h.request('/api/v1/commands/member.invite',{method:'POST',body:{commandId:createUlid(),expected:[],input:{email,name:'synthetic-cradle-5108',scopes:[{appId:h.appId,policyId:policy.id,legacy:false}]}}})).data.value
  await h.restart({MAIL_PROVIDER:'sendgrid',MAIL_PROVIDER_API_KEY:'test-only-sendgrid-mail-edge'})
  const invitedAt=(await h.mailMessages()).length
  await h.request('/auth/invite',{method:'POST',body:{email,displayName:'synthetic-cradle-5108',role:'member'},status:202})
  const invitation=(await h.mailMessages()).slice(invitedAt).find(message=>message.personalizations?.some(group=>group.to?.some(recipient=>recipient.email===email)))
  assert.ok(invitation,'The successor receives an actual native invitation')
  const link=new URL(invitation.content.find(part=>part.type==='text/plain').value.match(/https?:\/\/[^\s]+/)[0])
  const accepted=await fetch(h.origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({token:link.searchParams.get('token')})})
  assert.equal(accepted.status,303);await accepted.arrayBuffer()
  let successorSession=await baseHttpSession(h.origin,email)
  const ownerSession=await baseHttpSession(h.origin,fixture.owner.email)
  const as=session=>async(route,body,status=200)=>{
   const response=await fetch(h.origin+route,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{cookie:session.cookie,origin:h.origin,'x-csrf-token':session.csrfToken,'content-type':'application/json',connection:'close'},...(body===undefined?{}:{body:JSON.stringify(body)})})
   const value=await response.json().catch(()=>null);assert.equal(response.status,status,route+': '+JSON.stringify(value));return value?.data
  }
  const owner=as(ownerSession),expected=(id,version)=>[{ref:{appId:h.appId,entityId:'00000000000000000000000101',recordId:id},version}]
  const member=async(request,id)=>(await request('/api/v1/members?appId='+h.appId)).items.find(row=>row.id===id)
  const command=async(request,action,input,rows=[])=>{const data=await request('/api/v1/commands/'+action,{commandId:createUlid(),expected:rows,input});assert.equal(data.state,'committed');return data.value}
  const active=await member(owner,successor.id);assert.equal(active.state,'active','The invited successor really signs in before ownership can transfer')
  await command(owner,'member.transfer-ownership',{memberId:successor.id},expected(successor.id,active.version))
  successorSession=await baseHttpSession(h.origin,email)
  const current=as(successorSession)
  await h.restart(mailBindings)
  const control=await populateAutomationTestHistory({...h,request:async(route,{method='GET',body,status=200}={})=>({data:await current(route,method==='GET'?undefined:body,status)}),operator:successor.id},mail,status=>{mailStatus=status})
  const controlRows=await assertAutomationTestHistory(h.db,control,'unrelated successor history')
  const originalRows=await assertAutomationTestHistory(h.db,fixture,'before public erasure')
  const auditBefore=await automationTestAudit(h,successorSession,fixture)
  const controlAudit=await automationTestAudit(h,successorSession,control)
  const before=await member(current,fixture.ownerId)
  await current('/api/v1/commands/member.erase',{commandId:createUlid(),expected:expected(fixture.ownerId,before.version),input:{memberId:fixture.ownerId,reason:'synthetic-cradle-5110'}},409)
  assert.deepEqual(await assertAutomationTestHistory(h.db,fixture,'unsafe active-person erasure refusal'),originalRows,'Refused erasure changes no test history')
  await command(current,'member.remove',{memberId:fixture.ownerId,reason:'synthetic-cradle-5109'},expected(fixture.ownerId,before.version))
  const removed=await member(current,fixture.ownerId);assert.equal(removed.state,'removed')
  const erased=await command(current,'member.erase',{memberId:fixture.ownerId,reason:'synthetic-cradle-5110'},expected(fixture.ownerId,removed.version))
  assert.equal(erased.confirmed,true);assert.equal(erased.erasureState,'complete')
  const row=await member(current,fixture.ownerId);assert.equal(row.state,'erased');assert.equal(row.email,null);assert.match(row.name,/^Anonymous /)
  const retained=(await h.db.prepare('SELECT * FROM record_automation_tests WHERE automation_id=? ORDER BY id').bind(fixture.automationId).all()).results
  assert.equal(retained.length,originalRows.length,'Erasure preserves permitted anonymous test history')
  for(const original of originalRows){
   const after=retained.find(row=>row.id===original.id);assert.ok(after)
   assert.equal(after.state,original.state);assert.equal(after.mode,original.mode);assert.equal(after.definition_version,original.definition_version)
   const prior=JSON.parse(original.result_json),value=JSON.parse(after.result_json)
   assert.deepEqual(value.steps.map(step=>step.state),prior.steps.map(step=>step.state),'Erasure retains each step outcome, including Unknown')
   assert.equal(value.steps[0].output.after??value.steps[0].output.preview.after,prior.steps[0].input.action.value,'Non-personal action history survives')
   for(const literal of [fixture.owner.name,fixture.owner.email])assert.ok(!JSON.stringify(after).includes(literal),'Attributed test history scrubs the original author identity')
   assert.ok(after.result_json.includes(row.name),'Attributed personal copies use stable anonymous attribution')
  }
  const definitions=(await h.db.prepare('SELECT definition_version,definition_json FROM record_automation_versions WHERE automation_id=? ORDER BY definition_version').bind(fixture.automationId).all()).results
  assert.equal(definitions.length,fixture.versions.length)
  for(const definition of definitions){
   for(const literal of [fixture.owner.name,fixture.owner.email])assert.ok(!definition.definition_json.includes(literal),'Every attributed saved definition scrubs the erased identity')
   const value=JSON.parse(definition.definition_json),original=fixture.versions.find(item=>item.version===definition.definition_version).definition
   assert.equal(value.actions[2].text,row.name+' '+row.name,'Saved versions use the same stable anonymous attribution')
   assert.deepEqual(value.actions.slice(0,2),original.actions.slice(0,2),'Non-personal definition actions survive')
  }
  assert.deepEqual(await assertAutomationTestHistory(h.db,control,'unrelated history after erasure'),controlRows,'Erasure leaves another author history byte-identical')
  assert.deepEqual(await automationTestAudit(h,successorSession,fixture,true),auditBefore,'Erasure retains the same test audit events with anonymous attribution')
  assert.deepEqual(await automationTestAudit(h,successorSession,control),controlAudit,'Another author retains their named test audit events')
  const currentDefinition=await h.db.prepare('SELECT actions_json FROM automations WHERE id=?').bind(fixture.automationId).first()
  assert.equal(JSON.parse(currentDefinition.actions_json)[2].text,row.name+' '+row.name,'The current definition scrubs the same attributed personal copies as saved versions')
  const mailBefore=mail.length,providerBefore=(await h.mailMessages()).length
  for(const path of [`/api/user-automations/${fixture.automationId}/test`,`/api/user-automations/${fixture.automationId}/runs`]){
   const response=await fetch(h.origin+path,{method:path.endsWith('/test')?'POST':'GET',headers:{cookie:ownerSession.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':ownerSession.csrfToken,connection:'close'},...(path.endsWith('/test')?{body:JSON.stringify(fixture.unknownInput)}:{})})
   assert.ok([401,403,404].includes(response.status),'The erased author cannot read or replay captured tests');await response.arrayBuffer()
  }
  await current(`/api/user-automations/${fixture.automationId}/test`,fixture.unknownInput,404)
  const worker=await h.runtime.getWorker()
  assert.equal((await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.records.automations.v1',commandId:fixture.unknownInput.commandId}}])).outcome,'ok')
  assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()})).outcome,'ok')
  assert.equal(mail.length,mailBefore);assert.equal((await h.mailMessages()).length,providerBefore,'Erasure and captured replay send no mail')
  assert.deepEqual((await h.db.prepare('SELECT * FROM record_automation_tests WHERE automation_id=? ORDER BY id').bind(fixture.automationId).all()).results,retained,'Replay cannot resurrect personal test data')
  console.log('AUTOMATION_TEST_ERASURE '+JSON.stringify({retained:retained.length,versions:definitions.length,unrelated:controlRows.length,state:erased.erasureState,replayMail:0}))
 }finally{await h.close()}
}
