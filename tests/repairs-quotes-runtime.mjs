import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {fixture} from './repair-case-harness.mjs'
async function setup(){
 const h=await fixture({realEvidence:true})
 await h.db.exec((await readFile('migrations/core/0500_execution.sql','utf8')).replace(/\n/g,' '))
 h.r.registerRepairContractorCommand(h.registry,h.d);h.r.registerRepairQuoteCommand(h.registry,h.d)
 const report=await h.report(),opened=(await h.registry.get('repair.open').execute(h.ctx,await h.command(report))).result.value
 const work=await h.ref('workOrders',opened.workOrder.id),contractor=await h.ref('contractors',h.b.contractor)
 await h.registry.get('repair.assign-contractor').execute(h.ctx,await h.envelope({workOrder:work,contractor,eligibilityEvidence:[h.b.ev]},[work,contractor],{controlEpoch:0}))
 const source=await h.source()
 await h.db.prepare('UPDATE evidence_sources SET entity_id=?,record_id=?,field_ids=? WHERE id=?').bind(h.r.REPAIR_ENTITIES.stores,h.b.store,JSON.stringify([h.r.repairFieldId('stores','repair_evidence')]),source.sourceId).run()
 await h.db.prepare('INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) VALUES(?,?,1,?,?,?,?)').bind(h.r.createUlid(),source.sourceId,'synthetic-quote-sha','Synthetic original quotation','[]',h.ctx.now).run()
 const review=()=>h.reads.quotes(h.ctx,work.ref.recordId)
 async function quote(overrides={}){const data=await review(),total={minor:'200000',currency:'AUD',scale:2},input={workOrder:data.workOrder,contractor:data.contractor,scopeHash:data.scopeHash,total,taxIncluded:true,lineItems:[{description:'Repair the cooling unit',total}],exclusions:[],expiresAt:'2099-01-01T00:00:00.000Z',evidence:[source],offeredSlot:null,...overrides};return h.envelope(input,[input.workOrder,input.contractor],{controlEpoch:data.controlEpoch})}
 const prepare=async command=>{const registry=h.r.createCommandRegistry({commit:async(_ctx,plan)=>({plan}),replay:async()=>null});h.r.registerRepairQuoteCommand(registry,h.d);return (await registry.get('repair.record-quote').execute(h.ctx,command)).plan}
 return {...h,opened,source,review,quote,prepare,record:command=>h.registry.get('repair.record-quote').execute(h.ctx,command)}
}
test('manual quote capture and exact threshold review leave work, decisions, wakes and provider state untouched; original response replays',async()=>{
 const h=await setup()
 try{
  const before=await h.db.prepare('SELECT * FROM repair_work_orders WHERE id=?').bind(h.opened.workOrder.id).first(),command=await h.quote()
  const result=await h.record(command);assert.equal(result.result.value.total.minor,'200000');assert.equal((await h.record(command)).replay,true)
  const total={minor:'200001',currency:'AUD',scale:2};await h.record(await h.quote({total,lineItems:[{description:'Alternative exact terms',total}]}))
  const review=await h.review();assert.equal(review.items.length,2);assert.deepEqual(review.items.map(item=>item.approvalRequired).sort(),[false,true]);assert.ok(review.items.every(item=>item.issues.length===0))
  assert.deepEqual(await h.db.prepare('SELECT * FROM repair_work_orders WHERE id=?').bind(h.opened.workOrder.id).first(),before)
  for(const table of ['business_decisions','operation_wakes','execution_runs','admission_outbox'])assert.equal((await h.db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n,0)
  const response=await h.http.request(`/api/v1/repairs/${h.opened.workOrder.id}/quotes`);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')
 }finally{await h.close()}
})
test('quote capture rejects nonhuman, revoked action, stale scope, wrong totals and expired terms',async()=>{
 const h=await setup()
 try{
  const command=await h.quote()
  await assert.rejects(h.registry.get('repair.record-quote').execute({...h.ctx,principal:{...h.ctx.principal,kind:'agent'}},command),{code:'forbidden'})
  await assert.rejects(h.record(await h.quote({scopeHash:'0'.repeat(64)})),{code:'stale_evidence'})
  await assert.rejects(h.record(await h.quote({total:{minor:'1',currency:'AUD',scale:2}})),{code:'validation'})
  await assert.rejects(h.record(await h.quote({expiresAt:'2020-01-01T00:00:00.000Z'})),{code:'validation'})
  await h.auth.setRules(h.auth.rules.map(rule=>({...rule,actions:rule.actions.filter(action=>action!=='repair.record-quote')})))
  await assert.rejects(h.record(command),{code:'forbidden'})
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM repair_quotes').first()).n,0)
 }finally{await h.close()}
})
test('source correction and paused case reject prepared quote admission atomically',async()=>{
 const h=await setup()
 try{
  let command=await h.quote(),plan=await h.prepare(command)
  await h.db.prepare('UPDATE evidence_sources SET current_version=2 WHERE id=?').bind(h.source.sourceId).run()
  await assert.rejects(h.admission.commit(h.ctx,plan),{code:'version_conflict'})
  await h.db.prepare('UPDATE evidence_sources SET current_version=1 WHERE id=?').bind(h.source.sourceId).run()
  command=await h.quote();plan=await h.prepare(command)
  await h.db.prepare("UPDATE operation_cases SET data_json=json_set(data_json,'$.state','paused','$.controlEpoch',1,'$.version',2),version=2 WHERE id=?").bind(h.opened.case.id).run()
  await assert.rejects(h.admission.commit(h.ctx,plan),{code:'version_conflict'})
  await assert.rejects(h.record(command),{code:'invalid_transition'})
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM repair_quotes').first()).n,0)
 }finally{await h.close()}
})
test('retained provider insertion after preparation blocks manual quote continuation without changing that history',async()=>{
 const h=await setup()
 try{
  const command=await h.quote(),plan=await h.prepare(command),id=h.r.createUlid()
  await h.db.prepare("INSERT INTO execution_runs(id,app_id,origin_command_id,request_json,state,control_epoch,cause_identity,created_at,updated_at) VALUES(?,?,?,?,'unknown',0,?,?,?)").bind(id,h.r.REPAIRS_APP_ID,h.r.createUlid(),JSON.stringify({caseId:h.opened.case.id}),'Synthetic retained history',h.ctx.now,h.ctx.now).run()
  const row=await h.db.prepare('SELECT * FROM execution_runs WHERE id=?').bind(id).first()
  await assert.rejects(h.admission.commit(h.ctx,plan),{code:'version_conflict'})
  await assert.rejects(h.record(command),{code:'unconfigured'})
  assert.equal((await h.review()).canCapture,false)
  assert.deepEqual(await h.db.prepare('SELECT * FROM execution_runs WHERE id=?').bind(id).first(),row)
 }finally{await h.close()}
})
test('review explains incomparable or changed evidence without ranking; hidden quote/source fields deny read and replay',async()=>{
 const h=await setup()
 try{
  const command=await h.quote({taxIncluded:false,exclusions:['Compressor replacement excluded']});await h.record(command)
  assert.match((await h.review()).items[0].issues.join(' '),/tax-inclusive AUD/)
  await h.db.prepare('INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) VALUES(?,?,2,?,?,?,?)').bind(h.r.createUlid(),h.source.sourceId,'corrected-sha','Corrected terms','[]',h.ctx.now).run()
  await h.db.prepare('UPDATE evidence_sources SET current_version=2 WHERE id=?').bind(h.source.sourceId).run()
  assert.match((await h.review()).items[0].issues.join(' '),/source version changed/)
  await h.auth.setRules(h.auth.rules.map(rule=>rule.entityId===h.r.REPAIR_ENTITIES.quotes?{...rule,readableFields:rule.readableFields.filter(id=>id!==h.r.repairFieldId('quotes','exclusions'))}:rule))
  await assert.rejects(h.review(),{code:'forbidden'});await assert.rejects(h.record(command),{code:'forbidden'})
  await h.auth.setRules(h.auth.rules.map(rule=>rule.entityId===h.r.REPAIR_ENTITIES.stores?{...rule,readableFields:rule.readableFields.filter(id=>id!==h.r.repairFieldId('stores','repair_evidence'))}:rule))
  await assert.rejects(h.review(),{code:'forbidden'});await assert.rejects(h.record(command),{code:'forbidden'})
 }finally{await h.close()}
})
