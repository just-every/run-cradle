import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {AUTHORITY_ENTITY_IDS} from '../../src/domains/authority/contracts.ts'
import {unbase64} from '../../src/adapters/crypto.server.ts'
import {verifyWebhook} from '../../vendor/base/modules/integrations/core/webhook.ts'
import {baseHttpSession} from './base-http-session.mjs'

const root='/api/v1/change-subscriptions'

// Reuses the caller's emitted Worker and real receiver edge; registers no test.
// A Base co-owner can issue a key without transferring the installation owner.
export async function changeSubscriptionErasure(h,edge){
 const failures=[],subscriptions=[],name='synthetic-cradle-84',email=name+'@example.test',basePerson=createUlid()
 const check=(label,run)=>{try{run()}catch(error){failures.push(new Error(label,{cause:error}))}}
 const clean=(value,forbidden,label)=>{const body=JSON.stringify(value);for(const literal of forbidden)assert.ok(!body.includes(literal),label+' retains erased record identity, field or value')}
 async function session(email){
  const signed=await baseHttpSession(h.origin,email)
  return async(route,{method='GET',body,status=200}={})=>{
   const response=await fetch(h.origin+route,{method,redirect:'manual',headers:{cookie:signed.cookie,...(body?{origin:h.origin,'content-type':'application/json','x-csrf-token':signed.csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})})
   const value=await response.json()
   assert.equal(response.status,status,method+' '+route.split('?')[0]+': '+(value?.error?.code??'unexpected response'))
   return value
  }
 }
 const issue=request=>request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-85',permissions:'read',expiresAt:new Date(Date.now()+20*86400000).toISOString()}}).then(value=>value.data.key)
 const worker=await h.runtime.getWorker()
 const tick=()=>worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.changes.v1',commandId:createUlid()}}])
 const page=(entry,cursor,limit=200)=>h.request(`${root}/${entry.value.id}/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}`,{secret:entry.key.secret})
 async function subscribe(key,scope,viewId){
  const path='/changes-erasure-'+scope,value=(await h.request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId:h.appId,...(scope==='base'?{}:{entityId:h.entityId}),...(viewId?{viewId}:{}),url:edge.receiverOrigin+path}})).data
  const entry={key,value,path};subscriptions.push(entry);return entry
 }
 try{
  // Native identity fixture only. Membership, co-owner promotion, sign-in, keys,
  // subscriptions, record deletion and erasure all use their real public doors.
  await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(basePerson,email,name,Date.now()).run()
  const person=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(basePerson).first()).principal_id
  await h.request(`/api/v1/records/bases/${h.appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:person,role:'editor',version:0}})
  const ownerEmail=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(h.operator).first()).email
  const owner=await session(ownerEmail)
  await owner('/auth/operator/role',{method:'POST',body:{operatorId:basePerson,role:'owner'}})
  const personal=await session(email),issuerKey=await issue(personal),observerKey=await issue(owner)
  const schema=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
  const view=(await h.request('/api/v1/commands/view.save',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:schema.version}],input:{view:{appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-85',display:'grid',fields:[h.nameId,h.statusId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:h.nameId},visibility:'app',shipped:false}}}})).data.value
  const observers=[]
  for(const scope of ['base','table','view'])observers.push(await subscribe(observerKey,scope,scope==='view'?view.id:undefined))
  const issued=await subscribe(issuerKey,'issuer')
  const issuerStored=await h.db.prepare('SELECT * FROM record_change_subscriptions WHERE id=?').bind(issued.value.id).first()
  assert.equal(issuerStored.owner_id,person);assert.ok(issuerStored.sealed_json)
  assert.ok(!issuerStored.sealed_json.includes(issued.value.signingKey),'Issuer signing secret is sealed before erasure')
  const record=(await personal('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:schema.version}],input:{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:name,[h.statusId]:email}}}})).data.value
  await tick()
  for(const entry of subscriptions){
   entry.before=(await page(entry,entry.value.cursor)).data
   assert.ok(entry.before.items.some(item=>item.recordId===record.id),'Each scope captured the personal record before erasure')
   for(const value of [name,email,h.nameId,h.statusId])assert.ok(JSON.stringify(entry.before).includes(value),'Pre-erasure feed contains the identity and both field deltas')
  }
  await personal('/api/v1/commands/record.delete',{method:'POST',body:{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,confirmation:record.id}}})
  await tick()
  for(const entry of subscriptions)entry.deleted=(await page(entry,entry.before.cursor)).data
  assert.ok((await h.db.prepare('SELECT * FROM record_change_windows WHERE subscription_id=?').bind(issued.value.id).all()).results.length>=2,'Issuer retained both create and delete windows before erasure')
  const memberVersion=async()=> (await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(person).first()).version
  const member=async action=>h.request('/api/v1/commands/member.'+action,{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:AUTHORITY_ENTITY_IDS.member,recordId:person},version:await memberVersion()}],input:{memberId:person,reason:'synthetic-cradle-86'}}})
  await member('remove')
  assert.equal((await member('erase')).data.value.confirmed,true)
  const forbidden=[record.id,h.nameId,h.statusId,name,email]
  const descriptor=(await h.descriptors()).get(h.appId,h.entityId)
  assert.equal(await h.db.prepare(`SELECT * FROM "${descriptor.table.tableId}" WHERE id=?`).bind(record.id).first(),null,'Identity-only record is permanently erased rather than held in trash')
  assert.equal(await h.db.prepare('SELECT * FROM record_trash WHERE record_id=?').bind(record.id).first(),null)
  const issuerRows=(await h.db.prepare('SELECT * FROM record_change_subscriptions WHERE id=? OR owner_id=? OR principal_id=?').bind(issued.value.id,person,person).all()).results
  const issuerWindows=(await h.db.prepare('SELECT * FROM record_change_windows WHERE subscription_id=?').bind(issued.value.id).all()).results
  check('Issuer subscription and sealed secret removal',()=>assert.equal(issuerRows.length,0))
  check('Issuer cursor window removal',()=>assert.equal(issuerWindows.length,0))
  await h.request(`${root}/${issued.value.id}/changes?cursor=${encodeURIComponent(issued.value.cursor)}`,{secret:issuerKey.secret,status:403})
  for(const entry of observers){
   // Replay both fixed windows and page the original range one audit row at a
   // time: omission in an aggregate page must not hide a retained delete id.
   for(const cursor of [entry.value.cursor,entry.before.cursor,entry.deleted.cursor]){
    const replay=await page(entry,cursor)
    check(entry.path+' whole response',()=>clean(replay,forbidden,'Change page'))
   }
   let cursor=entry.value.cursor,more=true
   while(more){const response=await page(entry,cursor,1);check(entry.path+' paged response',()=>clean(response,forbidden,'Paged change response'));assert.notEqual(response.data.cursor,cursor);cursor=response.data.cursor;more=response.data.hasMore}
  }
  await tick();await tick()
  for(const entry of subscriptions){
   const windows=(await h.db.prepare('SELECT * FROM record_change_windows WHERE subscription_id=?').bind(entry.value.id).all()).results
   const deliveries=(await h.db.prepare("SELECT * FROM integration_deliveries WHERE namespace=? AND json_extract(envelope,'$.destinationId')=?").bind(h.appId,entry.value.id).all()).results
   check(entry.path+' retained windows',()=>clean(windows,forbidden,'Whole stored change-window rows'))
   assert.ok(deliveries.length,'The real dispatcher retained integration delivery envelopes before erasure')
   check(entry.path+' retained deliveries',()=>clean(deliveries,forbidden,'Whole integration-delivery rows'))
   const pings=edge.received.filter(ping=>ping.path===entry.path)
   assert.ok(pings.length,'Each scope delivered through the real relay to the receiver edge')
   for(const ping of pings){
    const verified=await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(entry.value.signingKey),tenant:h.appId,destinationId:entry.value.id})
    check(entry.path+' signed receiver body',()=>clean({body:ping.body,envelope:verified.envelope},forbidden,'Signed receiver body and envelope'))
   }
  }
  if(failures.length)throw new AggregateError(failures,'BASE-DATA-003 change-subscription person/record erasure proof failed')
  console.log('CHANGE_SUBSCRIPTION_ERASURE PASS identity-only record, whole feed/windows/envelopes, issuer subscription and sealed-secret removal')
 }finally{
  // Erasure owns issuer removal. Observers belong to the surviving owner and
  // are explicitly removed so this helper is safe to reuse in the same test.
  for(const entry of subscriptions.filter(entry=>entry.path!=='/changes-erasure-issuer'))await h.request(`${root}/${entry.value.id}`,{method:'DELETE',secret:entry.key.secret,body:{commandId:createUlid()}})
 }
}
