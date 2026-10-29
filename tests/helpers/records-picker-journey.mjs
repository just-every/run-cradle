import assert from 'node:assert/strict'
import {add} from './records-manual-harness.mjs'
import {applyPreview} from './base-exit-runtime.mjs'
import {assertPortableJsonSchema} from './json-schema-assert.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {recordsCsvHttp} from '../../src/domains/records/csv-http.server.ts'
import {baseExportHttp} from '../../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {prepareJsonSource,allocateJsonIdentities} from '../../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'
import {jsonIdentityMap} from '../../src/domains/records/base-transfer/json-remap.ts'

/** Author a live shared-view picker, then use the same public candidate door after edits and copy. */
export async function pickerJourney(h){
 const appId=createUlid(),vendorsId=createUlid(),ordersId=createUlid(),name=newField('Vendor'),city=newField('City'),active=newField('Approved','boolean'),budget=newField('Budget','money'),order=newField('Order'),vendor=newField('Vendor','relation')
 vendor.relation={ownerAppId:appId,entityId:vendorsId,cardinality:'one',onDelete:'restrict'}
 let r=(await h.create({appId,name:'Approved purchasing',tables:[{id:vendorsId,label:'Vendors',primaryFieldId:name.id,fields:[name,city,active,budget]},{id:ordersId,label:'Orders',primaryFieldId:order.id,fields:[order,vendor]}]})).r
 const origin='https://picker.example.test',auth=async()=>h.ctx
 async function call(http,path,input,status=200){const response=await http.fetch(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)})),body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error}
 const commands=()=>createCommandHttp({...r,authenticate:auth}),manual=()=>manualSchemaHttp(r.manual,{},auth)
 const command=(input,expected=[])=>({commandId:createUlid(),expected,input})
 const table=r.registry.get(appId,vendorsId).schema
 for(const [label,location,approved]of [['Northstar','Brisbane',true],['Acme','Sydney',true],['Blocked','Brisbane',false]])await add(h,r,table,{[name.id]:label,[city.id]:location,[active.id]:approved,[budget.id]:{minor:'123450',currency:'USD',scale:2}})
 const definition={appId,entityId:vendorsId,name:'Approved vendors',display:'grid',fields:[name.id,city.id],filter:{kind:'condition',fieldId:active.id,op:'eq',value:true},sort:[{fieldId:name.id,direction:'desc'}],groupBy:[],layout:{titleFieldId:name.id},visibility:'app',shipped:false}
 let view=(await call(commands(),'/api/v1/commands/view.save',command({view:definition}))).value
 const edit=await r.manual.read(h.ctx,appId),link=edit.tables.find(table=>table.id===ordersId).fields.find(field=>field.id===vendor.id)
 link.linkPicker={searchFieldIds:[city.id],displayFieldIds:[city.id,budget.id,active.id],viewId:view.id}
 const preview=await call(manual(),'/api/v1/records/schema-preview',edit)
 assert.ok(preview.impacts.find(impact=>impact.entityId===ordersId).changes.some(change=>change.includes(vendor.label)))
 await call(manual(),'/api/v1/commands/release.adopt',command({kind:'manual_schema',previewId:preview.id}));r=await h.runtime()
 const request={appId,entityId:ordersId,fieldId:vendor.id},candidates=(input={},status=200)=>call(recordsCsvHttp(r.csv,auth),'/api/v1/records/link-candidates',{...request,...input},status)
 let result=await candidates();assert.deepEqual(result.records.items.map(row=>row.fields[name.id].value),['Northstar','Acme']);assert.deepEqual(result.searchFieldIds,[name.id,city.id]);assert.deepEqual(result.displayFieldIds,[city.id,budget.id,active.id]);assert.equal(result.viewName,definition.name)
 assert.deepEqual((await candidates({search:'Brisbane'})).records.items.map(row=>row.fields[name.id].value),['Northstar']);assert.equal((await candidates({search:'Northstar'})).records.items.length,1,'The readable primary field is always searched')
 await candidates({fieldIds:[name.id]},400);await candidates({fieldId:order.id},403)
 const download=await call(baseExportHttp(createBaseExport(h.db,r.services),auth),'/api/v1/records/base-export',{appId,format:'json'}),document=JSON.parse(download.content)
 assertPortableJsonSchema(document)
 const ids=allocateJsonIdentities(document,'copy'),map=jsonIdentityMap(document,ids),copy=await applyPreview(h,previewJsonImport(prepareJsonSource({filename:'approved-purchasing.cradle.json',bytes:new TextEncoder().encode(download.content)}),{name:'Copied purchasing'},ids))
 const copied=await call(recordsCsvHttp(copy.r.csv,auth),'/api/v1/records/link-candidates',{appId:ids.appId,entityId:map.get(ordersId),fieldId:map.get(vendor.id),search:'Brisbane'})
 assert.equal(copied.records.items[0].fields[map.get(name.id)].value,'Northstar');assert.deepEqual(copied.searchFieldIds,[map.get(name.id),map.get(city.id)]);assert.equal(copy.r.registry.get(ids.appId,map.get(ordersId)).fields.get(map.get(vendor.id)).field.linkPicker.viewId,map.get(view.id))
 const expected=[{ref:{appId,entityId:'00000000000000000000000002',recordId:view.id},version:view.version}]
 view=(await call(commands(),'/api/v1/commands/view.save',command({id:view.id,view:{...definition,filter:{kind:'condition',fieldId:name.id,op:'eq',value:'Acme'}}},expected))).value
 assert.deepEqual((await candidates()).records.items.map(row=>row.fields[name.id].value),['Acme'],'Existing picker uses the latest shared-view filter')
 const pending=await call(manual(),'/api/v1/records/schema-preview',await r.manual.read(h.ctx,appId))
 await call(commands(),'/api/v1/commands/view.delete',command({viewId:view.id},[{ref:{appId,entityId:'00000000000000000000000002',recordId:view.id},version:view.version}]))
 await candidates({},404)
 await call(manual(),'/api/v1/commands/release.adopt',command({kind:'manual_schema',previewId:pending.id}),409)
 await call(manual(),'/api/v1/records/schema-preview',await r.manual.read(h.ctx,appId),400)
}

