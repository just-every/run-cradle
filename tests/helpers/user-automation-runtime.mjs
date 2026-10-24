import assert from 'node:assert/strict'
import {recordsImportBrowserRuntime} from './records-import-browser-runtime.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function userAutomationRuntime(port,network) {
 const h=await recordsImportBrowserRuntime(port,network)
 try {
  const csrf=await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})
  assert.equal(csrf.status,200);const csrfToken=(await csrf.json()).csrfToken
  async function request(route,{method='GET',body,secret,status=200}={}) {
   const response=await fetch(h.origin+route,{method,redirect:'manual',headers:{
    ...(secret?{authorization:`Bearer ${secret}`}:{cookie:h.cookie}),
    ...(body?{origin:h.origin,'content-type':'application/json','x-csrf-token':csrfToken}:{}),
   },...(body?{body:JSON.stringify(body)}:{})})
   const value=await response.json().catch(()=>null)
   assert.equal(response.status,status,`${method} ${route.split('?')[0]}: ${value?.error?.code??'unexpected response'}`)
   return value
  }
  const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),statusId=createUlid(),phoneId=createUlid(),phoneLinkId=createUlid(),phoneLookupId=createUlid()
  const draft={appId,name:'Automation acceptance',tables:[{id:entityId,label:'Items',primaryFieldId:nameId,fields:[
   {id:nameId,label:'Name',type:'text',required:true,unique:false},
   {id:statusId,label:'Status',type:'text',required:false,unique:false},
   {id:phoneId,label:'Phone',type:'phone',required:false,unique:false},
   {id:phoneLinkId,label:'Phone contact',type:'relation',required:false,unique:false,relation:{ownerAppId:appId,entityId,cardinality:'one',onDelete:'restrict'}},
   {id:phoneLookupId,label:'Contact phone',type:'computed',required:false,unique:false,readOnly:true,resultType:'phone',expression:{kind:'rollup',aggregate:'lookup',relationFieldId:phoneLinkId,valueFieldId:phoneId}},
  ]}]}
  const preview=(await request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
  await request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
  const entities=(await request(`/api/v1/apps/${appId}/entities`)).data.items
  const entity=entities.find(entity=>entity.id===entityId)
  assert.ok(entity)
  const operator=(await h.db.prepare("SELECT id FROM operators WHERE email='import-owner@example.test'").first()).id
  async function create(name,secret,phone) {
   const commandId=createUlid(),result=(await request('/api/v1/commands/record.create',{method:'POST',secret,
    body:{commandId,expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:entity.version}],
     input:{appId,entityId,values:{[nameId]:name,...(phone===undefined?{}:{[phoneId]:phone})}}}})).data
   assert.equal(result.state,'committed')
   return {commandId,record:result.value}
  }
  async function patch(record,changes,secret,commandId=createUlid(),status=200) {
   return request('/api/v1/commands/record.patch',{method:'POST',secret,status,body:{commandId,
    expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,changes}}})
  }
  async function tick(commandId) {
   const worker=await h.runtime.getWorker()
   return worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,
    body:{kind:'cradle.records.automations.v1',commandId}}])
  }
  return Object.assign(h,{request,appId,entityId,nameId,statusId,phoneId,phoneLookupId,entity,operator,create,patch,tick})
 }catch(error){await h.close();throw error}
}
