import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {RECORD_SCHEMA_ENTITY_ID} from '../../src/domains/records/contracts.ts'

/** All creation, template authoring, approvals and effects enter through native HTTP. */
export async function recordTemplateAutomation(h){
 for(const childCount of [1,3])await linkedTemplateAutomation(h,childCount)
}

async function linkedTemplateAutomation(h,childCount){
 const appId=createUlid(),triggerId=createUlid(),parentId=createUlid(),childId=createUlid(),supplierId=createUlid(),supplierName=createUlid(),supplierFieldId=createUlid()
 const triggerName=createUlid(),parentName=createUlid(),childName=createUlid(),parentFieldId=createUlid(),statusId=createUlid()
 const field=(id,label)=>({id,label,type:'text',required:true,unique:false})
 const draft={appId,name:'synthetic-cradle-131 templates',tables:[
  {id:triggerId,label:'Requests',primaryFieldId:triggerName,fields:[field(triggerName,'Name')]},
  {id:supplierId,label:'Suppliers',primaryFieldId:supplierName,fields:[field(supplierName,'Name')]},
  {id:parentId,label:'Orders',primaryFieldId:parentName,fields:[field(parentName,'Name'),{id:supplierFieldId,label:'Supplier',type:'relation',required:false,unique:false,relation:{ownerAppId:appId,entityId:supplierId,cardinality:'one',onDelete:'restrict'}}]},
  {id:childId,label:'Lines',primaryFieldId:childName,fields:[field(childName,'Name'),{id:statusId,label:'Status',type:'text',required:false,unique:false},{id:parentFieldId,label:'Order',type:'relation',required:true,unique:false,relation:{ownerAppId:appId,entityId:parentId,cardinality:'one',onDelete:'restrict'}}]},
 ]}
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 const schemas=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items
 const schemaExpected=entityId=>({ref:{appId,entityId:RECORD_SCHEMA_ENTITY_ID,recordId:entityId},version:schemas.find(table=>table.id===entityId).version})
 const command=async(action,input,expected=[],commandId=createUlid(),status=200)=>(await h.request(`/api/v1/commands/${action}`,{method:'POST',status,body:{commandId,expected,input}})).data
 const create=async(entityId,values)=>command('record.create',{appId,entityId,values},[schemaExpected(entityId)])
 const query=async(entityId)=>(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/query`,{method:'POST',body:{limit:100}})).data.items
 const supplier=(await create(supplierId,{[supplierName]:'synthetic-cradle-140 supplier'})).value
 const parent=(await create(parentId,{[parentName]:'synthetic-cradle-132 order',[supplierFieldId]:supplier.ref})).value
 for(let index=0;index<childCount;index++)await create(childId,{[childName]:`synthetic-cradle-133 line ${index}`,[parentFieldId]:parent.ref})
 const template=(await command('record.template-save',{ref:parent.ref,name:'synthetic-cradle-134 order template',includeLinks:true,includeAttachments:false,includeChildren:true},[schemaExpected(parentId),{ref:parent.ref,version:parent.version}])).value
 assert.equal(template.children.length,childCount);assert.deepEqual(template.values[supplierFieldId],supplier.ref)
 const action={kind:'apply_record_template',entityId:parentId,templateId:template.id}
 const save=async(entityId,actions,extra={})=>(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-135 create order',appId,entityId,event:'created',enabled:true,actions,...extra}}})).data.result.value
 const disable=automation=>h.request(`/api/user-automations/${automation.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:automation.version}})
 const wait=async(automation,recordId,commandId)=>{
  let run
  for(let attempt=0;attempt<30;attempt++){
   await h.tick(commandId)
   run=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.find(row=>row.recordId===recordId&&!row.testMode)
   if(run&&!['Queued','Running','Held'].includes(run.state))return run
   await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.fail(`Template automation did not finish: ${run?.state??'missing'}`)
 }
 const watcher=await save(childId,[{kind:'update',fieldId:statusId,value:'created by template'}])
 const automation=await save(triggerId,[action])
 try{
  const started=await create(triggerId,{[triggerName]:'synthetic-cradle-136 request'})
  const run=await wait(automation,started.value.id,started.commandId)
  assert.equal(run.state,'Complete',JSON.stringify(run))
  await h.tick(started.commandId);await h.tick(started.commandId)
  const parents=await query(parentId),children=await query(childId)
  assert.equal(parents.length,2,'Repeated queue delivery creates one parent')
  assert.equal(children.length,2*childCount,'Repeated queue delivery creates each child once')
  const copiedParent=parents.find(row=>row.id!==parent.id),copiedChild=children.find(row=>!template.children.some(child=>child.sourceRef.recordId===row.id))
  assert.deepEqual(copiedParent.fields[supplierFieldId].value,supplier.ref,'The automation retains the preset supplier link')
  const copiedChildren=children.filter(row=>row.fields[parentFieldId].value.recordId===copiedParent.id)
  assert.equal(copiedChildren.length,childCount)
  for(const child of copiedChildren)assert.deepEqual(child.fields[parentFieldId].value,copiedParent.ref)
  assert.deepEqual(copiedChild.fields[parentFieldId].value,copiedParent.ref)
  const childCommand=(await h.db.prepare('SELECT command_id FROM record_automation_events WHERE record_id=?').bind(copiedChild.id).first()).command_id
  const childRun=await wait(watcher,copiedChild.id,childCommand)
  assert.equal(childRun.state,'Complete','Template child insertion fires the ordinary created-record automation')
  const step=await h.db.prepare('SELECT idempotency_key FROM launch_automation_actions WHERE run_id=?').bind(run.id).first()
  const facts=(await h.db.prepare("SELECT subject_json FROM admission_audit WHERE command_id=? AND action='record.create'").bind(step.idempotency_key).all()).results.map(row=>JSON.parse(row.subject_json))
  assert.deepEqual(facts.map(ref=>ref.recordId).sort(),[copiedParent.id,...copiedChildren.map(child=>child.id)].sort(),'Parent and linked child share one audited command')
  const captured=(await h.db.prepare('SELECT cause_run_ids_json FROM record_automation_events WHERE command_id=?').bind(step.idempotency_key).all()).results
  assert.ok(captured.some(event=>JSON.parse(event.cause_run_ids_json).includes(run.id)),'Native child capture retains the causal run')
  const testRoute=`/api/user-automations/${automation.id}/test`,testInput={commandId:createUlid(),recordId:started.value.id,event:'created'}
  const dry=(await h.request(testRoute,{method:'POST',body:testInput})).data
  assert.equal(dry.state,'Complete');assert.equal(dry.steps[0].output.childCount,childCount)
  assert.equal((await query(parentId)).length,2,'A builder preview creates no records')
  assert.equal((await query(childId)).length,2*childCount)
  const liveInput={...testInput,commandId:createUlid(),live:{previewId:dry.id,effects:dry.confirmationEffects}}
  const live=(await h.request(testRoute,{method:'POST',body:liveInput})).data
  assert.equal(live.state,'Complete');await h.request(testRoute,{method:'POST',body:liveInput})
  assert.equal((await query(parentId)).length,3,'Replaying a confirmed live test creates no additional parent')
  assert.equal((await query(childId)).length,3*childCount)
  console.log(`Template automation with supplier and ${childCount} children: Complete; linked parent and children share one audited write`)
  // Credential revocation is durable authority fixture state, never an injected principal.
  const credential=await h.db.prepare('SELECT credential_id FROM record_automation_versions WHERE automation_id=? AND definition_version=?').bind(automation.id,automation.definitionVersion).first()
  await h.db.prepare('UPDATE authority_credentials SET revoked_at=? WHERE id=?').bind(Date.now(),credential.credential_id).run()
  const revoked=await create(triggerId,{[triggerName]:'synthetic-cradle-137 revoked'})
  assert.equal((await wait(automation,revoked.value.id,revoked.commandId)).state,'Cancelled')
  assert.equal((await query(parentId)).length,3);assert.equal((await query(childId)).length,3*childCount)
 }finally{await disable(automation);await disable(watcher)}
 // A current child-table create denial refuses the approval before any effect.
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId,h.operator).first()
 const rules=JSON.parse(policy.rules_json).map(rule=>rule.entityId===childId?{...rule,actions:rule.actions.filter(action=>action!=='record.create')}:rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
 try{
  await h.request('/api/user-automations',{method:'POST',status:403,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-138 forbidden child',appId,entityId:triggerId,event:'created',enabled:true,actions:[action]}}})
  assert.equal((await query(parentId)).length,3);assert.equal((await query(childId)).length,3*childCount)
 }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()}
 const duplicateWatcher=await save(parentId,[{kind:'update',fieldId:parentName,value:'synthetic-cradle-139 duplicate triggered'}])
 try{
  const duplicate=await command('record.duplicate',{ref:parent.ref,includeLinks:false,includeAttachments:false},[schemaExpected(parentId),{ref:parent.ref,version:parent.version}])
  assert.equal((await wait(duplicateWatcher,duplicate.value.id,duplicate.commandId)).state,'Complete')
  const copied=(await query(parentId)).find(row=>row.id===duplicate.value.id)
  assert.equal(copied.fields[parentName].value,'synthetic-cradle-139 duplicate triggered','Duplication fires the ordinary new-record automation')
 }finally{await disable(duplicateWatcher)}
}
