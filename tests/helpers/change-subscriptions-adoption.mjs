import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {resyncMessage} from '../../src/domains/change-subscriptions/schema.ts'
import {unbase64} from '../../src/adapters/crypto.server.ts'
import {verifyWebhook} from '../../vendor/base/modules/integrations/core/webhook.ts'

const root='/api/v1/change-subscriptions',schemaEntity='00000000000000000000000001'
const field=(id,label,type,required=false)=>({id,label,type,required,unique:false})

// Real manual-schema previews/adoptions and conversions, through the emitted
// Worker. A separate base keeps its schema changes out of the other feed doors.
export async function changeSubscriptionAdoption(h,edge){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),valueId=createUlid(),subscriptions=[]
 const draft={appId,name:'synthetic-cradle-370',tables:[{id:entityId,label:'Items',primaryFieldId:nameId,fields:[field(nameId,'Name','text',true),field(valueId,'Value','text')]}]}
 const preview=async body=>(await h.request('/api/v1/records/schema-preview',{method:'POST',body})).data
 const adopt=async review=>h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:review.id}}})
 const read=async row=>(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/records/${row.id}`)).data.record
 async function create(name,value){
  const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data
  return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:schemaEntity,recordId:entityId},version:schema.version}],input:{appId,entityId,values:{[nameId]:name,[valueId]:value}}}})).data.value
 }
 await adopt(await preview(draft))
 const record=await create('synthetic-cradle-371','12.3400')
 const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data
 const view=(await h.request('/api/v1/commands/view.save',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:schemaEntity,recordId:entityId},version:schema.version}],input:{view:{appId,entityId,name:'synthetic-cradle-372',display:'grid',fields:[nameId,valueId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:nameId},visibility:'app',shipped:false}}}})).data.value
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId,entityId,name:'synthetic-cradle-373',permissions:'read',expiresAt:new Date(Date.now()+20*86400000).toISOString()}})).data.key
 const worker=await h.runtime.getWorker(),tick=()=>worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.changes.v1',commandId:createUlid()}}])
 const page=async(subscription,cursor,limit=200,through)=>(await h.request(`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}${through?'&through='+encodeURIComponent(through):''}`,{secret:key.secret})).data
 function marker(result,from){
  assert.deepEqual(result.items,[],'An adoption range exposes no per-record or field facts')
  assert.equal(result.hasMore,false,'Even a one-row page consumes the complete adoption range')
  assert.deepEqual(result.resyncRequired,{code:'resync_required',message:resyncMessage,from,through:result.cursor},'Schema adoption uses the identical cause-free range marker')
  assert.deepEqual(Object.keys(result).sort(),['cursor','hasMore','items','resyncRequired','through'])
 }
 try{
  for(const scope of ['base','table','view']){
   const path='/changes-adoption-'+scope,subscription=(await h.request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId,...(scope==='base'?{}:{entityId}),...(scope==='view'?{viewId:view.id}:{}),url:edge.receiverOrigin+path}})).data
   subscriptions.push({...subscription,scope,path,next:subscription.cursor,pingCount:0,lastSequence:0,seen:new Set()})
  }
  for(const [index,type] of ['text','number','text'].entries()){
   // Put an ordinary write before the adoption. limit=1 must not project that
   // write while silently missing the later adopt in the same captured range.
   await h.patch(await read(record),{[nameId]:`synthetic-cradle-${374+index}`,[valueId]:index<2?'12.3400':'12.34'})
   const edit=(await h.request(`/api/v1/records/bases/${appId}`)).data
   if(index===0)edit.tables[0].label='Renamed items'
   else edit.tables[0].fields=edit.tables[0].fields.map(item=>item.id===valueId?field(valueId,'Value',type):item)
   const review=await preview(edit)
   if(index){
    const conversion=review.impacts.find(item=>item.entityId===entityId).conversions.find(item=>item.fieldId===valueId)
    assert.equal(conversion.to,type);assert.equal(conversion.losses.length,0)
    assert.ok(conversion.converted.some(item=>item.recordId===record.id))
   }
   await adopt(review)
   assert.equal((await read(record)).fields[valueId].value,index===0?'12.3400':'12.34','The real adoption stores the reviewed conversion')
   const retained=[]
   for(const subscription of subscriptions){
    const from=subscription.next,result=await page(subscription,from,1),full=await page(subscription,from)
    console.log('ADOPTION_RANGE',JSON.stringify({scope:subscription.scope,operation:index===0?'schema':'conversion',one:{items:result.items.map(item=>item.kind),hasMore:result.hasMore,resyncRequired:Boolean(result.resyncRequired)},full:{items:full.items.map(item=>item.kind),hasMore:full.hasMore,resyncRequired:Boolean(full.resyncRequired)}}))
    marker(result,from)
    assert.deepEqual(full,result,'A retained pre-adoption cursor replays the same marker at any page size')
    for(const forbidden of [record.id,valueId,nameId,review.id,'release.adopt','conversion','recordId','fieldId'])assert.ok(!JSON.stringify(result).includes(forbidden),'The marker discloses no record, field, value or adoption cause')
    retained.push({subscription,from,result});subscription.next=result.cursor
   }
   await tick();await tick()
   for(const subscription of subscriptions){
    const pings=edge.received.filter(item=>item.path===subscription.path)
    assert.equal(pings.length-subscription.pingCount,2,'Ordinary pre-write and real adoption each produce one generic ping')
    const bodies=[]
    for(const ping of pings.slice(subscription.pingCount)){
     const verified=await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(subscription.signingKey),tenant:appId,destinationId:subscription.id})
     assert.ok(!subscription.seen.has(verified.envelope.id),'Repeated dispatcher ticks never duplicate an adoption notification');subscription.seen.add(verified.envelope.id)
     const body=JSON.parse(verified.envelope.body);bodies.push(body)
     assert.equal(verified.envelope.event,'record.changed');assert.equal(body.subscriptionId,subscription.id);assert.equal(body.changeCount,1)
     assert.deepEqual(Object.keys(body).sort(),['changeCount','cursor','scope','subscriptionId'])
     assert.deepEqual(body.scope,{appId,entityId:subscription.scope==='base'?null:entityId,viewId:subscription.scope==='view'?view.id:null})
     for(const forbidden of [record.id,nameId,valueId,review.id,'release.adopt','conversion','recordId','fieldId'])assert.ok(!ping.body.includes(forbidden),'Signed notifications carry only generic scope/count/cursor data')
    }
    subscription.pingCount=pings.length
    const notified=await page(subscription,bodies[0].cursor,1,bodies[1].cursor)
    marker(notified,bodies[0].cursor)
   }
   const patched=(await h.patch(await read(record),{[valueId]:`${20+index}`})).data.value
   const created=await create(`synthetic-cradle-${377+index}`,`${30+index}`)
   await tick();await tick()
   for(const {subscription,from,result} of retained){
    assert.deepEqual(await page(subscription,from),result,'Later ordinary writes do not change the captured adoption marker')
    let cursor=subscription.next,items=[],finished=false
    for(let pages=0;pages<4;pages++){
     const next=await page(subscription,cursor,1)
     assert.equal(next.resyncRequired,undefined,'A post-marker ordinary range is complete')
     items.push(...next.items);cursor=next.cursor
     if(!next.hasMore){finished=true;break}
    }
    assert.ok(finished)
    assert.deepEqual(items.map(item=>[item.kind,item.recordId]),[['update',patched.id],['create',created.id]],'The marker cursor resumes ordinary writes in commit order with no gaps or duplicates')
    assert.equal(new Set(items.map(item=>item.id)).size,items.length)
    for(const item of items){assert.ok(item.sequence>subscription.lastSequence);subscription.lastSequence=item.sequence}
    subscription.next=cursor
    const pings=edge.received.filter(item=>item.path===subscription.path)
    assert.equal(pings.length-subscription.pingCount,2,'Ordinary notifications resume after the adoption marker')
    for(const ping of pings.slice(subscription.pingCount)){
     const verified=await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(subscription.signingKey),tenant:appId,destinationId:subscription.id})
     assert.ok(!subscription.seen.has(verified.envelope.id));subscription.seen.add(verified.envelope.id)
    }
    subscription.pingCount=pings.length
   }
   const listing=(await h.request(root+'?appId='+appId,{secret:key.secret})).data
   assert.ok(listing.every(item=>item.state==='active'&&item.deliveryState==='delivered'),'Available schema conversions do not end subscriptions or lose their authority')
   console.log('CHANGE_ADOPTION '+(index===0?'schema rename':index===1?'text/number':'number/text')+' PASS base/table/view empty marker, replay, signed pings and ordered later writes')
  }
 }finally{
  for(const subscription of subscriptions)await h.request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}})
  await h.request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId}})
 }
}
