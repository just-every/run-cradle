import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fixture } from './repair-case-harness.mjs'
async function setup(){
 const h=await fixture({realEvidence:true}),actions=['case.pause','case.takeover','case.resume','case.cancel']
 await h.db.exec((await readFile('migrations/core/0500_execution.sql','utf8')).replace(/\n/g,' '))
 await h.auth.setRules(h.auth.rules.map(rule=>({...rule,actions:[...rule.actions,...actions]})))
 const controls=h.r.createRepairCaseControls(h.d,h.operations);controls.register(h.registry);h.r.registerRepairCommands(h.registry,h.d,['repair.assign-contractor'])
 const reads=h.r.createRepairCaseReads(h.d,h.operations,controls),http=h.r.createRepairCaseHttp(reads,async()=>h.ctx)
 const report=await h.report(),opened=await h.registry.get('repair.open').execute(h.ctx,await h.command(report)),value=opened.result.value
 const controlCommand=(value,reason='Explicit synthetic manual control')=>h.envelope({caseId:value.id,caseVersion:value.version,reason},[],{controlEpoch:value.controlEpoch})
 return {...h,controls,reads,http,value,controlCommand}
}
test("repair manual control guard table refuses stale, machine and changed-mandate actions atomically",async()=>{
 const cases=[
  {name:"control stale versions, nonhuman access, SQL rollback, membership races and field-restricted replay remain denied",run:async()=>{
 const h=await setup()
 try{
  const command=await h.controlCommand(h.value.case),plan=await h.controls.prepare(h.ctx,'case.pause',command)
  await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1").run()
  await assert.rejects(h.admission.commit(h.ctx,plan),{code:'version_conflict'})
  await h.db.prepare("UPDATE authority_memberships SET state='active',version=version+1").run()
  const bad=await h.controlCommand({...h.value.case,version:9})
  await assert.rejects(h.registry.get('case.pause').execute(h.ctx,bad),{code:'version_conflict'})
  await assert.rejects(h.registry.get('case.pause').execute({...h.ctx,principal:{...h.ctx.principal,kind:'agent'}},command),{code:'forbidden'})
  await h.db.exec("CREATE TRIGGER refuse_manual_control BEFORE UPDATE ON operation_cases BEGIN SELECT RAISE(ABORT,'synthetic control failure');END;")
  await assert.rejects(h.registry.get('case.pause').execute(h.ctx,command))
  assert.equal((await h.operations.getCase(h.ctx,h.value.case.id)).controlEpoch,0)
  await h.db.exec('DROP TRIGGER refuse_manual_control')
  await h.registry.get('case.pause').execute(h.ctx,command)
  await h.auth.setRules(h.auth.rules.map(rule=>rule.entityId===h.r.REPAIR_ENTITIES.workOrders?{...rule,readableFields:rule.readableFields.filter(id=>id!==h.r.repairFieldId('workOrders','scope_description'))}:rule))
  await assert.rejects(h.registry.get('case.pause').execute(h.ctx,command),{code:'forbidden'})
 }finally{await h.close()}
}},
  {name:"stopping blocks retained queued wakes; changed mandates and machine authority cannot use manual resume",run:async()=>{
 const h=await setup()
 try{
  const now=h.ctx.now,id=h.r.createUlid(),wake={id,appId:h.r.REPAIRS_APP_ID,caseId:h.value.case.id,version:1,createdAt:now,updatedAt:now,reason:'Synthetic prior queued work',state:'queued',leaseOwner:null,leaseUntil:null,epoch:0,modelRequestId:h.r.createUlid(),actionCommandId:h.r.createUlid(),checkpoint:'refresh',planId:null,runId:null,nextWakeAt:now,failure:null}
  await h.db.prepare('INSERT INTO operation_wakes(id,app_id,version,data_json,case_id,state,lease_until,lease_owner,epoch) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,wake.appId,1,JSON.stringify(wake),wake.caseId,'queued',null,null,0).run()
  const paused=(await h.registry.get('case.pause').execute(h.ctx,await h.controlCommand(h.value.case))).result.value
  const stopped=await h.db.prepare('SELECT state,lease_owner FROM operation_wakes WHERE id=?').bind(id).first()
  assert.equal(stopped.state,'blocked');assert.equal(stopped.lease_owner,null)
  await h.db.prepare("UPDATE operation_mandates SET data_json=json_set(data_json,'$.actionIds',json('[]'),'$.version',2),version=2 WHERE id=?").bind(h.m.id).run()
  await assert.rejects(h.registry.get('case.resume').execute(h.ctx,await h.controlCommand(paused)),{code:'version_conflict'})
  assert.equal((await h.operations.getCase(h.ctx,h.value.case.id)).state,'paused')
 }finally{await h.close()}
}}
 ]
 for(const {name,run} of cases){
  try{await run()}catch(error){throw new Error(name+': '+error.message,{cause:error})}
 }
})




test('moved asset/store identity blocks fresh picker and assignment; an admission-time move also rolls back',async()=>{
 const h=await setup()
 try{
  const other=await h.insert('stores',{name:'Other store',location:'Melbourne',contact_id:h.ctx.principal.id,availability:'09:00–17:00',active:1})
  const work=await h.ref('workOrders',h.value.workOrder.id),contractor=await h.ref('contractors',h.b.contractor),command=await h.envelope({workOrder:work,contractor,eligibilityEvidence:[h.b.ev]},[work,contractor],{controlEpoch:0})
  const captured=h.r.createCommandRegistry({commit:async(_ctx,plan)=>({plan}),replay:async()=>null});h.r.registerRepairCommands(captured,h.d,['repair.assign-contractor'])
  const {plan}=await captured.get('repair.assign-contractor').execute(h.ctx,command)
  await h.db.prepare('UPDATE repair_assets SET store_id=?,version=version+1 WHERE id=?').bind(other,h.b.asset).run()
  await assert.rejects(h.admission.commit(h.ctx,plan),{code:'version_conflict'})
  assert.equal((await h.reads.contractors(h.ctx,h.value.workOrder.id)).items.length,0)
  await assert.rejects(h.registry.get('repair.assign-contractor').execute(h.ctx,command),{code:'invalid_transition'})
  assert.equal((await h.db.prepare('SELECT lifecycle FROM repair_work_orders WHERE id=?').bind(work.ref.recordId).first()).lifecycle,'triage')
 }finally{await h.close()}
})

test('every implicitly selected credential source keeps actual owner access at commit, replay and command-status lookup',async()=>{
 const h=await setup()
 try{
  const owner=await h.insert('contractors',{name:'Private credential custodian',payee_id:'NONE',email:'private@example.invalid',active:1})
  await h.db.prepare('UPDATE evidence_sources SET entity_id=?,record_id=?,field_ids=? WHERE id=?').bind(h.r.REPAIR_ENTITIES.contractors,owner,JSON.stringify([h.r.repairFieldId('contractors','email')]),h.b.ev.sourceId).run()
  const provided=await h.source()
  await h.db.prepare('UPDATE evidence_sources SET entity_id=?,record_id=?,field_ids=? WHERE id=?').bind(h.r.REPAIR_ENTITIES.stores,h.b.store,JSON.stringify([h.r.repairFieldId('stores','repair_evidence')]),provided.sourceId).run()
  await h.db.prepare('INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) VALUES(?,?,1,?,?,?,?)').bind(h.r.createUlid(),provided.sourceId,'synthetic-supplied-sha','Unrelated caller-supplied source','[]',h.ctx.now).run()
  await h.auth.setRules(h.auth.rules.map(rule=>rule.entityId===h.r.REPAIR_ENTITIES.contractors?{...rule,rows:{kind:'condition',fieldId:h.r.repairFieldId('contractors','active'),op:'eq',value:true}}:rule))
  const work=await h.ref('workOrders',h.value.workOrder.id),contractor=await h.ref('contractors',h.b.contractor),command=await h.envelope({workOrder:work,contractor,eligibilityEvidence:[provided]},[work,contractor],{controlEpoch:0})
  const captured=h.r.createCommandRegistry({commit:async(_ctx,plan)=>({plan}),replay:async()=>null});h.r.registerRepairCommands(captured,h.d,['repair.assign-contractor'])
  const {plan}=await captured.get('repair.assign-contractor').execute(h.ctx,command)
  assert.ok(plan.accessSubjects.some(subject=>subject.ref.recordId===owner&&subject.fieldIds.includes(h.r.repairFieldId('contractors','email'))))
  await h.db.prepare('UPDATE repair_contractors SET active=0,version=version+1 WHERE id=?').bind(owner).run()
  const missing=h.r.createUlid(),readErrors=[]
  assert.equal(await h.db.prepare('SELECT id FROM evidence_sources WHERE id=?').bind(missing).first(),null)
  // Read concealment does not change the commit, replay or status authorization below.
  for(const sourceId of [h.b.ev.sourceId,missing])await assert.rejects(h.d.evidence.source(h.ctx,sourceId),error=>{
   assert.equal(error.code,'not_found');assert.equal(error.status,404)
   readErrors.push({code:error.code,status:error.status,message:error.message});return true
  })
  assert.deepEqual(readErrors[0],readErrors[1])
  await assert.rejects(h.admission.commit(h.ctx,plan),{code:'version_conflict'})
  assert.equal((await h.db.prepare('SELECT lifecycle FROM repair_work_orders WHERE id=?').bind(work.ref.recordId).first()).lifecycle,'triage')
  await h.db.prepare('UPDATE repair_contractors SET active=1,version=version+1 WHERE id=?').bind(owner).run()
  const result=await h.registry.get('repair.assign-contractor').execute(h.ctx,command)
  assert.equal(result.result.value.stage,'quotes')
  assert.equal((await h.registry.get('repair.assign-contractor').execute(h.ctx,command)).replay,true)
  await h.db.prepare('UPDATE repair_contractors SET active=0,version=version+1 WHERE id=?').bind(owner).run()
  await assert.rejects(h.registry.get('repair.assign-contractor').execute(h.ctx,command),{code:'forbidden'})
  await assert.rejects(h.admission.status(h.ctx,command.commandId),{code:'forbidden'})
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM execution_runs').first()).n,0)
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM admission_outbox').first()).n,0)
 }finally{await h.close()}
})
