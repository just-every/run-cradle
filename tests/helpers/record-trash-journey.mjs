import assert from 'node:assert/strict'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {baseHttpSession} from './base-http-session.mjs'
import {LAUNCH_APP_ID} from '../../src/apps/launch/contracts.ts'
import {AUTHORITY_ENTITY_IDS} from '../../src/domains/authority/contracts.ts'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function recordTrashJourney(){
 const h=await userAutomationRuntime(18955)
 try{
  const draft=(await h.request(`/api/v1/records/bases/${h.appId}`)).data,parentId=createUlid(),parentName=createUlid(),linkId=createUlid()
  draft.tables.push({id:parentId,label:'Vendors',primaryFieldId:parentName,fields:[{id:parentName,label:'Vendor',type:'text',required:true,unique:false}]})
  draft.tables.find(t=>t.id===h.entityId).fields.push({id:linkId,label:'Vendor',type:'relation',required:false,unique:false,relation:{ownerAppId:h.appId,entityId:parentId,cardinality:'one',onDelete:'restrict'}})
  const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
  await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
  async function create(entityId,values){const schema=(await h.request(`/api/v1/apps/${h.appId}/entities/${entityId}`)).data;return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId:h.appId,entityId,values}}})).data.value}
  const vendor=await create(parentId,{[parentName]:'synthetic-cradle-21'}),record=await create(h.entityId,{[h.nameId]:'synthetic-cradle-20',[linkId]:vendor.ref})
  const remove=record=>h.request('/api/v1/commands/record.delete',{method:'POST',body:{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,confirmation:record.id}}})
  await h.request('/api/v1/commands/record.delete',{method:'POST',status:409,body:{commandId:createUlid(),expected:[{ref:vendor.ref,version:vendor.version}],input:{ref:vendor.ref,confirmation:vendor.id}}})
  assert.equal((await remove(record)).data.state,'committed')
  const route=`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${record.id}`,trash=`/api/v1/records/trash?appId=${h.appId}`
  await h.request(route,{status:404})
  assert.deepEqual((await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/query`,{method:'POST',body:{limit:20,includeArchived:true}})).data.items,[])
  const exported=(await h.request('/api/v1/records/base-export',{method:'POST',body:{appId:h.appId,format:'json'}})).data
  assert.ok(!exported.content.includes('synthetic-cradle-20'),'Base exports omit canonical trash values')
  const item=(await h.request(trash)).data.items.find(i=>i.id===record.id);assert.ok(item?.restorable)
  const restore=()=>h.request('/api/v1/records/trash/restore',{method:'POST',body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,recordId:record.id,version:item.version}})
  const owner=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=(SELECT id FROM oa_operators WHERE email=?)').bind('import-owner@example.test').first()).principal_id
  const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=?').bind(owner,h.appId).first(),rules=JSON.parse(policy.rules_json)
  for(const rule of rules)rule.actions=rule.actions.filter(a=>a!=='record.delete')
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
  assert.deepEqual((await h.request(trash)).data.items,[])
  await h.request('/api/v1/records/trash/restore',{method:'POST',status:403,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,recordId:record.id,version:item.version}})
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()
  assert.equal((await restore()).data.result.state,'committed')
  const restored=(await h.request(route)).data.record
  assert.equal(restored.id,record.id);assert.deepEqual(restored.fields,record.fields);assert.ok(restored.version>record.version)
  const history=(await h.request(`/api/v1/history?appId=${h.appId}&entityId=${h.entityId}&recordId=${record.id}`)).data.items
  assert.ok(history.some(i=>i.action==='record.create'));assert.ok(history.some(i=>i.action==='record.delete'));assert.ok(history.some(i=>i.action==='record.restore'))
  assert.deepEqual((await h.request(trash)).data.items,[])
  await remove(restored)
  const worker=await h.runtime.getWorker();await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()+31*86400000})
  assert.deepEqual((await h.request(trash)).data.items,[])
  const d=(await h.descriptors()).get(h.appId,h.entityId)
  assert.equal((await h.db.prepare(`SELECT count(*) n FROM "${d.table.tableId}" WHERE id=?`).bind(record.id).first()).n,0)
  assert.ok((await h.db.prepare("SELECT 1 FROM admission_audit WHERE action='record.trash.purge' AND json_extract(subject_json,'$.recordId')=?").bind(record.id).first()),'Purge is an audited irreversible step')
  const command=(input,expected=[])=>({commandId:createUlid(),expected,input})
  const tableSchema=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
  const revision={ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:tableSchema.version}
  const view=(await h.request('/api/v1/commands/view.save',{method:'POST',body:command({view:{appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-51',display:'grid',fields:[h.nameId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:h.nameId},visibility:'app',shipped:false}},[revision])})).data.value
  const form=(await h.request('/api/v1/commands/form.save',{method:'POST',body:command({form:{appId:h.appId,entityId:h.entityId,title:'synthetic-cradle-52',fields:[{fieldId:h.nameId,label:'Name',help:'',required:true}],submitAction:'record.create',authenticated:true}},[revision])})).data.value
  for(const [kind,saved] of [['view',view],['form',form]]){
   const drop=async version=>kind==='view'?h.request('/api/v1/commands/view.delete',{method:'POST',body:command({viewId:saved.id},[{ref:{appId:h.appId,entityId:'00000000000000000000000002',recordId:saved.id},version}])}):h.request(`/api/v1/records/trash/forms/${saved.id}/delete`,{method:'POST',body:{commandId:createUlid(),appId:h.appId,version}})
   await drop(saved.version)
   const listed=(await h.request(trash)).data.items.find(item=>item.id===saved.id);assert.equal(listed.kind,kind)
   const snapshot=(await h.request('/api/v1/records/base-export',{method:'POST',body:{appId:h.appId,format:'json'}})).data.content
   assert.ok(!snapshot.includes(saved.id),'Deleted metadata leaves base JSON')
   const result=(await h.request('/api/v1/records/trash/restore',{method:'POST',body:{kind,commandId:createUlid(),appId:h.appId,entityId:h.entityId,recordId:saved.id,version:listed.version}})).data
   assert.equal(result.result.state,'committed')
   assert.ok(!(await h.request(trash)).data.items.some(item=>item.id===saved.id))
   const row=await h.db.prepare(`SELECT definition_json,version,deleted_at FROM ${kind==='view'?'record_views':'record_forms'} WHERE id=?`).bind(saved.id).first()
   assert.equal(row.deleted_at,null);assert.equal(JSON.parse(row.definition_json).id,saved.id);assert.ok(row.version>saved.version)
   await drop(row.version)
  }
  await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()+32*86400000})
  for(const [table,id]of [['record_views',view.id],['record_forms',form.id]])assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${table} WHERE id=?`).bind(id).first()).n,0,'Expired metadata is purged')
  const email='synthetic-cradle-41@example.test',name='synthetic-cradle-41',basePerson=createUlid()
  await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(basePerson,email,name,Date.now()).run()
  const person=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(basePerson).first()).principal_id
  await h.request(`/api/v1/records/bases/${h.appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:person,role:'editor'}})
  const signed=await baseHttpSession(h.origin,email),csrf=(await (await fetch(h.origin+'/auth/csrf',{headers:{cookie:signed.cookie}})).json()).csrfToken
  async function personal(route,body){const response=await fetch(h.origin+route,{method:'POST',headers:{cookie:signed.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)}),value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value.data}
  const schema=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
  const personalRecord=(await personal('/api/v1/commands/record.create',{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:schema.version}],input:{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:name,[h.statusId]:email}}})).value
  await personal('/api/v1/commands/record.delete',{commandId:createUlid(),expected:[{ref:personalRecord.ref,version:personalRecord.version}],input:{ref:personalRecord.ref,confirmation:personalRecord.id}})
  assert.equal((await h.db.prepare('SELECT count(*) n FROM record_trash WHERE actor_id=?').bind(person).first()).n,1)
  const memberVersion=async()=> (await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(person).first()).version
  await h.request('/api/v1/commands/member.remove',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:LAUNCH_APP_ID,entityId:AUTHORITY_ENTITY_IDS.member,recordId:person},version:await memberVersion()}],input:{memberId:person,reason:'synthetic-cradle-42'}}})
  const erased=await h.request('/api/v1/commands/member.erase',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:LAUNCH_APP_ID,entityId:AUTHORITY_ENTITY_IDS.member,recordId:person},version:await memberVersion()}],input:{memberId:person}}})
  assert.equal(erased.data.value.confirmed,true)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM record_trash WHERE actor_id=?').bind(person).first()).n,0)
  const held=await h.db.prepare(`SELECT count(*) rows,COALESCE(sum(length(CAST("${d.fields.get(h.nameId).column}" AS BLOB))+length(CAST("${d.fields.get(h.statusId).column}" AS BLOB))),0) bytes FROM "${d.table.tableId}" WHERE id=?`).bind(personalRecord.id).first()
  assert.deepEqual(held,{rows:0,bytes:0},'Person erasure bypasses trash with zero held rows and bytes')
 }finally{await h.close()}
}
