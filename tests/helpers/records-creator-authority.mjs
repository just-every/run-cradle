import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {registerRecordFormActions} from '../../src/domains/records/form-actions.server.ts'
import {createAuthorizedRecordCreatePreparer} from '../../src/domains/records/actions.server.ts'
import {adminAuditResponse} from '../../src/domains/admission/admin-audit.server.ts'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {harness,add} from './records-manual-harness.mjs'

/** Native authoring keeps current role, validation and recovery checks at every write. */
export async function creatorAuthorityJourney(){
 const h=await harness()
 try{
  const name={...newField('Order'),required:true},amount={...newField('Units','number'),validation:{min:'0'}},notes=newField('Notes')
  const appId=createUlid(),entityId=createUlid(),draft={appId,name:'synthetic-cradle-authority',tables:[{id:entityId,label:'Orders',primaryFieldId:name.id,fields:[name,amount,notes]}]}
  const {r}=await h.create(draft),schema=r.registry.get(appId,entityId).schema
  const original=await add(h,r,schema,{[name.id]:'synthetic-cradle-1',[amount.id]:'5',[notes.id]:'synthetic-cradle-retained-note'})
  const people={owner:{id:h.owner},creator:{id:createUlid()},editor:{id:createUlid()}},now=Date.now()
  for(const [role,person]of Object.entries(people))if(role!=='owner'){
   await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(person.id,`synthetic-cradle-${role}`,[`synthetic-cradle-${role}`,'example.test'].join('@'),now,now).run()
   await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',0,?,?)").bind(person.id,person.id,now,now).run()
  }
  const origin='http://127.0.0.1:4189',auth=await createFixtureAuth(h.db,{appOrigin:origin,sessionSecret:'synthetic-cradle-session-secret-at-least-32-characters',mode:'development'},h.owner)
  for(const person of Object.values(people)){const {cookie,csrf}=await auth.signIn(person.id);Object.assign(person,{cookie,csrf})}
  const authenticate=async(request,ingress,requestId)=>{const session=request.method==='GET'?await auth.current(request):await auth.requireCsrf(request);assert.ok(session);return {principal:session.principal,now:new Date().toISOString(),requestId,ingress}}
  async function request(person,path,input,status=200){
   const runtime=await h.runtime();registerRecordFormActions(runtime.commands,{metadata:runtime.services.metadata,policy:runtime.policy,prepareCreate:createAuthorizedRecordCreatePreparer(runtime.services)})
   const req=new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{host:new URL(origin).host,cookie:person.cookie,origin,'content-type':'application/json',...(input===undefined?{}:{'x-csrf-token':person.csrf})},...(input===undefined?{}:{body:JSON.stringify(input)})})
   const http=path.includes('/records/schema-preview')||path.includes('/records/bases/')||path.includes('/records/releases/')||path.endsWith('/release.adopt')?manualSchemaHttp(runtime.manual,{},authenticate):path.includes('/commands/')?createCommandHttp({...runtime,authenticate}):createRecordHttp({...runtime.services,authenticate})
   const response=await http.fetch(req),body=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(body)}`);return status===200?body.data:body.error
  }
  const command=(input,expected=[])=>({commandId:createUlid(),expected,input}),ref=(kind,id)=>({appId,entityId:kind,recordId:id}),schemaRef=ref('00000000000000000000000001',entityId),viewRef=id=>ref('00000000000000000000000002',id),formRef=id=>ref('00000000000000000000000003',id)
  const base=`/api/v1/apps/${appId}/entities/${entityId}`,basePath=`/api/v1/records/bases/${appId}`,edit=()=>request(people.creator,basePath),adopt=preview=>command({kind:'manual_schema',previewId:preview.id})
  const assign=(role,destructive,version)=>request(people.owner,basePath+'/collaborators',{commandId:createUlid(),principalId:people.creator.id,role,destructive,version})
  await assign('creator',false,0)
  await request(people.owner,basePath+'/collaborators',{commandId:createUlid(),principalId:people.editor.id,role:'editor',destructive:false,version:0})
  const baseVersion=async()=>(await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(appId).first()).version
  const beforeVersion=await baseVersion(),formDefinition={appId,entityId,title:'synthetic-cradle-receiving',fields:[name,amount].map(field=>({fieldId:field.id,label:field.label,help:'',required:field.required})),submitAction:'record.create',authenticated:true}
  const saveForm=command({form:formDefinition},[{ref:schemaRef,version:schema.version}]),form=(await request(people.creator,'/api/v1/commands/form.save',saveForm)).value
  assert.deepEqual((await request(people.editor,`/api/v1/forms/${form.id}`)).fields,formDefinition.fields)
  assert.equal(await baseVersion(),beforeVersion,'Publishing a form does not adopt a schema')
  await request(people.editor,'/api/v1/commands/form.save',command({form:formDefinition}),403)
  const omitted=command({id:form.id,form:{...formDefinition,fields:formDefinition.fields.filter(field=>field.fieldId!==name.id)}},[{ref:formRef(form.id),version:form.version}])
  assert.match((await request(people.creator,'/api/v1/commands/form.save',omitted,400)).message,/required/)
  assert.deepEqual((await request(people.editor,`/api/v1/forms/${form.id}`)).fields,formDefinition.fields)
  const submit=values=>command({appId,entityId,formId:form.id,values},[{ref:schemaRef,version:schema.version},{ref:formRef(form.id),version:form.version}])
  const received=(await request(people.editor,'/api/v1/commands/form.submit',submit({[name.id]:'synthetic-cradle-2',[amount.id]:'12'}))).value
  assert.equal(received.fields[amount.id].value,'12')
  const rows=async()=>{const {evaluatedAt,...state}=await request(people.editor,base+'/query',{});return state}
  const beforeInvalid=await rows()
  assert.match((await request(people.editor,'/api/v1/commands/form.submit',submit({[name.id]:'synthetic-cradle-invalid',[amount.id]:'-1'}),400)).message,/Units min/)
  assert.match((await request(people.editor,'/api/v1/commands/form.submit',submit({[amount.id]:'1'}),400)).message,/Order.*required/)
  assert.deepEqual(await rows(),beforeInvalid)
  const definition={appId,entityId,name:'synthetic-cradle-shared',display:'grid',fields:[name.id,amount.id],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:name.id},visibility:'app',shipped:false}
  let view=(await request(people.creator,'/api/v1/commands/view.save',command({view:definition},[{ref:schemaRef,version:schema.version}]))).value
  const viewDefinition=view=>{const {id,version,createdAt,updatedAt,access,...value}=view;return value}
  const saveView=(person,changes,status=200)=>request(person,'/api/v1/commands/view.save',command({id:view.id,view:{...viewDefinition(view),...changes}},[{ref:viewRef(view.id),version:view.version}]),status)
  view=(await saveView(people.creator,{locked:true})).value
  const locked=await request(people.editor,`/api/v1/views/${view.id}`);assert.equal(locked.access.canEdit,false);assert.equal(locked.locked,true)
  await saveView(people.editor,{name:'synthetic-cradle-forbidden'},403)
  await request(people.editor,'/api/v1/commands/view.delete',command({viewId:view.id},[{ref:viewRef(view.id),version:view.version}]),403)
  assert.equal((await request(people.editor,`/api/v1/views/${view.id}`)).version,view.version)
  view=(await saveView(people.creator,{locked:false})).value
  view=(await saveView(people.editor,{name:'synthetic-cradle-editor-renamed'})).value
  const history=await request(people.editor,`/api/v1/views/${view.id}/history`);assert.equal(history.items.length,4)
  assert.equal(await baseVersion(),beforeVersion,'Locking and editing views do not adopt schemas')
  await assign('creator',true,1)
  const remove=await edit();remove.tables[0].fields=remove.tables[0].fields.filter(field=>field.id!==notes.id)
  const deletion=await request(people.creator,'/api/v1/records/schema-preview',remove);assert.equal(deletion.requiresOwnerReview,false)
  assert.equal(deletion.impacts[0].removedFields.find(field=>field.id===notes.id).populated,1)
  const destructiveCommand=adopt(deletion),deleted=await request(people.creator,'/api/v1/commands/release.adopt',destructiveCommand)
  const recovery=await request(people.creator,`/api/v1/records/releases/${deleted.value.releaseId}/recovery`)
  assert.match(recovery.tables[0].csv,/synthetic-cradle-retained-note/)
  assert.ok(recovery.priorSchemas[0].fields.some(field=>field.id===notes.id))
  assert.equal((await request(people.editor,base)).fields.some(field=>field.id===notes.id),false)
  const auditResponse=await adminAuditResponse(new Request(`${origin}/api/v1/admin/audit?base=${appId}`,{headers:{host:new URL(origin).host,cookie:people.owner.cookie}}),h.db,{authenticate})
  assert.equal(auditResponse.status,200);const audits=(await auditResponse.json()).data.items.filter(item=>item.eventId===destructiveCommand.commandId)
  assert.equal(audits.length,1);assert.equal(audits[0].action,'release.adopt');assert.equal(audits[0].personId,people.creator.id)
  const retainedDraft=await edit();retainedDraft.tables[0].fields=retainedDraft.tables[0].fields.filter(field=>field.id!==amount.id)
  const retained=await request(people.creator,'/api/v1/records/schema-preview',retainedDraft);assert.equal(retained.requiresOwnerReview,false)
  await assign('creator',false,2)
  const stable=await edit(),stableRows=await rows(),retainedCommand=adopt(retained)
  await request(people.creator,'/api/v1/commands/release.adopt',retainedCommand,409)
  await request(people.creator,'/api/v1/commands/release.adopt',retainedCommand,409)
  assert.deepEqual(await edit(),stable);assert.deepEqual(await rows(),stableRows)
  const reviewed=await request(people.creator,'/api/v1/records/schema-preview',retainedDraft);assert.equal(reviewed.requiresOwnerReview,true)
  await request(people.creator,'/api/v1/commands/release.adopt',adopt(reviewed),403)
  const narrow=await edit();narrow.tables[0].fields.find(field=>field.id===amount.id).validation={min:'10'}
  const violating=await request(people.creator,'/api/v1/records/schema-preview',narrow);assert.equal(violating.requiresOwnerReview,true)
  assert.deepEqual(violating.impacts[0].violatingRecordIds,[original.id]);assert.equal(violating.impacts[0].violatingRecordCount,1)
  await request(people.creator,'/api/v1/commands/release.adopt',adopt(violating),403)
  assert.match((await request(people.owner,'/api/v1/commands/release.adopt',adopt(violating),400)).message,/existing records break.*Units min/)
  await assign('creator',true,3)
  const delegatedViolation=await request(people.creator,'/api/v1/records/schema-preview',narrow);assert.equal(delegatedViolation.requiresOwnerReview,false)
  assert.match((await request(people.creator,'/api/v1/commands/release.adopt',adopt(delegatedViolation),400)).message,/existing records break.*Units min/)
  assert.deepEqual(await edit(),stable);assert.deepEqual(await rows(),stableRows)
  await request(people.editor,'/api/v1/commands/record.patch',command({ref:original.ref,changes:{[amount.id]:'15'}},[{ref:original.ref,version:original.version}]))
  const safe=await request(people.creator,'/api/v1/records/schema-preview',narrow);assert.equal(safe.impacts[0].violatingRecordCount,0)
  await request(people.creator,'/api/v1/commands/release.adopt',adopt(safe))
  assert.deepEqual((await request(people.editor,base)).fields.find(field=>field.id===amount.id).validation,{min:'10'})
  const currentOriginal=(await rows()).items.find(row=>row.id===original.id)
  assert.match((await request(people.editor,'/api/v1/commands/record.patch',command({ref:original.ref,changes:{[amount.id]:'7'}},[{ref:original.ref,version:currentOriginal.version}]),400)).message,/Units min/)
  assert.equal((await rows()).items.find(row=>row.id===original.id).fields[amount.id].value,'15')
  view=await request(people.creator,`/api/v1/views/${view.id}`);view=(await saveView(people.creator,{locked:true})).value
  const retainedForm=command({id:form.id,form:{...formDefinition,title:'synthetic-cradle-not-published'}},[{ref:formRef(form.id),version:form.version}])
  const addition=await edit();addition.tables[0].fields.push(newField('Not adopted'));const pending=await request(people.creator,'/api/v1/records/schema-preview',addition)
  await assign('editor',false,4)
  await request(people.creator,'/api/v1/commands/form.save',retainedForm,403)
  await saveView(people.creator,{locked:false},403)
  await request(people.creator,'/api/v1/commands/release.adopt',adopt(pending),403)
  assert.equal((await request(people.editor,`/api/v1/forms/${form.id}`)).title,form.title)
  assert.equal((await request(people.editor,`/api/v1/views/${view.id}`)).locked,true)
  assert.equal((await request(people.editor,base)).fields.some(field=>field.label==='Not adopted'),false)
  const afterDemotionRows=await rows(),afterDemotionSchema=await request(people.editor,base)
  assert.equal((await request(people.creator,'/api/v1/commands/release.adopt',destructiveCommand)).state,'committed')
  assert.deepEqual(await rows(),afterDemotionRows);assert.deepEqual(await request(people.editor,base),afterDemotionSchema)
  assert.equal((await h.db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first()).owner_id,h.owner)
 }finally{h.close()}
}
