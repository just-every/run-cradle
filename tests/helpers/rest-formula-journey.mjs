import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function restFormulaJourney(h){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),countId=createUlid(),flagId=createUlid(),hiddenId=createUlid(),computedId=createUlid()
 const draft={appId,name:'synthetic-cradle-301 formula REST',tables:[{id:entityId,label:'Formula items',primaryFieldId:nameId,fields:[
  {id:nameId,label:'Name',type:'text',required:true,unique:true},
  {id:countId,label:'Count',type:'number',required:true,unique:false},
  {id:flagId,label:'Approved',type:'boolean',required:false,unique:false},
  {id:hiddenId,label:'Secret',type:'text',required:false,unique:false},
  {id:computedId,label:'Derived secret',type:'computed',required:false,unique:false,readOnly:true,resultType:'text',expression:{kind:'field',fieldId:hiddenId}},
 ]}]}
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items.find(row=>row.id===entityId)
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{appId,entityId,expiresAt:new Date(Date.now()+86400000).toISOString(),commandId:createUlid(),name:'synthetic-cradle-302 formula key',permissions:'write'}})).data.key
 const document=await h.request(`/api/v1/apps/${appId}/openapi.json`,{secret:key.secret})
 const operations=Object.entries(document.paths).flatMap(([path,methods])=>Object.entries(methods).map(([method,operation])=>({path,method:method.toUpperCase(),operation})))
 const validator=new Ajv2020({allErrors:true});addFormats(validator)
 const call=async(name,body,status=200)=>{
  const item=operations.find(item=>item.operation['x-cradle-operation']===name&&item.operation['x-cradle-entityId']===entityId);assert.ok(item,`OpenAPI supplies ${name}`)
  if(status===200){const valid=validator.compile(item.operation.requestBody.content['application/json'].schema);assert.equal(valid(body),true,JSON.stringify(valid.errors))}
  const result=await h.request(item.path,{method:item.method,secret:key.secret,body,status})
  if(status===200){const valid=validator.compile(item.operation.responses['200'].content['application/json'].schema);assert.equal(valid(result),true,JSON.stringify(valid.errors))}
  return result.data
 }
 const rows=[['Alpha','3',true],['Bravo','4',true],['Charlie','5',true],['Delta','6',false],['Echo','10',true],['Foxtrot','7',true]]
 await call('batch',{commandId:createUlid(),schemaVersion:schema.version,operation:'create',rows:rows.map(([name,count,approved])=>({values:{[nameId]:name,[countId]:count,[flagId]:approved,[hiddenId]:'synthetic-cradle-303 private'}}))})
 const query={limit:2,formula:'AND({Approved}, LEN({Name}) > 4, {Count} * 2 >= 6)',sort:[{fieldId:countId,direction:'desc'}],fields:[nameId]}
 const first=await call('query',query),second=await call('query',{...query,cursor:first.nextCursor})
 assert.deepEqual([...first.items,...second.items].map(row=>row.fields[nameId].value),['Foxtrot','Charlie','Bravo','Alpha'])
 assert.equal(first.items.length,2);assert.equal(second.items.length,2);assert.ok(first.nextCursor);assert.equal(second.nextCursor,null)
 assert.deepEqual(first.total,{kind:'exact',value:4});assert.deepEqual(second.total,first.total)
 assert.ok([...first.items,...second.items].every(row=>Object.keys(row.fields).join()===nameId),'Predicate dependencies do not widen selected response fields')
 await call('query',{...query,formula:'{Count} > 3',cursor:first.nextCursor},409)
 assert.deepEqual((await call('query',{...query,filter:{kind:'condition',fieldId:nameId,op:'ne',value:'Bravo'}})).items.map(row=>row.fields[nameId].value),['Foxtrot','Charlie'],'A condition and formula both constrain the query')
 await call('query',{...query,formula:'AND('},400)
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id JOIN authority_credentials c ON c.principal_id=m.principal_id WHERE c.id=? AND m.app_id=?').bind(key.id,appId).first()
 try{
  const rules=JSON.parse(policy.rules_json).map(rule=>({...rule,readableFields:rule.readableFields.filter(id=>id!==hiddenId),rows:{kind:'condition',fieldId:nameId,op:'ne',value:'Foxtrot'}}))
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
  const narrowed=await call('query',query)
  assert.deepEqual(narrowed.items.map(row=>row.fields[nameId].value),['Charlie','Bravo']);assert.deepEqual(narrowed.total,{kind:'exact',value:3})
  await call('query',{...query,formula:'{Secret} = "synthetic-cradle-303 private"'},400)
  await call('query',{...query,formula:'{Derived secret} = "synthetic-cradle-303 private"'},400)
  await call('query',{...query,cursor:first.nextCursor},409)
 }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()}
 await h.request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId}})
 await call('query',query,401)
}
