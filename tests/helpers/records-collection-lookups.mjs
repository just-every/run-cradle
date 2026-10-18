import {recordsCsvHttp} from '../../src/domains/records/csv-http.server.ts'
import {parseCsv} from '../../src/domains/portability/csv.ts'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {baseExportHttp} from '../../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {prepareJsonSource,allocateJsonIdentities} from '../../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'
import {jsonIdentityMap} from '../../src/domains/records/base-transfer/json-remap.ts'
import {applyPreview} from './base-exit-runtime.mjs'
import {assertPortableJsonSchema} from './json-schema-assert.mjs'
const schemaEntity='00000000000000000000000001'
const envelope=(input,expected=[])=>({commandId:createUlid(),expected,input})
export async function collectionLookupFixture(call){
 const appId=createUlid(),productsId=createUlid(),ordersId=createUlid(),accountsId=createUlid()
 const product=newField('Product'),order=newField('PO number'),open=newField('Open','boolean'),due=newField('Due','date'),tags=newField('Handling','multi_select'),products=newField('Products','relation'),account=newField('Account'),orders=newField('Orders','relation'),latest=newField('Latest order','relation')
 tags.options=[{id:createUlid(),label:'Fragile'},{id:createUlid(),label:'Refrigerated'},{id:createUlid(),label:'Oversize'}]
 products.relation={ownerAppId:appId,entityId:productsId,cardinality:'many',onDelete:'restrict'}
 for(const [field,cardinality]of [[orders,'many'],[latest,'one']])field.relation={ownerAppId:appId,entityId:ordersId,cardinality,onDelete:'restrict'}
 const productNames=newField('Product names','computed');Object.assign(productNames,{readOnly:true,resultType:'array',resultElementType:'text',expression:{kind:'rollup',aggregate:'lookup',relationFieldId:products.id,valueFieldId:product.id}})
 const base={appId,name:'Northstar purchasing',tables:[{id:productsId,label:'Products',primaryFieldId:product.id,fields:[product]},{id:ordersId,label:'Orders',primaryFieldId:order.id,fields:[order,open,due,tags,products,productNames]},{id:accountsId,label:'Accounts',primaryFieldId:account.id,fields:[account,orders,latest]}]}
 let preview=await call('/api/v1/records/schema-preview',base);await call('/api/v1/commands/release.adopt',envelope({kind:'manual_schema',previewId:preview.id}))
 const schema=async entityId=>call(`/api/v1/apps/${appId}/entities/${entityId}`)
 const add=async(entityId,values)=>{const s=await schema(entityId);return (await call('/api/v1/commands/record.create',envelope({appId,entityId,values},[{ref:{appId,entityId:schemaEntity,recordId:entityId},version:s.version}]))).value}
 const items=[];for(const value of ['Insulated crate','Cold pack','Shipping label'])items.push(await add(productsId,{[product.id]:value}))
 const rows=[]
 for(const [index,isOpen,tagIds,itemIds]of [[0,true,[0,1],[0,1]],[1,true,[1],[1,2]],[2,true,[],[]],[3,false,[2],[2]]])rows.push(await add(ordersId,{[order.id]:`PO-${1040+index}`,[open.id]:isOpen,[due.id]:`2026-10-${20+index}`,[tags.id]:tagIds.map(i=>tags.options[i].id),[products.id]:itemIds.map(i=>items[i].ref)}))
 const company=await add(accountsId,{[account.id]:'Northstar Supply',[orders.id]:[rows[0].ref,rows[3].ref,rows[1].ref,rows[2].ref],[latest.id]:rows[0].ref})
 const empty=await add(accountsId,{[account.id]:'New vendor',[orders.id]:[],[latest.id]:null})
 const lookups={}
 for(const [label,source,link]of [['Handling requirements',tags,orders],['Ordered products',products,orders],['Ordered product names',productNames,orders],['Latest handling',tags,latest]]){
  const field=newField(label,'computed');Object.assign(field,{readOnly:true,resultType:'array',resultElementType:source===tags?'select':source===products?'relation':'text',...(source===tags?{options:tags.options}:{}),expression:{kind:'rollup',aggregate:'lookup',relationFieldId:link.id,valueFieldId:source.id,filter:{kind:'condition',fieldId:open.id,op:'eq',value:true},sort:[{fieldId:due.id,direction:'desc'}],limit:3}});lookups[label]=field
 }
 return {appId,productsId,ordersId,accountsId,base,company,empty,items,rows,product,order,open,due,tags,products,productNames,account,orders,latest,lookups,call,
  async query(){return call(`/api/v1/apps/${appId}/entities/${accountsId}/query`,{})},
 }
}
export async function collectionLookupJourney(h){
 const auth=async()=>h.ctx,origin='https://collections.example.test'
 async function call(path,input,status=200){const r=await h.runtime();const http=path.includes('schema')||path.endsWith('release.adopt')?manualSchemaHttp(r.manual,{},auth):path.endsWith('export-csv')?recordsCsvHttp(r.csv,auth):path.endsWith('base-export')?baseExportHttp(createBaseExport(h.db,r.services),auth):path.includes('/commands/')?createCommandHttp({...r,authenticate:auth}):createRecordHttp({...r.services,authenticate:auth});const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})})),body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error}
 const f=await collectionLookupFixture(call),{appId,accountsId,ordersId,productsId,lookups,tags,rows,items,open,company}=f
 let r=await h.runtime(),draft=await r.manual.read(h.ctx,appId);draft.tables.find(t=>t.id===accountsId).fields.push(...Object.values(lookups))
 const preview=await call('/api/v1/records/schema-preview',draft)
 assert.deepEqual(preview.calculations.find(c=>c.fieldId===lookups['Handling requirements'].id).samples.find(s=>s.recordId===company.id).after.value,[tags.options[1].id,tags.options[0].id,tags.options[1].id])
 await call('/api/v1/commands/release.adopt',envelope({kind:'manual_schema',previewId:preview.id}))
 const query=async()=>{const page=await f.query();return page.items.find(row=>row.id===company.id)}
 let row=await query()
 assert.deepEqual(row.fields[lookups['Handling requirements'].id].value,[tags.options[1].id,tags.options[0].id,tags.options[1].id])
 assert.deepEqual(row.fields[lookups['Ordered products'].id].value,[items[1].ref,items[2].ref,items[0].ref,items[1].ref])
 assert.deepEqual(row.fields[lookups['Ordered product names'].id].value,['Cold pack','Shipping label','Insulated crate','Cold pack'])
 assert.deepEqual(row.fields[lookups['Latest handling'].id].value,[tags.options[0].id,tags.options[1].id])
 for(const field of Object.values(lookups))assert.deepEqual((await f.query()).items.find(row=>row.id===f.empty.id).fields[field.id].value,[])
 await call('/api/v1/commands/record.patch',envelope({ref:rows[1].ref,changes:{[open.id]:false}},[{ref:rows[1].ref,version:rows[1].version}]))
 row=await query();assert.deepEqual(row.fields[lookups['Ordered products'].id].value,[items[0].ref,items[1].ref])
 const csv=await call('/api/v1/records/export-csv',{appId,entityId:accountsId,query:{fields:[f.account.id,...Object.values(lookups).map(field=>field.id)]}}),parsed=parseCsv(new TextEncoder().encode(csv.csv)),line=parsed.rows.find(row=>row[0]==='Northstar Supply')
 assert.deepEqual(JSON.parse(line[1]),['Fragile','Refrigerated']);assert.equal(line[2],'"Insulated crate","Cold pack"');assert.doesNotMatch(csv.csv,/recordId|appId|entityId/)
 const download=await call('/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(download.content);assertPortableJsonSchema(snapshot)
 const ids=allocateJsonIdentities(snapshot,'copy'),map=jsonIdentityMap(snapshot,ids),copied=await applyPreview(h,previewJsonImport(prepareJsonSource({filename:'collections.cradle.json',bytes:new TextEncoder().encode(download.content)}),{name:'Copied purchasing'},ids))
 const scope=await copied.r.policy.scope(h.ctx,{appId:ids.appId,entityId:map.get(accountsId),purpose:'read'}),copy=(await copied.r.services.reader.query(h.ctx,scope,{})).items.find(row=>row.id===map.get(company.id))
 assert.deepEqual(copy.fields[map.get(lookups['Ordered products'].id)].value,[items[0],items[1]].map(item=>({appId:ids.appId,entityId:map.get(productsId),recordId:map.get(item.id)})))
 assert.deepEqual(copy.fields[map.get(lookups['Handling requirements'].id)].value,[0,1].map(i=>map.get(tags.options[i].id)))
 // Current source row, field and final linked-target policy apply to every level.
 const stored=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),rules=JSON.parse(stored.rules_json)
 for(const rule of rules)if(rule.entityId===productsId)rule.rows={kind:'condition',fieldId:f.product.id,op:'ne',value:'Cold pack'}
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),stored.id).run()
 row=await query();assert.deepEqual(row.fields[lookups['Ordered products'].id].value,[items[0].ref]);assert.deepEqual(row.fields[lookups['Ordered product names'].id].value,['Insulated crate'])
 for(const rule of rules)if(rule.entityId===ordersId)rule.readableFields=rule.readableFields.filter(id=>id!==tags.id)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),stored.id).run()
 row=await query();assert.equal(row.fields[lookups['Handling requirements'].id].state,'redacted');assert.equal(row.fields[lookups['Latest handling'].id].state,'redacted')
}
