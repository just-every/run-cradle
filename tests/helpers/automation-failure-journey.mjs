import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {baseHttpSession} from './base-http-session.mjs'
export async function automationFailureJourney(h,delivered,setReceiver,receiverCalls){
 const definition={name:'synthetic-cradle-71 failure alert',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[]}
 const destination=(await h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,kind:'webhook',url:'https://receiver.example.com/failures'}})).data
 definition.actions=[{kind:'update',fieldId:h.statusId,value:'before delivery'},{kind:'webhook',destinationId:destination.id}]
 const saved=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition}})).data.result.value
 const runs=()=>h.request(`/api/user-automations/${saved.id}/runs`).then(reply=>reply.data.runs)
 const alerts=()=>h.request('/api/v1/notifications').then(reply=>reply.data.items.filter(row=>row.subject.kind==='automation-run'))
 const tick=async()=>{const worker=await h.runtime.getWorker();await worker.scheduled({scheduledTime:Date.parse('2026-10-23T12:17:00Z'),cron:'* * * * *'})}
 setReceiver(400)
 const first=await h.create('synthetic-cradle-72 private value');await h.tick(first.commandId);await tick()
 let failed=(await runs())[0]
 assert.equal(failed.state,'Failed');assert.equal(failed.retryable,false)
 const notices=await alerts(),mail=delivered.filter(message=>message.subject==='Record automation failed')
 assert.equal(notices.length,1,'A failed automation creates one in-app alert')
 assert.equal(mail.length,1,'A failed automation creates one email alert')
 assert.ok(notices[0].body.includes(failed.cause));assert.ok(notices[0].subject.href.includes(failed.id));assert.ok(mail[0].text.includes(failed.href))
 assert.equal(mail[0].to,'import-owner@example.test');assert.ok(!JSON.stringify(notices).includes('private value'));assert.ok(!JSON.stringify(mail).includes('private value'))
 const second=await h.create('synthetic-cradle-73');await h.tick(second.commandId);await tick()
 assert.equal((await alerts()).length,1);assert.equal(delivered.filter(message=>message.subject==='Record automation failed').length,1)
 assert.equal((await runs()).length,2,'Daily suppression retains every failed run')
 await h.restart({MAIL_PROVIDER:'sendgrid',MAIL_PROVIDER_API_KEY:'test-only-sendgrid-mail-edge'})
 const other=await baseHttpSession(h.origin,'synthetic-cradle-61@example.test')
 await h.restart({MAIL_PROVIDER:'rer',MAIL_PROVIDER_API_KEY:undefined})
 const others=await fetch(h.origin+'/api/v1/notifications',{headers:{cookie:other.cookie}});assert.equal(others.status,403,'An operator without inbox authority cannot read failure notices')
 const otherOperator=await h.db.prepare('SELECT human_id FROM authority_principals WHERE id=(SELECT principal_id FROM cradle_base_operators WHERE base_id=(SELECT id FROM oa_operators WHERE email=?))').bind('synthetic-cradle-61@example.test').first()
 assert.equal((await h.db.prepare("SELECT count(*) n FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.operator_id=? AND c.subject_type='automation-run'").bind(otherOperator.human_id).first()).n,0)
 setReceiver(429)
 const safe=await h.create('synthetic-cradle-74');await h.tick(safe.commandId);await tick()
 failed=(await runs()).find(run=>run.recordId===safe.record.id);assert.equal(failed.state,'Failed');assert.equal(failed.retryable,true)
 setReceiver(200)
 const retry={commandId:createUlid()},retryRoute=`/api/user-automations/${saved.id}/runs/${failed.id}/retry`
 await h.request(retryRoute,{method:'POST',body:retry});await h.request(retryRoute,{method:'POST',body:retry});await tick()
 assert.equal((await runs()).find(run=>run.id===failed.id).state,'Complete')
 const safeRecord=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${safe.record.id}`)).data.record
 assert.equal(safeRecord.version,2,'A retry preserves the completed update')
 const attempts=receiverCalls.filter(wire=>JSON.parse(wire.body).record.recordId===safe.record.id)
 assert.equal(attempts.length,2);assert.equal(attempts[0].body,attempts[1].body,'A safe retry uses the original idempotency key and immutable bytes')
 setReceiver(503)
 const unknown=await h.create('synthetic-cradle-75');await h.tick(unknown.commandId);await tick()
 const uncertain=(await runs()).find(run=>run.recordId===unknown.record.id);assert.equal(uncertain.state,'Unknown');assert.equal(uncertain.retryable,false)
 await h.request(`/api/user-automations/${saved.id}/runs/${uncertain.id}/retry`,{method:'POST',body:{commandId:createUlid()},status:403})
 const unknownCalls=receiverCalls.length
 await h.restart();await tick();assert.equal((await runs()).find(run=>run.id===uncertain.id).state,'Unknown');assert.equal(receiverCalls.length,unknownCalls,'An uncertain effect never resends')
 await h.request(`/api/user-automations/${saved.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:saved.version}})
 delivered.length=0;setReceiver(200)
 return {saved,failed,uncertain}
}

/** Leave admitted record events for the native cron to execute at its supplied
 * clock. Every boundary has a new real failure, never a rewritten run timestamp. */
