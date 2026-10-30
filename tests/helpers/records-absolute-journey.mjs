import assert from 'node:assert/strict'
import {add} from './records-manual-harness.mjs'
import {applyPreview} from './base-exit-runtime.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {recordsCsvHttp} from '../../src/domains/records/csv-http.server.ts'
import {baseExportHttp} from '../../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {prepareJsonSource,allocateJsonIdentities} from '../../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'
import {jsonIdentityMap} from '../../src/domains/records/base-transfer/json-remap.ts'
import {parseCsv} from '../../src/domains/portability/csv.ts'

/** Local exact arithmetic cases establish no real-account equivalence. */
export async function absoluteJourney(h){
 const origin='https://calculations.example.test',auth=async()=>h.ctx
 async function call(http,path,input,status=200){
  const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})})),body=await response.json()
  assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error
 }
 const label=newField('Case'),operand=newField('Operand','number'),appId=createUlid(),entityId=createUlid()
 let r=(await h.create({appId,name:'Exact absolute values',tables:[{id:entityId,label:'Numbers',primaryFieldId:label.id,fields:[label,operand]}]})).r
 // Expectations are explicit decimal strings, independent of the evaluator.
 const cases=[['Positive','17','17'],['Negative','-23','23'],['Zero','0','0'],['Fraction','-0.125','0.125'],['Precise','-9007199254740993.12345678901234567890123456789012','9007199254740993.12345678901234567890123456789012'],['Blank',null,null]]
 const records=[];for(const [name,input]of cases)records.push(await add(h,r,r.registry.get(appId,entityId).schema,{[label.id]:name,[operand.id]:input}))
 const draft=await r.manual.read(h.ctx,appId),absolute=newField('Absolute','computed'),invalid=newField('Unavailable absolute','computed')
 for(const field of [absolute,invalid])Object.assign(field,{readOnly:true,resultType:'number'})
 draft.tables[0].fields.push(absolute,invalid);draft.formulaSources={[absolute.id]:'ABS({Operand})',[invalid.id]:'ABS(1 / 0)'}
 const manual=manualSchemaHttp(r.manual,{},auth)
 for(const [source,error]of [['ABS()',/ABS expects 1 arguments/],['ABS(1, 2)',/ABS expects 1 arguments/],['ABS({Case})',/ABS expects a numeric operand/],['ABS(TRUE())',/ABS expects a numeric operand/]]){
  const bad=structuredClone(draft);bad.formulaSources[absolute.id]=source
  assert.match((await call(manual,'/api/v1/records/schema-preview',bad,400)).message,error)
 }
 const preview=await call(manual,'/api/v1/records/schema-preview',draft),samples=preview.calculations.find(field=>field.fieldId===absolute.id)
 assert.equal(samples.resultType,'number');assert.equal(samples.totalRecords,cases.length)
 for(const [name,,expected]of cases){const cell=samples.samples.find(sample=>sample.recordLabel===name).after;if(expected===null)assert.equal(cell.state,'unavailable');else assert.deepEqual(cell,{state:'value',value:expected},name)}
 assert.ok(preview.calculations.find(field=>field.fieldId===invalid.id).samples.every(sample=>sample.after.state==='unavailable'&&/Division by zero/.test(sample.after.message)))
 await call(manual,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}})
 r=await h.runtime()
 const query=runtime=>call(createRecordHttp({...runtime.services,authenticate:auth}),`/api/v1/apps/${appId}/entities/${entityId}/query`,{})
 let rows=(await query(r)).items
 for(const [name,,expected]of cases){const row=rows.find(row=>row.fields[label.id].value===name);if(expected===null)assert.equal(row.fields[absolute.id].state,'unavailable');else assert.deepEqual(row.fields[absolute.id],{state:'value',value:expected},name);assert.equal(row.fields[invalid.id].state,'unavailable')}
 const csv=await call(recordsCsvHttp(r.csv,auth),'/api/v1/records/export-csv',{appId,entityId,query:{fields:[label.id,absolute.id],filter:{kind:'condition',fieldId:operand.id,op:'not_empty'},sort:[{fieldId:label.id,direction:'asc'}]}})
 assert.deepEqual(parseCsv(new TextEncoder().encode(csv.csv)).rows,cases.filter(([,input])=>input!==null).map(([name,,expected])=>[name,expected]).sort(([a],[b])=>a.localeCompare(b)))
 const patch=await call(createCommandHttp({...r,authenticate:auth}),'/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref:records[1].ref,version:records[1].version}],input:{ref:records[1].ref,changes:{[operand.id]:'-7.0625'}}})
 assert.equal(patch.state,'committed');rows=(await query(r)).items;assert.deepEqual(rows.find(row=>row.id===records[1].id).fields[absolute.id],{state:'value',value:'7.0625'})
 const download=await call(baseExportHttp(createBaseExport(h.db,r.services),auth),'/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(download.content)
 assert.deepEqual(snapshot.base.tables[0].fields.find(field=>field.id===absolute.id).expression,{kind:'call',fn:'abs',args:[{kind:'field',fieldId:operand.id}]})
 const source=prepareJsonSource({filename:'absolute.cradle.json',bytes:new TextEncoder().encode(download.content)}),ids=allocateJsonIdentities(snapshot,'copy'),map=jsonIdentityMap(snapshot,ids),copy=await applyPreview(h,previewJsonImport(source,{name:'Copied absolute values'},ids))
 const copied=await call(createRecordHttp({...copy.r.services,authenticate:auth}),`/api/v1/apps/${ids.appId}/entities/${map.get(entityId)}/query`,{})
 for(const row of rows){const returned=copied.items.find(item=>item.fields[map.get(label.id)].value===row.fields[label.id].value);assert.deepEqual(returned.fields[map.get(absolute.id)],row.fields[absolute.id]);assert.equal(returned.fields[map.get(invalid.id)].state,'unavailable')}
 // A copied formula remains live after return rather than retaining exported results.
 const returned=copied.items.find(row=>row.fields[map.get(label.id)].value==='Negative')
 await call(createCommandHttp({...copy.r,authenticate:auth}),'/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref:returned.ref,version:returned.version}],input:{ref:returned.ref,changes:{[map.get(operand.id)]:'-0.03125'}}})
 const reread=await call(createRecordHttp({...copy.r.services,authenticate:auth}),`/api/v1/apps/${ids.appId}/entities/${map.get(entityId)}/query`,{})
 assert.deepEqual(reread.items.find(row=>row.id===returned.id).fields[map.get(absolute.id)],{state:'value',value:'0.03125'})
 const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),rules=JSON.parse(policy.rules_json)
 for(const rule of rules)if(rule.entityId===entityId)rule.readableFields=rule.readableFields.filter(id=>id!==operand.id)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run();r=await h.runtime()
 assert.ok((await query(r)).items.every(row=>row.fields[absolute.id].state==='redacted'))
 const metadata=await call(createRecordHttp({...r.services,authenticate:auth}),`/api/v1/apps/${appId}/entities/${entityId}`)
 assert.ok(!metadata.fields.find(field=>field.id===absolute.id).expression)
 await call(recordsCsvHttp(r.csv,auth),'/api/v1/records/export-csv',{appId,entityId,query:{fields:[absolute.id]}},403)
}
