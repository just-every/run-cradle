import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {templateBase,newField} from '../../src/ui/records/schema/templates.ts'
import {operationsTemplates} from '../../src/ui/records/schema/templates-operations.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {baseExportHttp} from '../../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {baseImportHttp} from '../../src/domains/records/base-transfer/http.server.ts'
import {createBaseImportService} from '../../src/domains/records/base-transfer/service.server.ts'
import {createJsonIdentityPreflight} from '../../src/domains/records/base-transfer/json-identities.server.ts'
import {prepareJsonSource} from '../../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'
import {jsonIdentityMap} from '../../src/domains/records/base-transfer/json-remap.ts'
import {canonicalBaseSnapshot} from '../../src/domains/records/base-transfer/json-format.ts'

/** Reused by the existing roundtrip registration: real previews, commands, downloads and reviewed copies. */
export async function operationsTemplatesJourney(h){
 const origin='https://operations-templates.example.test',auth=async()=>h.ctx,receipts=[]
 const call=async(http,path,input)=>{
  const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,...(input instanceof FormData?{}:{'content-type':'application/json'})},...(input===undefined?{}:{body:input instanceof FormData?input:JSON.stringify(input)})})),body=await response.json()
  assert.equal(response.status,200,JSON.stringify(body));return body.data
 }
 const envelope=(input,expected=[])=>({commandId:createUlid(),expected,input})
 const exporter=r=>baseExportHttp(createBaseExport(h.db,r.services),auth)
 const download=(r,appId,includeRecords=true)=>call(exporter(r),'/api/v1/records/base-export',{appId,format:'json',includeRecords})
 for(const template of operationsTemplates){
  const draft=templateBase(template.id)
  // Customize the draft before adoption. Built-in templates carry schema, never sample records.
  const notes=newField('Internal instructions');draft.tables[0].fields.push(notes)
  let r=await h.runtime(),manual=manualSchemaHttp(r.manual,{},auth)
  const before=(await call(createRecordHttp({...r.services,authenticate:auth}),'/api/v1/apps')).items.map(app=>app.id)
  const preview=await call(manual,'/api/v1/records/schema-preview',draft)
  assert.deepEqual((await call(createRecordHttp({...r.services,authenticate:auth}),'/api/v1/apps')).items.map(app=>app.id),before,'Schema preview creates no base')
  assert.ok(preview.impacts.every(impact=>impact.count===0))
  await call(manual,'/api/v1/commands/release.adopt',envelope({kind:'manual_schema',previewId:preview.id}));r=await h.runtime()
  const initial=JSON.parse((await download(r,draft.appId)).content)
  assert.ok(initial.base.tables.every(table=>table.records.length===0),'Adopting a template creates no sample records')
  const commands=createCommandHttp({...r,authenticate:auth}),rows=new Map()
  for(const table of draft.tables){
   const schema=await call(createRecordHttp({...r.services,authenticate:auth}),`/api/v1/apps/${draft.appId}/entities/${table.id}`),values={}
   for(const field of table.fields){
    if(field.type==='computed')continue
    if(field.type==='relation'){assert.ok(rows.has(field.relation.entityId),'Template links target a usable existing table');values[field.id]=rows.get(field.relation.entityId).ref}
    else if(field.type==='select')values[field.id]=field.options[0].id
    else if(field.type==='number')values[field.id]='3'
    else if(field.type==='money')values[field.id]={minor:'12950',currency:'USD',scale:2}
    else if(field.type==='boolean')values[field.id]=false
    else if(field.type==='date')values[field.id]='2026-11-18'
    else if(field.type==='instant')values[field.id]='2026-11-18T15:30:00.000Z'
    else if(field.type==='person')values[field.id]=h.owner
    else if(field.type==='url')values[field.id]='https://operations.example.test/brief'
    else values[field.id]=`${template.name} ${field.label}`
   }
   const row=(await call(commands,'/api/v1/commands/record.create',envelope({appId:draft.appId,entityId:table.id,values},[{ref:{appId:draft.appId,entityId:'00000000000000000000000001',recordId:table.id},version:schema.version}]))).value
   rows.set(table.id,row)
  }
  const linked=draft.tables.find(table=>table.fields.some(field=>field.type==='relation')),relation=linked.fields.find(field=>field.type==='relation'),primary=linked.fields[0]
  // This record-specific view must be named in the schema-only exclusions, while the full copy retains its filter.
  await call(commands,'/api/v1/commands/view.save',envelope({view:{appId:draft.appId,entityId:linked.id,name:'Selected linked work',display:'grid',fields:linked.fields.map(field=>field.id),filter:{kind:'condition',fieldId:relation.id,op:'eq',value:rows.get(relation.relation.entityId).ref},sort:[{fieldId:primary.id,direction:'asc'}],groupBy:[],layout:{titleFieldId:primary.id},visibility:'app',shipped:false}}))
  await call(commands,'/api/v1/commands/form.save',envelope({form:{appId:draft.appId,entityId:linked.id,title:'Operations entry',fields:linked.fields.filter(field=>field.type!=='computed').map(field=>({fieldId:field.id,label:field.label,help:'',required:field.required})),submitAction:'record.create',authenticated:true}}))
  const original=JSON.parse((await download(r,draft.appId)).content)
  for(const includeRecords of [true,false]){
   const file=await download(r,draft.appId,includeRecords),source=JSON.parse(file.content)
   if(!includeRecords){
    assert.ok(source.base.tables.every(table=>table.records.length===0))
    assert.deepEqual(source.base.tables.map(table=>table.fields),original.base.tables.map(table=>table.fields))
    assert.deepEqual(source.base.forms,original.base.forms)
    assert.deepEqual(source.base.views[0].filter,{kind:'all',conditions:[]})
    assert.equal(file.omissions.length,draft.tables.length+1,'Exclusions name every populated table and the record-specific view')
    assert.ok(file.omissions.some(message=>message.includes('Selected linked work')))
   }
   r=await h.runtime()
   const identities=createJsonIdentityPreflight(h.db,r.registry),service=createBaseImportService(h.db,r.policy,r.registry,r.manual,previewJsonImport)
   const http=baseImportHttp(service,{prepare:files=>prepareJsonSource(files[0]),identities:source=>identities.allocate(source),validateIdentities:(source,ids)=>identities.validate(source,ids)},auth,auth)
   const form=new FormData();form.append('files',new Blob([file.content]),'operations.cradle.json');form.set('options',JSON.stringify({name:source.base.name}))
   const copyPreview=await call(http,'/api/v1/records/base-import/preview',form),map=jsonIdentityMap(source,copyPreview.identities)
   assert.equal(new Set(map.values()).size,map.size)
   assert.ok([...map].every(([a,b])=>a!==b),'Copies replace every identity')
   form.set('identities',JSON.stringify(copyPreview.identities));form.set('fingerprint',copyPreview.fingerprint);form.set('acceptLoss','true')
   const review=await call(http,'/api/v1/records/base-import/review',form)
   let job=await call(http,'/api/v1/records/base-import/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true})
   for(let n=0;job.state!=='completed'&&n<100;n++){assert.notEqual(job.state,'failed',JSON.stringify(job));job=await call(http,`/api/v1/records/base-import/jobs/${job.id}/resume`,{})}
   assert.equal(job.state,'completed');assert.equal((await call(http,`/api/v1/records/base-import/jobs/${job.id}`)).reconciliation.ok,true)
   r=await h.runtime()
   const copied=JSON.parse((await download(r,copyPreview.identities.appId)).content),reverse=new Map([...map].map(([a,b])=>[b,a]))
   const restore=value=>typeof value==='string'?reverse.get(value)??value:Array.isArray(value)?value.map(restore):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,value])=>[reverse.get(key)??key,restore(value)])):value
   assert.equal(canonicalBaseSnapshot(restore(copied)),canonicalBaseSnapshot(source),'Copies preserve every schema, typed value, option, linked identity, view and form')
   assert.equal(canonicalBaseSnapshot(JSON.parse((await download(r,draft.appId)).content)),canonicalBaseSnapshot(original),'Copying leaves the populated source unchanged')
   receipts.push({template:template.id,includeRecords,sourceAppId:draft.appId,copyAppId:copied.base.id})
  }
 }
 return receipts
}