export async function automationFailureCalendarJourney(h,delivered,setReceiver,receiverCalls){
 const settings=(await h.request('/api/v1/settings')).data
 const session=await fetch(h.origin+'/auth/session',{headers:{cookie:h.cookie}})
 assert.equal(session.status,200);const recipient=(await session.json()).operator.email
 const timezone=async zone=>{
  const current=(await h.request('/api/v1/settings')).data
  await h.request('/api/v1/commands/settings.update',{method:'POST',body:{commandId:createUlid(),expected:[],input:{version:current.version,changes:{timezone:zone}}}})
 }
 await timezone('America/New_York')
 const destination=(await h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,kind:'webhook',url:'https://receiver.example.com/calendar-failures'}})).data
 const saved=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+29*86400000).toISOString(),definition:{name:'synthetic-cradle-76 calendar failures',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'webhook',destinationId:destination.id}]}}})).data.result.value
 const runs=()=>h.request(`/api/user-automations/${saved.id}/runs`).then(reply=>reply.data.runs)
 const notices=()=>h.request('/api/v1/notifications').then(reply=>reply.data.items.filter(row=>row.subject.kind==='automation-run'&&row.subject.href.includes(saved.id)))
 const mail=()=>delivered.filter(message=>message.subject==='Record automation failed'&&message.text.includes(saved.id))
 // Expected counts are fixed independently of the product's calendar formatter.
 // March 8 has 23 hours; November 1 has 25 hours in this workspace.
 const boundaries=[
  {at:'2026-03-08T04:45:00Z',count:1,label:'spring eve at 23:45'},
  {at:'2026-03-08T05:00:00Z',count:2,label:'spring local midnight within the same UTC day'},
  {at:'2026-03-08T06:45:00Z',count:2,label:'before the skipped hour'},
  {at:'2026-03-08T07:00:00Z',count:2,label:'after the skipped hour at 03:00',restart:true},
  {at:'2026-03-09T00:00:00Z',count:2,label:'UTC midnight is still the same local day'},
  {at:'2026-03-09T04:00:00Z',count:3,label:'midnight after the 23-hour day'},
  {at:'2026-11-01T03:45:00Z',count:4,label:'fall eve at 23:45'},
  {at:'2026-11-01T04:00:00Z',count:5,label:'fall local midnight within the same UTC day'},
  {at:'2026-11-01T05:30:00Z',count:5,label:'first 01:30'},
  {at:'2026-11-01T06:30:00Z',count:5,label:'repeated 01:30 after restart',restart:true},
  {at:'2026-11-02T00:00:00Z',count:5,label:'fall UTC midnight is still the same local day'},
  {at:'2026-11-02T04:30:00Z',count:5,label:'24 hours after the first fall-day notice is still 23:30'},
  {at:'2026-11-02T05:00:00Z',count:6,label:'midnight after the 25-hour day'},
 ]
 let previousCount=0,errorCode,previousCommand
 const alertRuns=[]
 setReceiver(400)
 try{
  for(const [index,boundary] of boundaries.entries()){
   if(boundary.restart){
    await h.restart();await h.tick(previousCommand)
    assert.equal((await notices()).length,previousCount,`${boundary.label}: queue replay after restart keeps suppression`)
    assert.equal(mail().length,previousCount,`${boundary.label}: queue replay after restart sends no mail`)
   }
   const created=await h.create(`synthetic-cradle-76 boundary ${index}`)
   await h.scheduled(boundary.at)
   const history=await runs(),run=history.find(row=>row.recordId===created.record.id)
   assert.ok(run,`${boundary.label}: the admitted record has run history`)
   assert.equal(run.state,'Failed',`${boundary.label}: a real failure reaches suppression`)
   assert.equal(run.finishedAt,new Date(boundary.at).toISOString(),`${boundary.label}: the scheduled clock finishes the run`)
   assert.equal(run.retryable,false)
   errorCode??=run.errorCode
   assert.ok(errorCode);assert.equal(run.errorCode,errorCode,'Every boundary exercises the same failure kind')
   assert.equal(receiverCalls.filter(wire=>JSON.parse(wire.body).record.recordId===created.record.id).length,1,`${boundary.label}: one real transport attempt`)
   assert.equal(history.length,index+1,`${boundary.label}: suppression keeps every failure`)
   if(boundary.count>previousCount)alertRuns.push(run)
   const inbox=await notices(),messages=mail()
   assert.equal(inbox.length,boundary.count,`${boundary.label}: in-app count`)
   assert.equal(messages.length,boundary.count,`${boundary.label}: email count`)
   assert.deepEqual(inbox.map(row=>row.subject.href).sort(),alertRuns.map(row=>row.href).sort(),`${boundary.label}: alerts link only the first failure of each local day`)
   for(const first of alertRuns){
    const message=messages.find(message=>message.text.includes(first.href))
    assert.ok(message,`${boundary.label}: email links the first failure`)
    assert.equal(message.to,recipient,'Calendar changes preserve the enabling recipient')
    assert.ok(message.text.includes(first.cause),'The failure cause remains visible')
   }
   previousCount=boundary.count;previousCommand=created.commandId
  }
  await h.restart();await h.tick(previousCommand);await h.scheduled(boundaries.at(-1).at)
  assert.equal((await runs()).length,boundaries.length,'Restart without a new event creates no run')
  assert.equal((await notices()).length,6,'Restart retains every local-day suppression claim')
  assert.equal(mail().length,6,'Restart sends no duplicate failure mail')
  console.log(`Failure calendar: ${boundaries.length} admitted failures, six local-day notices and mails; both DST transitions and restart replay passed`)
 }finally{
  await h.request(`/api/user-automations/${saved.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:saved.version}})
  await timezone(settings.timezone)
  delivered.length=0;setReceiver(200)
 }
}
