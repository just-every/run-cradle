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
