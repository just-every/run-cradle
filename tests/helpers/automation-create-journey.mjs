import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {RECORD_SCHEMA_ENTITY_ID} from '../../src/domains/records/contracts.ts'

/** Native approval, record commands, queue delivery and test doors share one create effect. */
export async function automationCreateJourney(h){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),quantityId=createUlid(),approvedId=createUlid(),dayId=createUlid(),choiceId=createUlid(),memoId=createUlid(),defaultId=createUlid(),readyId=createUlid()
 const draft={appId,name:'synthetic-cradle-161 create action',tables:[{id:entityId,label:'Orders',primaryFieldId:nameId,fields:[
  {id:nameId,label:'Name',type:'text',required:true,unique:false},
  {id:quantityId,label:'Quantity',type:'number',required:true,unique:false},
  {id:approvedId,label:'Approved',type:'boolean',required:false,unique:false},
  {id:dayId,label:'Ship day',type:'date',required:false,unique:false},
  {id:choiceId,label:'Stage',type:'select',required:false,unique:false,options:[{id:readyId,label:'Ready'}]},
  {id:memoId,label:'Memo',type:'text',required:false,unique:false},
  {id:defaultId,label:'Source',type:'text',required:false,unique:false,defaultValue:'synthetic-cradle-162 default'},
 ]}]}
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items.find(row=>row.id===entityId)
 const schemaExpected={ref:{appId,entityId:RECORD_SCHEMA_ENTITY_ID,recordId:entityId},version:schema.version}
 const command=async(action,input,expected=[],commandId=createUlid(),status=200)=>(await h.request(`/api/v1/commands/${action}`,{method:'POST',status,body:{commandId,expected,input}})).data
 const create=name=>command('record.create',{appId,entityId,values:{[nameId]:name,[quantityId]:'1'}},[schemaExpected])
 const read=async id=>(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/records/${id}`)).data.record
 const query=async()=>(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/query`,{method:'POST',body:{limit:100}})).data.items
 const values={[nameId]:'synthetic-cradle-163 created',[quantityId]:'12.50',[approvedId]:true,[dayId]:'2026-11-03',[choiceId]:readyId,[memoId]:null}
 const normalized={...values,[quantityId]:'12.5',[defaultId]:'synthetic-cradle-162 default'}
 const action={kind:'create',values}
 const definition={name:'synthetic-cradle-164 general create',appId,entityId,event:'created',enabled:true,actions:[action]}
 const save=async(definition,status=201)=>(await h.request('/api/user-automations',{method:'POST',status,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition}})).data
 const disable=automation=>h.request(`/api/user-automations/${automation.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:automation.version}})
 const runs=async automation=>(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs
 const wait=async(automation,recordId,commandId)=>{
  let run
  for(let attempt=0;attempt<40;attempt++){
   await h.tick(commandId)
   run=(await runs(automation)).find(row=>row.recordId===recordId&&!row.testMode)
   if(run&&!['Queued','Running','Held'].includes(run.state))return run
   await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.fail(`Create action did not finish: ${run?.state??'missing'}`)
 }
 const expectedRecord=record=>{
  assert.equal(record.fields[nameId].value,'synthetic-cradle-163 created')
  assert.equal(record.fields[quantityId].value,'12.5')
  assert.equal(record.fields[approvedId].value,true)
  assert.equal(record.fields[dayId].value,'2026-11-03')
  assert.equal(record.fields[choiceId].value,readyId)
  assert.ok(record.fields[memoId].state==='empty'||record.fields[memoId].value===null)
  assert.equal(record.fields[defaultId].value,'synthetic-cradle-162 default')
 }
 // Configuration refuses nonliteral objects, native type errors and missing required values.
 for(const badValues of [{...values,[memoId]:{fieldId:nameId}},{...values,[quantityId]:'not a number'},{...values,[approvedId]:'true'},{...values,[dayId]:'2026-02-30'},{...values,[choiceId]:createUlid()},{[nameId]:'synthetic-cradle-165 missing quantity'}]){
  await save({...definition,actions:[{kind:'create',values:badValues}]},400)
 }
 await save({...definition,actions:[{kind:'create',values:{...values,[createUlid()]:'synthetic-cradle-166 unknown'}}]},403)
 assert.equal((await query()).length,0,'Refused create definitions have no record effects')
 const automation=(await save(definition)).result.value
 try{
  const approval=await h.db.prepare('SELECT d.grant_id,c.scopes_json FROM authority_delegations d JOIN record_automation_versions v ON v.principal_id=d.principal_id JOIN authority_credentials c ON c.id=v.credential_id WHERE v.automation_id=? AND v.definition_version=?').bind(automation.id,automation.definitionVersion).first()
  assert.ok(approval.grant_id,'Create requires an explicit durable write approval')
  const grant=JSON.parse((await h.db.prepare('SELECT spec_json FROM authority_grants WHERE id=?').bind(approval.grant_id).first()).spec_json)
  assert.deepEqual(grant.actions,['record.create'],'Create-only approval cannot patch or delete')
  assert.deepEqual(grant.scope,[{entityId}],'Approval names only the triggering table create scope')
  const credentialScope=JSON.parse(approval.scopes_json)
  assert.ok(credentialScope.some(scope=>scope.appId===appId&&scope.actions.includes('record.create')))
  const started=await create('synthetic-cradle-167 trigger')
  const run=await wait(automation,started.value.id,started.commandId)
  assert.equal(run.state,'Complete',JSON.stringify(run))
  assert.deepEqual(run.actions.map(row=>row.state),['Complete'])
  let rows=await query()
  assert.equal(rows.length,2,'One trigger creates one independent record')
  const created=rows.find(row=>row.id!==started.value.id)
  expectedRecord(created)
  assert.equal(created.version,1)
  const step=await h.db.prepare('SELECT id,idempotency_key,result_json FROM launch_automation_actions WHERE run_id=?').bind(run.id).first()
  assert.equal(step.id,step.idempotency_key)
  assert.deepEqual(JSON.parse(step.result_json),{commandId:step.idempotency_key,recordId:created.id})
  const admission=await h.db.prepare('SELECT action,state,result_json FROM command_admissions WHERE command_id=?').bind(step.idempotency_key).first()
  assert.equal(admission.action,'record.create');assert.equal(admission.state,'committed')
  assert.equal(JSON.parse(admission.result_json).value.id,created.id)
  const audit=(await h.db.prepare("SELECT subject_json FROM admission_audit WHERE command_id=? AND action='record.create'").bind(step.idempotency_key).all()).results
  assert.deepEqual(audit.map(row=>JSON.parse(row.subject_json)),[created.ref],'The retained step identity owns one native create audit')
  const captured=await h.db.prepare("SELECT cause_run_ids_json FROM record_automation_events WHERE command_id=? AND record_id=? AND event='created'").bind(step.idempotency_key,created.id).first()
  assert.ok(JSON.parse(captured.cause_run_ids_json).includes(run.id),'Native capture keeps the causal run identity')
  await h.tick(started.commandId);await h.tick(step.idempotency_key)
  let suppressed=(await runs(automation)).find(row=>row.recordId===created.id)
  assert.equal(suppressed?.state,'Suppressed','The created record cannot recursively execute its own creating automation')
  // A crash after the admission commits but before the action acknowledgement is durable.
  await h.db.prepare("UPDATE launch_automation_actions SET state='Running',result_json=NULL,started_at=? WHERE id=?").bind(Date.now()-61000,step.id).run()
  await h.db.prepare("UPDATE automation_runs SET state='Running',finished_at=NULL WHERE id=?").bind(run.id).run()
  await h.restart()
  assert.equal((await wait(automation,started.value.id,started.commandId)).state,'Complete')
  await h.tick(started.commandId);await h.tick(step.idempotency_key)
  rows=await query();assert.equal(rows.length,2,'Worker recovery and duplicate delivery never create a second effect')
  expectedRecord(rows.find(row=>row.id===created.id))
  const recovered=await h.db.prepare('SELECT result_json FROM launch_automation_actions WHERE id=?').bind(step.id).first()
  assert.equal(JSON.parse(recovered.result_json).recordId,created.id,'Recovered history identifies the already committed record')
  const testRoute=`/api/user-automations/${automation.id}/test`,testInput={commandId:createUlid(),recordId:started.value.id,event:'created'}
  const dry=(await h.request(testRoute,{method:'POST',body:testInput})).data
  assert.equal(dry.mode,'dry');assert.equal(dry.state,'Complete')
  assert.deepEqual(dry.steps[0].input.action,action)
  assert.deepEqual(dry.steps[0].output,{appId,entityId,values:normalized,created:false})
  assert.deepEqual(dry.confirmationEffects,[{position:0,kind:'create',destination:entityId}])
  assert.equal((await query()).length,2,'Dry create testing previews the new values without writing')
  await h.request(testRoute,{method:'POST',status:409,body:{...testInput,commandId:createUlid(),live:{previewId:dry.id,effects:[]}}})
  assert.equal((await query()).length,2,'An unconfirmed live create has no effect')
  const liveInput={...testInput,commandId:createUlid(),live:{previewId:dry.id,effects:dry.confirmationEffects}}
  const live=(await h.request(testRoute,{method:'POST',body:liveInput})).data
  assert.equal(live.mode,'live');assert.equal(live.state,'Complete')
  assert.deepEqual(live.steps[0].output.preview,dry.steps[0].output)
  const liveRecordId=live.steps[0].output.result.recordId
  assert.ok(liveRecordId&&liveRecordId!==created.id&&liveRecordId!==started.value.id)
  expectedRecord(await read(liveRecordId))
  const replay=(await h.request(testRoute,{method:'POST',body:liveInput})).data
  assert.equal(replay.steps[0].output.result.recordId,liveRecordId)
  await h.tick(live.steps[0].output.result.commandId)
  assert.equal((await query()).length,3,'Confirmed live test and its replay commit exactly one created record')
  suppressed=(await runs(automation)).find(row=>row.recordId===liveRecordId&&!row.testMode)
  assert.equal(suppressed?.state,'Suppressed','A live-test create retains loop suppression')
 }finally{await disable(automation)}
 // Durable current authority fixtures are changed before a native triggering patch.
 const probe=(await create('synthetic-cradle-168 authority probe')).value
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId,h.operator).first()
 const originalRules=JSON.parse(policy.rules_json)
 const updatedDefinition={...definition,event:'updated'}
 const patch=async label=>{const current=await read(probe.id);return command('record.patch',{ref:current.ref,changes:{[nameId]:label}},[{ref:current.ref,version:current.version}])}
 for(const lost of ['create','field','approval']){
  const removeAuthority=rules=>rules.map(rule=>rule.entityId!==entityId?rule:lost==='create'?{...rule,actions:rule.actions.filter(action=>action!=='record.create')}:{...rule,writableFields:rule.writableFields.filter(id=>id!==quantityId)})
  if(lost!=='approval'){
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(removeAuthority(originalRules)),policy.id).run()
   try{await save(updatedDefinition,403)}finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()}
  }
  const approved=(await save({...updatedDefinition,name:`synthetic-cradle-169 lost ${lost}`})).result.value
  try{
   if(lost==='approval'){
    const credential=await h.db.prepare('SELECT credential_id FROM record_automation_versions WHERE automation_id=? AND definition_version=?').bind(approved.id,approved.definitionVersion).first()
    await h.db.prepare('UPDATE authority_credentials SET revoked_at=? WHERE id=?').bind(Date.now(),credential.credential_id).run()
   }else{
    const delegate=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id JOIN record_automation_versions v ON v.principal_id=m.principal_id WHERE v.automation_id=? AND v.definition_version=?').bind(approved.id,approved.definitionVersion).first()
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(removeAuthority(JSON.parse(delegate.rules_json))),delegate.id).run()
   }
   const before=(await query()).map(row=>row.id).sort()
   const triggered=await patch(`synthetic-cradle-170 refused ${lost}`)
   const refused=await wait(approved,probe.id,triggered.commandId)
   assert.equal(refused.state,'Cancelled',`${lost} authority loss fences the retained create approval`)
   assert.deepEqual((await query()).map(row=>row.id).sort(),before,`${lost} authority loss creates no record`)
   await h.restart();await h.tick(triggered.commandId)
   assert.deepEqual((await query()).map(row=>row.id).sort(),before,`${lost} refusal survives Worker restart and duplicate delivery`)
  }finally{await disable(approved)}
 }
 console.log('General create action: native typed values, retained approval and effect identity, recovery, dry and live tests, causal suppression and authority refusal passed')
}
