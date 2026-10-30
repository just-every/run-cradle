import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {RECORD_SCHEMA_ENTITY_ID} from '../../src/domains/records/contracts.ts'

/** An explicitly selected table has its own schema, approval and native effect. */
export async function automationCreateTargetJourney(h){
 const appId=createUlid(),requestId=createUlid(),requestName=createUlid(),targetId=createUlid(),targetName=createUlid(),quantityId=createUlid(),activeId=createUlid()
 const draft={appId,name:'synthetic-cradle-171 routed creation',tables:[
  {id:requestId,label:'Requests',primaryFieldId:requestName,fields:[{id:requestName,label:'Request',type:'text',required:true,unique:false}]},
  {id:targetId,label:'Fulfilments',primaryFieldId:targetName,fields:[
   {id:targetName,label:'Fulfilment',type:'text',required:true,unique:false},
   {id:quantityId,label:'Quantity',type:'number',required:true,unique:false},
   {id:activeId,label:'Active',type:'boolean',required:false,unique:false,defaultValue:true},
  ]},
 ]}
 const command=async(action,input,expected=[],commandId=createUlid())=>(await h.request(`/api/v1/commands/${action}`,{method:'POST',body:{commandId,expected,input}})).data
 const adopt=async draft=>{const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data;return command('release.adopt',{kind:'manual_schema',previewId:preview.id})}
 await adopt(draft)
 const query=async entityId=>(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/query`,{method:'POST',body:{limit:100}})).data.items
 const create=async name=>{
  const schema=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items.find(row=>row.id===requestId)
  return command('record.create',{appId,entityId:requestId,values:{[requestName]:name}},[{ref:{appId,entityId:RECORD_SCHEMA_ENTITY_ID,recordId:requestId},version:schema.version}])
 }
 const action={kind:'create',entityId:targetId,values:{[targetName]:'synthetic-cradle-172 fulfilment',[quantityId]:'3.50'}}
 const definition={name:'synthetic-cradle-173 create fulfilment',appId,entityId:requestId,event:'created',enabled:true,actions:[action]}
 const save=async(definition,status=201)=>(await h.request('/api/user-automations',{method:'POST',status,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition}})).data?.result?.value
 const disable=automation=>h.request(`/api/user-automations/${automation.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:automation.version}})
 const wait=async(automation,recordId,commandId)=>{
  let run
  for(let attempt=0;attempt<40;attempt++){
   await h.tick(commandId)
   run=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.find(row=>row.recordId===recordId&&!row.testMode)
   if(run&&!['Queued','Running','Held'].includes(run.state))return run
   await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.fail(`Target-table creation did not finish: ${run?.state??'missing'}`)
 }
 const assertTarget=row=>{
  assert.equal(row.ref.entityId,targetId)
  assert.equal(row.fields[targetName].value,'synthetic-cradle-172 fulfilment')
  assert.equal(row.fields[quantityId].value,'3.5')
  assert.equal(row.fields[activeId].value,true)
  assert.equal(row.version,1)
 }
 await save({...definition,actions:[{...action,values:{...action.values,[requestName]:'wrong table'}}]},403)
 const watcher=await save({...definition,name:'synthetic-cradle-179 return acknowledgement',entityId:targetId,actions:[{kind:'create',entityId:requestId,values:{[requestName]:'synthetic-cradle-180 acknowledgement'}}]})
 const automation=await save(definition)
 let watcherDisabled=false
 try{
  const delegate=await h.db.prepare('SELECT d.grant_id,p.rules_json FROM authority_delegations d JOIN authority_memberships m ON m.principal_id=d.principal_id JOIN authority_policies p ON p.id=m.policy_id WHERE d.automation_id=?').bind(automation.id).first()
  const grant=JSON.parse((await h.db.prepare('SELECT spec_json FROM authority_grants WHERE id=?').bind(delegate.grant_id).first()).spec_json)
  assert.deepEqual(grant.actions,['record.create'])
  assert.deepEqual(grant.scope,[{entityId:targetId}],'Only the selected target table receives create authority')
  const rules=JSON.parse(delegate.rules_json)
  assert.ok(rules.some(rule=>rule.entityId===requestId&&rule.actions.includes('record.read')))
  assert.ok(rules.filter(rule=>rule.entityId===requestId).every(rule=>!rule.actions.includes('record.create')&&!rule.actions.includes('record.patch')),'The triggering table is read-only for this approval')
  const started=await create('synthetic-cradle-174 request'),run=await wait(automation,started.value.id,started.commandId)
  assert.equal(run.state,'Complete',JSON.stringify(run))
  const rows=await query(targetId);assert.equal(rows.length,1);assertTarget(rows[0])
  const step=await h.db.prepare('SELECT id,idempotency_key,result_json FROM launch_automation_actions WHERE run_id=?').bind(run.id).first()
  assert.equal(step.id,step.idempotency_key)
  assert.deepEqual(JSON.parse(step.result_json),{commandId:step.idempotency_key,recordId:rows[0].id})
  const audits=(await h.db.prepare("SELECT subject_json FROM admission_audit WHERE command_id=? AND action='record.create'").bind(step.idempotency_key).all()).results
  assert.deepEqual(audits.map(row=>JSON.parse(row.subject_json)),[rows[0].ref])
  const capture=await h.db.prepare("SELECT cause_run_ids_json FROM record_automation_events WHERE command_id=? AND record_id=? AND event='created'").bind(step.idempotency_key,rows[0].id).first()
  assert.ok(JSON.parse(capture.cause_run_ids_json).includes(run.id))
  assert.equal((await wait(watcher,rows[0].id,step.idempotency_key)).state,'Complete','The ordinary target-table create triggers its own approved automation')
  const sourceRows=await query(requestId);assert.equal(sourceRows.length,2)
  const acknowledgement=sourceRows.find(row=>row.id!==started.value.id)
  assert.equal(acknowledgement.fields[requestName].value,'synthetic-cradle-180 acknowledgement')
  const acknowledgementEvent=await h.db.prepare("SELECT command_id FROM record_automation_events WHERE record_id=? AND event='created'").bind(acknowledgement.id).first()
  await h.tick(acknowledgementEvent.command_id)
  const loop=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.find(row=>row.recordId===acknowledgement.id&&!row.testMode)
  assert.equal(loop?.state,'Suppressed','A cycle across two tables cannot recursively repeat the first automation')
  await disable(watcher);watcherDisabled=true
  await h.db.prepare("UPDATE launch_automation_actions SET state='Running',result_json=NULL,started_at=? WHERE id=?").bind(Date.now()-61000,step.id).run()
  await h.db.prepare("UPDATE automation_runs SET state='Running',finished_at=NULL WHERE id=?").bind(run.id).run()
  await h.restart();assert.equal((await wait(automation,started.value.id,started.commandId)).state,'Complete')
  await h.tick(started.commandId);await h.tick(step.idempotency_key)
  assert.equal((await query(targetId)).length,1);assertTarget((await query(targetId))[0])
  const route=`/api/user-automations/${automation.id}/test`,input={commandId:createUlid(),recordId:started.value.id,event:'created'}
  const dry=(await h.request(route,{method:'POST',body:input})).data
  assert.equal(dry.state,'Complete')
  assert.deepEqual(dry.confirmationEffects,[{position:0,kind:'create',destination:targetId}])
  assert.deepEqual(dry.steps[0].output,{appId,entityId:targetId,values:{...action.values,[quantityId]:'3.5',[activeId]:true},created:false,entityLabel:'Fulfilments',fields:[{id:targetName,label:'Fulfilment'},{id:quantityId,label:'Quantity'},{id:activeId,label:'Active'}]})
  assert.equal((await query(targetId)).length,1,'A target-table dry test creates nothing')
  await h.request(route,{method:'POST',status:409,body:{...input,commandId:createUlid(),live:{previewId:dry.id,effects:[{position:0,kind:'create',destination:requestId}]}}})
  assert.equal((await query(targetId)).length,1,'Confirming the wrong table grants no live effect')
  const liveInput={...input,commandId:createUlid(),live:{previewId:dry.id,effects:dry.confirmationEffects}}
  const live=(await h.request(route,{method:'POST',body:liveInput})).data
  assert.equal(live.state,'Complete');assert.deepEqual(live.steps[0].output.preview,dry.steps[0].output)
  await h.request(route,{method:'POST',body:liveInput})
  const liveRows=await query(targetId);assert.equal(liveRows.length,2);for(const row of liveRows)assertTarget(row)
  assert.ok(liveRows.some(row=>row.id===live.steps[0].output.result.recordId))
  const currentPolicy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId,h.operator).first()
  const narrowed=JSON.parse(currentPolicy.rules_json).map(rule=>rule.entityId===targetId?{...rule,readableFields:rule.readableFields.filter(field=>field!==quantityId)}:rule)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrowed),currentPolicy.id).run()
  try{
   await h.request(route,{method:'POST',status:403,body:input})
   await h.request(route,{method:'POST',status:403,body:liveInput})
  }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(currentPolicy.rules_json,currentPolicy.id).run()}
  assert.equal((await query(targetId)).length,2,'Refused private-result replay never repeats a create effect')
 }finally{await disable(automation);if(!watcherDisabled)await disable(watcher)}
 const ownerPolicy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId,h.operator).first()
 for(const lost of ['create','field','approval']){
  const approved=await save({...definition,name:`synthetic-cradle-175 target lost ${lost}`})
  try{
   const delegate=await h.db.prepare('SELECT v.credential_id,p.id,p.rules_json FROM record_automation_versions v JOIN authority_memberships m ON m.principal_id=v.principal_id JOIN authority_policies p ON p.id=m.policy_id WHERE v.automation_id=? AND v.definition_version=?').bind(approved.id,approved.definitionVersion).first()
   if(lost==='approval')await h.db.prepare('UPDATE authority_credentials SET revoked_at=? WHERE id=?').bind(Date.now(),delegate.credential_id).run()
   else{
    const remove=rules=>JSON.parse(rules).map(rule=>rule.entityId!==targetId?rule:lost==='create'?{...rule,actions:rule.actions.filter(action=>action!=='record.create')}:{...rule,writableFields:rule.writableFields.filter(field=>field!==quantityId)})
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(remove(ownerPolicy.rules_json)),ownerPolicy.id).run()
    try{await save(definition,403)}finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(ownerPolicy.rules_json,ownerPolicy.id).run()}
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(remove(delegate.rules_json)),delegate.id).run()
   }
   const before=(await query(targetId)).map(row=>row.id).sort(),started=await create(`synthetic-cradle-176 lost ${lost}`)
   assert.equal((await wait(approved,started.value.id,started.commandId)).state,'Cancelled')
   await h.restart();await h.tick(started.commandId)
   assert.deepEqual((await query(targetId)).map(row=>row.id).sort(),before,`Lost target ${lost} authority refuses creation after restart`)
  }finally{await disable(approved)}
 }
 // Tightening a native field rule after approval cannot let a retained action
 // create values that no longer satisfy the target's current schema.
 const staleDefinition={...definition,actions:[{...action,values:{...action.values,[targetName]:'synthetic-cradle-177 '+ 'x'.repeat(50)}}]}
 const approved=await save(staleDefinition)
 try{
  draft.tables[1].fields[0].validation={maxLength:40}
  const before=(await query(targetId)).map(row=>row.id).sort()
  await adopt(draft)
  await save(staleDefinition,400)
  const started=await create('synthetic-cradle-178 schema changed')
  const run=await wait(approved,started.value.id,started.commandId)
  assert.ok(['Failed','Cancelled'].includes(run.state),'A changed target schema refuses stale values or stale approval')
  assert.deepEqual((await query(targetId)).map(row=>row.id).sort(),before,'A changed target schema creates no incomplete record')
 }finally{await disable(approved)}
 console.log('Explicit target-table create: typed effect, target-only approval, native audit, restart, truthful dry and live output and current-authority refusal passed')
}
