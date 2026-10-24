import {preparedSigningRotation} from './helpers/signing-key-rotation.mjs'
import {parallelChatJourney} from './helpers/parallel-chat-journey.mjs'
import {slackAppJourney} from './helpers/slack-app-journey.mjs'
import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {changeSubscriptionsUpgrade} from './helpers/change-subscriptions-upgrade.mjs'
import {changeSubscriptionsJourney} from './helpers/change-subscriptions-journey.mjs'
import {randomBytes} from 'node:crypto'
import {contract} from './contract.mjs'
import {userAutomationRuntime} from './helpers/user-automation-runtime.mjs'
import {automationNetworkEdge} from './helpers/automation-network-edge.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {verifyWebhook} from '../vendor/base/modules/integrations/core/webhook.ts'
import {unbase64} from '../src/adapters/crypto.server.ts'

contract('WEBHOOK-USER-001','[WEBHOOK-USER-002] real Worker signed delivery preserves ordered replay, delete resynchronization and policy-narrowed restores',async()=>{
 for(const provider of ['slack','teams','nook'])await slackAppJourney(provider)
 await parallelChatJourney()
 let edge,h
 try {
  edge=await automationNetworkEdge()
  const preflight=await edge.deliver({url:edge.receiverOrigin+'/accepted',headers:{},body:'{}'})
  assert.equal(preflight.status,200,JSON.stringify({calls:edge.tlsCalls,errors:edge.transportErrors}));await preflight.arrayBuffer();edge.received.length=0
  await changeSubscriptionsUpgrade(edge)
  h=await userAutomationRuntime(0,{bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
   EGRESS_RELAY_URL:'https://relay.egress.example.com/v1/deliver',EGRESS_RELAY_SECRET:edge.secret},outbound:request=>edge.outbound(request)})
  const destination=(await h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{
   commandId:createUlid(),appId:h.appId,entityId:h.entityId,kind:'webhook',url:edge.receiverOrigin+'/accepted'}})).data
  const stored=await h.db.prepare('SELECT sealed_json FROM record_automation_destinations WHERE id=?').bind(destination.id).first()
  assert.ok(!stored.sealed_json.includes(destination.signingKey)&&!stored.sealed_json.includes(edge.receiverOrigin),'Destination credentials are encrypted')
  const slack=(await h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{commandId:createUlid(),
   appId:h.appId,entityId:h.entityId,kind:'slack',url:'https://hooks.slack.com/services/OWNER/CHANNEL/PRIVATE'}})).data
  const automation=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),
   expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'Deliver externally',appId:h.appId,
    entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'webhook',destinationId:destination.id},
     {kind:'slack',destinationId:slack.id,text:'A record is ready for review'}]}}})).data.result.value
  const record=await h.create('Webhook acceptance');await h.tick(record.commandId);await h.tick(record.commandId)
  const runs=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs
  assert.equal(runs.length,1);assert.equal(runs[0].state,'Complete',JSON.stringify({actions:runs[0].actions,calls:edge.tlsCalls,outbound:edge.outboundSeen,received:edge.received.length,errors:edge.transportErrors,networkErrors:edge.networkErrors}));assert.equal(edge.received.length,2)
  const webhook=edge.received.find(request=>request.path==='/accepted')
  const verified=await verifyWebhook({body:new TextEncoder().encode(webhook.body),headers:webhook.headers,
   key:unbase64(destination.signingKey),tenant:h.appId,destinationId:destination.id})
  assert.equal(JSON.parse(verified.envelope.body).record.recordId,record.record.ref.recordId)
  assert.equal(JSON.parse(edge.received.find(request=>request.path.startsWith('/services/')).body).text,'A record is ready for review')
  await assert.rejects(verifyWebhook({body:new TextEncoder().encode(webhook.body+' '),headers:webhook.headers,
   key:unbase64(destination.signingKey),tenant:h.appId,destinationId:destination.id}))
  const heldRecord=await h.create('synthetic-cradle-held-webhook')
  const rotated=await preparedSigningRotation({h,edge,path:'/accepted',destinationId:destination.id,priorKey:destination.signingKey,
   dispatch:()=>h.tick(heldRecord.commandId),
   rotate:async()=>(await h.request(`/api/user-automations/destinations/${destination.id}/rotate`,{method:'POST',body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId}})).data})
  const afterRotation=await h.create('Webhook after rotation');await h.tick(afterRotation.commandId)
  const nextWebhook=edge.received.filter(request=>request.path==='/accepted').at(-1)
  await verifyWebhook({body:new TextEncoder().encode(nextWebhook.body),headers:nextWebhook.headers,key:unbase64(rotated.signingKey),tenant:h.appId,destinationId:destination.id})
  await assert.rejects(verifyWebhook({body:new TextEncoder().encode(nextWebhook.body),headers:nextWebhook.headers,key:unbase64(destination.signingKey),tenant:h.appId,destinationId:destination.id}))
  const wire={url:edge.receiverOrigin+'/accepted',headers:{'content-type':'application/json'},body:'{}'}
  const before=edge.tlsCalls
  const unauthorized=await edge.deliver(wire,false);assert.equal(unauthorized.status,401);await unauthorized.arrayBuffer()
  const insecure=await edge.deliver({...wire,url:'http://public.example.com/'});assert.equal(insecure.status,400);await insecure.arrayBuffer()
  const literalPrivate=await edge.deliver({...wire,url:'https://127.0.0.1/'});assert.equal(literalPrivate.status,400);await literalPrivate.arrayBuffer()
  const large=await edge.deliver({...wire,body:'x'.repeat(1048577)});assert.equal(large.status,400);await large.arrayBuffer()
  assert.equal(edge.tlsCalls,before,'Refused requests never open a destination socket')
  edge.privateAnswers(true)
  const privateDns=await edge.deliver(wire);assert.equal(privateDns.status,502);await privateDns.arrayBuffer();assert.equal(edge.tlsCalls,before)
  edge.privateAnswers(false)
  const redirect=await edge.deliver({...wire,url:edge.receiverOrigin+'/redirect'});assert.equal(redirect.status,422);await redirect.arrayBuffer()
  assert.ok(!edge.received.some(request=>request.path==='/followed'),'No redirect destination is fetched')
  const overflow=await edge.deliver({...wire,url:edge.receiverOrigin+'/oversized'});assert.equal(overflow.status,502);await overflow.arrayBuffer()
  const timedOut=await edge.deliver({...wire,url:edge.receiverOrigin+'/stalled'});assert.equal(timedOut.status,502);await timedOut.arrayBuffer()
  const uncertain=(await h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{commandId:createUlid(),
   appId:h.appId,entityId:h.entityId,kind:'webhook',url:edge.receiverOrigin+'/oversized'}})).data
  const failure=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),
   expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'Unknown acknowledgement',appId:h.appId,entityId:h.entityId,
    event:'updated',enabled:true,actions:[{kind:'webhook',destinationId:uncertain.id}]}}})).data.result.value
  const current=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${record.record.ref.recordId}`)).data.record
  const change=await h.patch(current,{[h.statusId]:'uncertain'});await h.tick(change.data.commandId)
  const calls=edge.tlsCalls;await h.tick(change.data.commandId)
  assert.equal((await h.request(`/api/user-automations/${failure.id}/runs`)).data.runs[0].state,'Unknown')
  assert.equal(edge.tlsCalls,calls,'Uncertain external work is not automatically resent')
  await changeSubscriptionsJourney(h,edge)
 }finally{await h?.close();await edge?.close()}
})
