import assert from 'node:assert/strict'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
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
 }finally{await h.close()}
}
