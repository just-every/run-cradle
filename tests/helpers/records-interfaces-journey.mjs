import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {createRecordInterfaces} from '../../src/domains/records/interfaces/service.server.ts'
import {recordInterfacesHttp} from '../../src/domains/records/interfaces/http.server.ts'
import {interfaceTrashPurge} from '../../src/domains/records/interfaces/purge.server.ts'
import {adminAuditResponse} from '../../src/domains/admission/admin-audit.server.ts'
import {AdmissionError} from '../../src/domains/admission/errors.ts'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {harness,add} from './records-manual-harness.mjs'
import {interfacePortabilityJourney} from './records-interfaces-portability.mjs'
import {createAuthHandler} from '../../vendor/base/modules/operator-auth/index.mjs'

/** Native interface publication, current audience, history and custody share the role boundary. */
export async function interfacesJourney(){
 const h=await harness()
 try{
  const title={...newField('Order'),required:true},units=newField('Units','number'),appId=createUlid(),entityId=createUlid()
  const {r}=await h.create({appId,name:'synthetic-cradle-interfaces',tables:[{id:entityId,label:'Orders',primaryFieldId:title.id,fields:[title,units]}]}),schema=r.registry.get(appId,entityId).schema
  for(const [name,value]of [['synthetic-cradle-public','3'],['synthetic-cradle-private','8']])await add(h,r,schema,{[title.id]:name,[units.id]:value})
  const people={owner:{id:h.owner},creator:{id:createUlid()},editor:{id:createUlid()},reader:{id:createUlid()},other:{id:createUlid()}},now=Date.now()
  for(const [role,person]of Object.entries(people))if(role!=='owner'){
   await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(person.id,`synthetic-cradle-${role}`,[`synthetic-cradle-${role}`,'example.test'].join('@'),now,now).run()
   await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',0,?,?)").bind(person.id,person.id,now,now).run()
  }
  const origin='http://127.0.0.1:4191',auth=await createFixtureAuth(h.db,{appOrigin:origin,sessionSecret:'synthetic-cradle-interface-session-at-least-32-characters',mode:'development'},h.owner)
  for(const person of Object.values(people)){const {cookie,csrf}=await auth.signIn(person.id);Object.assign(person,{cookie,csrf})}
  const authenticate=async(request,ingress,requestId)=>{const session=request.method==='GET'?await auth.current(request):await auth.requireCsrf(request);if(!session)throw new AdmissionError('signed_out','A current session is required.');return {principal:session.principal,now:new Date().toISOString(),requestId,ingress}}
  async function request(person,path,input,status=200){
   const runtime=await h.runtime(),service=createRecordInterfaces(h.db,runtime.services.metadata,runtime.policy,runtime.admission),req=new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{host:new URL(origin).host,cookie:person.cookie,origin,'content-type':'application/json',...(input===undefined?{}:{'x-csrf-token':person.csrf})},...(input===undefined?{}:{body:JSON.stringify(input)})})
   const http=path.includes('/interfaces')?recordInterfacesHttp(service,authenticate):path.includes('/records/schema-preview')||path.includes('/records/bases/')||path.endsWith('/release.adopt')?manualSchemaHttp(runtime.manual,{},authenticate):path.includes('/commands/')?createCommandHttp({...runtime,authenticate}):createRecordHttp({...runtime.services,authenticate})
   const response=await http.fetch(req),body=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(body)}`);return status===200?body.data:body.error
  }
  const basePath=`/api/v1/records/bases/${appId}`,interfacesPath=`/api/v1/apps/${appId}/interfaces`,command=(input,expected=[])=>({commandId:createUlid(),expected,input})
  const assign=(person,role,version=0)=>request(people.owner,basePath+'/collaborators',{commandId:createUlid(),principalId:person.id,role,destructive:false,version})
  await assign(people.creator,'creator');await assign(people.editor,'editor');await assign(people.reader,'read-only');await assign(people.other,'read-only')
  const view=(await request(people.creator,'/api/v1/commands/view.save',command({view:{appId,entityId,name:'synthetic-cradle-orders',display:'grid',fields:[title.id,units.id],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:title.id},visibility:'app',shipped:false}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}]))).value
  const form=(await request(people.creator,'/api/v1/commands/form.save',command({form:{appId,entityId,title:'synthetic-cradle-intake',fields:[{fieldId:title.id,label:'Order',help:'',required:true}],submitAction:'record.create',authenticated:true}}))).value
  const input={appId,name:'synthetic-cradle-receiving',pages:[{id:createUlid(),title:'Receiving',sections:[{id:createUlid(),title:'Orders',tab:'Queue',components:[{id:createUlid(),kind:'text',text:'synthetic-cradle-guide <strong>plain</strong>'},{id:createUlid(),kind:'divider'},{id:createUlid(),kind:'view',viewId:view.id},{id:createUlid(),kind:'form',formId:form.id}]}]}],audience:{roles:['editor'],people:[people.reader.id]}}
  const baseVersion=async()=>(await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(appId).first()).version,beforeVersion=await baseVersion()
  const publication={commandId:createUlid(),definition:input},published=await request(people.creator,interfacesPath+'/publish',publication),itemPath=`/api/v1/interfaces/${published.id}`
  assert.equal(published.canEdit,true);assert.equal(published.authorId,people.creator.id);assert.equal(published.version,1);assert.deepEqual(published.pages,input.pages)
  assert.equal((await request(people.creator,interfacesPath+'/publish',publication)).version,1,'A captured publication replays without another version')
  assert.equal(await baseVersion(),beforeVersion,'An interface publishes without schema adoption')
  const editorRead=await request(people.editor,itemPath);assert.equal(editorRead.canEdit,false);assert.deepEqual(editorRead.audience.people,[]);assert.equal(editorRead.authorId,null);assert.deepEqual(editorRead.pages,input.pages)
  const readerRead=await request(people.reader,itemPath),readerComponents=readerRead.pages[0].sections[0].components
  assert.ok(readerComponents.some(component=>component.kind==='view'));assert.equal(readerComponents.some(component=>component.kind==='form'),false,'Read-only members receive no writable form component')
  assert.ok((await request(people.reader,interfacesPath)).items.some(item=>item.id===published.id));await request(people.other,itemPath,undefined,404);assert.equal((await request(people.other,interfacesPath)).items.length,0)
  await request(people.editor,itemPath+'/versions',undefined,403)
  const stable=await request(people.owner,itemPath),forbidden={commandId:createUlid(),id:published.id,version:published.version,definition:{...input,name:'synthetic-cradle-forbidden'}}
  assert.match((await request(people.editor,interfacesPath+'/publish',forbidden,403)).message,/owner|creator/i);assert.deepEqual(await request(people.owner,itemPath),stable)
  const revision={...input,name:'synthetic-cradle-revised',pages:input.pages.map(page=>({...page,title:'Receiving review'})),audience:{roles:['editor'],people:[]}}
  const updated=await request(people.creator,interfacesPath+'/publish',{commandId:createUlid(),id:published.id,version:published.version,definition:revision});assert.equal(updated.version,2)
  await request(people.reader,itemPath,undefined,404);assert.equal((await request(people.reader,interfacesPath)).items.length,0)
  const history=await request(people.creator,itemPath+'/versions');assert.deepEqual(history.items.map(item=>item.version),[2,1])
  const historical=await request(people.creator,itemPath+'/versions/1');assert.equal(historical.canEdit,false);assert.deepEqual(historical.pages,input.pages)
  const restored=await request(people.creator,itemPath+'/restore',{commandId:createUlid(),version:updated.version,restoreVersion:1});assert.equal(restored.version,3);assert.deepEqual(restored.pages,input.pages);assert.deepEqual((await request(people.reader,itemPath)).pages[0].sections[0].components,readerComponents)
  await interfacePortabilityJourney(h,{appId,interfaceId:published.id,viewId:view.id,formId:form.id})
  const policy=await h.db.prepare("SELECT p.id,p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.app_id=? AND m.principal_id=? AND m.state='active'").bind(appId,people.reader.id).first(),rules=JSON.parse(policy.rules_json)
  for(const rule of rules)if(rule.entityId===entityId)rule.rows={kind:'condition',fieldId:title.id,op:'eq',value:'synthetic-cradle-public'}
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
  assert.ok((await request(people.reader,itemPath)).pages[0].sections[0].components.some(component=>component.kind==='view'))
  const filtered=await request(people.reader,`/api/v1/views/${view.id}/query`,{});assert.deepEqual(filtered.records.items.map(row=>row.fields[title.id].value),['synthetic-cradle-public'])
  const readerSession=(await auth.current(new Request(origin+'/app',{headers:{host:new URL(origin).host,cookie:people.reader.cookie}}))).principal.baseSessionId
  const revoked=await createAuthHandler(auth.base)(new Request(origin+'/auth/session/revoke',{method:'POST',headers:{host:new URL(origin).host,cookie:people.owner.cookie,origin,'content-type':'application/json','x-csrf-token':people.owner.csrf},body:JSON.stringify({sessionId:readerSession})}));assert.equal(revoked.status,204)
  await request(people.reader,itemPath,undefined,401);await request(people.reader,interfacesPath,undefined,401)
  const captured={commandId:createUlid(),id:published.id,version:restored.version,definition:{...input,name:'synthetic-cradle-captured'}}
  await assign(people.creator,'editor',1)
  await request(people.creator,interfacesPath+'/publish',captured,403);await request(people.creator,interfacesPath+'/publish',publication,403);await request(people.creator,itemPath+'/restore',{commandId:createUlid(),version:restored.version,restoreVersion:1},403)
  assert.equal((await request(people.owner,itemPath)).name,input.name)
  const deleted=await request(people.owner,itemPath+'/delete',{commandId:createUlid(),version:restored.version});assert.equal(deleted.deletedId,published.id)
  await request(people.editor,itemPath,undefined,404);await request(people.editor,itemPath+'/trash-restore',{commandId:createUlid(),version:restored.version+1},403)
  const trashed=(await request(people.owner,interfacesPath+'?state=deleted')).items.find(item=>item.id===published.id);assert.equal(trashed.version,4)
  const viewRef={appId,entityId:'00000000000000000000000002',recordId:view.id}
  await request(people.owner,'/api/v1/commands/view.delete',command({viewId:view.id},[{ref:viewRef,version:view.version}]))
  await request(people.owner,itemPath+'/trash-restore',{commandId:createUlid(),version:trashed.version},400)
  assert.equal((await request(people.owner,interfacesPath+'?state=deleted')).items.find(item=>item.id===published.id).version,trashed.version)
  await request(people.owner,'/api/v1/commands/view.restore',command({viewId:view.id},[{ref:viewRef,version:view.version+1}]))
  const recovered=await request(people.owner,itemPath+'/trash-restore',{commandId:createUlid(),version:trashed.version});assert.equal(recovered.version,5);assert.deepEqual(recovered.pages,input.pages)
  const retained=await request(people.owner,interfacesPath+'/publish',{commandId:createUlid(),definition:{...input,name:'synthetic-cradle-unexpired'}})
  await request(people.owner,itemPath+'/delete',{commandId:createUlid(),version:recovered.version})
  const runtime=await h.runtime();await interfaceTrashPurge(h.db,runtime.admission,()=>new Date(Date.now()+31*86400000))()
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_interfaces WHERE id=?').bind(published.id).first()).n,0);assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_interface_versions WHERE interface_id=?').bind(published.id).first()).n,0)
  await request(people.owner,itemPath+'/trash-restore',{commandId:createUlid(),version:recovered.version+1},404)
  assert.equal((await request(people.owner,`/api/v1/interfaces/${retained.id}`)).name,'synthetic-cradle-unexpired')
  await request(people.owner,interfacesPath+'/publish',publication,404)
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_interfaces WHERE id=?').bind(published.id).first()).n,0)
  const auditResponse=await adminAuditResponse(new Request(`${origin}/api/v1/admin/audit?base=${appId}`,{headers:{host:new URL(origin).host,cookie:people.owner.cookie}}),h.db,{authenticate});assert.equal(auditResponse.status,200)
  const audits=(await auditResponse.json()).data.items.filter(item=>item.eventId===publication.commandId);assert.equal(audits.length,1);assert.equal(audits[0].action,'interface.publish');assert.equal(audits[0].personId,people.creator.id)
 }finally{h.close()}
}
