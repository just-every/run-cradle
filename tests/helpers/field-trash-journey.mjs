import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {parseCsv} from '../../src/domains/portability/csv.ts'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {freePort} from './free-port.mjs'

const field=(id,label)=>({id,label,type:'text',required:false,unique:false})

/** Field/table custody is exercised independently of record Trash, through the
 * same public schema-review, recovery and Trash restore surfaces. */
export async function fieldTrashJourney(existing){
 const h=existing??await userAutomationRuntime(await freePort())
 try{
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
  const first=await create(entityId,{[nameId]:'synthetic-cradle-331',[valueId]:'synthetic-cradle-332'}),second=await create(secondId,{[secondName]:'synthetic-cradle-333'})
  const firstHistory=await history(first),secondHistory=await history(second)
  assert.ok(firstHistory.some(item=>item.action==='record.create'));assert.ok(secondHistory.some(item=>item.action==='record.create'))
  const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data,expected=[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}]
  const metadata=[]
  for(const [kind,input] of [['view',{view:{appId,entityId,name:'synthetic-cradle-334',display:'grid',fields:[nameId,valueId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:nameId},visibility:'app',shipped:false}}],['form',{form:{appId,entityId,title:'synthetic-cradle-335',fields:[{fieldId:nameId,label:'Name',help:'',required:false},{fieldId:valueId,label:'Value',help:'',required:false}],submitAction:'record.create',authenticated:true}}]])metadata.push({kind,saved:(await h.request(`/api/v1/commands/${kind}.save`,{method:'POST',body:{commandId:createUlid(),expected,input}})).data.value})
  async function metadataFields(item){const saved=(await h.request(`/api/v1/${item.kind==='view'?'views':'forms'}/${item.saved.id}`)).data;return item.kind==='view'?saved.fields:saved.fields.map(field=>field.fieldId)}
  let draft=await readDraft();draft.tables.find(table=>table.id===entityId).fields=draft.tables.find(table=>table.id===entityId).fields.filter(item=>item.id!==valueId)
  const removedField=await adopt(draft),fieldMarker=await held('field',valueId)
  assert.ok(!(await readDraft()).tables.find(table=>table.id===entityId).fields.some(item=>item.id===valueId))
  assert.equal((await read(first)).fields[valueId],undefined)
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
  draft=await readDraft();draft.tables=draft.tables.filter(table=>table.id!==secondId)
  const removedTable=await adopt(draft),tableMarker=await held('table',secondId)
  assert.ok(!(await readDraft()).tables.some(table=>table.id===secondId))
  await h.request(`/api/v1/apps/${appId}/entities/${secondId}`,{status:404})
  await recovery(removedTable,second,'Name','synthetic-cradle-333')
  const collisionTable=createUlid(),collisionName=createUlid();draft=await readDraft();draft.tables.push({id:collisionTable,label:'Retained table',primaryFieldId:collisionName,fields:[field(collisionName,'Name')]});await adopt(draft)
  await restore('table',secondId,secondId,tableMarker.version,409)
  assert.ok((await readDraft()).tables.some(table=>table.id===collisionTable));assert.ok(!(await readDraft()).tables.some(table=>table.id===secondId))
  draft=await readDraft();draft.tables=draft.tables.filter(table=>table.id!==collisionTable);await adopt(draft)
  await restore('table',secondId,secondId,(await held('table',secondId)).version)
  const restored=(await readDraft()).tables.find(table=>table.id===secondId);assert.equal(restored.label,'Retained table');assert.equal(restored.primaryFieldId,secondName)
  await preserved(second,secondHistory);assert.ok(!(await listing()).some(item=>item.kind==='table'&&item.id===secondId))
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
 }finally{if(!existing)await h.close()}
}
