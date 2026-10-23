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
