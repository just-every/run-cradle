import assert from 'node:assert/strict'
import {add} from './records-manual-harness.mjs'
import {applyPreview} from './base-exit-runtime.mjs'
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
import {assertPortableJsonSchema} from './json-schema-assert.mjs'

/** The existing records HTTP journey also exercises ordered, typed many-link lookups. */
export async function lookupJourney(h){
 const origin='https://lookups.example.test',auth=async()=>h.ctx
 async function call(http,path,input,status=200){const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})})),body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error}
 const appId=createUlid(),ordersId=createUlid(),accountId=createUlid(),name=newField('Order'),open=newField('Open','boolean'),due=newField('Due','date'),total=newField('Total','money'),note=newField('Note'),person=newField('Buyer','person'),stage=newField('Stage','select'),account=newField('Account'),orders=newField('Orders','relation')
 stage.options=[{id:createUlid(),label:'Ready'},{id:createUlid(),label:'Waiting'}];orders.relation={ownerAppId:appId,entityId:ordersId,cardinality:'many',onDelete:'restrict'}
 let r=(await h.create({appId,name:'Purchase follow-up',tables:[{id:ordersId,label:'Orders',primaryFieldId:name.id,fields:[name,open,due,total,note,person,stage]},{id:accountId,label:'Accounts',primaryFieldId:account.id,fields:[account,orders]}]})).r
 const rows=[]
 for(const [index,date,active]of [[1,'12',true],[2,'17',false],[3,'15',true],[4,'16',true],[5,'14',true],[6,'13',true]])rows.push(await add(h,r,r.registry.get(appId,ordersId).schema,{[name.id]:`PO-${100+index}`,[due.id]:`2026-10-${date}`,[open.id]:active,[total.id]:index===6?null:{minor:String(index*1050),currency:'USD',scale:2},[note.id]:index===5?null:`Dock ${index}`,[person.id]:h.owner,[stage.id]:stage.options[index%2].id}))
 await add(h,r,r.registry.get(appId,accountId).schema,{[account.id]:'Northstar Supply',[orders.id]:[rows[0],rows[4],rows[1],rows[5],rows[2],rows[3]].map(row=>row.ref)})
 const edit=await r.manual.read(h.ctx,appId),table=edit.tables.find(table=>table.id===accountId),fields={}
 for(const source of [name,total,note,person,stage,open]){const field=newField(`Latest ${source.label}`,'computed');Object.assign(field,{readOnly:true,resultType:'array',resultElementType:source.type,options:source.options,expression:{kind:'rollup',aggregate:'lookup',relationFieldId:orders.id,valueFieldId:source.id,filter:{kind:'condition',fieldId:open.id,op:'eq',value:true},sort:[{fieldId:due.id,direction:'desc'}],limit:3}});fields[source.type==='text'?source===name?'name':'note':source.type]=field;table.fields.push(field)}
 const tied=newField('Stable equal values','computed');Object.assign(tied,{...fields.name,id:tied.id,label:tied.label,expression:{...fields.name.expression,sort:[{fieldId:open.id,direction:'desc'}]}});fields.tied=tied;table.fields.push(tied)
 const manual=manualSchemaHttp(r.manual,{},auth),preview=await call(manual,'/api/v1/records/schema-preview',edit),sample=preview.calculations.find(item=>item.fieldId===fields.name.id).samples[0]
 assert.deepEqual(sample.after,{state:'value',value:['PO-104','PO-103','PO-105']})
 await call(manual,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}});r=await h.runtime()
 const query=runtime=>call(createRecordHttp({...runtime.services,authenticate:auth}),`/api/v1/apps/${appId}/entities/${accountId}/query`,{filter:{kind:'condition',fieldId:account.id,op:'eq',value:'Northstar Supply'}})
 let row=(await query(r)).items[0]
 assert.deepEqual(row.fields[fields.name.id].value,['PO-104','PO-103','PO-105']);assert.deepEqual(row.fields[fields.note.id].value,['Dock 4','Dock 3',null]);assert.deepEqual(row.fields[fields.person.id].value,[h.owner,h.owner,h.owner]);assert.deepEqual(row.fields[fields.select.id].value,[stage.options[0].id,stage.options[1].id,stage.options[1].id]);assert.deepEqual(row.fields[fields.boolean.id].value,[true,true,true])
 assert.deepEqual(row.fields[fields.money.id].value,[4,3,5].map(index=>({minor:String(index*1050),currency:'USD',scale:2})))
 assert.deepEqual(row.fields[tied.id].value,rows.filter((_,index)=>index!==1).sort((left,right)=>left.id<right.id?-1:1).slice(0,3).map(row=>`PO-${101+rows.findIndex(item=>item.id===row.id)}`))
 await add(h,r,r.registry.get(appId,accountId).schema,{[account.id]:'Empty account',[orders.id]:[]})
 const empty=(await call(createRecordHttp({...r.services,authenticate:auth}),`/api/v1/apps/${appId}/entities/${accountId}/query`,{filter:{kind:'condition',fieldId:account.id,op:'eq',value:'Empty account'}})).items[0]
 for(const field of Object.values(fields))assert.deepEqual(empty.fields[field.id],{state:'value',value:[]})
 await call(createCommandHttp({...r,authenticate:auth}),'/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref:rows[3].ref,version:rows[3].version}],input:{ref:rows[3].ref,changes:{[open.id]:false}}})
 row=(await query(r)).items[0];assert.deepEqual(row.fields[fields.name.id].value,['PO-103','PO-105','PO-106']);assert.deepEqual(row.fields[fields.money.id].value,[{minor:'3150',currency:'USD',scale:2},{minor:'5250',currency:'USD',scale:2},null])
 const download=await call(baseExportHttp(createBaseExport(h.db,r.services),auth),'/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(download.content)
 assertPortableJsonSchema(snapshot)
 const exported=snapshot.base.tables.find(table=>table.id===accountId).fields.find(field=>field.id===fields.name.id);assert.equal(exported.resultElementType,'text');assert.deepEqual(exported.expression.sort,[{fieldId:due.id,direction:'desc'}]);assert.equal(exported.expression.limit,3);assert.equal(exported.lookup,undefined)
 const ids=allocateJsonIdentities(snapshot,'copy'),map=jsonIdentityMap(snapshot,ids),copy=await applyPreview(h,previewJsonImport(prepareJsonSource({filename:'purchase-follow-up.cradle.json',bytes:new TextEncoder().encode(download.content)}),{name:'Copied purchase follow-up'},ids)),scope=await copy.r.policy.scope(h.ctx,{appId:ids.appId,entityId:map.get(accountId),purpose:'read'}),copied=(await copy.r.services.reader.query(h.ctx,scope,{filter:{kind:'condition',fieldId:map.get(account.id),op:'eq',value:'Northstar Supply'}})).items[0]
 for(const field of Object.values(fields)){
  const expected=row.fields[field.id].value
  if(field===fields.select)assert.deepEqual(copied.fields[map.get(field.id)].value,expected.map(value=>map.get(value)))
  else if(field===tied){const active=rows.filter((_,index)=>![1,3].includes(index)).sort((left,right)=>map.get(left.id)<map.get(right.id)?-1:1);assert.deepEqual(copied.fields[map.get(field.id)].value,active.slice(0,3).map(row=>`PO-${101+rows.findIndex(item=>item.id===row.id)}`))}
  else assert.deepEqual(copied.fields[map.get(field.id)].value,expected)
 }
 const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),rules=JSON.parse(policy.rules_json)
 for(const rule of rules)if(rule.entityId===ordersId)rule.rows={kind:'condition',fieldId:name.id,op:'ne',value:'PO-103'}
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run();r=await h.runtime()
 assert.deepEqual((await query(r)).items[0].fields[fields.name.id].value,['PO-105','PO-106','PO-101'])
 for(const rule of rules)if(rule.entityId===ordersId)rule.readableFields=rule.readableFields.filter(id=>id!==due.id)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run();r=await h.runtime()
 assert.equal((await query(r)).items[0].fields[fields.name.id].state,'redacted')
 const metadata=await call(createRecordHttp({...r.services,authenticate:auth}),`/api/v1/apps/${appId}/entities/${accountId}`);assert.equal(metadata.fields.find(field=>field.id===fields.name.id).expression,undefined)
}
