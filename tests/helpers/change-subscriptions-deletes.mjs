import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {createCursorCodec} from '../../src/domains/records/cursor.server.ts'
import {verifyWebhook} from '../../vendor/base/modules/integrations/core/webhook.ts'
import {unbase64} from '../../src/adapters/crypto.server.ts'

// One change-feed synchronization matrix, through the emitted Worker's HTTP/queue doors.
export async function changeSubscriptionDeletes(h,edge){
 const root='/api/v1/change-subscriptions',worker=await h.runtime.getWorker(),failures=[]
 let rangeMarker
 const tick=()=>worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.changes.v1',commandId:createUlid()}}])
 const remove=record=>h.request('/api/v1/commands/record.delete',{method:'POST',body:{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,confirmation:record.id}}})
 async function policy(key,edit){
  const row=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_credentials c JOIN authority_memberships m ON m.principal_id=c.principal_id JOIN authority_policies p ON p.id=m.policy_id WHERE c.id=? AND m.app_id=?').bind(key.id,h.appId).first()
  const rules=JSON.parse(row.rules_json);for(const rule of rules)edit(rule)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),row.id).run()
 }
 for(const scope of ['base','table','view','restricted']){
  try{
   const name=`synthetic-cradle-${scope==='table'?61:scope==='view'?62:63}`,record=(await h.create(name)).record
   const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name,permissions:'read',expiresAt:new Date(Date.now()+29*86400000).toISOString()}})).data.key
   let viewId
   if(scope==='view'){
    const view=(await h.request('/api/v1/commands/view.save',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:h.entity.version}],input:{view:{appId:h.appId,entityId:h.entityId,name,display:'grid',fields:[h.nameId,h.statusId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:h.nameId},visibility:'app',shipped:false}}}})).data.value
    viewId=view.id
   }
   if(scope==='restricted')await policy(key,rule=>{rule.rows={kind:'condition',fieldId:h.nameId,op:'eq',value:name}})
   const path='/changes-'+scope,subscription=(await h.request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId:h.appId,...(scope==='base'?{}:{entityId:h.entityId}),...(viewId?{viewId}:{}),url:edge.receiverOrigin+path}})).data
   const route=(cursor,limit=200)=>`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}`
   const fetchPage=cursor=>h.request(route(cursor),{secret:key.secret})
   await remove(record);await tick();await tick()
   const pings=edge.received.filter(r=>r.path===path)
   assert.equal(pings.length,1,scope+': exactly one idempotent delete ping')
   const deletion=await fetchPage(subscription.cursor)
   if(scope==='table'||scope==='base'){
    assert.equal(deletion.data.items.length,1)
    const item=deletion.data.items[0]
    assert.deepEqual(Object.keys(item).sort(),['id','kind','recordId','sequence'])
    assert.equal(item.kind,'delete');assert.equal(item.recordId,record.id)
   }else{
    assert.deepEqual(deletion.data.items,[])
    assert.equal(deletion.data.resyncRequired?.code,'resync_required',scope+': uncertain delete requires resynchronization')
    assert.deepEqual(Object.keys(deletion.data.resyncRequired).sort(),['code','from','message','through'])
    assert.equal(deletion.data.resyncRequired.from,subscription.cursor);assert.equal(deletion.data.resyncRequired.through,deletion.data.cursor)
    for(const raw of [JSON.stringify(deletion),...pings.map(p=>p.body)])for(const forbidden of [record.id,name,h.nameId,h.statusId,'recordId','changes_json','rowCount'])assert.ok(!raw.includes(forbidden),scope+': no record identity/content anywhere in answer or ping')
   }
   let cursor=subscription.cursor,more=true,markers=0,paged=[]
   while(more){const part=(await h.request(route(cursor,1),{secret:key.secret})).data;paged.push(...part.items);if(part.resyncRequired){markers++;assert.equal(part.resyncRequired.from,cursor);assert.equal(part.resyncRequired.through,part.cursor)}cursor=part.cursor;more=part.hasMore}
   assert.deepEqual(paged,deletion.data.items,'Paging the same delete range has no gaps or duplicate items');assert.equal(markers,['base','table'].includes(scope)?0:1)
   console.log('CHANGE_DELETE '+scope+' PASS')
   const held=(await h.request(`/api/v1/records/trash?appId=${h.appId}`)).data.items.find(item=>item.id===record.id)
   // Current field narrowing applies to restoration, and an unreadable restored row is omitted.
   await policy(key,rule=>{rule.readableFields=rule.readableFields.filter(id=>id!==h.statusId);if(scope==='restricted')rule.rows={kind:'condition',fieldId:h.nameId,op:'eq',value:'synthetic-cradle-64'}})
   await h.request('/api/v1/records/trash/restore',{method:'POST',body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,recordId:record.id,version:held.version}})
   await tick();await tick()
   assert.deepEqual((await fetchPage(subscription.cursor)).data,deletion.data,'Same cursor replays its captured delete range')
   const restored=(await fetchPage(deletion.data.cursor)).data
   if(scope==='restricted'){assert.deepEqual(restored.items,[]);assert.equal(restored.resyncRequired.code,'resync_required');assert.equal(restored.resyncRequired.message,deletion.data.resyncRequired.message);assert.deepEqual(Object.keys(restored.resyncRequired).sort(),Object.keys(deletion.data.resyncRequired).sort());assert.equal(edge.received.filter(r=>r.path===path).length,2)}
   else{
    assert.equal(restored.resyncRequired,undefined)
    assert.deepEqual(restored.items.map(i=>[i.kind,i.recordId]),[['restore',record.id]],'Restore is the next change after its delete')
    assert.ok(restored.items[0].changes.length>0);assert.ok(restored.items[0].changes.every(c=>c.fieldId!==h.statusId))
    assert.equal(edge.received.filter(r=>r.path===path).length,2)
   }
   console.log('CHANGE_RESTORE '+scope+' PASS')
   const current=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${record.id}`)).data.record
   const laterName=scope==='restricted'?'synthetic-cradle-64':name+' later'
   await h.patch(current,{[h.nameId]:laterName,[h.statusId]:'synthetic-cradle-65'});await tick();await tick()
   if(scope!=='restricted')assert.deepEqual((await fetchPage(deletion.data.cursor)).data,restored,'Captured later window also replays identically under current policy')
   const later=(await fetchPage(restored.cursor)).data
   rangeMarker=later.resyncRequired
   assert.equal(later.resyncRequired.code,'resync_required','Current field-policy narrowing uses the same cause-free range marker')
   assert.deepEqual(later.items.map(i=>[i.kind,i.recordId]),[['update',record.id]],'Next cursor contains only later changes, once')
   const allPings=edge.received.filter(r=>r.path===path)
   for(const ping of allPings){const verified=await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(subscription.signingKey),tenant:h.appId,destinationId:subscription.id});assert.equal(JSON.parse(verified.envelope.body).subscriptionId,subscription.id)}
   if(scope==='table'||scope==='base'){
    // The signed cursor codec's revision is its issuance-clock seam; move it back
    // 31 days while keeping this seven-day subscription and its key current.
    const bindings=await h.runtime.getBindings(),codec=createCursorCodec(bindings.SESSION_SECRET),position=await codec.decode(subscription.cursor),clock=()=>new Date(Date.now()-31*86400000)
    const old=await codec.encode({...position,revision:clock().getTime()})
    const expired=await h.request(route(old),{secret:key.secret,status:410})
    assert.equal(expired.error.code,'cursor_expired');assert.match(expired.error.message,/resynchroniz/i);assert.equal(expired.resyncRequired.code,later.resyncRequired.code);assert.equal(expired.resyncRequired.message,later.resyncRequired.message);assert.deepEqual(Object.keys(expired.resyncRequired).sort(),Object.keys(later.resyncRequired).sort())
    console.log('CHANGE_CURSOR_RETENTION PASS 410 cursor_expired resynchronize')
   }
   if(scope==='view'){
    const currentView=(await h.request(`/api/v1/views/${viewId}`)).data
    await h.request('/api/v1/commands/view.delete',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000002',recordId:viewId},version:currentView.version}],input:{viewId}}})
    await tick()
    const final=(await fetchPage(later.cursor)).data
    assert.deepEqual(final.items,[]);assert.equal(final.hasMore,false)
    assert.deepEqual(Object.keys(final.resyncRequired).sort(),['code','from','message','through'])
    assert.equal(final.resyncRequired.message,later.resyncRequired.message)
    for(const forbidden of [record.id,name,h.nameId,h.statusId,'recordId','rowCount'])assert.ok(!JSON.stringify(final).includes(forbidden),'Unavailable scope final page leaks no record content or cause')
    assert.deepEqual((await fetchPage(later.cursor)).data,final,'Unavailable scope final range replays identically')
    const listed=(await h.request(root+'?appId='+h.appId,{secret:key.secret})).data.find(row=>row.id===subscription.id)
    assert.equal(listed.state,'ended');assert.equal(listed.deliveryState,'authority_lost')
    console.log('CHANGE_DELETED_SCOPE view PASS generic final range and safe listing')
   }
   await h.request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}})
  }catch(error){console.error('CHANGE_MATRIX_FAILURE '+scope+': '+error.stack);failures.push(error)}
 }
 try{await tableScopeTermination(h,edge,tick,rangeMarker)}catch(error){console.error('CHANGE_TABLE_TERMINATION_FAILURE '+error.stack);failures.push(error)}
 if(failures.length)throw new AggregateError(failures,'Change-feed delete/restore synchronization matrix failed')
}

async function tableScopeTermination(h,edge,tick,rangeMarker){
 const root='/api/v1/change-subscriptions',appId=createUlid(),entityId=createUlid(),nameId=createUlid(),valueId=createUlid(),otherId=createUlid(),otherName=createUlid()
 const field=(id,label)=>({id,label,type:'text',required:false,unique:false})
 const draft={appId,name:'synthetic-cradle-660',tables:[
  {id:entityId,label:'Items',primaryFieldId:nameId,fields:[field(nameId,'Name'),field(valueId,'Value')]},
  {id:otherId,label:'Retained table',primaryFieldId:otherName,fields:[field(otherName,'Name')]},
 ]}
 async function adopt(schema){
  const review=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:schema})).data
  await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:review.id}}})
  return review
 }
 await adopt(draft)
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId,entityId,name:'synthetic-cradle-661',permissions:'read',expiresAt:new Date(Date.now()+20*86400000).toISOString()}})).data.key
 const subscriptions=[]
 for(const door of ['http','queue']){
  const path='/changes-deleted-table-'+door,subscription=(await h.request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId,entityId,url:edge.receiverOrigin+path}})).data
  subscriptions.push({...subscription,door,path})
 }
 const fetchPage=(subscription,cursor=subscription.cursor,limit=1)=>h.request(`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}`,{secret:key.secret}).then(result=>result.data)
 const list=()=>h.request(root+'?appId='+appId,{secret:key.secret}).then(result=>result.data)
 const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data
 const record=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,values:{[nameId]:'synthetic-cradle-662',[valueId]:'synthetic-cradle-663'}}}})).data.value
 await tick();await tick()
 for(const subscription of subscriptions){
  const readable=await fetchPage(subscription,subscription.cursor,200)
  assert.deepEqual(readable.items.map(item=>[item.kind,item.recordId]),[['create',record.id]])
  assert.ok(JSON.stringify(readable).includes('synthetic-cradle-663'),'The current scoped key reads populated retained changes before table deletion')
  subscription.readable=readable
  const pings=edge.received.filter(ping=>ping.path===subscription.path)
  assert.equal(pings.length,1,'A live table delivers one signed ping')
  await verifyWebhook({body:new TextEncoder().encode(pings[0].body),headers:pings[0].headers,key:unbase64(subscription.signingKey),tenant:appId,destinationId:subscription.id})
 }
 // Leave an undelivered change behind the watermark before reviewed deletion.
 await h.patch(record,{[valueId]:'synthetic-cradle-664'})
 const removed=await adopt({...draft,tables:draft.tables.filter(table=>table.id!==entityId)})
 assert.equal(removed.impacts.find(impact=>impact.entityId===entityId).deletedTable,true)
 await h.request(`/api/v1/apps/${appId}/entities/${entityId}`,{status:404})
 const [httpFirst,queueFirst]=subscriptions
 httpFirst.final=await fetchPage(httpFirst)
 await tick();await tick()
 // The queue must retire the subscription itself, before HTTP can mask a miss.
 assert.deepEqual(await h.db.prepare('SELECT state,delivery_state,sealed_json FROM record_change_subscriptions WHERE id=?').bind(queueFirst.id).first(),{state:'ended',delivery_state:'authority_lost',sealed_json:null})
 for(const subscription of [httpFirst,queueFirst]){
  const listed=(await list()).find(row=>row.id===subscription.id)
  assert.equal(listed.state,'ended');assert.equal(listed.deliveryState,'authority_lost')
 }
 // A fresh subscription after deletion is refused, even though the key is current.
 await h.request(root,{method:'POST',secret:key.secret,status:403,body:{commandId:createUlid(),appId,entityId,url:edge.receiverOrigin+'/changes-deleted-table-new'}})
 for(const subscription of subscriptions){
  const final=subscription.final??await fetchPage(subscription)
  assert.deepEqual(Object.keys(final).sort(),['cursor','hasMore','items','resyncRequired','through'])
  assert.deepEqual(final.items,[]);assert.equal(final.hasMore,false)
  assert.deepEqual(Object.keys(final.resyncRequired).sort(),['code','from','message','through'])
  assert.equal(final.resyncRequired.code,'resync_required');assert.equal(final.resyncRequired.from,subscription.cursor);assert.equal(final.resyncRequired.through,final.cursor)
  assert.equal(final.resyncRequired.message,rangeMarker.message,'Table termination and policy narrowing use the identical cause-free marker')
  assert.deepEqual(await fetchPage(subscription),final,'Replaying the populated captured cursor yields the same empty final range')
  assert.deepEqual((await fetchPage(subscription,subscription.readable.cursor)).items,[],'A retained continuation cannot expose the undelivered patch')
  const listed=(await list()).find(row=>row.id===subscription.id)
  assert.equal(listed.state,'ended');assert.equal(listed.deliveryState,'authority_lost')
  assert.deepEqual(Object.keys(listed).sort(),['appId','createdAt','deliveryState','entityId','expiresAt','id','state','viewId'])
  for(const response of [final,listed])for(const forbidden of [record.id,nameId,valueId,'synthetic-cradle-662','synthetic-cradle-663','synthetic-cradle-664','recordId','rowCount',subscription.signingKey])assert.ok(!JSON.stringify(response).includes(forbidden),'Final pages and safe listings retain no record identity, value or secret')
  await h.request(`${root}/${subscription.id}/refresh`,{method:'POST',secret:key.secret,status:403,body:{commandId:createUlid()}})
 }
 await tick();await tick()
 for(const subscription of subscriptions){
  assert.equal(edge.received.filter(ping=>ping.path===subscription.path).length,1,'Retained changes and repeated queue wakes never deliver after table deletion')
  await h.request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}})
 }
 assert.deepEqual(await list(),[],'The still-current scoped key can remove ended subscriptions')
 console.log('CHANGE_DELETED_SCOPE table PASS HTTP, emitted queue, generic final range, safe listing and stopped delivery')
}
