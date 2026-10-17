import assert from 'node:assert/strict'
import {add} from './records-manual-harness.mjs'
import {applyPreview} from './base-exit-runtime.mjs'
import {assertPortableJsonSchema} from './json-schema-assert.mjs'
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

/** One existing public-door journey grows calculation coverage without another test registration. */
export async function calculationJourney(h){
 const origin='https://calculations.example.test',auth=async()=>h.ctx
 async function call(http,path,input,status=200){const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})})),body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error}
 const name=newField('Name'),amount=newField('Amount','number'),open=newField('Open','boolean'),due=newField('Due','date'),projectName=newField('Project'),items=newField('Items','relation'),appId=createUlid(),taskId=createUlid(),projectId=createUlid()
 items.relation={ownerAppId:appId,entityId:taskId,cardinality:'many',onDelete:'restrict'}
 const draft={appId,name:'Calculated operations',tables:[{id:taskId,label:'Tasks',primaryFieldId:name.id,fields:[name,amount,open,due]},{id:projectId,label:'Projects',primaryFieldId:projectName.id,fields:[projectName,items]}]}
 let r=(await h.create(draft)).r
 const tasks=[];for(const [title,value,active]of [['A','10',true],['B','20',false],['A','0',true]])tasks.push(await add(h,r,r.registry.get(appId,taskId).schema,{[name.id]:title,[amount.id]:value,[open.id]:active,[due.id]:'2026-10-17'}))
 const project=await add(h,r,r.registry.get(appId,projectId).schema,{[projectName.id]:'Operations',[items.id]:tasks.map(row=>row.ref)})
 const edit=await r.manual.read(h.ctx,appId),task=edit.tables.find(t=>t.id===taskId),projects=edit.tables.find(t=>t.id===projectId),double=newField('Double','computed'),title=newField('Caption','computed'),nextDay=newField('Next day','computed'),broken=newField('Broken ratio','computed')
 for(const field of [double,title,nextDay,broken])Object.assign(field,{readOnly:true,resultType:field===double||field===broken?'number':field===nextDay?'date':'text'})
 task.fields.push(double,title,nextDay,broken);edit.formulaSources={[double.id]:'{Amount} * 2',[title.id]:'CONCATENATE(UPPER({Name}), " / ", IF({Open}, "open", "closed"))',[nextDay.id]:'DATEADD({Due}, 2, "days")',[broken.id]:'1 / 0'}
 const aggregateFields={};for(const aggregate of ['sum','average','min','max','count','counta','countall','arrayjoin','arrayunique','and','or']){
  const field=newField(aggregate.toUpperCase(),'computed'),boolean=aggregate==='and'||aggregate==='or',text=['counta','arrayjoin','arrayunique'].includes(aggregate)
  Object.assign(field,{readOnly:true,resultType:boolean?'boolean':aggregate==='arrayjoin'?'text':aggregate==='arrayunique'?'array':'number',expression:{kind:'rollup',relationFieldId:items.id,valueFieldId:boolean?open.id:text?name.id:double.id,aggregate,...(aggregate==='sum'?{filter:{kind:'condition',fieldId:open.id,op:'eq',value:true}}:{}),...(aggregate==='arrayjoin'?{separator:'|'}:{})}})
  aggregateFields[aggregate]=field;projects.fields.push(field)
 }
 const count=newField('Open count','computed');Object.assign(count,{readOnly:true,resultType:'number',expression:{kind:'rollup',relationFieldId:items.id,valueFieldId:name.id,aggregate:'countall',filter:{kind:'condition',fieldId:open.id,op:'eq',value:true}}});projects.fields.push(count)
 const manual=manualSchemaHttp(r.manual,{},auth),bad=structuredClone(edit);bad.formulaSources[double.id]='IF({Amount} > 0,'
 const syntax=await call(manual,'/api/v1/records/schema-preview',bad,400);assert.match(syntax.message,/Double:.*position \d+/)
 const cycle=structuredClone(edit);cycle.formulaSources[double.id]='{Double}';assert.match((await call(manual,'/api/v1/records/schema-preview',cycle,400)).message,/cycle|depth/)
 const prepared=await call(manual,'/api/v1/records/schema-preview',edit)
 const sample=id=>prepared.calculations.find(c=>c.fieldId===id).samples[0].after
 assert.equal(sample(double.id).value,'20');assert.equal(sample(title.id).value,'A / open');assert.equal(sample(nextDay.id).value,'2026-10-19');assert.equal(sample(broken.id).state,'unavailable');assert.match(sample(broken.id).message,/Division by zero/)
 const expected={sum:'20',average:'20',min:'0',max:'40',count:'3',counta:'3',countall:'3',arrayjoin:'A|B|A',arrayunique:['A','B'],and:false,or:true}
 for(const [aggregate,value]of Object.entries(expected))assert.deepEqual(sample(aggregateFields[aggregate].id),{state:'value',value},aggregate)
 assert.equal(sample(count.id).value,'2');assert.equal(prepared.calculations.find(c=>c.fieldId===count.id).samples[0].recordLabel,'Operations')
 assert.ok(!r.registry.get(appId,taskId).fields.has(double.id),'preview does not change live schema')
 await call(manual,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:prepared.id}})
 r=await h.runtime()
 const query=async(runtime,entityId,fields)=>call(createRecordHttp({...runtime.services,authenticate:auth}),`/api/v1/apps/${appId}/entities/${entityId}/query`,{fields})
 let projectRow=(await query(r,projectId)).items[0]
 for(const [aggregate,value]of Object.entries(expected))assert.deepEqual(projectRow.fields[aggregateFields[aggregate].id],{state:'value',value},aggregate)
 const commands=createCommandHttp({...r,authenticate:auth}),patched=await call(commands,'/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref:tasks[1].ref,version:tasks[1].version}],input:{ref:tasks[1].ref,changes:{[amount.id]:'5',[open.id]:true}}})
 assert.equal(patched.state,'committed')
 projectRow=(await query(r,projectId)).items[0];assert.equal(projectRow.fields[aggregateFields.sum.id].value,'30');assert.equal(projectRow.fields[count.id].value,'3')
 const taskRows=(await query(r,taskId)).items;assert.equal(taskRows.find(row=>row.id===tasks[1].id).fields[double.id].value,'10')
 const csv=await call(recordsCsvHttp(r.csv,auth),'/api/v1/records/export-csv',{appId,entityId:projectId,query:{fields:[projectName.id,aggregateFields.sum.id,count.id,aggregateFields.arrayunique.id]}}),parsed=parseCsv(new TextEncoder().encode(csv.csv))
 assert.deepEqual(parsed.rows,[['Operations','30','3','["A","B"]']])
 const exportHttp=baseExportHttp(createBaseExport(h.db,r.services),auth),download=await call(exportHttp,'/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(download.content)
 assertPortableJsonSchema(snapshot);assert.equal(snapshot.base.tables.find(t=>t.id===taskId).records[0].calculationErrors[broken.id].code,'invalid_source');assert.deepEqual(snapshot.base.tables.find(t=>t.id===taskId).fields.find(f=>f.id===double.id).expression,{kind:'call',fn:'multiply',args:[{kind:'field',fieldId:amount.id},{kind:'literal',value:'2',valueType:'number'}]})
 const source=prepareJsonSource({filename:'calculations.cradle.json',bytes:new TextEncoder().encode(download.content)}),ids=allocateJsonIdentities(snapshot,'copy'),map=jsonIdentityMap(snapshot,ids),copy=await applyPreview(h,previewJsonImport(source,{name:'Copied calculations'},ids))
 const copyScope=await copy.r.policy.scope(h.ctx,{appId:ids.appId,entityId:map.get(projectId),purpose:'read'}),copyRow=(await copy.r.services.reader.query(h.ctx,copyScope,{})).items[0]
 const copiedTasks=await copy.r.policy.scope(h.ctx,{appId:ids.appId,entityId:map.get(taskId),purpose:'read'});assert.ok((await copy.r.services.reader.query(h.ctx,copiedTasks,{fields:[map.get(broken.id)]})).items.every(row=>row.fields[map.get(broken.id)].state==='unavailable'))
 assert.equal(copyRow.fields[map.get(aggregateFields.sum.id)].value,'30');assert.equal(copyRow.fields[map.get(count.id)].value,'3');assert.deepEqual(copyRow.fields[map.get(aggregateFields.arrayunique.id)].value,['A','B'])
 // An expression edit is previewed on real records, and any intervening linked write invalidates adoption.
 r=await h.runtime();const revise=await r.manual.read(h.ctx,appId);revise.formulaSources={[double.id]:'{Amount} * 3'}
 const changed=await call(manualSchemaHttp(r.manual,{},auth),'/api/v1/records/schema-preview',revise);assert.equal(changed.calculations.find(c=>c.fieldId===double.id).samples[0].after.value,'30')
 await call(createCommandHttp({...r,authenticate:auth}),'/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref:tasks[0].ref,version:tasks[0].version}],input:{ref:tasks[0].ref,changes:{[amount.id]:'12'}}})
 await call(manualSchemaHttp(r.manual,{},auth),'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:changed.id}},409)
 // Field policy redacts dependent cells and their expression metadata, without hiding unrelated formulas or count-all.
 const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),rules=JSON.parse(policy.rules_json)
 for(const rule of rules)if(rule.entityId===taskId)rule.readableFields=rule.readableFields.filter(id=>id!==amount.id)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run();r=await h.runtime()
 projectRow=(await query(r,projectId)).items[0];assert.equal(projectRow.fields[aggregateFields.sum.id].state,'redacted');assert.equal(projectRow.fields[count.id].value,'3')
 const metadata=await call(createRecordHttp({...r.services,authenticate:auth}),`/api/v1/apps/${appId}/entities/${taskId}`)
 assert.ok(!metadata.fields.find(f=>f.id===double.id).expression);assert.ok(metadata.fields.find(f=>f.id===title.id).expression)
 const failed=await call(recordsCsvHttp(r.csv,auth),'/api/v1/records/export-csv',{appId,entityId:projectId,query:{fields:[aggregateFields.sum.id]}},403);assert.match(failed.message,/restricted|unavailable/)
}
