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

/** Native typed values are enforced at the public HTTP doors, with real D1 policy/admission. */
export async function phoneJourney(){
 const h=await harness(),origin='https://records.test',auth=async()=>h.ctx
 const call=async(http,path,body,status=200,method='POST')=>{const response=await http.fetch(new Request(origin+path,{method,headers:{origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})),wire=await response.json();assert.equal(response.status,status,JSON.stringify(wire));return status<400?wire.data:wire.error}
 try{
  const appId=createUlid(),entityId=createUlid(),linkedId=createUlid(),name=newField('Name'),phone=newField('Phone','phone'),link=newField('Contact','relation'),lookup=newField('Contact phone','computed'),linkedName=newField('Name')
  Object.assign(link,{relation:{ownerAppId:appId,entityId,cardinality:'one',onDelete:'restrict'}})
  Object.assign(lookup,{readOnly:true,resultType:'phone',expression:{kind:'rollup',aggregate:'lookup',relationFieldId:link.id,valueFieldId:phone.id}})
  const draft={appId,name:'synthetic-cradle-phones',tables:[{id:entityId,label:'Contacts',primaryFieldId:name.id,fields:[name,phone]},{id:linkedId,label:'Messages',primaryFieldId:linkedName.id,fields:[linkedName,link,lookup]}]}
  let r=await h.runtime();const manual=manualSchemaHttp(r.manual,{},auth),preview=await call(manual,'/api/v1/records/schema-preview',draft)
  await call(manual,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}});r=await h.runtime()
  const schema=r.registry.get(appId,entityId).schema,rest=createRecordHttp({...r.services,rest:createRecordRest(h.db,r.services,r.admission),authenticate:auth}),route=`/api/v1/apps/${appId}/rest/entities/${entityId}/records`
  const created=await call(rest,route,{commandId:createUlid(),schemaVersion:schema.version,values:{[name.id]:'US contact',[phone.id]:'(555) 123-4567'}}),query=await call(rest,`/api/v1/apps/${appId}/entities/${entityId}/query`,{})
  const row=query.items[0];assert.equal(row.fields[phone.id].value,'+15551234567')
  for(const value of ['invalid','+0123456789','5551234','+1234567890123456']){const failure=await call(rest,route,{commandId:createUlid(),schemaVersion:schema.version,values:{[name.id]:'Invalid',[phone.id]:value}},400);assert.match(failure.message,/Phone.*E\.164/)}
  await call(rest,route+'/'+row.id,{commandId:createUlid(),version:row.version,changes:{[phone.id]:'+44 20 7946 0958'}},200,'PATCH')
  const updated=await call(rest,route+'/'+row.id,undefined,200,'GET');assert.equal(updated.fields[phone.id].value,'+442079460958')
  const commands=createCommandHttp({...r,authenticate:auth}),linkedSchema=r.registry.get(appId,linkedId).schema
  const child=await call(commands,'/api/v1/commands/record.create',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:linkedId},version:linkedSchema.version}],input:{appId,entityId:linkedId,values:{[linkedName.id]:'Linked phone',[link.id]:row.ref}}})
  const linkedRows=await call(rest,`/api/v1/apps/${appId}/entities/${linkedId}/query`,{});assert.equal(linkedRows.items[0].fields[lookup.id].value,'+442079460958')
  registerRecordFormActions(r.commands,{metadata:r.services.metadata,policy:r.policy,prepareCreate:createAuthorizedRecordCreatePreparer(r.services)})
  const form=(await call(commands,'/api/v1/commands/form.save',{commandId:createUlid(),expected:[],input:{form:{appId,entityId,title:'Contact form',fields:[name,phone].map(field=>({fieldId:field.id,label:field.label,help:'',required:false})),submitAction:'record.create',authenticated:true}}})).value
  const submit=values=>({commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000003',recordId:form.id},version:form.version},{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,formId:form.id,values}})
  const invalidForm=await call(commands,'/api/v1/commands/form.submit',submit({[name.id]:'Bad form',[phone.id]:'not a number'}),400);assert.match(invalidForm.message,/Phone.*E\.164/)
  const validForm=await call(commands,'/api/v1/commands/form.submit',submit({[name.id]:'Form contact',[phone.id]:'555-123-4568'}));assert.equal(validForm.value.fields[phone.id].value,'+15551234568')
  const csv=recordsCsvHttp(r.csv,auth),input={appId,entityId,csv:'Name,Phone\nCSV contact,(555) 123-4569\nBad CSV,broken',mapping:[name,phone].map(field=>({column:field.label,fieldId:field.id})),mergeFieldId:name.id},csvPreview=await call(csv,'/api/v1/records/import-preview',input)
  assert.equal(csvPreview.creates,1);assert.equal(csvPreview.rejected,1);assert.match(csvPreview.errors[0].message,/Phone/)
  await call(csv,'/api/v1/commands/records.import-commit',{commandId:createUlid(),expected:[],input:{previewId:csvPreview.id}})
  const afterCsv=await call(rest,`/api/v1/apps/${appId}/entities/${entityId}/query`,{});assert.equal(afterCsv.items.find(row=>row.fields[name.id].value==='CSV contact').fields[phone.id].value,'+15551234569')
  await adoptFixtureOperators(h.db);const baseSession=createUlid()
  await h.db.prepare("INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at) VALUES(?,?,?,1,'native',?,?)").bind(baseSession,createUlid(),h.owner,Date.now(),Date.now()+3600000).run()
  await h.db.prepare('INSERT INTO cradle_base_sessions(base_id,session_id) VALUES(?,?)').bind(baseSession,h.session).run();h.ctx.principal.baseSessionId=baseSession
  r=await h.runtime(undefined,true)
  const automations=recordAutomationsHttp({configuration:createRecordAutomationConfiguration(h.db,r.policy,r.admission,r.registry,origin),authenticate:auth})
  automations.onError((error,c)=>errorResponse(error,createUlid(),c.req.method+' '+c.req.path))
  const definition={name:'Phone update',appId,entityId,event:'updated',enabled:true,actions:[{kind:'update',fieldId:phone.id,value:'broken'}]}
  const badAutomation=await call(automations,'/',{commandId:createUlid(),expiresAt:new Date(Date.now()+3600000).toISOString(),definition},400);assert.match(badAutomation.message,/Phone.*E\.164/)
  definition.actions[0].value='(555) 123-4570';const saved=await call(automations,'/',{commandId:createUlid(),expiresAt:new Date(Date.now()+3600000).toISOString(),definition},201)
  const effects=createAutomationEffects({env:{DB:h.db},entities:createApplicationEntityRegistry(r.registry),admission:r.admission,commands:r.commands,destinations:createAutomationDestinations({DB:h.db},r.policy,r.admission)})
  const commandId=createUlid();await call(createCommandHttp({...r,authenticate:auth}),'/api/v1/commands/record.patch',{commandId,expected:[{ref:row.ref,version:updated.version}],input:{ref:row.ref,changes:{[name.id]:'Trigger contact'}}})
  await createRecordAutomationRuntime({db:h.db,appOrigin:origin,policy:r.policy,descriptors:r.registry,effects}).tick(commandId)
  const run=await h.db.prepare('SELECT state FROM automation_runs WHERE automation_id=?').bind(saved.result.value.id).first();assert.equal(run.state,'Complete')
  const scope=await r.policy.scope(h.ctx,{appId,entityId,purpose:'read'});assert.equal((await r.services.reader.record(h.ctx,scope,row.ref)).fields[phone.id].value,'+15551234570')
  console.log('PHONE_DOORS PASS schema, REST normalization/refusal, authenticated form, CSV, phone lookup and automation value admission')
 }finally{h.close()}
}
