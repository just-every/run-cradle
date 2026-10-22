import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {createCursorCodec} from '../../src/domains/records/cursor.server.ts'
import {verifyWebhook} from '../../vendor/base/modules/integrations/core/webhook.ts'
import {unbase64} from '../../src/adapters/crypto.server.ts'

// One change-feed synchronization matrix, through the emitted Worker's HTTP/queue doors.
export async function changeSubscriptionDeletes(h,edge){
 const root='/api/v1/change-subscriptions',worker=await h.runtime.getWorker(),failures=[]
 const tick=()=>worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.changes.v1',commandId:createUlid()}}])
 const remove=record=>h.request('/api/v1/commands/record.delete',{method:'POST',body:{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,confirmation:record.id}}})
 async function policy(key,edit){
  const row=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_credentials c JOIN authority_memberships m ON m.principal_id=c.principal_id JOIN authority_policies p ON p.id=m.policy_id WHERE c.id=? AND m.app_id=?').bind(key.id,h.appId).first()
  const rules=JSON.parse(row.rules_json);for(const rule of rules)edit(rule)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),row.id).run()
 }
 for(const scope of ['table','view','restricted']){
  try{
   const name=`synthetic-cradle-${scope==='table'?61:scope==='view'?62:63}`,record=(await h.create(name)).record
   const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name,permissions:'read',expiresAt:new Date(Date.now()+29*86400000).toISOString()}})).data.key
   let viewId
   if(scope==='view'){
    const view=(await h.request('/api/v1/commands/view.save',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:h.entity.version}],input:{view:{appId:h.appId,entityId:h.entityId,name,display:'grid',fields:[h.nameId,h.statusId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:h.nameId},visibility:'app',shipped:false}}}})).data.value
    viewId=view.id
   }
   if(scope==='restricted')await policy(key,rule=>{rule.rows={kind:'condition',fieldId:h.nameId,op:'eq',value:name}})
   const path='/changes-'+scope,subscription=(await h.request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,...(viewId?{viewId}:{}),url:edge.receiverOrigin+path}})).data
   const route=(cursor,limit=200)=>`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}`
   const fetchPage=cursor=>h.request(route(cursor),{secret:key.secret})
   await remove(record);await tick();await tick()
   const pings=edge.received.filter(r=>r.path===path)
   assert.equal(pings.length,1,scope+': exactly one idempotent delete ping')
   const deletion=await fetchPage(subscription.cursor)
   if(scope==='table'){
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
   assert.deepEqual(paged,deletion.data.items,'Paging the same delete range has no gaps or duplicate items');assert.equal(markers,scope==='table'?0:1)
   console.log('CHANGE_DELETE '+scope+' PASS')
   const held=(await h.request(`/api/v1/records/trash?appId=${h.appId}`)).data.items.find(item=>item.id===record.id)
   // Current field narrowing applies to restoration, and an unreadable restored row is omitted.
   await policy(key,rule=>{rule.readableFields=rule.readableFields.filter(id=>id!==h.statusId);if(scope==='restricted')rule.rows={kind:'condition',fieldId:h.nameId,op:'eq',value:'synthetic-cradle-64'}})
   await h.request('/api/v1/records/trash/restore',{method:'POST',body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,recordId:record.id,version:held.version}})
   await tick();await tick()
   assert.deepEqual((await fetchPage(subscription.cursor)).data,deletion.data,'Same cursor replays its captured delete range')
   const restored=(await fetchPage(deletion.data.cursor)).data
   assert.equal(restored.resyncRequired,undefined)
   if(scope==='restricted'){assert.deepEqual(restored.items,[]);assert.equal(edge.received.filter(r=>r.path===path).length,1)}
   else{
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
   assert.deepEqual(later.items.map(i=>[i.kind,i.recordId]),[['update',record.id]],'Next cursor contains only later changes, once')
   const allPings=edge.received.filter(r=>r.path===path)
   for(const ping of allPings){const verified=await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(subscription.signingKey),tenant:h.appId,destinationId:subscription.id});assert.equal(JSON.parse(verified.envelope.body).subscriptionId,subscription.id)}
   if(scope==='table'){
    // The signed cursor codec's revision is its issuance-clock seam; move it back
    // 31 days while keeping this seven-day subscription and its key current.
    const bindings=await h.runtime.getBindings(),codec=createCursorCodec(bindings.SESSION_SECRET),position=await codec.decode(subscription.cursor),clock=()=>new Date(Date.now()-31*86400000)
    const old=await codec.encode({...position,revision:clock().getTime()})
    const expired=await h.request(route(old),{secret:key.secret,status:410})
    assert.equal(expired.error.code,'cursor_expired');assert.match(expired.error.message,/resynchroniz/i)
    console.log('CHANGE_CURSOR_RETENTION PASS 410 cursor_expired resynchronize')
   }
   await h.request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}})
  }catch(error){console.error('CHANGE_MATRIX_FAILURE '+scope+': '+error.stack);failures.push(error)}
 }
 if(failures.length)throw new AggregateError(failures,'Change-feed delete/restore synchronization matrix failed')
}
