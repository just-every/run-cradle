import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {baseExportHttp} from '../../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {prepareJsonSource,allocateJsonIdentities} from '../../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'
import {jsonIdentityMap} from '../../src/domains/records/base-transfer/json-remap.ts'
import {createRecordInterfaces} from '../../src/domains/records/interfaces/service.server.ts'
import {recordInterfacesHttp} from '../../src/domains/records/interfaces/http.server.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {assertPortableJsonSchema} from './json-schema-assert.mjs'
import {applyPreview} from './base-exit-runtime.mjs'

/** The existing native role journey also returns populated interfaces and their retained versions. */
export async function interfacePortabilityJourney(h,{appId,interfaceId,viewId,formId}){
 const origin='https://interfaces.example.test',authenticate=async()=>h.ctx
 async function request(runtime,path,input,status=200){
  const interfaces=createRecordInterfaces(h.db,runtime.services.metadata,runtime.policy,runtime.admission)
  const http=path==='/api/v1/records/base-export'?baseExportHttp(createBaseExport(h.db,runtime.services),authenticate):path.includes('/interfaces')?recordInterfacesHttp(interfaces,authenticate):path.includes('/records/schema-preview')||path.includes('/records/bases/')||path.endsWith('/release.adopt')?manualSchemaHttp(runtime.manual,{},authenticate):path.includes('/commands/')?createCommandHttp({...runtime,authenticate}):createRecordHttp({...runtime.services,authenticate})
  const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})})),body=await response.json()
  assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error
 }
 const runtime=await h.runtime(),source=await request(runtime,`/api/v1/interfaces/${interfaceId}`),history=await request(runtime,`/api/v1/interfaces/${interfaceId}/versions`)
 const download=await request(runtime,'/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(download.content);assertPortableJsonSchema(snapshot)
 const portable=snapshot.base.interfaces.find(item=>item.id===interfaceId)
 assert.equal(portable.version,source.version);assert.deepEqual(portable.pages,source.pages);assert.equal(portable.versions.length,history.items.length)
 for(const version of history.items){const previous=await request(runtime,`/api/v1/interfaces/${interfaceId}/versions/${version.version}`),exported=portable.versions.find(item=>item.version===version.version);assert.equal(exported.name,previous.name);assert.deepEqual(exported.pages,previous.pages)}
 const identities=allocateJsonIdentities(snapshot,'copy'),map=jsonIdentityMap(snapshot,identities),prepared=previewJsonImport(prepareJsonSource({filename:'synthetic-cradle-interfaces.json',bytes:new TextEncoder().encode(download.content)}),{name:'synthetic-cradle-returned-interface'},identities)
 assert.ok(prepared.report.diagnostics.some(item=>item.code==='interface_authority_reset'))
 const copied=await applyPreview(h,prepared),copyId=map.get(interfaceId),returned=await request(copied.r,`/api/v1/interfaces/${copyId}`)
 assert.notEqual(returned.id,source.id);assert.equal(returned.appId,identities.appId);assert.equal(returned.name,source.name);assert.equal(returned.version,source.version);assert.equal(returned.authorId,h.owner)
 assert.deepEqual(returned.audience,{roles:['owner'],people:[]})
 const remap=value=>Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['id','viewId','formId'].includes(key)&&typeof item==='string'?map.get(item):remap(item)])):value
 assert.deepEqual(returned.pages,remap(source.pages))
 const components=returned.pages.flatMap(page=>page.sections.flatMap(section=>section.components))
 assert.ok(components.some(component=>component.kind==='view'&&component.viewId===map.get(viewId)))
 assert.ok(components.some(component=>component.kind==='form'&&component.formId===map.get(formId)))
 const returnedHistory=await request(copied.r,`/api/v1/interfaces/${copyId}/versions`);assert.deepEqual(returnedHistory.items.map(item=>item.version),history.items.map(item=>item.version))
 for(const version of portable.versions){const previous=await request(copied.r,`/api/v1/interfaces/${copyId}/versions/${version.version}`);assert.deepEqual(previous.pages,remap(version.pages));assert.deepEqual(previous.audience,{roles:['owner'],people:[]});assert.equal(previous.authorId,h.owner)}
 const oldest=portable.versions.reduce((first,item)=>item.version<first.version?item:first),restored=await request(copied.r,`/api/v1/interfaces/${copyId}/restore`,{commandId:createUlid(),version:returned.version,restoreVersion:oldest.version})
 assert.equal(restored.version,returned.version+1);assert.deepEqual(restored.pages,remap(oldest.pages));assert.deepEqual(restored.audience,{roles:['owner'],people:[]})
 const view=await request(runtime,`/api/v1/views/${viewId}`),viewBefore=JSON.stringify(view)
 const refused=await request(runtime,'/api/v1/commands/view.delete',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000002',recordId:viewId},version:view.version}],input:{viewId}},400)
 assert.match(refused.message,/interface/i);assert.equal(JSON.stringify(await request(runtime,`/api/v1/views/${viewId}`)),viewBefore)
 const draft=await request(runtime,`/api/v1/records/bases/${appId}`),table=draft.tables.find(item=>item.id===view.entityId),removed=table.fields.find(field=>field.id!==table.primaryFieldId&&view.fields.includes(field.id));assert.ok(removed,'Seed a referenced non-primary field for the dependency journey')
 table.fields=table.fields.filter(field=>field.id!==removed.id)
 const preview=await request(runtime,'/api/v1/records/schema-preview',draft),impact=preview.impacts.find(item=>item.entityId===table.id)
 assert.ok(impact.dependencies.some(item=>item.kind==='interface'&&item.id===interfaceId));assert.ok(impact.refusals.some(message=>message.includes('Interface')))
 await request(runtime,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}},400)
 assert.ok((await request(runtime,`/api/v1/apps/${appId}/entities/${table.id}`)).fields.some(field=>field.id===removed.id))
}
