import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {rulesCommand,storedRulesFixture} from './records-rules-fixture.mjs'

/** Native sessions and emitted Worker admission; no product transport is replaced. */
export async function nativeFieldRulesJourney(){
 const h=await userAutomationRuntime(0)
 try{
  const f=await storedRulesFixture(h),rest=`/api/v1/apps/${f.appId}/rest/entities/${f.entityId}/records`
  const refuse=async(route,body,rule,method='POST')=>{
   const before=await f.snapshot(),reply=await h.request(route,{method,body,status:400})
   assert.equal(reply.error.code,'validation');assert.ok(reply.error.message.includes(rule.name+': '+rule.message),reply.error.message)
   assert.deepEqual(await f.snapshot(),before,'A refused native write changes no schema, record, value or version')
  }
  for(const [index,values]of [[0,f.values('Bad REST shipping',{shipped:true})],[1,f.values('Bad REST approval',{high:true})]]){
   await refuse(rest,{commandId:createUlid(),schemaVersion:(await f.schema()).version,values},f.rules[index])
  }
  await f.call(rest,{commandId:createUlid(),schemaVersion:(await f.schema()).version,values:f.values('Valid REST',{shipped:true,high:true,approved:true,date:'2027-02-03'})})
  let restRow=(await f.rows()).find(row=>row.fields[f.order.id].value==='Valid REST')
  assert.equal(restRow.fields[f.ship.id].value,'2027-02-03');assert.equal(restRow.fields[f.approval.id].value,true)
  for(const [rule,changes]of [[f.rules[0],{[f.ship.id]:null}],[f.rules[1],{[f.approval.id]:false}]]){
   await refuse(rest+'/'+restRow.id,{commandId:createUlid(),version:restRow.version,changes},rule,'PATCH')
  }
  await f.call(rest+'/'+restRow.id,{commandId:createUlid(),version:restRow.version,changes:{[f.ship.id]:'2027-02-04'}},200,'PATCH')
  restRow=await f.read(restRow.id);assert.equal(restRow.fields[f.ship.id].value,'2027-02-04')
  const form=(await f.call('/api/v1/commands/form.save',rulesCommand({form:{appId:f.appId,entityId:f.entityId,title:'Rules order',fields:f.fields.map(field=>({fieldId:field.id,label:field.label,help:'',required:field.required})),submitAction:'record.create',authenticated:true}}))).value
  const submit=async values=>rulesCommand({appId:f.appId,entityId:f.entityId,formId:form.id,values},[{ref:{appId:f.appId,entityId:'00000000000000000000000003',recordId:form.id},version:form.version},{ref:{appId:f.appId,entityId:'00000000000000000000000001',recordId:f.entityId},version:(await f.schema()).version}])
  await refuse('/api/v1/commands/form.submit',await submit(f.values('Bad form shipping',{shipped:true})),f.rules[0])
  await refuse('/api/v1/commands/form.submit',await submit(f.values('Bad form approval',{high:true})),f.rules[1])
  const submitted=(await f.call('/api/v1/commands/form.submit',await submit(f.values('Valid form',{shipped:true,high:true,approved:true,date:'2027-02-05'})))).value
  const formRow=await f.read(submitted.id);assert.equal(formRow.fields[f.ship.id].value,'2027-02-05');assert.equal(formRow.fields[f.discount.id].value,'25');assert.equal(formRow.fields[f.approval.id].value,true)
  const beforeCsv=await f.snapshot()
  const csv=await f.call('/api/v1/records/import-preview',{appId:f.appId,entityId:f.entityId,csv:'Order,Status,Ship date,Discount,Manager approval\nValid control,Shipped,,25,true\nValid REST,Shipped,2027-02-04,25,false\nValid CSV,Shipped,2027-02-06,25,true',mapping:[f.order,f.status,f.ship,f.discount,f.approval].map(field=>({column:field.label,fieldId:field.id})),mergeFieldId:f.order.id})
  assert.equal(csv.rejected,2);assert.equal(csv.creates,1);assert.equal(csv.updates,0)
  for(const rule of f.rules)assert.ok(csv.errors.some(error=>error.message.includes(rule.name+': '+rule.message)),JSON.stringify(csv.errors))
  assert.deepEqual(await f.snapshot(),beforeCsv,'CSV preview has no record effects')
  const commit=rulesCommand({previewId:csv.id});await f.call('/api/v1/commands/records.import-commit',commit)
  const csvRows=await f.rows();for(const previous of beforeCsv.rows)assert.deepEqual(csvRows.find(row=>row.id===previous.id),previous,'Rejected CSV updates preserve their original records')
  const imported=csvRows.find(row=>row.fields[f.order.id].value==='Valid CSV');assert.equal(imported.fields[f.ship.id].value,'2027-02-06');assert.equal(imported.fields[f.approval.id].value,true)
  await f.call('/api/v1/commands/records.import-commit',commit);assert.deepEqual(await f.rows(),csvRows,'Import replay adds no effect')
  // Each approved automation has one action, so its own refusal is observable.
  for(const [index,field,value]of [[0,f.ship,null],[1,f.approval,false]]){
   const target=await f.create(f.values('Automation refusal '+index,{shipped:true,high:true,approved:true,date:'2027-03-01'}))
   const saved=(await f.call('/api/user-automations',{commandId:createUlid(),expiresAt:new Date(Date.now()+3600000).toISOString(),definition:{name:'synthetic-cradle-rules refused '+index,appId:f.appId,entityId:f.entityId,event:'updated',enabled:true,actions:[{kind:'update',fieldId:field.id,value}] }},201)).result.value
   const trigger=rulesCommand({ref:target.ref,changes:{[f.memo.id]:'Trigger refused action'}},[{ref:target.ref,version:target.version}])
   await f.call('/api/v1/commands/record.patch',trigger);const before=await f.read(target.id)
   await h.tick(trigger.commandId)
   const run=(await f.call(`/api/user-automations/${saved.id}/runs`)).runs.find(run=>run.recordId===target.id)
   assert.equal(run.state,'Failed');assert.equal(run.errorCode,'validation');assert.ok(run.cause.includes(f.rules[index].name+': '+f.rules[index].message),JSON.stringify(run))
   assert.deepEqual(await f.read(target.id),before,'A refused automated patch preserves every field and version')
   await h.tick(trigger.commandId);assert.deepEqual(await f.read(target.id),before,'Repeated delivery cannot apply a refused action')
   await f.call(`/api/user-automations/${saved.id}/disable`,{commandId:createUlid(),version:saved.version})
  }
  const valid=await f.create(f.values('Automation valid',{shipped:true,high:true,approved:true,date:'2027-03-02'}))
  const approved=(await f.call('/api/user-automations',{commandId:createUlid(),expiresAt:new Date(Date.now()+3600000).toISOString(),definition:{name:'synthetic-cradle-rules valid',appId:f.appId,entityId:f.entityId,event:'updated',enabled:true,actions:[{kind:'update',fieldId:f.ship.id,value:'2027-03-03'}]}},201)).result.value
  const trigger=rulesCommand({ref:valid.ref,changes:{[f.memo.id]:'Trigger valid action'}},[{ref:valid.ref,version:valid.version}]);await f.call('/api/v1/commands/record.patch',trigger);const before=await f.read(valid.id)
  await h.tick(trigger.commandId)
  const run=(await f.call(`/api/user-automations/${approved.id}/runs`)).runs.find(run=>run.recordId===valid.id)
  assert.equal(run.state,'Complete');assert.equal(run.actions[0].state,'Complete')
  const after=await f.read(valid.id);assert.equal(after.fields[f.ship.id].value,'2027-03-03');assert.equal(after.version,before.version+1)
  await h.tick(trigger.commandId);assert.deepEqual(await f.read(valid.id),after,'A valid automated write commits only once')
  console.log('FIELD_RULES_NATIVE PASS named shipping and approval refusals, unchanged readbacks and valid REST, authenticated form, CSV and approved automation effects')
 }finally{await h.close()}
}
