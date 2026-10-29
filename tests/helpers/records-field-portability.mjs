import {fieldViewCsvJourney} from './records-field-view-csv.mjs'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {baseExportHttp} from '../../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {baseImportHttp} from '../../src/domains/records/base-transfer/http.server.ts'
import {createBaseImportService} from '../../src/domains/records/base-transfer/service.server.ts'
import {prepareJsonSource} from '../../src/domains/records/base-transfer/source-json.ts'
import {prepareCsvSource,allocateImportIdentities} from '../../src/domains/records/base-transfer/source.ts'
import {createJsonIdentityPreflight} from '../../src/domains/records/base-transfer/json-identities.server.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'
import {previewBaseImport} from '../../src/domains/records/base-transfer/plan.ts'
import {csvDownloadEntries} from './base-csv-download.mjs'
import {assertPortableJsonSchema,assertCorrespondenceSchema} from './json-schema-assert.mjs'
import {canonicalBaseSnapshot} from '../../src/domains/records/base-transfer/json-format.ts'
import {harness} from './records-manual-harness.mjs'

/** Author, export and return through HTTP; reuse the existing roundtrip registration. */
export async function fieldPortabilityJourney(h){
 const origin='https://portable-fields.example.test',auth=async()=>h.ctx
 const call=async(http,path,input,status=200)=>{const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,...(input instanceof FormData?{}:{'content-type':'application/json'})},...(input===undefined?{}:{body:input instanceof FormData?input:JSON.stringify(input)})})),body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error}
 const name=newField('Name'),instant=newField('When','instant'),money=newField('Price','money'),single=newField('Status','select'),multiple=newField('Tags','multi_select'),person=newField('Assigned','person'),phone=newField('Phone','phone'),email=newField('Email','email'),rating=newField('Rating','rating'),duration=newField('Duration','duration'),appId=createUlid(),entityId=createUlid()
 single.options=[{id:createUlid(),label:'Ready'},{id:createUlid(),label:'Done'}];single.defaultValue=single.options[0].id
 multiple.options=[{id:createUlid(),label:'A, B'},{id:createUlid(),label:'C "quoted"'},{id:createUlid(),label:'Unused'}];multiple.defaultValue=[multiple.options[1].id,multiple.options[0].id]
 rating.validation={max:'10'}
 name.validation={minLength:1,maxLength:40,pattern:'^[A-Z][a-z]*$'};instant.validation={min:'2026-01-01T00:00:00.000Z'};money.validation={min:'-999999',max:'999999'};money.defaultValue={minor:'12345',currency:'USD',scale:2};person.defaultValue=h.owner
 const condition=(field,op,value)=>({kind:'condition',fieldId:field.id,op,...(value===undefined?{}:{value})}),rules=[{id:createUlid(),name:'Ready tagged work',message:'Ready work needs its selected tags.',when:{kind:'all',conditions:[condition(single,'eq',single.options[0].id),condition(person,'eq',h.owner)]},require:{kind:'any',conditions:[condition(multiple,'eq',[multiple.options[1].id,multiple.options[0].id]),condition(money,'gte',{minor:'10000',currency:'USD',scale:2})]}}]
 const draft={appId,name:'Portable field work',tables:[{id:entityId,label:'Work',primaryFieldId:name.id,fields:[name,instant,money,single,multiple,person,phone,email,rating,duration],validationRules:rules}]}
 let r=await h.runtime(),manual=manualSchemaHttp(r.manual,{},auth)
 const invalid=structuredClone(draft);invalid.tables[0].fields.find(field=>field.type==='multi_select').unique=true
 const refused=await call(manual,'/api/v1/records/schema-preview',invalid,400);assert.match(JSON.stringify(refused),/scalar fields only/)
 const preview=await call(manual,'/api/v1/records/schema-preview',draft)
 await call(manual,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}});r=await h.runtime()
 const commands=createCommandHttp({...r,authenticate:auth}),schema=r.registry.get(appId,entityId).schema
 const values=[{[name.id]:'Alpha',[instant.id]:'2026-10-17T03:04:05.006Z',[money.id]:{minor:'-12345',currency:'JPY',scale:0},[single.id]:single.options[0].id,[multiple.id]:[multiple.options[1].id,multiple.options[0].id],[person.id]:h.owner,[phone.id]:'+15551234567',[email.id]:'synthetic-cradle-396@example.test',[rating.id]:'10',[duration.id]:'3661'},{[name.id]:'Beta',[instant.id]:null,[money.id]:null,[single.id]:single.options[1].id,[multiple.id]:[],[person.id]:null,[phone.id]:null,[email.id]:null,[rating.id]:null,[duration.id]:'0'}]
 for(const row of values)await call(commands,'/api/v1/commands/record.create',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,values:row}})
 const additive=await r.manual.read(h.ctx,appId),help='Use the external order reference. <strong>Plain text</strong> & no automatic changes.'
 const appendedSingle={id:createUlid(),label:'Awaiting confirmation'},appendedMulti={id:createUlid(),label:'Priority'}
 additive.tables[0].fields.find(field=>field.id===name.id).help=help
 additive.tables[0].fields.find(field=>field.id===single.id).options.push(appendedSingle)
 additive.tables[0].fields.find(field=>field.id===multiple.id).options.push(appendedMulti)
 const additivePreview=await call(manualSchemaHttp(r.manual,{},auth),'/api/v1/records/schema-preview',additive)
 assert.equal(additivePreview.impacts[0].count,2);assert.deepEqual(additivePreview.impacts[0].conversions,[])
 await call(manualSchemaHttp(r.manual,{},auth),'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:additivePreview.id}})
 single.options.push(appendedSingle);multiple.options.push(appendedMulti);name.help=help;r=await h.runtime()
 await fieldViewCsvJourney(h,{draft,call,auth,values})
 const exporter=runtime=>baseExportHttp(createBaseExport(h.db,runtime.services),auth),download=await call(exporter(r),'/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(download.content);assertPortableJsonSchema(snapshot)
 assert.equal(snapshot.base.views.find(view=>view.name==='Portable fields').position,37)
 const exported=snapshot.base.tables[0];assert.equal(exported.fields.find(field=>field.id===name.id).help,help);assert.deepEqual(exported.fields.find(field=>field.id===single.id).options,single.options);assert.deepEqual(exported.fields.find(field=>field.id===multiple.id).options,multiple.options);assert.deepEqual(exported.validationRules,rules);assert.deepEqual(exported.fields.find(f=>f.id===multiple.id).defaultValue,multiple.defaultValue)
 const importer=async(target=h)=>{const runtime=await target.runtime(),identities=createJsonIdentityPreflight(target.db,runtime.registry),service=createBaseImportService(target.db,runtime.policy,runtime.registry,runtime.manual,(source,options,ids)=>source.format==='cradle-base-v1'?previewJsonImport(source,options,ids):previewBaseImport(source,options,ids));return baseImportHttp(service,{prepare:files=>files[0].filename.endsWith('.json')?prepareJsonSource(files[0]):prepareCsvSource(files),identities:source=>source.format==='cradle-base-v1'?identities.allocate(source):allocateImportIdentities(source),validateIdentities:(source,ids)=>source.format==='cradle-base-v1'?identities.validate(source,ids):undefined},async()=>target.ctx,async()=>target.ctx)}
 const form=(files,options,correspondence)=>{const data=new FormData();for(const file of files)data.append('files',new Blob([file.bytes]),file.name);data.set('options',JSON.stringify(options));if(correspondence)data.append('correspondence',new Blob([correspondence]),'correspondence.json');return data}
 const complete=async(http,data,p)=>{data.set('fingerprint',p.fingerprint);data.set('identities',JSON.stringify(p.identities));data.set('acceptLoss','true');const review=await call(http,'/api/v1/records/base-import/review',data);let job=await call(http,'/api/v1/records/base-import/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true});for(let n=0;job.state!=='completed'&&n<100;n++)job=await call(http,`/api/v1/records/base-import/jobs/${job.id}/resume`,{});assert.equal(job.state,'completed');const status=await call(http,`/api/v1/records/base-import/jobs/${job.id}`);assert.equal(status.reconciliation.ok,true);return {p,job}}
 const http=await importer(),jsonForm=form([{name:'portable.json',bytes:download.content}],{name:snapshot.base.name}),copyPreview=await call(http,'/api/v1/records/base-import/preview',jsonForm),copy=await complete(http,jsonForm,copyPreview)
 const copyId=copy.p.identities.tables[entityId].entityId,copyField=id=>copy.p.identities.tables[entityId].fields[id],copyRuntime=await h.runtime(),copySchema=copyRuntime.registry.get(copy.p.identities.appId,copyId).schema
 assert.notEqual(copySchema.validationRules[0].id,rules[0].id);assert.equal(copySchema.validationRules[0].when.conditions[1].value,h.owner);assert.equal(copySchema.validationRules[0].when.conditions[0].value,copySchema.fields.find(f=>f.id===copyField(single.id)).options[0].id)
 assert.deepEqual(copySchema.fields.find(f=>f.id===copyField(multiple.id)).defaultValue,copySchema.fields.find(f=>f.id===copyField(multiple.id)).options.slice(0,2).reverse().map(o=>o.id));assert.equal(copySchema.fields.find(f=>f.id===copyField(person.id)).defaultValue,h.owner)
 assert.equal(copySchema.fields.find(f=>f.id===copyField(phone.id)).type,'phone')
 assert.equal(copySchema.fields.find(field=>field.id===copyField(name.id)).help,help);assert.deepEqual(copySchema.fields.find(field=>field.id===copyField(single.id)).options.map(option=>option.label),single.options.map(option=>option.label));assert.deepEqual(copySchema.fields.find(field=>field.id===copyField(multiple.id)).options.map(option=>option.label),multiple.options.map(option=>option.label))
 const copied=await call(createRecordHttp({...copyRuntime.services,authenticate:auth}),`/api/v1/apps/${copy.p.identities.appId}/entities/${copyId}/query`,{});assert.deepEqual(copied.items.find(row=>row.fields[copyField(name.id)].value==='Alpha').fields[copyField(money.id)].value,values[0][money.id]);assert.deepEqual(copied.items.find(row=>row.fields[copyField(name.id)].value==='Alpha').fields[copyField(multiple.id)].value,copySchema.fields.find(f=>f.id===copyField(multiple.id)).defaultValue)
 assert.equal(copied.items.find(row=>row.fields[copyField(name.id)].value==='Alpha').fields[copyField(phone.id)].value,values[0][phone.id])
 for(const original of values){const row=copied.items.find(row=>row.fields[copyField(name.id)].value===original[name.id]);for(const field of [email,rating,duration]){assert.equal(copySchema.fields.find(f=>f.id===copyField(field.id)).type,field.type);assert.equal(row.fields[copyField(field.id)].value,original[field.id])}}
 const zipped=await call(exporter(await h.runtime()),'/api/v1/records/base-export',{appId,format:'csv-set'}),entries=csvDownloadEntries(Buffer.from(zipped.content,'base64')),text=name=>new TextDecoder().decode(entries.find(e=>e.name===name).bytes),options=JSON.parse(text('import-options.json')),correspondence=text('correspondence.json');assertCorrespondenceSchema(JSON.parse(correspondence));assert.match(text('README.txt'),/Person IDs/)
 const csvFiles=entries.filter(e=>e.name.endsWith('.csv')).map(e=>({name:e.name,bytes:e.bytes})),csvForm=form(csvFiles,options,correspondence),unaccepted=await call(http,'/api/v1/records/base-import/preview',csvForm);assert.equal(unaccepted.correspondenceReview.accepted,false);assert.equal(unaccepted.schemaDraft.tables[0].validationRules,undefined)
 options.correspondenceAcceptedFingerprint=unaccepted.correspondenceReview.fingerprint;csvForm.set('identities',JSON.stringify(unaccepted.identities));csvForm.set('options',JSON.stringify(options));const accepted=await call(http,'/api/v1/records/base-import/preview',csvForm),csv=await complete(http,csvForm,accepted),csvRuntime=await h.runtime(),csvTable=csvRuntime.registry.list(csv.p.identities.appId)[0].schema
 assert.deepEqual(csvTable.fields.find(f=>f.label==='Tags').options.map(o=>o.label),multiple.options.map(o=>o.label));assert.deepEqual(csvTable.fields.find(f=>f.label==='Tags').defaultValue,csvTable.fields.find(f=>f.label==='Tags').options.slice(0,2).reverse().map(o=>o.id));assert.equal(csvTable.validationRules[0].when.conditions[1].value,h.owner)
 const csvRows=await call(createRecordHttp({...csvRuntime.services,authenticate:auth}),`/api/v1/apps/${csv.p.identities.appId}/entities/${csvTable.id}/query`,{}),csvFields=Object.fromEntries(csvTable.fields.map(f=>[f.label,f.id])),alpha=csvRows.items.find(row=>row.fields[csvFields.Name].value==='Alpha');assert.deepEqual(alpha.fields[csvFields.Price].value,values[0][money.id]);assert.equal(alpha.fields[csvFields.Assigned].value,h.owner);assert.equal(alpha.fields[csvFields.When].value,values[0][instant.id]);assert.deepEqual(csvRows.items.find(row=>row.fields[csvFields.Name].value==='Beta').fields[csvFields.Tags].value,[])
 assert.equal(alpha.fields[csvFields.Phone].value,values[0][phone.id]);assert.equal(csvTable.fields.find(f=>f.label==='Phone').type,'phone')
 for(const original of values){const row=csvRows.items.find(row=>row.fields[csvFields.Name].value===original[name.id]);for(const field of [email,rating,duration]){assert.equal(csvTable.fields.find(f=>f.label===field.label).type,field.type);assert.equal(row.fields[csvFields[field.label]].value,original[field.id])}}
 // A different installation cannot invent the referenced person; refusal happens before schema or job writes.
 const fresh=await harness();try{const freshHttp=await importer(fresh),before=(await fresh.db.prepare('SELECT COUNT(*) n FROM manual_record_bases').first()).n,error=await call(freshHttp,'/api/v1/records/base-import/preview',form([{name:'portable.json',bytes:download.content}],{name:snapshot.base.name}),400);assert.match(error.message,/person.*unavailable.*installation/i);assert.equal((await fresh.db.prepare('SELECT COUNT(*) n FROM manual_record_bases').first()).n,before)
  const sourcePerson=await h.db.prepare('SELECT * FROM operators WHERE id=?').bind(h.owner).first();await fresh.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?)').bind(sourcePerson.id,sourcePerson.name,'portable-person@example.test',sourcePerson.active,sourcePerson.created_at,sourcePerson.updated_at,sourcePerson.version).run()
  const freshForm=form([{name:'portable.json',bytes:download.content}],{name:snapshot.base.name}),p=await call(freshHttp,'/api/v1/records/base-import/preview',freshForm);assert.equal(p.identities.appId,appId);await complete(freshHttp,freshForm,p);const restored=await call(baseExportHttp(createBaseExport(fresh.db,(await fresh.runtime()).services),async()=>fresh.ctx),'/api/v1/records/base-export',{appId,format:'json'});assert.equal(canonicalBaseSnapshot(JSON.parse(restored.content)),canonicalBaseSnapshot(snapshot))
 }finally{fresh.close()}
 // Undo must treat multiple-select tuples as their own native cell without relation metadata.
 const undone=await call(http,`/api/v1/records/base-import/jobs/${csv.job.id}/undo`,{});assert.equal(undone.state,'undone')
}
