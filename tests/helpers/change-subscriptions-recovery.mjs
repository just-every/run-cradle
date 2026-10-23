import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {unbase64} from '../../src/adapters/crypto.server.ts'
import {verifyWebhook} from '../../vendor/base/modules/integrations/core/webhook.ts'

const root='/api/v1/change-subscriptions'

export async function changeSubscriptionRecovery(h,edge){
 await withSubscriptions(h,edge,uncertainRecovery)
}

export async function changeSubscriptionFairness(h,edge){
 await withSubscriptions(h,edge,fairDelivery)
}

async function withSubscriptions(h,edge,journey){
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-70',permissions:'read',expiresAt:new Date(Date.now()+20*86400000).toISOString()}})).data.key
 const worker=await h.runtime.getWorker(),subscriptions=new Map(),active=new Set(),pings=new Map(),deliveryIds=new Set()
 let receivedThrough=edge.received.length,failure
 const remove=async subscription=>{await h.request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}});active.delete(subscription.id)}
 async function subscribe(path){
  const subscription=(await h.request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,url:edge.receiverOrigin+path}})).data
  subscriptions.set(subscription.id,subscription);active.add(subscription.id);pings.set(subscription.id,[])
  assert.equal(subscription.state,'active')
  return subscription
 }
 async function tick(){
  await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.changes.v1',commandId:createUlid()}}])
  for(const ping of edge.received.slice(receivedThrough)){
   const subscription=subscriptions.get(ping.headers['webhook-destination'])
   if(!subscription){assert.notEqual(ping.path,'/changes-recovery-fair','Every fairness ping belongs to a created subscription');continue}
   const verified=await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(subscription.signingKey),tenant:h.appId,destinationId:subscription.id})
   const body=JSON.parse(verified.envelope.body)
   assert.equal(verified.envelope.event,'record.changed');assert.equal(body.subscriptionId,subscription.id);assert.equal(body.changeCount,1)
   assert.deepEqual(body.scope,{appId:h.appId,entityId:h.entityId,viewId:null})
   assert.ok(!deliveryIds.has(verified.envelope.id),'A committed change is never automatically sent twice to a subscription')
   deliveryIds.add(verified.envelope.id);pings.get(subscription.id).push(body)
  }
  receivedThrough=edge.received.length
 }
 const page=async(subscription,cursor,limit=200)=>(await h.request(`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}`,{secret:key.secret})).data
 const current=async record=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${record.id}`)).data.record
 const context={h,edge,key,subscribe,remove,tick,page,current,pings}
 try{await journey(context)}catch(error){console.error('CHANGE_PROOF_FAILURE '+journey.name+': '+error.message);failure=error}
 const cleanup=[]
 for(const id of active){try{await remove(subscriptions.get(id))}catch(error){cleanup.push(error)}}
 try{
  assert.deepEqual((await h.request(root+'?appId='+h.appId,{secret:key.secret})).data,[],'All recovery subscriptions are deleted through the public door')
 }catch(error){cleanup.push(error)}
 try{await h.request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId:h.appId}})}catch(error){cleanup.push(error)}
 if(failure||cleanup.length)throw new AggregateError([...(failure?[failure]:[]),...cleanup],'Change-subscription recovery proof failed')
}

async function uncertainRecovery({h,edge,key,subscribe,remove,tick,page,current,pings}){
 // The receiver accepts the signed request, but its oversized response makes the
 // real relay acknowledgement uncertain. Recovery reads the feed, never resends.
 const subscription=await subscribe('/oversized'),errorsBefore=edge.transportErrors.length
 const first=(await h.create('synthetic-cradle-71')).record
 await tick()
 assert.equal(pings.get(subscription.id).length,1)
 assert.ok(edge.transportErrors.slice(errorsBefore).some(error=>error.reason==='Response limit exceeded'),'The network edge actually lost the bounded acknowledgement')
 const listed=(await h.request(root+'?appId='+h.appId,{secret:key.secret})).data.find(row=>row.id===subscription.id)
 assert.equal(listed?.state,'active');assert.equal(listed.deliveryState,'failed','Uncertain delivery is visibly failed without ending the subscription')
 await tick();await tick()
 assert.equal(pings.get(subscription.id).length,1,'Repeated dispatcher ticks do not resend uncertain external work')
 const initial=await page(subscription,subscription.cursor)
 assert.deepEqual(initial.items.map(item=>[item.kind,item.recordId]),[['create',first.id]])
 assert.equal(initial.hasMore,false)
 const second=(await h.create('synthetic-cradle-72')).record
 await h.patch(await current(first),{[h.statusId]:'synthetic-cradle-73'})
 await tick();await tick()
 assert.equal(pings.get(subscription.id).length,3,'Later committed changes still attempt their own signed notifications')
 assert.deepEqual(await page(subscription,subscription.cursor),initial,'The original fetched cursor window stays replayable after failure')
 let cursor=initial.cursor,items=[],finished=false
 for(let count=0;count<4;count++){
  const part=await page(subscription,cursor,1)
  items.push(...part.items);cursor=part.cursor
  if(!part.hasMore){finished=true;break}
 }
 assert.ok(finished,'Recovery pagination finishes within the known change window')
 assert.deepEqual(items.map(item=>[item.kind,item.recordId]),[['create',second.id],['update',first.id]],'The next cursor recovers every later create and patch, in commit order')
 const recovered=[...initial.items,...items]
 assert.equal(new Set(recovered.map(item=>item.id)).size,3,'Cursor recovery has no duplicates')
 assert.ok(recovered.every((item,index)=>index===0||item.sequence>recovered[index-1].sequence),'Recovered sequence numbers strictly increase')
 const empty=await page(subscription,cursor)
 assert.deepEqual(empty.items,[],'Recovery leaves no missing or repeated changes')
 // The empty fetch captures its window; its continuation starts the next one.
 const next=empty.cursor
 await h.patch(await current(second),{[h.statusId]:'synthetic-cradle-74'})
 await tick();await tick()
 assert.equal(pings.get(subscription.id).length,4,'A later change sends a new signed ping even after cursor recovery')
 const later=await page(subscription,next)
 assert.deepEqual(later.items.map(item=>[item.kind,item.recordId]),[['update',second.id]])
 assert.ok(later.items[0].sequence>recovered.at(-1).sequence)
 await remove(subscription)
 console.log('CHANGE_SUBSCRIPTION_UNCERTAIN_RECOVERY PASS signed failed delivery, no resend, ordered cursor recovery')
}

async function fairDelivery({h,subscribe,remove,tick,current,pings}){
 const subscribers=[]
 // One scoped synthetic key avoids creating 201 independent authority graphs.
 // Ordered public writes preserve subscription creation order and watermarks.
 for(let count=0;count<201;count++)subscribers.push(await subscribe('/changes-recovery-fair'))
 const record=(await h.create('synthetic-cradle-75')).record,budget=Math.ceil(subscribers.length/200)+2
 for(let count=0;count<budget;count++)await tick()
 for(const subscription of subscribers)assert.equal(pings.get(subscription.id).length,1,'Every active subscription, including those beyond 200, receives the common change within bounded sweeps')
 const late=await subscribe('/changes-recovery-fair')
 // Earlier subscribers receive fresh work before every sweep. A subscription
 // beyond the first batch must still advance while those earlier ones are busy.
 for(let count=0;count<Math.ceil((subscribers.length+1)/200)+2;count++){
  await h.patch(await current(record),{[h.statusId]:`synthetic-cradle-${76+count}`})
  await tick()
 }
 assert.ok(pings.get(late.id).length>0,'A newly added subscription beyond 200 is not starved by continuously changing earlier subscriptions')
 for(const subscription of subscribers)assert.ok(pings.get(subscription.id).length>1,'Existing subscriptions beyond the batch boundary also continue receiving changes')
 for(const subscription of [...subscribers,late])await remove(subscription)
 console.log('CHANGE_SUBSCRIPTION_FAIRNESS PASS 202 public subscriptions, bounded sweeps under continued writes')
}

// A received HTTP 429 is a definite refusal, unlike a lost acknowledgement.
export async function changeSubscriptionRetry(h,edge){
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-89',permissions:'read',expiresAt:new Date(Date.now()+86400000).toISOString()}})).data.key
 let subscription
 try{
  subscription=(await h.request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,url:edge.receiverOrigin+'/changes-retry-once'}})).data
  const record=(await h.create('synthetic-cradle-90')).record,worker=await h.runtime.getWorker()
  await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.changes.v1',commandId:createUlid()}}])
  const listed=async()=>(await h.request(root+'?appId='+h.appId,{secret:key.secret})).data.find(row=>row.id===subscription.id)
  assert.equal((await listed()).deliveryState,'retrying')
  await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()+2000})
  assert.equal((await listed()).deliveryState,'delivered')
  const pings=edge.received.filter(ping=>ping.path==='/changes-retry-once')
  assert.equal(pings.length,2);assert.equal(pings[0].headers['webhook-id'],pings[1].headers['webhook-id']);assert.equal(pings[0].body,pings[1].body)
  for(const ping of pings)await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(subscription.signingKey),tenant:h.appId,destinationId:subscription.id})
  const page=(await h.request(`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(subscription.cursor)}`,{secret:key.secret})).data
  assert.deepEqual(page.items.map(item=>[item.kind,item.recordId]),[['create',record.id]])
  console.log('CHANGE_SUBSCRIPTION_DEFINITE_RETRY PASS HTTP429 queued then accepted with same signed id and immutable body')
 }finally{
  if(subscription)await h.request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}})
  await h.request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId:h.appId}})
 }
}
