import assert from 'node:assert/strict'
import {fileRecords} from '@runeditrun/rer/modules/portability/files'
import {createUlid} from '../../src/core/shared/ids.ts'

const day=86400000
const command=(input,expected=[])=>({commandId:createUlid(),expected,input})
const publicPath=item=>item.kind==='record'?`/api/v1/apps/${item.appId}/entities/${item.entityId}/records/${item.id}`:`/api/v1/${item.kind==='view'?'views':'forms'}/${item.id}`
const restoreBody=item=>({kind:item.kind,commandId:createUlid(),appId:item.appId,entityId:item.entityId,recordId:item.id,version:item.trash.version})
const definition=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['version','updatedAt','access'].includes(key)))
const recordFields=record=>({id:record.id,ref:record.ref,fields:record.fields})
const historyPath=item=>item.kind==='view'?`/api/v1/views/${item.id}/history`:`/api/v1/history?appId=${item.appId}&entityId=${item.kind==='form'?'00000000000000000000000003':item.entityId}&recordId=${item.id}`

/** Native deletions populate all three implemented object kinds before export.
 * Only the expired controls' custody clock is aged; their deletion is native. */
export async function addRecordTrashArchiveState(h,liveRecord){
 const post=async(route,body)=>(await h.request(route,{method:'POST',body})).data
 const schema=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
 const linkId=schema.fields.find(field=>field.type==='relation'&&field.relation.entityId===h.entityId).id
 const revision={ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:schema.version}
 const live=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${liveRecord}`)).data.record
 const items=[]
 for(const expired of [false,true]){
  const label=expired?'expired':'retained',create=command({appId:h.appId,entityId:h.entityId,values:{[h.nameId]:'synthetic-cradle-trash-'+label}},[revision])
  const created={commandId:create.commandId,record:(await post('/api/v1/commands/record.create',create)).value}
  const record=(await h.patch(created.record,{[h.statusId]:'synthetic-cradle-retained-value',[linkId]:live.ref})).data.value
  assert.equal(record.fields[h.statusId].value,'synthetic-cradle-retained-value')
  assert.deepEqual(record.fields[linkId].value,live.ref)
  const view=(await post('/api/v1/commands/view.save',command({view:{appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-trash-view-'+label,display:'grid',fields:[h.nameId,h.statusId,linkId],filter:{kind:'all',conditions:[]},sort:[{fieldId:h.nameId,direction:'asc'}],groupBy:[],layout:{titleFieldId:h.nameId},visibility:'app',shipped:false}},[revision]))).value
  const form=(await post('/api/v1/commands/form.save',command({form:{appId:h.appId,entityId:h.entityId,title:'synthetic-cradle-trash-form-'+label,fields:[{fieldId:h.nameId,label:'Name',help:'synthetic-cradle-retained-help',required:true},{fieldId:h.statusId,label:'Status',help:'',required:false}],submitAction:'record.create',authenticated:true}},[revision]))).value
  for(const [kind,value] of [['record',record],['view',view],['form',form]]){
   const item={kind,id:value.id,appId:h.appId,entityId:h.entityId,expired,createCommand:kind==='record'?created.commandId:null}
   const read=async()=>{const data=(await h.request(publicPath(item))).data;return kind==='record'?data.record:data}
   const drop=async current=>{
    if(kind==='record')return post('/api/v1/commands/record.delete',command({ref:current.ref,confirmation:current.id},[{ref:current.ref,version:current.version}]))
    if(kind==='view')return post('/api/v1/commands/view.delete',command({viewId:current.id},[{ref:{appId:h.appId,entityId:'00000000000000000000000002',recordId:current.id},version:current.version}]))
    return (await post(`/api/v1/records/trash/forms/${current.id}/delete`,{commandId:createUlid(),appId:h.appId,version:current.version})).result
   }
   // Retain an earlier recovery in every object's nonempty public history.
   assert.equal((await drop(await read())).state,'committed')
   item.trash=(await h.request(`/api/v1/records/trash?appId=${h.appId}`)).data.items.find(row=>row.id===item.id)
   assert.equal((await post('/api/v1/records/trash/restore',restoreBody(item))).result.state,'committed')
   const visible=await read()
   item.before=kind==='record'?recordFields(visible):definition(visible)
   item.history=(await h.request(historyPath(item))).data.items
   assert.ok(item.history.some(row=>row.action===kind+'.delete'),'The pre-export history includes deletion for '+kind)
   assert.ok(item.history.some(row=>row.action===kind+'.restore'),'The pre-export history includes restoration for '+kind)
   assert.equal((await drop(visible)).state,'committed')
   await h.request(publicPath(item),{status:404})
   let trash=(await h.request(`/api/v1/records/trash?appId=${h.appId}`)).data.items.find(row=>row.id===item.id)
   assert.ok(trash?.restorable,'Native deletion is initially restorable')
   assert.equal(Date.parse(trash.expiresAt)-Date.parse(trash.deletedAt),30*day)
   if(expired){
    // A fixed historical clock avoids dependence on today's date or a boundary.
    const deleted=Date.parse('2001-01-01T12:00:00.000Z')
    await h.db.prepare(`UPDATE ${kind==='record'?'record_trash':kind==='view'?'record_views':'record_forms'} SET deleted_at=?,expires_at=? WHERE ${kind==='record'?'record_id':'id'}=?`).bind(deleted,deleted+30*day,item.id).run()
    trash=(await h.request(`/api/v1/records/trash?appId=${h.appId}`)).data.items.find(row=>row.id===item.id)
    assert.equal(trash.restorable,false)
   }
   item.trash=trash
   const table=kind==='record'?'record_trash':kind==='view'?'record_views':'record_forms'
   item.custody={table,row:await h.db.prepare(`SELECT * FROM ${table} WHERE ${kind==='record'?'record_id':'id'}=?`).bind(item.id).first()}
   if(kind==='record'){
    const d=(await h.descriptors()).get(h.appId,h.entityId)
    item.canonical={table:d.table.tableId,row:await h.db.prepare(`SELECT * FROM "${d.table.tableId}" WHERE id=?`).bind(item.id).first()}
   }
   items.push(item)
  }
 }
 return {appId:h.appId,entityId:h.entityId,items,live:recordFields(live),sourceCookie:h.cookie,sourceOwnerId:(await h.db.prepare('SELECT current_owner_id FROM cradle_restore WHERE singleton=1').first()).current_owner_id}
}

/** Compare the archive to expectations captured before it existed. */
export async function assertRecordTrashArchive(path,fixture){
 const rows=[]
 for await(const record of fileRecords(path))if(record.kind==='part')for(const item of record.items)if(item.kind==='row')rows.push(item)
 for(const item of fixture.items)for(const held of [item.custody,...(item.canonical?[item.canonical]:[])]){
  const actual=rows.find(row=>row.table===held.table&&(row.row.id??row.row.record_id)===item.id)
  assert.deepEqual(actual?.row,held.row,'Archive preserves original custody and canonical content for '+item.kind)
 }
 for(const table of ['sessions','authority_sessions','authority_credentials','connection_credentials','admission_outbox'])assert.equal(rows.filter(row=>row.table===table).length,0,'Source authority and dispatch are not archived')
}

/** Actual rer import has completed, then the fresh native owner uses public doors. */
export async function restoredRecordTrash(runtime,db,request,fixture,origin){
 const listPath=`/api/v1/records/trash?appId=${fixture.appId}`
 const listed=await request(listPath)
 assert.equal(listed.items.length,fixture.items.length,'All populated Trash kinds survive import')
 for(const item of fixture.items){
  assert.deepEqual(listed.items.find(row=>row.id===item.id),item.trash,'Import retains original identity, version and both custody times')
  await request(publicPath(item),undefined,404)
 }
 const stale=await fetch(origin+listPath,{redirect:'manual',headers:{cookie:fixture.sourceCookie}})
 assert.equal(stale.status,401,'Source sessions never regain access at the imported installation');await stale.arrayBuffer()
 const owner=(await db.prepare('SELECT current_owner_id FROM cradle_restore WHERE singleton=1').first()).current_owner_id
 assert.ok(owner);assert.notEqual(owner,fixture.sourceOwnerId)
 const policy=await db.prepare('SELECT p.id,p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=?').bind(owner,fixture.appId).first()
 assert.ok(policy)
 const rules=JSON.parse(policy.rules_json)
 for(const rule of rules)rule.actions=rule.actions.filter(action=>!['record.delete','view.delete','form.save'].includes(action))
 const before=(await db.prepare('SELECT count(*) n FROM command_admissions').first()).n
 // Narrow the admitted owner's current policy, retaining read access as a control.
 await db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
 assert.deepEqual((await request(listPath)).items,[],'Lost delete authority conceals retained contents')
 assert.deepEqual(recordFields((await request(`/api/v1/apps/${fixture.appId}/entities/${fixture.entityId}/records/${fixture.live.id}`)).record),fixture.live)
 for(const item of fixture.items.filter(item=>!item.expired)){
  await request('/api/v1/records/trash/restore',restoreBody(item),403)
  const row=await db.prepare(`SELECT * FROM ${item.custody.table} WHERE ${item.kind==='record'?'record_id':'id'}=?`).bind(item.id).first()
  assert.deepEqual(row,item.custody.row,'Refusal changes no retained state')
 }
 assert.equal((await db.prepare('SELECT count(*) n FROM command_admissions').first()).n,before,'Refused restores admit no command')
 await db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()
 for(const item of fixture.items){
  const body=restoreBody(item)
  if(item.expired){
   await request('/api/v1/records/trash/restore',body,409)
   assert.deepEqual(await db.prepare(`SELECT * FROM ${item.custody.table} WHERE ${item.kind==='record'?'record_id':'id'}=?`).bind(item.id).first(),item.custody.row,'Expired refusal preserves custody')
   await request(publicPath(item),undefined,404)
   continue
  }
  assert.equal((await request('/api/v1/records/trash/restore',body)).result.state,'committed')
  const visible=await request(publicPath(item))
  assert.deepEqual(item.kind==='record'?recordFields(visible.record):definition(visible),item.before,'The fresh owner restores the retained values or definition')
  const history=(await request(historyPath(item))).items
  for(const previous of item.history)assert.deepEqual(history.find(row=>row.id===previous.id),previous,'Original history remains intact')
  const action=item.kind+'.restore'
  assert.ok(history.some(row=>row.action===item.kind+'.delete'),'Deletion remains in public history')
  const priorRestores=item.history.filter(row=>row.action===action).length
  assert.equal(history.filter(row=>row.action===action).length,priorRestores+1,'The current restoration has one new public history entry')
  if(item.kind!=='view')assert.equal(history.find(row=>row.action===action&&!item.history.some(previous=>previous.id===row.id)).actor.id,owner,'Restoration uses current owner authority')
  // Replaying the capture cannot duplicate restoration or its audit.
  await request('/api/v1/records/trash/restore',body,item.kind==='record'?404:409)
  assert.equal((await request(historyPath(item))).items.filter(row=>row.action===action).length,priorRestores+1)
 }
 assert.deepEqual(recordFields((await request(`/api/v1/apps/${fixture.appId}/entities/${fixture.entityId}/records/${fixture.live.id}`)).record),fixture.live,'Live linked record is unchanged')
 const remaining=(await request(listPath)).items
 assert.deepEqual(remaining.map(row=>row.id).sort(),fixture.items.filter(item=>item.expired).map(item=>item.id).sort())
 assert.ok(remaining.every(row=>!row.restorable))
 assert.equal((await db.prepare("SELECT count(*) n FROM admission_outbox WHERE state='pending'").first()).n,0,'Restore adds no automatic dispatch')
 const worker=await runtime.getWorker(),record=fixture.items.find(item=>item.kind==='record'&&!item.expired)
 assert.equal((await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.records.automations.v1',commandId:record.createCommand}}])).outcome,'ok')
 assert.deepEqual(recordFields((await request(publicPath(record))).record),record.before,'A captured source delivery cannot change restored data')
 console.log('TRASH_ARCHIVE_RESTORE '+JSON.stringify({kinds:['record','view','form'],retained:3,expired:3,sourceSessions:'refused',currentAuthority:'checked',dispatch:'none'}))
}
