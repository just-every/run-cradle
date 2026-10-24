import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {createRecordRest} from '../../src/domains/records/rest/service.server.ts'
import {registerRecordFormActions} from '../../src/domains/records/form-actions.server.ts'
import {createAuthorizedRecordCreatePreparer} from '../../src/domains/records/actions.server.ts'
import {recordsCsvHttp} from '../../src/domains/records/csv-http.server.ts'
import {createRecordAutomationConfiguration} from '../../src/domains/automations/configuration.server.ts'
import {createAutomationEffects} from '../../src/domains/automations/effects.server.ts'
import {createAutomationDestinations} from '../../src/domains/automations/destinations.server.ts'
import {createRecordAutomationRuntime} from '../../src/domains/automations/runtime.server.ts'
import {createApplicationEntityRegistry} from '../../src/core/app/composition/entities.server.ts'
import {recordAutomationsHttp} from '../../src/domains/automations/http.server.ts'
import {errorResponse} from '../../src/core/registry/errors.server.ts'
import {adoptFixtureOperators} from './base-fixture-auth.mjs'
import {harness} from './records-manual-harness.mjs'

/** Email/rating/duration share native admission at every existing write door. */
export async function typedFieldJourney(){
 const h=await harness(),origin='https://records.test',auth=async()=>h.ctx
 const call=async(http,path,body,status=200,method='POST')=>{const response=await http.fetch(new Request(origin+path,{method,headers:{origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})),wire=await response.json();assert.equal(response.status,status,JSON.stringify(wire));return status<400?wire.data:wire.error}
 try{
  const appId=createUlid(),entityId=createUlid(),linkedId=createUlid(),name=newField('Name'),linkedName=newField('Name'),link=newField('Contact','relation')
  const examples=[{field:newField('Email','email'),valid:'synthetic-cradle-400@example.test',next:'synthetic-cradle-401@example.test',invalid:['bad','a@example.test\nBcc:someone@example.test','a@example.test,b@example.test']},{field:newField('Rating','rating'),valid:'5',next:'4',invalid:['0','6','1.5','-1']},{field:{...newField('Ten-star rating','rating'),validation:{max:'10'}},valid:'9',next:'10',invalid:['11','0','4.5']},{field:newField('Duration','duration'),valid:'3661',next:'7200',csv:'1:01:01',invalid:['-1','1.5','one hour']}]
  Object.assign(link,{relation:{ownerAppId:appId,entityId,cardinality:'one',onDelete:'restrict'}})
  const lookups=examples.map(({field})=>({...newField('Contact '+field.label,'computed'),readOnly:true,resultType:field.type,expression:{kind:'rollup',aggregate:'lookup',relationFieldId:link.id,valueFieldId:field.id}}))
  const draft={appId,name:'synthetic-cradle-typed-fields',tables:[{id:entityId,label:'Contacts',primaryFieldId:name.id,fields:[name,...examples.map(e=>e.field)]},{id:linkedId,label:'Messages',primaryFieldId:linkedName.id,fields:[linkedName,link,...lookups]}]}
  let r=await h.runtime();const manual=manualSchemaHttp(r.manual,{},auth)
  for(const maximum of ['0','11','2.5']){const bad=structuredClone(draft);bad.tables[0].fields.find(f=>f.type==='rating').validation={max:maximum};const refused=await call(manual,'/api/v1/records/schema-preview',bad,400);assert.match(JSON.stringify(refused),/Rating.*maximum/)}
  const preview=await call(manual,'/api/v1/records/schema-preview',draft)
  await call(manual,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}});r=await h.runtime()
  const schema=r.registry.get(appId,entityId).schema,rest=createRecordHttp({...r.services,rest:createRecordRest(h.db,r.services,r.admission),authenticate:auth}),route=`/api/v1/apps/${appId}/rest/entities/${entityId}/records`,validValues=Object.fromEntries(examples.map(e=>[e.field.id,e.valid]))
  await call(rest,route,{commandId:createUlid(),schemaVersion:schema.version,values:{[name.id]:'Typed contact',...validValues}})
  let row=(await call(rest,`/api/v1/apps/${appId}/entities/${entityId}/query`,{})).items[0]
  for(const e of examples){assert.equal(row.fields[e.field.id].value,e.valid);for(const value of e.invalid){const failure=await call(rest,route,{commandId:createUlid(),schemaVersion:schema.version,values:{[name.id]:'Invalid',[e.field.id]:value}},400);assert.ok(failure.message.includes(e.field.label),failure.message)}}
  await call(rest,route+'/'+row.id,{commandId:createUlid(),version:row.version,changes:Object.fromEntries(examples.map(e=>[e.field.id,e.next]))},200,'PATCH')
  row=await call(rest,route+'/'+row.id,undefined,200,'GET');for(const e of examples)assert.equal(row.fields[e.field.id].value,e.next)
  const commands=createCommandHttp({...r,authenticate:auth}),linkedSchema=r.registry.get(appId,linkedId).schema
  await call(commands,'/api/v1/commands/record.create',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:linkedId},version:linkedSchema.version}],input:{appId,entityId:linkedId,values:{[linkedName.id]:'Typed lookups',[link.id]:row.ref}}})
  const child=(await call(rest,`/api/v1/apps/${appId}/entities/${linkedId}/query`,{})).items[0];for(const [i,e]of examples.entries())assert.equal(child.fields[lookups[i].id].value,e.next)
  registerRecordFormActions(r.commands,{metadata:r.services.metadata,policy:r.policy,prepareCreate:createAuthorizedRecordCreatePreparer(r.services)})
  const form=(await call(commands,'/api/v1/commands/form.save',{commandId:createUlid(),expected:[],input:{form:{appId,entityId,title:'Typed form',fields:[name,...examples.map(e=>e.field)].map(field=>({fieldId:field.id,label:field.label,help:'',required:false})),submitAction:'record.create',authenticated:true}}})).value
  const submit=values=>({commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000003',recordId:form.id},version:form.version},{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,formId:form.id,values}})
  for(const e of examples){const failure=await call(commands,'/api/v1/commands/form.submit',submit({[name.id]:'Bad form',[e.field.id]:e.invalid[0]}),400);assert.ok(failure.message.includes(e.field.label))}
  const submitted=await call(commands,'/api/v1/commands/form.submit',submit({[name.id]:'Form contact',...validValues}));for(const e of examples)assert.equal(submitted.value.fields[e.field.id].value,e.valid)
  const csv=recordsCsvHttp(r.csv,auth)
  for(const e of examples){const input={appId,entityId,csv:`Name,${e.field.label}\nCSV ${e.field.label},${e.csv??e.valid}\nBad CSV,${e.invalid[0]}`,mapping:[name,e.field].map(field=>({column:field.label,fieldId:field.id})),mergeFieldId:name.id},p=await call(csv,'/api/v1/records/import-preview',input);assert.equal(p.creates,1);assert.equal(p.rejected,1);assert.ok(p.errors[0].message.includes(e.field.label));await call(csv,'/api/v1/commands/records.import-commit',{commandId:createUlid(),expected:[],input:{previewId:p.id}});const after=(await call(rest,`/api/v1/apps/${appId}/entities/${entityId}/query`,{})).items.find(row=>row.fields[name.id].value==='CSV '+e.field.label);assert.equal(after.fields[e.field.id].value,e.valid)}
  await adoptFixtureOperators(h.db);const baseSession=createUlid()
  await h.db.prepare("INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at) VALUES(?,?,?,1,'native',?,?)").bind(baseSession,createUlid(),h.owner,Date.now(),Date.now()+3600000).run()
  await h.db.prepare('INSERT INTO cradle_base_sessions(base_id,session_id) VALUES(?,?)').bind(baseSession,h.session).run();h.ctx.principal.baseSessionId=baseSession
  r=await h.runtime(undefined,true)
  const automations=recordAutomationsHttp({configuration:createRecordAutomationConfiguration(h.db,r.policy,r.admission,r.registry,origin),authenticate:auth});automations.onError((error,c)=>errorResponse(error,createUlid(),c.req.method+' '+c.req.path))
  for(const e of examples){const definition={name:e.field.label+' update',appId,entityId,event:'updated',enabled:true,actions:[{kind:'update',fieldId:e.field.id,value:e.invalid[0]}]};const failure=await call(automations,'/',{commandId:createUlid(),expiresAt:new Date(Date.now()+3600000).toISOString(),definition},400);assert.ok(failure.message.includes(e.field.label))}
  const definition={name:'Typed updates',appId,entityId,event:'updated',enabled:true,actions:examples.map(e=>({kind:'update',fieldId:e.field.id,value:e.valid}))},saved=await call(automations,'/',{commandId:createUlid(),expiresAt:new Date(Date.now()+3600000).toISOString(),definition},201)
  const effects=createAutomationEffects({env:{DB:h.db},entities:createApplicationEntityRegistry(r.registry),admission:r.admission,commands:r.commands,destinations:createAutomationDestinations({DB:h.db},r.policy,r.admission)})
  const commandId=createUlid();await call(createCommandHttp({...r,authenticate:auth}),'/api/v1/commands/record.patch',{commandId,expected:[{ref:row.ref,version:row.version}],input:{ref:row.ref,changes:{[name.id]:'Trigger typed contact'}}})
  await createRecordAutomationRuntime({db:h.db,appOrigin:origin,policy:r.policy,descriptors:r.registry,effects}).tick(commandId)
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE automation_id=?').bind(saved.result.value.id).first()).state,'Complete')
  const scope=await r.policy.scope(h.ctx,{appId,entityId,purpose:'read'}),updated=await r.services.reader.record(h.ctx,scope,row.ref);for(const e of examples)assert.equal(updated.fields[e.field.id].value,e.valid)
  console.log('TYPED_FIELD_DOORS PASS email/rating/duration schema, REST, authenticated form, CSV, lookups and automation write admission')
 }finally{h.close()}
}
