import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
export async function recordsRestJourney(h){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),flagId=createUlid(),hiddenId=createUlid()
 const draft={appId,name:'synthetic-cradle-201 REST',tables:[{id:entityId,label:'REST items',primaryFieldId:nameId,fields:[
  {id:nameId,label:'Name',type:'text',required:true,unique:true},
  {id:flagId,label:'Approved',type:'boolean',required:false,unique:false},
  {id:hiddenId,label:'Private note',type:'text',required:false,unique:false},
 ]}]}
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items.find(row=>row.id===entityId)
 const issue={appId,entityId,expiresAt:new Date(Date.now()+86400000).toISOString()}
 const key=async options=>(await h.request('/api/user-keys',{method:'POST',status:201,body:{...issue,commandId:createUlid(),name:'synthetic-cradle-202 REST key',permissions:'write',...options}})).data.key
 const writable=await key(),deleting=await key({allowDelete:true})
 const issuedIds=(await h.request('/api/user-keys?appId='+appId)).data.keys.map(key=>key.id)
 await h.request('/api/user-keys',{method:'POST',status:400,body:{...issue,commandId:createUlid(),name:'synthetic-cradle-203 invalid delete scope',permissions:'read',allowDelete:true}})
 assert.deepEqual((await h.request('/api/user-keys?appId='+appId)).data.keys.map(key=>key.id),issuedIds,'Read-only delete issuance creates no credential')
 const document=await h.request(`/api/v1/apps/${appId}/openapi.json`,{secret:writable.secret})
 const operations=Object.entries(document.paths).flatMap(([path,methods])=>Object.entries(methods).map(([method,operation])=>({path,method:method.toUpperCase(),operation})))
 const endpoint=name=>{const item=operations.find(item=>item.operation['x-cradle-operation']===name&&item.operation['x-cradle-entityId']===entityId);assert.ok(item,`OpenAPI supplies ${name}`);return item}
 const validator=new Ajv2020({allErrors:true});addFormats(validator)
 const seen=new Set(),call=async(name,{id,body,status=200,secret=writable.secret}={})=>{
  const item=endpoint(name);seen.add(name)
  const input=item.operation.requestBody?.content['application/json'].schema
  if(status===200&&input){const valid=validator.compile(input);assert.equal(valid(body),true,JSON.stringify(valid.errors))}
  const response=await h.request(item.path.replace('{recordId}',id??''),{method:item.method,secret,status,body})
  if(status===200){const valid=validator.compile(item.operation.responses['200'].content['application/json'].schema);assert.equal(valid(response),true,JSON.stringify(valid.errors))}
  return response.data
 }
 const readSchema=await call('schema');assert.deepEqual(readSchema.fields.map(field=>field.id),[nameId,flagId,hiddenId])
 const created=await call('create',{body:{commandId:createUlid(),schemaVersion:schema.version,values:{[nameId]:'synthetic-cradle-204 first',[hiddenId]:'synthetic-cradle-205 private value'}}})
 assert.equal(created.result.state,'committed');let record=created.result.value.rows[0]
 assert.equal((await call('get',{id:record.id})).fields[hiddenId].value,'synthetic-cradle-205 private value')
 const updated=await call('update',{id:record.id,body:{commandId:createUlid(),version:record.version,changes:{[flagId]:true}}});record=updated.result.value.rows[0];assert.equal(record.fields[flagId].value,true)
 await call('create',{body:{commandId:createUlid(),schemaVersion:schema.version,values:{[nameId]:'synthetic-cradle-204 excluded',[flagId]:false}}})
 const query={limit:2,filter:{kind:'condition',fieldId:flagId,op:'eq',value:true},sort:[{fieldId:nameId,direction:'asc'}]}
 assert.deepEqual((await call('query',{body:query})).items.map(row=>row.id),[record.id])
 const batchBody={commandId:createUlid(),schemaVersion:schema.version,operation:'create',rows:Array.from({length:100},(_,i)=>({values:{[nameId]:`synthetic-cradle-206 batch ${String(99-i).padStart(3,'0')}`}}))}
 const count=async()=>Number((await call('query',{body:{limit:1}})).total.value)
 const before=await count()
 const batch=await call('batch',{body:batchBody});assert.equal(batch.result.state,'committed');assert.equal(batch.result.value.rows.length,100);assert.equal(await count(),before+100)
 assert.equal((await call('batch',{body:batchBody})).result.value.rows[0].id,batch.result.value.rows[0].id);assert.equal(await count(),before+100,'Replay creates nothing twice')
 assert.equal(await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(batchBody.commandId).first('n'),1,'The batch has one admission')
 const page=await call('query',{body:{limit:2,sort:[{fieldId:nameId,direction:'asc'}]}})
 const next=await call('query',{body:{limit:2,sort:[{fieldId:nameId,direction:'asc'}],cursor:page.nextCursor}})
 assert.deepEqual([...page.items,...next.items].map(row=>row.fields[nameId].value),['synthetic-cradle-204 excluded','synthetic-cradle-204 first','synthetic-cradle-206 batch 000','synthetic-cradle-206 batch 001']);assert.equal(page.items.length,2);assert.equal(next.items.length,2);assert.equal(new Set([...page.items,...next.items].map(row=>row.id)).size,4,'Sorted pagination neither repeats nor skips its boundary')
 await call('batch',{status:409,body:{...batchBody,commandId:createUlid(),schemaVersion:schema.version+1,rows:[{values:{[nameId]:'synthetic-cradle-215 stale schema'}}]}})
 assert.equal(await count(),before+100,'A stale schema writes nothing')
 const batchRows=batch.result.value.rows
 const changed=await call('batch',{body:{commandId:createUlid(),operation:'update',rows:batchRows.map(row=>({recordId:row.id,version:row.version,changes:{[flagId]:true}}))}})
 assert.equal(changed.result.value.rows.length,100);assert.ok(changed.result.value.rows.every(row=>row.fields[flagId].value===true))
 const batchCurrent=changed.result.value.rows,baseline=await count()
 await call('batch',{status:400,body:{...batchBody,commandId:createUlid(),rows:Array.from({length:101},(_,i)=>({values:{[nameId]:`synthetic-cradle-207 refused ${i}`}}))}})
 assert.equal(await count(),baseline,'An oversized batch writes zero rows')
 await call('batch',{status:400,body:{...batchBody,commandId:createUlid(),rows:[{values:{[nameId]:'synthetic-cradle-208 should not be created'}},{values:{[nameId]:'synthetic-cradle-209 invalid',[flagId]:'invalid boolean'}}]}})
 assert.equal(await count(),baseline,'One invalid row refuses the entire create batch')
 await call('batch',{status:400,body:{commandId:createUlid(),operation:'update',rows:[{recordId:record.id,version:record.version,changes:{[flagId]:false}},{recordId:batchCurrent[0].id,version:batchCurrent[0].version,changes:{[flagId]:'invalid boolean'}}]}})
 assert.equal((await call('get',{id:record.id})).fields[flagId].value,true,'One invalid row refuses the entire update batch')
 await call('batch',{status:400,body:{...batchBody,commandId:createUlid(),rows:[{values:{[nameId]:'synthetic-cradle-212 duplicate'}},{values:{[nameId]:'synthetic-cradle-212 duplicate'}}]}})
 assert.equal(await count(),baseline,'Duplicate unique values refuse the whole batch')
 await call('batch',{status:400,body:{commandId:createUlid(),operation:'update',rows:Array.from({length:101},()=>({recordId:record.id,version:record.version,changes:{[flagId]:false}}))}})
 assert.equal((await call('get',{id:record.id})).fields[flagId].value,true)
 const delegatePolicy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id JOIN authority_credentials c ON c.principal_id=m.principal_id WHERE c.id=? AND m.app_id=?').bind(writable.id,appId).first()
 try{
  const rules=JSON.parse(delegatePolicy.rules_json).map(rule=>({...rule,rows:{kind:'condition',fieldId:nameId,op:'ne',value:batchCurrent[0].fields[nameId].value}}))
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),delegatePolicy.id).run()
  await call('batch',{status:404,body:{commandId:createUlid(),operation:'update',rows:[{recordId:record.id,version:record.version,changes:{[flagId]:false}},{recordId:batchCurrent[0].id,version:batchCurrent[0].version,changes:{[flagId]:false}}]}})
 }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(delegatePolicy.rules_json,delegatePolicy.id).run()}
 assert.equal((await call('get',{id:record.id})).fields[flagId].value,true,'One policy-hidden row refuses the entire batch')
 const upsert={commandId:createUlid(),schemaVersion:schema.version,mergeFieldId:nameId,values:{[nameId]:'synthetic-cradle-210 upsert',[flagId]:false}}
 const inserted=(await call('upsert',{body:upsert})).result.value.rows[0]
 const merged=(await call('upsert',{body:{...upsert,commandId:createUlid(),values:{...upsert.values,[flagId]:true}}})).result.value.rows[0]
 assert.equal(merged.id,inserted.id);assert.equal(merged.version,inserted.version+1);assert.equal(merged.fields[flagId].value,true)
 assert.deepEqual((await call('upsert',{body:upsert})).result.value.rows[0],inserted,'An upsert replay preserves its first result, including its original version and values')
 await call('upsert',{status:400,body:{...upsert,commandId:createUlid(),mergeFieldId:flagId,values:{[nameId]:'synthetic-cradle-214 nonunique',[flagId]:false}}})
 await call('delete',{id:record.id,status:403,body:{commandId:createUlid(),version:record.version,confirmation:record.id}})
 await call('delete',{id:record.id,status:400,secret:deleting.secret,body:{commandId:createUlid(),version:record.version,confirmation:inserted.id}})
 const deleteOne={commandId:createUlid(),version:record.version,confirmation:record.id}
 const deleted=await call('delete',{id:record.id,secret:deleting.secret,body:deleteOne})
 await call('delete',{id:record.id,secret:deleting.secret,body:deleteOne,status:403})
 assert.equal(await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(deleteOne.commandId).first('n'),1,'An unreadable deleted subject refuses receipt replay without another write')
 assert.equal(deleted.result.state,'committed')
 const trashed=(await h.request(`/api/v1/records/trash?appId=${appId}`)).data
 assert.ok(JSON.stringify(trashed).includes(record.id),'Delete uses the existing trash door')
 await call('batch',{status:400,secret:deleting.secret,body:{commandId:createUlid(),operation:'delete',rows:[{recordId:batchCurrent[0].id,version:batchCurrent[0].version,confirmation:batchCurrent[0].id},{recordId:batchCurrent[1].id,version:batchCurrent[1].version,confirmation:inserted.id}]}})
 assert.equal((await call('get',{id:batchCurrent[0].id})).id,batchCurrent[0].id,'An invalid delete confirmation refuses all rows')
 await call('batch',{status:400,secret:deleting.secret,body:{commandId:createUlid(),operation:'delete',rows:Array.from({length:101},()=>({recordId:batchCurrent[0].id,version:batchCurrent[0].version,confirmation:batchCurrent[0].id}))}})
 assert.equal((await call('get',{id:batchCurrent[0].id})).id,batchCurrent[0].id)
 const deleteMany={commandId:createUlid(),operation:'delete',rows:batchCurrent.map(row=>({recordId:row.id,version:row.version,confirmation:row.id}))}
 const removed=await call('batch',{secret:deleting.secret,body:deleteMany})
 await call('batch',{secret:deleting.secret,body:deleteMany,status:403})
 assert.equal(await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(deleteMany.commandId).first('n'),1,'A deleted batch keeps one admission when current visibility refuses replay')
 assert.equal(removed.result.value.deleted.length,100)
 // Current issuer authority narrows both the generated contract and all REST representations.
 const owner=await h.db.prepare("SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=(SELECT principal_id FROM cradle_base_operators WHERE base_id=(SELECT id FROM oa_operators WHERE email='import-owner@example.test'))").bind(appId).first()
 try{
  const rules=JSON.parse(owner.rules_json).map(rule=>rule.entityId===entityId?{...rule,readableFields:[nameId],writableFields:[]}:rule)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),owner.id).run()
  const narrow=await key({permissions:'read'})
  const narrowed=await h.request(`/api/v1/apps/${appId}/openapi.json`,{secret:narrow.secret})
  assert.ok(!JSON.stringify(narrowed).includes(hiddenId));assert.ok(!JSON.stringify(narrowed).includes(flagId))
  for(const [name,options]of [['schema',{}],['get',{id:inserted.id}],['query',{body:{limit:10}}]]){
   const result=await call(name,{...options,secret:narrow.secret});assert.ok(!JSON.stringify(result).includes(hiddenId));assert.ok(!JSON.stringify(result).includes(flagId));assert.ok(!JSON.stringify(result).includes('synthetic-cradle-205 private value'))
  }
  await call('update',{id:inserted.id,status:403,secret:narrow.secret,body:{commandId:createUlid(),version:merged.version,changes:{[nameId]:'synthetic-cradle-211 refused update'}}})
 }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(owner.rules_json,owner.id).run()}
 assert.deepEqual([...seen].sort(),operations.map(item=>item.operation['x-cradle-operation']).sort(),'The contract test drives every documented endpoint')
 return {appId,entityId,operations:seen.size,created:100,updated:100,deleted:100}
}