/** Exercise the bounded candidate HTTP door over independently seeded vendors,
 * including access and shared-view changes while a page cursor is retained. */
export async function pickerScaleJourney(h){
 const {vendorPickerFixture,enumeratePicker,assertPickerPage,pickerCommand}=await import('./records-picker-fixture.mjs')
 const origin='https://picker.example.test'
 async function call(path,input,status=200){
  const r=await h.runtime(),auth=async()=>h.ctx
  const http=path.includes('/schema-preview')||path.includes('/records/bases/')||path.endsWith('/release.adopt')?manualSchemaHttp(r.manual,{},auth):path.endsWith('/link-candidates')?recordsCsvHttp(r.csv,auth):createCommandHttp({...r,authenticate:auth})
  const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})})),body=await response.json()
  assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error
 }
 const f=await vendorPickerFixture({db:h.db,call,descriptors:async()=>(await h.runtime()).registry},'synthetic-cradle-vendor-picker')
 await f.saveView();await f.configure();await f.populate();await f.restrict()
 const enumeration=await enumeratePicker(f);assert.ok(enumeration.pages>50)
 const distant=await f.candidates({search:'Distant city'});assertPickerPage(distant,f)
 assert.deepEqual(distant.records.items.map(row=>row.id),[f.rows[4997].id],'City search reaches a match beyond the first fifty pages')
 for(const search of ['Inactive city','Hidden city','synthetic-cradle-private-context'])assert.equal((await f.candidates({search})).records.items.length,0)
 assert.deepEqual((await f.candidates({search:f.rows[4997].name})).records.items.map(row=>row.id),[f.rows[4997].id],'Primary text remains searchable')
 const first=await f.candidates()
 await f.saveView({kind:'all',conditions:[f.definition.filter,{kind:'condition',fieldId:f.city.id,op:'eq',value:'Distant city'}]})
 assert.equal((await f.candidates({cursor:first.records.nextCursor},409)).code,'stale_cursor')
 await enumeratePicker(f,{},[f.rows[4997]])
 await f.saveView()
 const beforePolicy=await f.candidates()
 await f.restrict({hideCity:true,hideAnother:true})
 assert.equal((await f.candidates({cursor:beforePolicy.records.nextCursor},409)).code,'stale_cursor')
 await enumeratePicker(f,{},f.expected.filter(row=>row.index!==2),{hideCity:true})
 assert.equal((await f.candidates({search:'Distant city'})).records.items.length,0,'Newly unreadable city values cannot be searched')
 const schema=(await h.runtime()).registry.get(f.appId,f.orders).schema
 const selected=(await call('/api/v1/commands/record.create',pickerCommand({appId:f.appId,entityId:f.orders,values:{[f.order.id]:'synthetic-cradle-selected-vendor',[f.link.id]:{appId:f.appId,entityId:f.vendors,recordId:f.rows[4997].id}}},[{ref:{appId:f.appId,entityId:f.schemaEntity,recordId:f.orders},version:schema.version}]))).value
 assert.deepEqual(selected.fields[f.link.id].value,{appId:f.appId,entityId:f.vendors,recordId:f.rows[4997].id})
 await f.restrict({hideSource:true});await f.candidates({},403)
 console.log('FIELD_005_NATIVE '+JSON.stringify({fixture:5000,...enumeration,distantCity:true,liveView:true,policyNarrowing:true}))
}
