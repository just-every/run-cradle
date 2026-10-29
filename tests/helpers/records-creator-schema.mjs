import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {baseExportHttp} from '../../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {adminAuditResponse} from '../../src/domains/admission/admin-audit.server.ts'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {assertPortableJsonSchema} from './json-schema-assert.mjs'
import {harness,add} from './records-manual-harness.mjs'

/** A non-owner creator builds linked tables and calculations, then editors use the adopted result. */
export async function creatorSchemaJourney(){
 const h=await harness()
 try{
  const title=newField('Order'),units=newField('Units','number'),appId=createUlid(),ordersId=createUlid()
  const {r}=await h.create({appId,name:'synthetic-cradle-purchases',tables:[{id:ordersId,label:'Orders',primaryFieldId:title.id,fields:[title,units]}]})
  const schema=r.registry.get(appId,ordersId).schema,orders=[]
  for(const [name,quantity]of [['synthetic-cradle-order-1','3'],['synthetic-cradle-order-2','5']])orders.push(await add(h,r,schema,{[title.id]:name,[units.id]:quantity}))
  const people={owner:{id:h.owner},creator:{id:createUlid()},editor:{id:createUlid()}},now=Date.now()
  for(const [role,person]of Object.entries(people))if(role!=='owner'){
   await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(person.id,`synthetic-cradle-${role}`,[`synthetic-cradle-${role}`,'example.test'].join('@'),now,now).run()
   await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',0,?,?)").bind(person.id,person.id,now,now).run()
  }
  const origin='http://127.0.0.1:4190',auth=await createFixtureAuth(h.db,{appOrigin:origin,sessionSecret:'synthetic-cradle-schema-session-at-least-32-characters',mode:'development'},h.owner)
  for(const person of Object.values(people)){const {cookie,csrf}=await auth.signIn(person.id);Object.assign(person,{cookie,csrf})}
  const authenticate=async(request,ingress,requestId)=>{const session=request.method==='GET'?await auth.current(request):await auth.requireCsrf(request);assert.ok(session);return {principal:session.principal,now:new Date().toISOString(),requestId,ingress}}
  async function request(person,path,input,status=200){
   const runtime=await h.runtime(),req=new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{host:new URL(origin).host,cookie:person.cookie,origin,'content-type':'application/json',...(input===undefined?{}:{'x-csrf-token':person.csrf})},...(input===undefined?{}:{body:JSON.stringify(input)})})
   const http=path==='/api/v1/records/base-export'?baseExportHttp(createBaseExport(h.db,runtime.services),authenticate):path.includes('/records/schema-preview')||path.includes('/records/bases/')||path.endsWith('/release.adopt')?manualSchemaHttp(runtime.manual,{},authenticate):path.includes('/commands/')?createCommandHttp({...runtime,authenticate}):createRecordHttp({...runtime.services,authenticate})
   const response=await http.fetch(req),body=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(body)}`);return status===200?body.data:body.error
  }
  const basePath=`/api/v1/records/bases/${appId}`,entityPath=id=>`/api/v1/apps/${appId}/entities/${id}`,command=(input,expected=[])=>({commandId:createUlid(),expected,input}),adopt=preview=>command({kind:'manual_schema',previewId:preview.id})
  const current=id=>request(people.editor,entityPath(id)),query=id=>request(people.editor,entityPath(id)+'/query',{}),edit=()=>request(people.creator,basePath)
  for(const role of ['creator','editor'])await request(people.owner,basePath+'/collaborators',{commandId:createUlid(),principalId:people[role].id,role,destructive:false,version:0})
  const before=await edit(),newTableId=createUlid(),supplierName=newField('Supplier'),supplier=newField('Supplier','relation'),purchases=newField('Purchases','relation'),poNumber=newField('PO number')
  supplier.relation={ownerAppId:appId,entityId:newTableId,cardinality:'one',onDelete:'restrict'}
  purchases.relation={ownerAppId:appId,entityId:ordersId,cardinality:'many',onDelete:'restrict'}
  const expanded=structuredClone(before);expanded.tables[0].label='Purchase orders';expanded.tables[0].fields.find(field=>field.id===title.id).label='Purchase order';expanded.tables[0].fields.push(supplier,poNumber)
  expanded.tables.push({id:newTableId,label:'Suppliers',primaryFieldId:supplierName.id,fields:[supplierName,purchases]})
  const structural=await request(people.creator,'/api/v1/records/schema-preview',expanded)
  assert.equal(structural.requiresOwnerReview,false);assert.equal(structural.schemas.length,2)
  assert.deepEqual(structural.impacts.find(impact=>impact.entityId===ordersId).recordIds,orders.map(row=>row.id))
  assert.ok(structural.impacts.find(impact=>impact.entityId===ordersId).changes.some(change=>change.includes('Purchase orders')))
  assert.deepEqual(await edit(),before,'Preview does not change live table names or fields')
  const editorAttempt=structuredClone(expanded);editorAttempt.tables[0].fields.push(newField('Not permitted'))
  assert.match((await request(people.editor,'/api/v1/records/schema-preview',editorAttempt,403)).message,/owner|creator/i)
  assert.deepEqual(await edit(),before)
  const structuralCommand=adopt(structural);await request(people.creator,'/api/v1/commands/release.adopt',structuralCommand)
  const adoptedOrders=await current(ordersId),adoptedSuppliers=await current(newTableId)
  assert.equal(adoptedOrders.label,'Purchase orders');assert.equal(adoptedOrders.fields.find(field=>field.id===title.id).label,'Purchase order')
  assert.equal(adoptedOrders.fields.find(field=>field.id===poNumber.id).label,'PO number');assert.deepEqual(adoptedOrders.fields.find(field=>field.id===supplier.id).relation,supplier.relation)
  assert.equal(adoptedSuppliers.label,'Suppliers');assert.deepEqual(adoptedSuppliers.fields.find(field=>field.id===purchases.id).relation,purchases.relation)
  assert.deepEqual((await query(ordersId)).items.map(row=>row.fields[units.id].value),['3','5'])
  const supplierRecord=(await request(people.editor,'/api/v1/commands/record.create',command({appId,entityId:newTableId,values:{[supplierName.id]:'synthetic-cradle-supplier-1',[purchases.id]:orders.map(row=>row.ref)}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:newTableId},version:adoptedSuppliers.version}]))).value
  await request(people.editor,'/api/v1/commands/record.patch',command({ref:orders[0].ref,changes:{[supplier.id]:supplierRecord.ref,[poNumber.id]:'synthetic-cradle-po-1'}},[{ref:orders[0].ref,version:orders[0].version}]))
  const calculated=await edit(),double={...newField('Double units','computed'),readOnly:true,resultType:'number'},lookup={...newField('Supplier name','computed'),readOnly:true,resultType:'text',expression:{kind:'rollup',aggregate:'lookup',relationFieldId:supplier.id,valueFieldId:supplierName.id}},total={...newField('Total units','computed'),readOnly:true,resultType:'number',expression:{kind:'rollup',aggregate:'sum',relationFieldId:purchases.id,valueFieldId:units.id}},count={...newField('Order count','computed'),readOnly:true,resultType:'number',expression:{kind:'rollup',aggregate:'countall',relationFieldId:purchases.id,valueFieldId:title.id}}
  calculated.tables.find(table=>table.id===ordersId).fields.push(double,lookup);calculated.tables.find(table=>table.id===newTableId).fields.push(total,count);calculated.formulaSources={[double.id]:'{Units} * 2'}
  const arithmetic=await request(people.creator,'/api/v1/records/schema-preview',calculated),sample=(field,recordId)=>arithmetic.calculations.find(item=>item.fieldId===field.id).samples.find(item=>item.recordId===recordId)
  assert.equal(arithmetic.requiresOwnerReview,false)
  assert.equal(sample(double,orders[0].id).recordLabel,'synthetic-cradle-order-1');assert.deepEqual(sample(double,orders[0].id).after,{state:'value',value:'6'})
  assert.deepEqual(sample(lookup,orders[0].id).after,{state:'value',value:'synthetic-cradle-supplier-1'})
  assert.deepEqual(sample(total,supplierRecord.id).after,{state:'value',value:'8'});assert.deepEqual(sample(count,supplierRecord.id).after,{state:'value',value:'2'})
  assert.equal((await current(ordersId)).fields.some(field=>field.id===double.id),false)
  const arithmeticCommand=adopt(arithmetic);await request(people.creator,'/api/v1/commands/release.adopt',arithmeticCommand)
  const nextRead=await query(ordersId),first=nextRead.items.find(row=>row.id===orders[0].id)
  assert.equal(first.fields[double.id].value,'6');assert.equal(first.fields[lookup.id].value,'synthetic-cradle-supplier-1');assert.equal(first.fields[poNumber.id].value,'synthetic-cradle-po-1')
  let supplierRow=(await query(newTableId)).items.find(row=>row.id===supplierRecord.id);assert.equal(supplierRow.fields[total.id].value,'8');assert.equal(supplierRow.fields[count.id].value,'2')
  const second=nextRead.items.find(row=>row.id===orders[1].id)
  await request(people.editor,'/api/v1/commands/record.patch',command({ref:second.ref,changes:{[units.id]:'7'}},[{ref:second.ref,version:second.version}]))
  assert.equal((await query(ordersId)).items.find(row=>row.id===second.id).fields[double.id].value,'14')
  supplierRow=(await query(newTableId)).items.find(row=>row.id===supplierRecord.id);assert.equal(supplierRow.fields[total.id].value,'10');assert.equal(supplierRow.fields[count.id].value,'2')
  const download=await request(people.creator,'/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(download.content);assertPortableJsonSchema(snapshot)
  const portableOrders=snapshot.base.tables.find(table=>table.id===ordersId),portableSuppliers=snapshot.base.tables.find(table=>table.id===newTableId)
  assert.equal(portableOrders.label,'Purchase orders');assert.equal(portableOrders.fields.find(field=>field.id===title.id).label,'Purchase order')
  assert.deepEqual(portableOrders.fields.find(field=>field.id===double.id).expression,{kind:'call',fn:'multiply',args:[{kind:'field',fieldId:units.id},{kind:'literal',value:'2',valueType:'number'}]})
  assert.deepEqual(portableSuppliers.fields.find(field=>field.id===total.id).expression,total.expression)
  assert.equal(portableSuppliers.records.find(row=>row.id===supplierRecord.id).values[total.id],'10')
  const auditResponse=await adminAuditResponse(new Request(`${origin}/api/v1/admin/audit?base=${appId}`,{headers:{host:new URL(origin).host,cookie:people.owner.cookie}}),h.db,{authenticate})
  assert.equal(auditResponse.status,200);const audits=(await auditResponse.json()).data.items
  for(const adopted of [structuralCommand,arithmeticCommand]){const matches=audits.filter(item=>item.eventId===adopted.commandId);assert.equal(matches.length,1);assert.equal(matches[0].action,'release.adopt');assert.equal(matches[0].personId,people.creator.id)}
  assert.equal((await h.db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first()).owner_id,h.owner)
 }finally{h.close()}
}
