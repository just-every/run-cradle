import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {adminAuditResponse} from '../../src/domains/admission/admin-audit.server.ts'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {harness,add} from './records-manual-harness.mjs'

/** Native sessions exercise additive authoring and its unsafe paths through HTTP. */
export async function creatorAdditiveJourney(){
 const h=await harness()
 try{
  const name=newField('Order'),single=newField('Stage','select'),multiple=newField('Tags','multi_select')
  single.options=[{id:createUlid(),label:'Ready'},{id:createUlid(),label:'Shipped'}]
  multiple.options=[{id:createUlid(),label:'Stock'},{id:createUlid(),label:'Delivery'}]
  const appId=createUlid(),entityId=createUlid(),draft={appId,name:'synthetic-cradle-creator',tables:[{id:entityId,label:'Orders',primaryFieldId:name.id,fields:[name,single,multiple]}]}
  let {r}=await h.create(draft)
  const schema=r.registry.get(appId,entityId).schema,original=await add(h,r,schema,{[name.id]:'synthetic-cradle-1',[single.id]:single.options[0].id,[multiple.id]:multiple.options.map(option=>option.id)})
  const people={owner:{id:h.owner},creator:{id:createUlid()},editor:{id:createUlid()}},now=Date.now()
  for(const [role,person]of Object.entries(people))if(role!=='owner'){
   await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(person.id,`synthetic-cradle-${role}`,[`synthetic-cradle-${role}`,'example.test'].join('@'),now,now).run()
   await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',0,?,?)").bind(person.id,person.id,now,now).run()
  }
  const origin='http://127.0.0.1:4189',auth=await createFixtureAuth(h.db,{appOrigin:origin,sessionSecret:'synthetic-cradle-session-secret-at-least-32-characters',mode:'development'},h.owner)
  for(const person of Object.values(people)){const {cookie,csrf}=await auth.signIn(person.id);Object.assign(person,{cookie,csrf})}
  const authenticate=async(request,ingress,requestId)=>{const session=request.method==='GET'?await auth.current(request):await auth.requireCsrf(request);assert.ok(session);return {principal:session.principal,now:new Date().toISOString(),requestId,ingress}}
  async function request(person,path,input,status=200){
   const runtime=await h.runtime(),headers={host:new URL(origin).host,cookie:person.cookie,origin,'content-type':'application/json',...(input===undefined?{}:{'x-csrf-token':person.csrf})},req=new Request(origin+path,{method:input===undefined?'GET':'POST',headers,...(input===undefined?{}:{body:JSON.stringify(input)})})
   const http=path.includes('/records/schema-preview')||path.includes('/records/bases/')||path.endsWith('/release.adopt')?manualSchemaHttp(runtime.manual,{},authenticate):path.includes('/commands/')?createCommandHttp({...runtime,authenticate}):createRecordHttp({...runtime.services,authenticate})
   const response=await http.fetch(req),body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error
  }
  const edit=()=>request(people.creator,`/api/v1/records/bases/${appId}`),base=`/api/v1/apps/${appId}/entities/${entityId}`
  const adopt=(preview,commandId=createUlid())=>({commandId,expected:[],input:{kind:'manual_schema',previewId:preview.id}})
  for(const role of ['creator','editor'])await request(people.owner,`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:people[role].id,role,destructive:false,version:0})
  const savedView=(await request(people.editor,'/api/v1/commands/view.save',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{view:{appId,entityId,name:'synthetic-cradle-filtered',display:'grid',fields:[name.id,single.id,multiple.id],filter:{kind:'condition',fieldId:single.id,op:'eq',value:single.options[0].id},sort:[],groupBy:[single.id],layout:{titleFieldId:name.id},visibility:'app',shipped:false}}})).value
  const before=await edit(),next=structuredClone(before),select=next.tables[0].fields.find(field=>field.id===single.id),multi=next.tables[0].fields.find(field=>field.id===multiple.id)
  select.options.push({id:createUlid(),label:'Backordered'});multi.options.push({id:createUlid(),label:'Priority'})
  const help='Use the supplier reference.\n<strong>Plain text only</strong> & no automatic changes.'
  next.tables[0].fields.find(field=>field.id===name.id).help=help
  const preview=await request(people.creator,'/api/v1/records/schema-preview',next),impact=preview.impacts.find(item=>item.entityId===entityId)
  assert.equal(preview.requiresOwnerReview,false);assert.equal(impact.count,1);assert.deepEqual(impact.recordIds,[original.id]);assert.deepEqual(impact.conversions,[]);assert.deepEqual(impact.refusals,[])
  assert.ok(impact.changes.some(change=>change.includes('Backordered')&&change.includes('stored values stay unchanged')))
  assert.ok(impact.changes.some(change=>change.includes('Priority')&&change.includes('stored values stay unchanged')))
  assert.ok(impact.changes.some(change=>change.includes('Help for Order')&&change.includes(JSON.stringify(help))))
  assert.deepEqual(await edit(),before,'Preview leaves the live schema unchanged')
  await request(people.editor,'/api/v1/records/schema-preview',next,403)
  await request(people.editor,'/api/v1/commands/release.adopt',adopt(preview),404)
  const command=adopt(preview),adopted=await request(people.creator,'/api/v1/commands/release.adopt',command)
  assert.equal(adopted.state,'committed');assert.deepEqual(await request(people.creator,'/api/v1/commands/release.adopt',command),adopted)
  const live=await request(people.editor,base)
  assert.deepEqual(live.fields.find(field=>field.id===single.id).options,select.options)
  assert.deepEqual(live.fields.find(field=>field.id===multiple.id).options,multi.options)
  assert.equal(live.fields.find(field=>field.id===name.id).help,help)
  const retainedView=await request(people.editor,`/api/v1/views/${savedView.id}`);assert.equal(retainedView.id,savedView.id);assert.deepEqual(retainedView.filter,savedView.filter);assert.deepEqual(retainedView.groupBy,savedView.groupBy)
  const retained=(await request(people.editor,base+'/query',{})).items.find(row=>row.id===original.id)
  assert.equal(retained.version,original.version);assert.equal(retained.fields[single.id].value,single.options[0].id);assert.deepEqual(retained.fields[multiple.id].value,multiple.options.map(option=>option.id));assert.equal(retained.fields[name.id].value,'synthetic-cradle-1')
  const created=await request(people.editor,'/api/v1/commands/record.create',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:live.version}],input:{appId,entityId,values:{[name.id]:'synthetic-cradle-2',[single.id]:select.options.at(-1).id,[multiple.id]:[multi.options[0].id,multi.options.at(-1).id]}}})
  assert.equal(created.value.fields[single.id].value,select.options.at(-1).id);assert.deepEqual(created.value.fields[multiple.id].value,[multi.options[0].id,multi.options.at(-1).id])
  const filtered=await request(people.editor,`/api/v1/views/${savedView.id}/query`,{});assert.deepEqual(filtered.records.items.map(record=>record.id),[original.id]);assert.equal(filtered.records.items[0].fields[single.id].value,single.options[0].id)
  const viewDefinition=value=>{const {id,version,createdAt,updatedAt,access,...definition}=value;return definition}
  const viewCommand=(value,changes)=>({commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000002',recordId:value.id},version:value.version}],input:{id:value.id,view:{...viewDefinition(value),...changes}}})
  const peerView=(await request(people.editor,'/api/v1/commands/view.save',{commandId:createUlid(),expected:[],input:{view:{...viewDefinition(savedView),name:'synthetic-cradle-second',position:20}}})).value
  const ordered=(await request(people.editor,'/api/v1/commands/view.save',viewCommand(savedView,{position:30}))).value
  assert.deepEqual((await request(people.editor,`/api/v1/apps/${appId}/views`)).items.map(view=>view.id),[peerView.id,savedView.id])
  await request(people.editor,'/api/v1/commands/view.save',viewCommand(ordered,{position:10}))
  const orderedPage=await request(people.editor,`/api/v1/apps/${appId}/views?limit=1`)
  assert.deepEqual(orderedPage.items.map(view=>view.id),[savedView.id]);assert.ok(orderedPage.nextCursor)
  assert.deepEqual((await request(people.editor,`/api/v1/apps/${appId}/views?limit=1&cursor=${encodeURIComponent(orderedPage.nextCursor)}`)).items.map(view=>view.id),[peerView.id])
  const viewHistory=await request(people.editor,`/api/v1/views/${savedView.id}/history`)
  assert.equal(viewHistory.items.filter(item=>item.action==='view.save').length,3)
  assert.deepEqual((await request(people.editor,`/api/v1/views/${savedView.id}`)).filter,savedView.filter)
  const auditResponse=await adminAuditResponse(new Request(`${origin}/api/v1/admin/audit?base=${appId}`,{headers:{host:new URL(origin).host,cookie:people.owner.cookie}}),h.db,{authenticate})
  assert.equal(auditResponse.status,200)
  const audits=(await auditResponse.json()).data.items.filter(item=>item.eventId===command.commandId)
  assert.equal(audits.length,1);assert.equal(audits[0].action,'release.adopt');assert.equal(audits[0].personId,people.creator.id)
  const recordSnapshot=async()=>{const {evaluatedAt,...result}=await request(people.editor,base+'/query',{});return result}
  const stable=await edit(),recordState=await recordSnapshot()
  for(const type of ['remove','relabel'])for(const id of [single.id,multiple.id]){
   const destructive=structuredClone(stable),field=destructive.tables[0].fields.find(item=>item.id===id)
   if(type==='remove')field.options.splice(0,1);else field.options[0].label+=' changed'
   const refused=await request(people.creator,'/api/v1/records/schema-preview',destructive)
   assert.ok(refused.impacts[0].refusals.some(message=>message.includes('option migration')))
   await request(people.creator,'/api/v1/commands/release.adopt',adopt(refused),400)
   assert.deepEqual(await edit(),stable);assert.deepEqual(await recordSnapshot(),recordState)
  }
  for(const invalidHelp of ['x'.repeat(2001),'Do not store\u0000control characters']){
   const invalid=structuredClone(stable);invalid.tables[0].fields.find(field=>field.id===name.id).help=invalidHelp
   await request(people.creator,'/api/v1/records/schema-preview',invalid,400);assert.deepEqual(await edit(),stable)
  }
  const pending=structuredClone(stable);pending.tables[0].fields.find(field=>field.id===name.id).help='A revised plain-text guide.';pending.tables[0].fields.find(field=>field.id===single.id).options.push({id:createUlid(),label:'Cancelled'})
  const retainedPreview=await request(people.creator,'/api/v1/records/schema-preview',pending)
  await request(people.owner,`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:people.creator.id,role:'editor',destructive:false,version:1})
  await request(people.creator,'/api/v1/commands/release.adopt',adopt(retainedPreview),403)
  const afterDemotion=await request(people.editor,base);assert.deepEqual(afterDemotion,live);assert.deepEqual(await recordSnapshot(),recordState)
  assert.equal((await h.db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first()).owner_id,h.owner)
 }finally{h.close()}
}
