import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './repair-case-harness.mjs'
test("repair case admission guard table refuses initial and prepared authority, identity and source races atomically",async()=>{
 const cases=[
  {name:"case admission rejects stale/forged identity, inactive/wrong mandate and unauthorized copied sources without partial writes",run:async()=>{
  const h = await fixture()
  try {
    const id = await h.report(), baseline = await h.counts(), open = h.registry.get('repair.open')
    for (const changes of [ { asset: { ...(await h.ref('assets', h.b.asset)), ref: h.r.repairRef('stores', h.b.asset) } }, { mandate: { id: h.m.id, version: 9 } }, { mandate: undefined } ]) await assert.rejects(open.execute(h.ctx, await h.command(id, changes)))
    await h.db.prepare("UPDATE operation_mandates SET data_json=json_set(data_json,'$.state','paused') WHERE id=?").bind(h.m.id).run()
    await assert.rejects(open.execute(h.ctx, await h.command(id)), { code: 'invalid_transition' })
    await h.db.prepare("UPDATE operation_mandates SET data_json=json_set(data_json,'$.state','active','$.appId',?) WHERE id=?").bind(h.r.createUlid(), h.m.id).run()
    await assert.rejects(open.execute(h.ctx, await h.command(id)), { code: 'forbidden' })
    await h.db.prepare("UPDATE operation_mandates SET data_json=json_set(data_json,'$.appId',?) WHERE id=?").bind(h.r.REPAIRS_APP_ID, h.m.id).run()
    const captured = await h.report(h.b.ev.sourceId)
    await h.db.prepare('UPDATE evidence_sources SET erased_at=? WHERE id=?').bind(h.ctx.now, h.b.ev.sourceId).run()
    await assert.rejects(open.execute(h.ctx, await h.command(captured)))
    assert.deepEqual(await h.counts(), baseline)
  } finally { await h.close() }
}},
  {name:"prepared case admission guards membership, mandate, source, owner and intake races; concurrent opens remain atomic",run:async()=>{
  const h = await fixture()
  try {
    const open = h.registry.get('repair.open'), id = await h.report(h.b.ev.sourceId)
    async function race(sql, undo, bindings = []) {
      const command = await h.command(id), plan = await h.r.openRepair(h.r.createRepairOpenContext(h.d,h.ctx,command,'repair.open'),command.input), before = await h.counts()
      await h.db.prepare(sql).bind(...bindings).run()
      await assert.rejects(h.admission.commit(h.ctx, plan), { code: 'version_conflict' })
      assert.deepEqual(await h.counts(), before)
      await h.db.prepare(undo).bind(...bindings).run()
    }
    await race("UPDATE authority_memberships SET state='removed',version=version+1", "UPDATE authority_memberships SET state='active',version=version+1")
    await race('UPDATE operation_mandates SET version=version+1 WHERE id=?', 'UPDATE operation_mandates SET version=version-1 WHERE id=?', [h.m.id])
    await race('UPDATE evidence_sources SET current_version=current_version+1 WHERE id=?', 'UPDATE evidence_sources SET current_version=current_version-1 WHERE id=?', [h.b.ev.sourceId])
    await race("UPDATE authority_principals SET state='removed' WHERE id=?", "UPDATE authority_principals SET state='active' WHERE id=?", [h.ctx.principal.id])
    await race('UPDATE repair_assets SET version=version+1 WHERE id=?', 'UPDATE repair_assets SET version=version-1 WHERE id=?', [h.b.asset])
    for(let round=0;round<3;round++) {
      const report=round===0?id:await h.report(),first=await h.command(report),second=await h.command(report)
      const a=await h.r.openRepair(h.r.createRepairOpenContext(h.d,h.ctx,first,'repair.open'),first.input),b=await h.r.openRepair(h.r.createRepairOpenContext(h.d,h.ctx,second,'repair.open'),second.input)
      const results=await Promise.allSettled([h.admission.commit(h.ctx,a),h.admission.commit(h.ctx,b)])
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
      const conflict=results.find(r=>r.status==='rejected').reason
      assert.equal(conflict.code,'version_conflict',String(conflict)+' '+String(conflict.cause))
      assert.deepEqual(await h.counts(),{operation_cases:round+1,repair_jobs:round+1,repair_work_orders:round+1,operation_wakes:0})
    }
  } finally { await h.close() }
}}
 ]
 for(const {name,run} of cases){
  try{await run()}catch(error){throw new Error(name+': '+error.message,{cause:error})}
 }
})


test('mandate-only sources retain owner-field permission on admission and original-key replay',async()=>{
 const h=await fixture()
 try{
  const link=await h.source()
  await h.db.prepare('UPDATE evidence_sources SET entity_id=?,record_id=?,field_ids=? WHERE id=?').bind(h.r.REPAIR_ENTITIES.contractors,h.b.contractor,JSON.stringify([h.r.repairFieldId('contractors','email')]),link.sourceId).run()
  h.m.sourceIds=[link.sourceId]
  await h.db.prepare('UPDATE operation_mandates SET data_json=? WHERE id=?').bind(JSON.stringify(h.m),h.m.id).run()
  const id=await h.report(),command=await h.command(id),result=await h.registry.get('repair.open').execute(h.ctx,command)
  assert.deepEqual(result.result.value.case.sourceIds,[link.sourceId])
  const facts=(await h.db.prepare("SELECT source_ids_json FROM admission_audit WHERE action='repair.open'").all()).results
  assert.ok(facts.every(row=>JSON.parse(row.source_ids_json).includes(link.sourceId)))
  const restricted=h.auth.rules.map(rule=>rule.entityId===h.r.REPAIR_ENTITIES.contractors?{...rule,readableFields:rule.readableFields.filter(id=>id!==h.r.repairFieldId('contractors','email'))}:rule)
  await h.auth.setRules(restricted)
  await assert.rejects(h.registry.get('repair.open').execute(h.ctx,command),{code:'forbidden'})
  const next=await h.report()
  await assert.rejects(h.registry.get('repair.open').execute(h.ctx,await h.command(next)),{code:'forbidden'})
  assert.equal((await h.counts()).operation_cases,1)
 }finally{await h.close()}
})

test('case descriptions and copied private fields obey subject field policy on direct reads and replay',async()=>{
 const h=await fixture()
 try{
  const id=await h.report(),command=await h.command(id),opened=await h.registry.get('repair.open').execute(h.ctx,command)
  const repair=opened.result.value
  for(const name of ['scope_description','requester_id','store_id','asset_id']){
   await h.auth.setRules(h.auth.rules.map(rule=>rule.entityId===h.r.REPAIR_ENTITIES.workOrders?{...rule,readableFields:rule.readableFields.filter(id=>id!==h.r.repairFieldId('workOrders',name))}:rule))
   for(const path of [`cases/${repair.case.id}`,`repairs/${repair.workOrder.id}`]){
    const response=await h.http.request(`http://local/api/v1/${path}`)
    assert.equal(response.status,403,name+' '+path)
    assert.ok(!(await response.text()).includes('Cooling failed'))
   }
   await assert.rejects(h.registry.get('repair.open').execute(h.ctx,command),{code:'forbidden'})
  }
  await h.auth.setRules(h.auth.rules)
  assert.equal((await h.http.request(`http://local/api/v1/cases/${repair.case.id}`)).status,200)
 }finally{await h.close()}
})
