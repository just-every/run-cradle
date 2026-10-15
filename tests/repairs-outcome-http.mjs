import {test} from 'node:test'
import assert from 'node:assert/strict'
import {repairOutcomeFixture} from './repair-outcome-fixture.mjs'
import {repairFlow} from './repair-outcome-flow.mjs'
test('mounted emitted repair journey enforces exact approval, grants, independent store acceptance and one accounting receipt',async()=>{
 const h=await repairOutcomeFixture(),flow=repairFlow(h)
 try{
  const issued=await h.issuedGrant()
  for(const minor of ['199999','200000']){const routine=await flow.quoted(minor);assert.equal(routine.decision,null);await flow.agreement(routine);await h.db.prepare("UPDATE authority_grants SET state='revoked' WHERE id=?").bind(issued.grant.id).run();await flow.book(routine,{status:403});await h.db.prepare("UPDATE authority_grants SET state='active' WHERE id=?").bind(issued.grant.id).run()}
  assert.equal(h.edge.calls.length,0,'Threshold never grants provider authority')
  const q=await flow.quoted(),review=await h.read(`/api/v1/decisions/${q.decision.id}/review`)
  const decide={decisionId:q.decision.id,outcome:'approve',rationale:'',confirmedInputHash:review.decision.exactInputHash}
  await h.post('decision.outcome',decide,review.expected,{status:403})
  await h.post('decision.outcome',decide,review.expected,{session:h.otherSession,status:403})
  await flow.agreement(q);await flow.book(q,{status:409});assert.equal(h.edge.calls.length,0)
  await flow.approve(q)
  const booking=await flow.book(q),attempt=await h.waitAttempt(booking.value.attemptId);assert.equal(attempt.state,'confirmed')
  await h.post('repair.reconcile-effect',{kind:'visit',id:booking.value.visitId},[await h.ref('visits',booking.value.visitId)])
  await flow.book(q,{status:409});assert.equal(h.edge.events.size,1)
  await flow.claim(q,booking.value.visitId)
  assert.equal((await h.read(`/api/v1/repairs/${q.workId}`)).storeAcceptance,null)
  const earlyInvoice=await flow.invoice(q);await flow.handoff(q,earlyInvoice,{status:409});assert.equal(h.edge.invoices.size,0)
  const acceptance=await flow.acceptance(q);const accepted=await h.post('repair.store-acceptance',acceptance.input,acceptance.expected)
  assert.equal((await h.read('/api/v1/commands/'+accepted.commandId)).state,'committed')
  await flow.handoff(q,earlyInvoice,{status:503})
  await h.post('repair.configure-accounting',{connectionId:h.connections.xero,expectedVersion:0,contacts:{'SYNTHETIC-UI-SUPPLIER':'00000000-0000-4000-8000-000000000002'},allowedAccountCodes:['400'],allowedTaxTypes:['INPUT']})
  const latest=await h.ref('workOrders',q.workId)
  const duplicate=await h.post('repair.record-invoice',{...earlyInvoice.input,workOrder:latest},[latest],{status:400});assert.equal(duplicate.body.error.code,'validation');assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_invoices WHERE work_order_id=?').bind(q.workId).first()).n,1)
  const handoff=await flow.handoff(q,earlyInvoice),accounted=await h.waitAttempt(handoff.value.attemptId);assert.equal(accounted.state,'confirmed')
  const requestsBefore=h.edge.calls.filter(c=>c.method==='POST'||c.method==='PUT').length
  await Promise.all([flow.handoff(q,earlyInvoice,{status:409}),flow.handoff(q,earlyInvoice,{status:409})])
  await h.post('repair.reconcile-effect',{kind:'handoff',id:handoff.value.handoffId},[await h.ref('handoffs',handoff.value.handoffId)])
  const repaired=await h.read(`/api/v1/repairs/${q.workId}`)
  assert.equal(repaired.accounting.state,'handed_off');assert.ok(repaired.accounting.receiptId);assert.ok(repaired.accounting.externalId)
  assert.equal(h.edge.invoices.size,1);assert.equal(h.edge.calls.filter(c=>c.method==='POST'||c.method==='PUT').length,requestsBefore)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_handoffs WHERE work_order_id=?').bind(q.workId).first()).n,1)
 }finally{await h.close()}
})
test('mounted repair refuses stale business terms, resolves unknown original booking and distinguishes cancellation refusal',async()=>{
 const h=await repairOutcomeFixture(),flow=repairFlow(h)
 try{
  const {spec}=await h.issuedGrant()
  await h.post('grant.prepare',{spec:{...spec,providerScopes:[{...spec.providerScopes[0],fields:[h.id()]}]}},[],{status:403})
  const q=await flow.quoted();await flow.approve(q);await flow.agreement(q)
  await h.db.prepare('UPDATE repair_contractors SET version=version+1 WHERE id=?').bind(q.contractor.ref.recordId).run()
  await flow.book(q,{status:409});assert.equal(h.edge.calls.length,0)
  await h.db.prepare('UPDATE repair_contractors SET version=version-1 WHERE id=?').bind(q.contractor.ref.recordId).run()
  h.edge.setBooking('unknown');const booking=await flow.book(q);assert.equal((await h.waitAttempt(booking.value.attemptId)).state,'unknown')
  const posts=h.edge.calls.filter(c=>c.method==='POST').length
  await flow.book(q,{status:409})
  await h.post('attempt.reconcile',{attemptId:booking.value.attemptId})
  for(let i=0;i<100;i++){if((await h.db.prepare('SELECT state FROM execution_attempts WHERE id=?').bind(booking.value.attemptId).first()).state==='confirmed')break;await new Promise(resolve=>setTimeout(resolve,100))}
  assert.equal((await h.db.prepare('SELECT state FROM execution_attempts WHERE id=?').bind(booking.value.attemptId).first()).state,'confirmed');assert.equal(h.edge.calls.filter(c=>c.method==='POST').length,posts)
  await h.post('repair.reconcile-effect',{kind:'visit',id:booking.value.visitId},[await h.ref('visits',booking.value.visitId)])
  h.edge.setCancellation('refused')
  const cancel=await h.post('repair.cancel-visit',{visitId:booking.value.visitId,connectionId:h.connections.calendar,reason:'Store closed'},[await h.ref('visits',booking.value.visitId),await h.ref('workOrders',q.workId)])
  assert.equal((await h.waitAttempt(cancel.value.attemptId)).state,'refused')
  await h.post('repair.reconcile-effect',{kind:'visit',id:booking.value.visitId},[await h.ref('visits',booking.value.visitId)])
  assert.equal((await h.db.prepare('SELECT lifecycle FROM repair_visits WHERE id=?').bind(booking.value.visitId).first()).lifecycle,'confirmed')
  h.edge.setCancellation('confirmed')
  const next=await h.post('repair.cancel-visit',{visitId:booking.value.visitId,connectionId:h.connections.calendar,reason:'Reschedule agreed'},[await h.ref('visits',booking.value.visitId),await h.ref('workOrders',q.workId)])
  assert.equal((await h.waitAttempt(next.value.attemptId)).state,'confirmed')
  await h.post('repair.reconcile-effect',{kind:'visit',id:booking.value.visitId},[await h.ref('visits',booking.value.visitId)])
  assert.equal((await h.db.prepare('SELECT lifecycle FROM repair_visits WHERE id=?').bind(booking.value.visitId).first()).lifecycle,'cancelled')
 }finally{await h.close()}
})
test('permitted routine booking and failed or uncertain accounting keep original keys and prevent duplicate supplier invoices',async()=>{
 const h=await repairOutcomeFixture(),flow=repairFlow(h)
 try{
  const {grant,spec}=await h.issuedGrant()
  const hidden=spec.providerScopes[0].fields[0],restricted=h.rules.map(rule=>rule.entityId===h.REPAIR_ENTITIES.workOrders?{...rule,readableFields:rule.readableFields.filter(f=>f!==hidden)}:rule)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(restricted),h.policyId).run()
  await h.post('grant.prepare',{spec},[],{status:403})
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(h.rules),h.policyId).run()
  await h.post('repair.configure-accounting',{connectionId:h.connections.xero,expectedVersion:0,contacts:{'SYNTHETIC-UI-SUPPLIER':'00000000-0000-4000-8000-000000000002'},allowedAccountCodes:['400'],allowedTaxTypes:['INPUT']})
  for(const [minor,mode] of [['199999','refused'],['200000','unknown']]){
   const q=await flow.quoted(minor);assert.equal(q.decision,null);await flow.agreement(q)
   const booking=await flow.book(q);assert.equal((await h.waitAttempt(booking.value.attemptId)).state,'confirmed')
   await flow.claim(q,booking.value.visitId);const acceptance=await flow.acceptance(q);await h.post('repair.store-acceptance',acceptance.input,acceptance.expected)
   const mismatched=await flow.invoice(q,{payeeId:'WRONG-SUPPLIER'})
   const before=h.edge.calls.length;await flow.handoff(q,mismatched,{status:400});assert.equal(h.edge.calls.length,before)
   const invoice=await flow.invoice(q),duplicateEvidence=await h.source('Same supplier invoice delivered a second time'),workOrder=await h.ref('workOrders',q.workId)
   const duplicate=await h.post('repair.record-invoice',{...invoice.input,workOrder,sourceId:duplicateEvidence.sourceId,evidence:[duplicateEvidence]},[workOrder],{status:400});assert.equal(duplicate.body.error.code,'validation');assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_invoices WHERE payee_id=? AND invoice_number=?').bind(invoice.input.payeeId,invoice.input.invoiceNumber).first()).n,1)
   h.edge.setAccounting(mode)
   const handoff=await flow.handoff(q,invoice),attempt=await h.waitAttempt(handoff.value.attemptId);assert.equal(attempt.state,mode)
   await flow.handoff(q,invoice,{status:409})
   if(mode==='unknown'){
    const count=h.edge.invoices.size,key=attempt.idempotency_key,writeCount=h.edge.calls.filter(c=>c.path.includes('/Invoices')&&c.key===attempt.idempotency_key).length
    await h.post('attempt.recover',{attemptId:attempt.id},[],{status:409})
    assert.equal(h.edge.calls.filter(c=>c.path.includes('/Invoices')&&c.key===key).length,writeCount)
    h.edge.setAccounting('confirmed')
    await h.post('attempt.reconcile',{attemptId:attempt.id})
    await new Promise(resolve=>setTimeout(resolve,1500))
    assert.equal(h.edge.invoices.size,count,'Readback/replay never creates a second accounting identity')
    assert.equal(h.edge.calls.filter(c=>c.path.includes('/Invoices')&&c.key===key).length,writeCount,'Readback never resends the uncertain invoice')
    await h.post('attempt.recover',{attemptId:attempt.id})
    for(let i=0;i<100;i++){if((await h.db.prepare('SELECT state FROM execution_attempts WHERE id=?').bind(attempt.id).first()).state==='confirmed')break;await new Promise(resolve=>setTimeout(resolve,100))}
    assert.equal((await h.db.prepare('SELECT state FROM execution_attempts WHERE id=?').bind(attempt.id).first()).state,'confirmed')
    assert.equal(h.edge.invoices.size,count)
    assert.equal(h.edge.calls.filter(c=>c.path.includes('/Invoices')&&c.key===key).length,writeCount+1,'Explicit bounded recovery reuses the original provider key')
    const original=await h.db.prepare('SELECT command_id,idempotency_key FROM execution_attempts WHERE id=?').bind(attempt.id).first();assert.equal(original.idempotency_key,key)
    assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_handoffs WHERE invoice_id=?').bind(invoice.value.invoiceId).first()).n,1)
   }
  }
  const expired=await flow.quoted();await flow.approve(expired);await flow.agreement(expired)
  await h.db.prepare("UPDATE business_decisions SET expires_at='2020-01-01T00:00:00.000Z' WHERE id=?").bind(expired.decision.id).run()
  const before=h.edge.calls.length;await flow.book(expired,{status:409});assert.equal(h.edge.calls.length,before)
  const revokedSession=await h.db.prepare('SELECT s.id FROM oa_sessions s JOIN cradle_base_operators p ON p.base_id=s.operator_id WHERE p.principal_id=? AND s.revoked_at IS NULL ORDER BY s.created_at DESC LIMIT 1').bind(h.owner).first()
  await h.db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),revokedSession.id).run()
  const response=await fetch(h.origin+`/api/v1/repairs/${expired.workId}`,{headers:{cookie:h.ownerSession.cookie}});assert.equal(response.status,401)
 }finally{await h.close()}
})
