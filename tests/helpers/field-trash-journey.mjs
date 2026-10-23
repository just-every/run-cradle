import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {parseCsv} from '../../src/domains/portability/csv.ts'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {freePort} from './free-port.mjs'
import {randomBytes} from 'node:crypto'
import {automationNetworkEdge} from './automation-network-edge.mjs'

const field=(id,label)=>({id,label,type:'text',required:false,unique:false})

/** Field/table custody is exercised independently of record Trash, through the
 * same public schema-review, recovery and Trash restore surfaces. */
export async function fieldTrashJourney(existing){
 let h=existing,edge
 const credentials=[]
 async function cleanup(){for(const item of credentials)if(item.key){await h.request(`/api/user-keys/${item.key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId:item.appId}});item.key=null}}

 try{
  if(!h){edge=await automationNetworkEdge();h=await userAutomationRuntime(await freePort(),{bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EGRESS_RELAY_URL:'https://relay.egress.example.com/v1/deliver',EGRESS_RELAY_SECRET:edge.secret},outbound:request=>edge.outbound(request)})}
  const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),valueId=createUlid(),secondId=createUlid(),secondName=createUlid()
  const initial={appId,name:'synthetic-cradle-330',tables:[{id:entityId,label:'Items',primaryFieldId:nameId,fields:[field(nameId,'Name'),field(valueId,'Value')]},{id:secondId,label:'Retained table',primaryFieldId:secondName,fields:[field(secondName,'Name')]}]}
  const readDraft=async()=>(await h.request(`/api/v1/records/bases/${appId}`)).data
  async function adopt(draft){const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data;return (await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})).data.value}
  async function create(table,values){const schema=(await h.request(`/api/v1/apps/${appId}/entities/${table}`)).data;return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:table},version:schema.version}],input:{appId,entityId:table,values}}})).data.value}
  const read=async row=>(await h.request(`/api/v1/apps/${appId}/entities/${row.ref.entityId}/records/${row.id}`)).data.record
  const history=async row=>(await h.request(`/api/v1/history?appId=${appId}&entityId=${row.ref.entityId}&recordId=${row.id}`)).data.items
  const listing=async()=>(await h.request(`/api/v1/records/trash?appId=${appId}`)).data.items
  async function held(kind,id){const item=(await listing()).find(item=>item.kind===kind&&item.id===id);assert.ok(item,kind+' has an explicit Trash entry');assert.equal(item.restorable,true);assert.equal(Date.parse(item.expiresAt)-Date.parse(item.deletedAt),30*86400000);return item}
  const restore=async(kind,entity,id,version,status=200)=>h.request('/api/v1/records/trash/restore',{method:'POST',status,body:{kind,commandId:createUlid(),appId,entityId:entity,recordId:id,version}})
  async function recovery(release,row,label,value){const result=(await h.request(`/api/v1/records/releases/${release.releaseId}/recovery`)).data,table=result.tables.find(table=>table.entityId===row.ref.entityId);assert.ok(table);const csv=parseCsv(new TextEncoder().encode(table.csv)),column=csv.headers.indexOf(label);assert.ok(column>=0);assert.equal(csv.rows.find(values=>values[0]===row.id)?.[column],value,'The deletion recovery export retains the original value by record ID')}
  async function preserved(row,entries){const current=await read(row);assert.equal(current.id,row.id);assert.equal(current.createdAt,row.createdAt);assert.deepEqual(current.fields,row.fields);const retained=await history(row);for(const entry of entries)assert.ok(retained.some(item=>item.id===entry.id),'Original record history survives field/table custody')}
  await adopt(initial)
  async function subscribe(entityId){
   const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId,entityId,name:'synthetic-cradle-336',permissions:'read',expiresAt:new Date(Date.now()+20*86400000).toISOString()}})).data.key,item={appId,key,subscription:null};credentials.push(item)
   item.subscription=(await h.request('/api/v1/change-subscriptions',{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId,entityId,url:(edge?.receiverOrigin??'https://automation-receiver.example.com')+'/field-trash'}})).data
   return {...item.subscription,key}
  }
  const fieldSubscription=await subscribe(entityId)
  const changes=async subscription=>(await h.request(`/api/v1/change-subscriptions/${subscription.id}/changes?cursor=${encodeURIComponent(subscription.cursor)}`,{secret:subscription.key.secret})).data
  const first=await create(entityId,{[nameId]:'synthetic-cradle-331',[valueId]:'synthetic-cradle-332'}),second=await create(secondId,{[secondName]:'synthetic-cradle-333'})
  const firstHistory=await history(first),secondHistory=await history(second)
  assert.ok(firstHistory.some(item=>item.action==='record.create'));assert.ok(secondHistory.some(item=>item.action==='record.create'))
  const originalFieldPage=await changes(fieldSubscription)
  assert.deepEqual(originalFieldPage.items.map(item=>item.recordId),[first.id]);assert.ok(JSON.stringify(originalFieldPage).includes(valueId));assert.ok(JSON.stringify(originalFieldPage).includes('synthetic-cradle-332'))
  const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data,expected=[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}]
  const metadata=[]
  for(const [kind,input] of [['view',{view:{appId,entityId,name:'synthetic-cradle-334',display:'grid',fields:[nameId,valueId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:nameId},visibility:'app',shipped:false}}],['form',{form:{appId,entityId,title:'synthetic-cradle-335',fields:[{fieldId:nameId,label:'Name',help:'',required:false},{fieldId:valueId,label:'Value',help:'',required:false}],submitAction:'record.create',authenticated:true}}]])metadata.push({kind,saved:(await h.request(`/api/v1/commands/${kind}.save`,{method:'POST',body:{commandId:createUlid(),expected,input}})).data.value})
  async function metadataFields(item){const saved=(await h.request(`/api/v1/${item.kind==='view'?'views':'forms'}/${item.saved.id}`)).data;return item.kind==='view'?saved.fields:saved.fields.map(field=>field.fieldId)}
  let draft=await readDraft();draft.tables.find(table=>table.id===entityId).fields=draft.tables.find(table=>table.id===entityId).fields.filter(item=>item.id!==valueId)
  const removedField=await adopt(draft),fieldMarker=await held('field',valueId)
  assert.ok(!(await readDraft()).tables.find(table=>table.id===entityId).fields.some(item=>item.id===valueId))
  assert.equal((await read(first)).fields[valueId],undefined)
  const revoked=await h.request(`/api/v1/change-subscriptions/${fieldSubscription.id}/changes?cursor=${encodeURIComponent(fieldSubscription.cursor)}`,{secret:fieldSubscription.key.secret,status:403});assert.equal(revoked.error.code,'grant_revoked','Real issuer policy narrowing revokes the old delegation')
  const fresh=await subscribe(entityId),current=await read(first);await h.patch(current,{[nameId]:'synthetic-cradle-331 current'})
  const narrowed=await changes(fresh);assert.deepEqual(narrowed.items.map(item=>item.recordId),[first.id])
  for(const forbidden of [valueId,'synthetic-cradle-332'])assert.ok(!JSON.stringify(narrowed).includes(forbidden),'A currently authorized cursor response contains neither the removed field nor its value')
  first.fields[nameId].value='synthetic-cradle-331 current'
  for(const item of metadata)assert.ok(!(await metadataFields(item)).includes(valueId),'Field deletion prunes the current saved view and form')
  await recovery(removedField,first,'Value','synthetic-cradle-332')
  // A new field may use the freed name, but restoring an old identity must never
  // overwrite it. Remove the conflicting field before restoring the original.
  const collisionId=createUlid();draft=await readDraft();draft.tables.find(table=>table.id===entityId).fields.push(field(collisionId,'Value'));await adopt(draft)
  await restore('field',entityId,valueId,fieldMarker.version,409)
  let live=(await readDraft()).tables.find(table=>table.id===entityId)
  assert.ok(live.fields.some(item=>item.id===collisionId));assert.ok(!live.fields.some(item=>item.id===valueId))
  draft=await readDraft();draft.tables.find(table=>table.id===entityId).fields=draft.tables.find(table=>table.id===entityId).fields.filter(item=>item.id!==collisionId);await adopt(draft)
  await restore('field',entityId,valueId,(await held('field',valueId)).version)
  live=(await readDraft()).tables.find(table=>table.id===entityId);assert.equal(live.fields.find(item=>item.id===valueId).label,'Value')
  await preserved(first,firstHistory);assert.ok(!(await listing()).some(item=>item.kind==='field'&&item.id===valueId))
  for(const item of metadata)assert.deepEqual(await metadataFields(item),[nameId,valueId],'Restoring the field restores unedited view/form references to the original field identity')
  const tableSubscription=await subscribe(secondId)
  draft=await readDraft();draft.tables=draft.tables.filter(table=>table.id!==secondId)
  const removedTable=await adopt(draft),tableMarker=await held('table',secondId)
  assert.ok(!(await readDraft()).tables.some(table=>table.id===secondId))
  await h.request(`/api/v1/apps/${appId}/entities/${secondId}`,{status:404})
  const finalPage=await changes(tableSubscription)
  assert.deepEqual(finalPage.items,[]);assert.equal(finalPage.hasMore,false)
  assert.deepEqual(Object.keys(finalPage.resyncRequired).sort(),['code','from','message','through']);assert.equal(finalPage.resyncRequired.code,'resync_required');assert.equal(finalPage.resyncRequired.from,tableSubscription.cursor);assert.equal(finalPage.resyncRequired.through,finalPage.cursor)
  for(const forbidden of [second.id,secondName,'synthetic-cradle-333','recordId','rowCount'])assert.ok(!JSON.stringify(finalPage).includes(forbidden),'Unavailable table recovery contains only a cause-free range marker')
  assert.deepEqual(await changes(tableSubscription),finalPage,'The unavailable table range replays identically')
  const ended=(await h.request('/api/v1/change-subscriptions?appId='+appId,{secret:tableSubscription.key.secret})).data.find(item=>item.id===tableSubscription.id)
  assert.equal(ended.state,'ended');assert.equal(ended.deliveryState,'authority_lost');assert.ok(!JSON.stringify(ended).includes(tableSubscription.signingKey))
  await recovery(removedTable,second,'Name','synthetic-cradle-333')
  await restore('table',secondId,secondId,(await held('table',secondId)).version)
  assert.deepEqual(await changes(tableSubscription),finalPage,'A still-current key replays the same final window after table restoration')
  draft=await readDraft();draft.tables=draft.tables.filter(table=>table.id!==secondId);await adopt(draft)
  const collisionTable=createUlid(),collisionName=createUlid();draft=await readDraft();draft.tables.push({id:collisionTable,label:'Retained table',primaryFieldId:collisionName,fields:[field(collisionName,'Name')]});await adopt(draft)
  await restore('table',secondId,secondId,tableMarker.version,409)
  assert.ok((await readDraft()).tables.some(table=>table.id===collisionTable));assert.ok(!(await readDraft()).tables.some(table=>table.id===secondId))
  draft=await readDraft();draft.tables=draft.tables.filter(table=>table.id!==collisionTable);await adopt(draft)
  await restore('table',secondId,secondId,(await held('table',secondId)).version)
  const restored=(await readDraft()).tables.find(table=>table.id===secondId);assert.equal(restored.label,'Retained table');assert.equal(restored.primaryFieldId,secondName)
  await preserved(second,secondHistory);assert.ok(!(await listing()).some(item=>item.kind==='table'&&item.id===secondId))
  const revokedAfterNewTable=await h.request(`/api/v1/change-subscriptions/${tableSubscription.id}/changes?cursor=${encodeURIComponent(tableSubscription.cursor)}`,{secret:tableSubscription.key.secret,status:403});assert.equal(revokedAfterNewTable.error.code,'grant_revoked','Adding the collision table changed issuer authority; the old key remains refused')
  await cleanup()
  draft=await readDraft();draft.tables=draft.tables.filter(table=>table.id!==secondId);draft.tables.find(table=>table.id===entityId).fields=draft.tables.find(table=>table.id===entityId).fields.filter(item=>item.id!==valueId)
  await adopt(draft);await held('field',valueId);await held('table',secondId)
  const worker=await h.runtime.getWorker();await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()+31*86400000})
  const expired=await listing()
  for(const [kind,entity,id] of [['field',entityId,valueId],['table',secondId,secondId]]){
   const item=expired.find(item=>item.kind===kind&&item.id===id)
   assert.ok(item,'Expired schema custody remains explicitly visible until recovery copies can be disposed of')
   assert.equal(item.restorable,false);assert.equal(item.purgeState,'blocked_recovery_custody')
   const refused=await restore(kind,entity,id,item.version,409);assert.equal(refused.error.code,'invalid_transition')
  }
  const final=await readDraft();assert.ok(!final.tables.some(table=>table.id===secondId));assert.ok(!final.tables.find(table=>table.id===entityId).fields.some(item=>item.id===valueId))
  console.log('FIELD_TABLE_TRASH PASS identities, values, history, recovery exports, name collisions and expired visible custody hold; physical purge unproven')
 }finally{try{if(!existing)await h?.close()}finally{await edge?.close()}}
}
