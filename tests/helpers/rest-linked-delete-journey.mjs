import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function restLinkedDeleteJourney(h){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid()
 const links=['one','many'].map(cardinality=>({id:createUlid(),label:'Restricted '+cardinality,type:'relation',required:false,unique:false,relation:{ownerAppId:appId,entityId,cardinality,onDelete:'restrict'}}))
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:{appId,name:'synthetic-cradle-601 linked deletion',tables:[{id:entityId,label:'Linked items',primaryFieldId:nameId,fields:[{id:nameId,label:'Name',type:'text',required:true,unique:false},...links]}]}})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items.find(row=>row.id===entityId)
 const key=async allowDelete=>(await h.request('/api/user-keys',{method:'POST',status:201,body:{appId,entityId,commandId:createUlid(),name:'synthetic-cradle-602 linked key',permissions:'write',allowDelete,expiresAt:new Date(Date.now()+86400000).toISOString()}})).data.key
 const deleting=await key(true),writing=await key(false)
 const document=await h.request(`/api/v1/apps/${appId}/openapi.json`,{secret:deleting.secret})
 const operations=Object.entries(document.paths).flatMap(([path,methods])=>Object.entries(methods).map(([method,operation])=>({path,method:method.toUpperCase(),operation})))
 const call=async(name,{id,body,secret=deleting.secret,status=200}={})=>{
  const item=operations.find(item=>item.operation['x-cradle-operation']===name&&item.operation['x-cradle-entityId']===entityId)
  assert.ok(item)
  return (await h.request(item.path.replace('{recordId}',id??''),{method:item.method,secret,body,status})).data
 }
 const create=async(name,values={})=>(await call('create',{body:{commandId:createUlid(),schemaVersion:schema.version,values:{[nameId]:name,...values}}})).result.value.rows[0]
 const remove=(row,status=200,secret=deleting.secret)=>call('delete',{id:row.id,status,secret,body:{commandId:createUlid(),version:row.version,confirmation:row.id}})
 for(const field of links){
  const parent=await create('synthetic-cradle-603 '+field.label),value=field.relation.cardinality==='one'?parent.ref:[parent.ref]
  const child=await create('synthetic-cradle-604 '+field.label,{[field.id]:value})
  await remove(parent,403,writing.secret)
  assert.deepEqual((await call('get',{id:child.id})).fields[field.id].value,value,'A key without delete scope cannot change linked rows')
  await remove(parent,409)
  assert.equal((await call('get',{id:parent.id})).version,parent.version)
  assert.equal((await call('get',{id:child.id})).version,child.version)
  const changes={[field.id]:field.relation.cardinality==='one'?null:[]}
  const changed=await call('update',{id:child.id,body:{commandId:createUlid(),version:child.version,changes}})
  assert.deepEqual(changed.result.value.rows[0].fields[field.id].value,changes[field.id])
  assert.equal((await remove(parent)).result.state,'committed')
  await call('get',{id:parent.id,status:404})
  const kept=await call('get',{id:child.id})
  assert.equal(kept.version,child.version+1)
  assert.deepEqual(kept.fields[field.id].value,changes[field.id],'Explicit unlink preserves the child while allowing parent deletion')
 }
 const field=links.find(field=>field.relation.cardinality==='one')
 const parent=await create('synthetic-cradle-605 protected parent'),child=await create('synthetic-cradle-606 protected child',{[field.id]:parent.ref})
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id JOIN authority_credentials c ON c.principal_id=m.principal_id WHERE c.id=? AND m.app_id=?').bind(deleting.id,appId).first()
 try{
  for(const restriction of ['row','field']){
   const rules=JSON.parse(policy.rules_json).map(rule=>({...rule,...(restriction==='write'?{actions:rule.actions.filter(action=>action!=='record.patch')}:restriction==='row'?{rows:{kind:'condition',fieldId:nameId,op:'ne',value:'synthetic-cradle-606 protected child'}}:{readableFields:rule.readableFields.filter(id=>id!==field.id)})}))
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
   await remove(parent,403)
   const current=(await h.request(`/api/v1/apps/${appId}/rest/entities/${entityId}/records/${child.id}`)).data
   assert.equal(current.version,child.version)
   assert.deepEqual(current.fields[field.id].value,parent.ref,'A protected dependency refuses deletion atomically')
   assert.equal((await call('get',{id:parent.id})).version,parent.version)
  }
 }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()}
}
