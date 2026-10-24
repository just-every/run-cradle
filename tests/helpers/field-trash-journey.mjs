import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {parseCsv} from '../../src/domains/portability/csv.ts'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {randomBytes} from 'node:crypto'
import {schemaPurgeJourney} from './schema-purge-journey.mjs'
import {historicalLinkedFieldRestore} from './field-history-restore-journey.mjs'
import {automationNetworkEdge} from './automation-network-edge.mjs'

const field=(id,label)=>({id,label,type:'text',required:false,unique:false})

/** Field/table custody is exercised independently of record Trash, through the
 * same public schema-review, recovery and Trash restore surfaces. */
export async function fieldTrashJourney(existing){
 let h=existing,edge
 const credentials=[]
 async function cleanup(){for(const item of credentials)if(item.key){await h.request(`/api/user-keys/${item.key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId:item.appId}});item.key=null}}

 try{
  if(!h){edge=await automationNetworkEdge();h=await userAutomationRuntime(0,{bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EGRESS_RELAY_URL:'https://relay.egress.example.com/v1/deliver',EGRESS_RELAY_SECRET:edge.secret},outbound:request=>edge.outbound(request)})}
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
  await h.request('/api/v1/commands/record.delete',{method:'POST',body:{commandId:createUlid(),expected:[{ref:second.ref,version:second.version}],input:{ref:second.ref,confirmation:second.id}}})
  const recordMarker=(await listing()).find(item=>item.kind==='record'&&item.id===second.id),unsafe=await readDraft();unsafe.tables=unsafe.tables.filter(table=>table.id!==secondId)
  const blocked=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:unsafe})).data;assert.ok(blocked.impacts.find(item=>item.entityId===secondId).refusals.some(reason=>reason.includes('records already in Trash')))
  const refused=await h.request('/api/v1/commands/release.adopt',{method:'POST',status:400,body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:blocked.id}}});assert.equal(refused.error.code,'validation')
  await restore('record',secondId,second.id,recordMarker.version)
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
  // A conversion is one schema event, never invented per-record patch events.
  const conversionSubscription=await subscribe(secondId)
  const conversionDraft=await readDraft(),option=createUlid()
  const convertedField=conversionDraft.tables.find(table=>table.id===secondId).fields.find(item=>item.id===secondName)
  convertedField.type='select';convertedField.options=[{id:option,label:'synthetic-cradle-333'}]
  const conversionPreview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:conversionDraft})).data
  assert.ok(conversionPreview.impacts.find(item=>item.entityId===secondId).dependencies.some(item=>item.kind==='api_key'&&item.id===conversionSubscription.key.id),'Conversion review names its scoped API key')
  await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:conversionPreview.id}}})
  const conversionPage=await changes(conversionSubscription)
  assert.deepEqual(conversionPage.items,[],'Schema conversion invents no record patches')
  assert.deepEqual(Object.keys(conversionPage.resyncRequired).sort(),['code','from','message','through'])
  assert.equal(conversionPage.resyncRequired.code,'resync_required')
  assert.equal(conversionPage.resyncRequired.from,conversionSubscription.cursor)
  assert.equal(conversionPage.resyncRequired.through,conversionPage.cursor)
  for(const forbidden of [second.id,secondName,'synthetic-cradle-333',option,'recordId','rowCount'])assert.ok(!JSON.stringify(conversionPage).includes(forbidden),'The fetched conversion range discloses no record or field values')
  assert.deepEqual(await changes(conversionSubscription),conversionPage,'The cause-free conversion range replays identically')
  console.log('FIELD_CONVERSION_RANGE PASS cause-free marker, stable replay and no invented record events')
  await historicalLinkedFieldRestore(h)
  await linkedTableTrashJourney(h)
  await schemaPurgeJourney(h)
  await cleanup()
  draft=await readDraft();draft.tables=draft.tables.filter(table=>table.id!==secondId);draft.tables.find(table=>table.id===entityId).fields=draft.tables.find(table=>table.id===entityId).fields.filter(item=>item.id!==valueId)
  await adopt(draft);const expiredCandidates=[await held('field',valueId),await held('table',secondId)]
  const physicalBefore=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,28)=?").bind('r_'+secondId.toLowerCase()).all()).results
  assert.ok(physicalBefore.length>0,'Canonical and historical table storage exists before scheduled expiry')
  const worker=await h.runtime.getWorker(),scheduled=await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()+31*86400000});assert.equal(scheduled.outcome,'ok','Scheduled expiry completes without a hidden exception')
  const expired=await listing()
  for(const candidate of expiredCandidates){
   assert.ok(!expired.some(item=>item.kind===candidate.kind&&item.id===candidate.id),'Physically purged schema values leave the Trash listing')
   const refused=await restore(candidate.kind,candidate.entityId,candidate.id,candidate.version,409);assert.equal(refused.error.code,'invalid_transition')
   const tombstone=await h.db.prepare('SELECT purge_state,detail_json FROM record_trash WHERE app_id=? AND entity_id=? AND record_id=? AND kind=?').bind(appId,candidate.entityId,candidate.id,candidate.kind).first()
   assert.deepEqual(tombstone,{purge_state:'purged',detail_json:'{}'},'Only an identity reservation remains; it carries no recoverable schema or value')
  }
  assert.deepEqual((await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,28)=?").bind('r_'+secondId.toLowerCase()).all()).results,[],'Every physical table revision, join and search store for the expired table is gone')
  const retained=await h.db.prepare('SELECT detail_json FROM manual_record_releases WHERE app_id=? UNION ALL SELECT detail_json FROM manual_record_previews WHERE app_id=?').bind(appId,appId).all()
  for(const row of retained.results)for(const value of ['synthetic-cradle-332','synthetic-cradle-333'])assert.ok(!row.detail_json.includes(value),'Expired values are gone from all release and preview recovery copies')
  const mainTables=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,28)=?").bind('r_'+entityId.toLowerCase()).all()).results
  for(const table of mainTables){const columns=(await h.db.prepare('PRAGMA table_xinfo("'+table.name+'")').all()).results;assert.ok(!columns.some(column=>column.name==='f_'+valueId.toLowerCase()),'No retained physical revision contains the expired field column')}
  assert.equal((await read(first)).fields[nameId].value,'synthetic-cradle-331 current','Scheduled disposal preserves current records')
  assert.equal((await h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0,'Physical disposal leaves no broken foreign keys')
  console.log('FIELD_SCHEMA_PURGE PASS physical revisions '+physicalBefore.length+' -> 0, all recovery copies redacted, restore refused, live values and FKs preserved')
  const final=await readDraft();assert.ok(!final.tables.some(table=>table.id===secondId));assert.ok(!final.tables.find(table=>table.id===entityId).fields.some(item=>item.id===valueId))
  console.log('FIELD_TABLE_TRASH PASS identities, values, history, recovery exports, name collisions and scheduled physical expiry purge')
 }finally{try{if(!existing)await h?.close()}finally{await edge?.close()}}
}


/** Deleting only the target table previews and holds every inbound link field. */
async function linkedTableTrashJourney(h){
 const appId=createUlid(),items=createUlid(),name=createUlid(),single=createUlid(),many=createUlid(),other=createUlid(),otherName=createUlid(),otherLink=createUlid(),targets=createUlid(),title=createUlid()
 const relation=(id,label,cardinality)=>({id,label,type:'relation',required:false,unique:false,relation:{ownerAppId:appId,entityId:targets,cardinality,onDelete:'restrict'}})
 const draft={appId,name:'synthetic-cradle-400',tables:[{id:items,label:'Items',primaryFieldId:name,fields:[field(name,'Name'),relation(single,'Main contact','one'),relation(many,'Other contacts','many')]},{id:other,label:'Other source',primaryFieldId:otherName,fields:[field(otherName,'Name'),relation(otherLink,'Contact','one')]},{id:targets,label:'Contacts',primaryFieldId:title,fields:[field(title,'Name')]}]}
 const preview=async body=>(await h.request('/api/v1/records/schema-preview',{method:'POST',body})).data
 const adopt=async review=>(await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:review.id}}})).data.value
 await adopt(await preview(draft))
 async function create(entityId,values){const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data;return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,values}}})).data.value}
 const parents=[];for(const label of ['synthetic-cradle-401','synthetic-cradle-402'])parents.push(await create(targets,{[title]:label}))
 const first=await create(items,{[name]:'synthetic-cradle-403',[single]:parents[0].ref,[many]:[parents[1].ref,parents[0].ref]}),second=await create(other,{[otherName]:'synthetic-cradle-404',[otherLink]:parents[1].ref})
 const history=async row=>(await h.request('/api/v1/history?'+new URLSearchParams(row.ref))).data.items
 const histories=await Promise.all([...parents,first,second].map(history))
 const edit=(await h.request(`/api/v1/records/bases/${appId}`)).data;edit.tables=edit.tables.filter(table=>table.id!==targets)
 const review=await preview(edit),impact=review.impacts.find(item=>item.entityId===targets)
 assert.equal(impact.deletedTable,true);assert.deepEqual(impact.refusals,[])
 for(const [source,id,label]of [[items,single,'Items · Main contact'],[items,many,'Items · Other contacts'],[other,otherLink,'Other source · Contact']])assert.ok(impact.dependencies.some(item=>item.kind==='relation'&&item.id===source+':'+id&&item.name===label),'Every inbound link names its source table and field')
 await adopt(review)
 await h.request(`/api/v1/apps/${appId}/entities/${targets}`,{status:404})
 for(const row of [first,second]){const current=(await h.request(`/api/v1/apps/${appId}/entities/${row.ref.entityId}/records/${row.id}`)).data.record;assert.equal(current.id,row.id);for(const id of row===first?[single,many]:[otherLink])assert.equal(current.fields[id],undefined,'Inbound links leave live schema while their target is in Trash')}
 const trash=(await h.request(`/api/v1/records/trash?appId=${appId}`)).data.items,marker=trash.find(item=>item.kind==='table'&&item.id===targets)
 assert.ok(marker?.restorable);assert.equal(Date.parse(marker.expiresAt)-Date.parse(marker.deletedAt),30*86400000)
 for(const id of [single,many,otherLink])assert.ok(trash.some(item=>item.kind==='field'&&item.id===id&&item.restorable),'Every inbound field shares the restore window')
 await h.request('/api/v1/records/trash/restore',{method:'POST',body:{kind:'table',commandId:createUlid(),appId,entityId:targets,recordId:targets,version:marker.version}})
 for(const [index,row]of [...parents,first,second].entries()){
  const current=(await h.request(`/api/v1/apps/${appId}/entities/${row.ref.entityId}/records/${row.id}`)).data.record
  assert.equal(current.id,row.id);assert.equal(current.createdAt,row.createdAt);assert.deepEqual(current.fields,row.fields,'Restoration returns original values and every ordered incoming link')
  const entries=await history(row);for(const item of histories[index])assert.ok(entries.some(entry=>entry.id===item.id),'Original record history survives linked-table custody')
 }
 assert.ok(!(await h.request(`/api/v1/records/trash?appId=${appId}`)).data.items.some(item=>[targets,single,many,otherLink].includes(item.id)),'Atomic table restoration consumes every inbound custody marker')
 assert.equal((await h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 console.log('FIELD_LINKED_TABLE_TRASH PASS all inbound previews, 30-day grouped custody, identities, values, ordered links and history')
}
