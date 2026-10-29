import {baseExportHttp} from '../../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {prepareJsonSource,allocateJsonIdentities} from '../../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'
import {jsonIdentityMap} from '../../src/domains/records/base-transfer/json-remap.ts'
import {applyPreview} from './base-exit-runtime.mjs'
import {assertPortableJsonSchema} from './json-schema-assert.mjs'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {createRecordInterfaces} from '../../src/domains/records/interfaces/service.server.ts'
import {recordInterfacesHttp} from '../../src/domains/records/interfaces/http.server.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {AdmissionError} from '../../src/domains/admission/errors.ts'

/** The existing public member-erasure journey carries current and historical interface custody. */
export async function interfaceErasureFixture(h,{appId,auth,member,identity}){
 const origin=h.origin
 const authenticate=async(request,ingress,requestId)=>{const session=request.method==='GET'?await auth.current(request):await auth.requireCsrf(request);if(!session)throw new AdmissionError('signed_out','A current session is required.');return {principal:session.principal,now:new Date().toISOString(),requestId,ingress}}
 async function call(person,path,input,status=200){
  const runtime=await h.runtime(),service=createRecordInterfaces(h.db,runtime.services.metadata,runtime.policy,runtime.admission),http=path==='/api/v1/records/base-export'?baseExportHttp(createBaseExport(h.db,runtime.services),authenticate):path.includes('/interfaces')?recordInterfacesHttp(service,authenticate):manualSchemaHttp(runtime.manual,{},authenticate)
  const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{host:new URL(origin).host,origin,cookie:person.cookie,'content-type':'application/json',...(input===undefined?{}:{'x-csrf-token':person.csrf})},...(input===undefined?{}:{body:JSON.stringify(input)})})),body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error
 }
 const endpoint=`/api/v1/apps/${appId}/interfaces`
 await call(h.session,`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:h.person,role:'creator',destructive:false,version:0})
 const layout=(name,text,people=[])=>({appId,name,pages:[{id:createUlid(),title:'Receiving',sections:[{id:createUlid(),title:'Guidance',tab:'Notes',components:[{id:createUlid(),kind:'text',text}]}]}],audience:{roles:people.length?[]:['owner'],people}})
 const definition=layout('synthetic-cradle-member-layout',identity.name+' '+identity.email,[h.person]),captured={commandId:createUlid(),definition}
 const original=await call(member,endpoint+'/publish',captured)
 const revised=structuredClone(definition);revised.pages[0].title='Current '+identity.name;revised.pages[0].sections[0].components[0].text='Contact '+identity.email
 const current=await call(member,endpoint+'/publish',{commandId:createUlid(),id:original.id,version:original.version,definition:revised})
 const unrelated=await call(h.session,endpoint+'/publish',{commandId:createUlid(),definition:layout('synthetic-cradle-unrelated','Keep this independent layout')})
 const unrelatedRows=()=>({current:h.sql.prepare('SELECT * FROM record_interfaces WHERE id=?').get(unrelated.id),history:h.sql.prepare('SELECT * FROM record_interface_versions WHERE interface_id=? ORDER BY version').all(unrelated.id)}),before=unrelatedRows()
 assert.equal((await call(member,`/api/v1/interfaces/${current.id}/versions`)).items.length,2)
 return {
  interfaceId:current.id,unrelatedId:unrelated.id,
  async assertErased(){
   for(const row of [h.sql.prepare('SELECT * FROM record_interfaces WHERE id=?').get(current.id),...h.sql.prepare('SELECT * FROM record_interface_versions WHERE interface_id=? ORDER BY version').all(current.id)]){
    assert.ok(row,'Interface layout custody survives erasure');assert.equal(row.author_id,null)
    const definition=JSON.parse(row.definition_json);assert.equal(definition.authorId,null);assert.equal(definition.audience.people.includes(h.person),false)
    for(const literal of [identity.name,identity.email,h.person])assert.equal(row.definition_json.includes(literal),false,'Current and historical layouts retain no erased identity')
   }
   const visible=await call(h.session,`/api/v1/interfaces/${current.id}`);assert.equal(visible.authorId,null);assert.deepEqual(visible.audience,{roles:[],people:[]})
   assert.deepEqual(unrelatedRows(),before,'An unrelated current layout and its retained versions stay byte-for-byte intact')
   await call(member,`/api/v1/interfaces/${current.id}`,undefined,401)
   await call(member,endpoint+'/publish',captured,401)
   assert.equal(h.sql.prepare('SELECT version FROM record_interfaces WHERE id=?').get(current.id).version,current.version,'A captured erased-author publication cannot create another version')
   const download=await call(h.session,'/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(download.content);assertPortableJsonSchema(snapshot)
   const portable=snapshot.base.interfaces.find(item=>item.id===current.id);assert.deepEqual(portable.audience,{roles:[],people:[]});assert.equal(portable.versions.length,2)
   for(const literal of [identity.name,identity.email,h.person])assert.equal(JSON.stringify(portable).includes(literal),false,'Post-erasure export retains anonymous layout history')
   const identities=allocateJsonIdentities(snapshot,'copy'),map=jsonIdentityMap(snapshot,identities)
   await applyPreview(h,previewJsonImport(prepareJsonSource({filename:'synthetic-cradle-erased-interfaces.json',bytes:new TextEncoder().encode(download.content)}),{name:'synthetic-cradle-anonymous-return'},identities))
   const returned=await call(h.session,`/api/v1/interfaces/${map.get(current.id)}`);assert.equal(returned.name,visible.name);assert.deepEqual(returned.audience,{roles:['owner'],people:[]});assert.equal(returned.authorId,h.owner)
   const history=await call(h.session,`/api/v1/interfaces/${map.get(current.id)}/versions`);assert.equal(history.items.length,2)
   for(const item of history.items){const version=await call(h.session,`/api/v1/interfaces/${map.get(current.id)}/versions/${item.version}`);for(const literal of [identity.name,identity.email,h.person])assert.equal(JSON.stringify(version).includes(literal),false)}
   await call(member,`/api/v1/interfaces/${map.get(current.id)}`,undefined,401)
  },
 }
}
