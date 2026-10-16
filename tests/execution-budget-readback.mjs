import './helpers/typescript-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {executionBudgetFixture} from './helpers/execution-budget-fixture.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {createExecutionService} from '../src/domains/execution/service.server.ts'
import {reserveBudgets,settleReservation} from '../src/domains/authority/budget.server.ts'

const withoutPrototype=value=>JSON.parse(JSON.stringify(value))

test('public readback persists a released effect and audited overrun without spending another action reservation',async()=>{
 const f=await executionBudgetFixture();try{
  const a=await f.reserved();await f.refuse(a)
  const refused=await f.service.repository.attempt(a.attemptId),prior=await f.service.repository.receipt(refused.receipt_id)
  assert.equal(prior.status,'refused');assert.equal(prior.method,null);assert.equal(f.counts().writes,1);assert.ok(a.reservationIds.every(id=>f.sql.prepare('SELECT state FROM authority_reservations WHERE id=?').get(id).state==='released'))
  // A different action has since taken the released capacity. This is persisted test history.
  const other=await f.reserved()
  f.sql.prepare('UPDATE authority_reservations SET grant_id=? WHERE attempt_id=?').run(a.grantId,other.attemptId)
  f.sql.prepare("UPDATE authority_budgets SET reserved=ceiling,version=version+1 WHERE grant_id=?").run(a.grantId)
  const untouched=withoutPrototype(f.sql.prepare('SELECT * FROM authority_reservations WHERE attempt_id=?').all(other.attemptId))
  f.setReadback('confirmed')
  const command=await f.reconcile(a,createExecutionService(f.deps)),attempt=await f.service.repository.attempt(a.attemptId),receipt=await f.service.repository.receipt(attempt.receipt_id)
  assert.equal((await f.service.read(f.context,a.runId)).state,'completed');assert.equal(attempt.state,'confirmed');assert.equal(attempt.idempotency_key,a.idempotencyKey)
  assert.equal(receipt.method,'readback');assert.equal(receipt.external_id,a.eventId)
  const result=JSON.parse(receipt.result_json);assert.equal(result.receiptHash,a.receiptHash);assert.equal(result.requestId,a.requestId)
  assert.deepEqual(result.value,{reservation:'confirmed',contractorAcceptance:false,etag:'original-calendar-etag',calendarId:a.input.calendarId})
  assert.deepEqual(f.budgets(a.grantId),[{unit:'quantity',ceiling:'1',consumed:'1',reserved:'1'},{unit:'wallSeconds',ceiling:'60',consumed:'60',reserved:'60'}])
  assert.deepEqual(result.budgetReconciliation.map(r=>({unit:r.unit,actual:r.actual,overrun:r.overrun,previousReceiptId:r.previousReceiptId})),[{unit:'quantity',actual:'1',overrun:'1',previousReceiptId:prior.id},{unit:'wallSeconds',actual:'60',overrun:'60',previousReceiptId:prior.id}])
  assert.deepEqual(withoutPrototype(f.sql.prepare('SELECT * FROM authority_reservations WHERE attempt_id=?').all(other.attemptId)),untouched)
  assert.ok(f.sql.prepare("SELECT 1 FROM admission_audit WHERE action='execution.budget-reconciled' AND personal_refs_json LIKE ?").get(`%${receipt.id}%`))
  await assert.rejects(reserveBudgets(f.db,{grantId:a.grantId,grantVersion:1,commandId:createUlid(),now:Date.now(),amounts:new Map([['quantity','1']])}),{code:'budget_exhausted'})
  const before=f.budgets(a.grantId),readCount=f.counts().reads.length,writes=f.counts().writes
  const replay=await f.queue(a.attemptId,command.commandId);assert.equal(replay.outboxId,command.outboxId)
  await createExecutionService(f.deps).dispatch(f.context,replay.outboxId);await f.reconcile(a)
  assert.deepEqual(f.budgets(a.grantId),before);assert.equal(f.counts().reads.length,readCount);assert.equal(f.counts().writes,writes);assert.equal(writes,1)
  assert.ok(f.counts().reads.every(input=>input.url===a.url&&input.method==='GET'&&input.body===undefined))
 }finally{f.close()}
})

test('released readback races settle once and preserve binding and current authority fences',async()=>{
 const f=await executionBudgetFixture();try{
  const a=await f.reserved();await f.refuse(a);await f.reconcile(a)
  f.setReadback('unknown');await f.reconcile(a)
  assert.equal((await f.service.repository.attempt(a.attemptId)).state,'unknown')
  f.setReadback('confirmed')
  // One worker commits after the other's live attempt read, before its settlement preparation.
  let competing=true
  const worker=createExecutionService({...f.deps,settlement:async(...args)=>{if(competing){competing=false;await f.service.reconcile(f.context,a.attemptId)}return f.deps.settlement(...args)}})
  await f.reconcile(a,worker)
  assert.deepEqual(f.budgets(a.grantId),[{unit:'quantity',ceiling:'1',consumed:'1',reserved:'0'},{unit:'wallSeconds',ceiling:'60',consumed:'60',reserved:'0'}])
  assert.equal(f.sql.prepare("SELECT count(*) n FROM execution_receipts WHERE attempt_id=? AND status='confirmed'").get(a.attemptId).n,2)
  const simultaneous=await f.reserved();await f.refuse(simultaneous);f.setReadback('confirmed')
  let race=true
  const atCommit=createExecutionService({...f.deps,admission:{...f.deps.admission,async commit(ctx,plan){if(race&&plan.committedResult?.receiptId){race=false;await f.service.reconcile(f.context,simultaneous.attemptId)}return f.deps.admission.commit(ctx,plan)}}})
  await f.reconcile(simultaneous,atCommit)
  assert.deepEqual(f.budgets(simultaneous.grantId),[{unit:'quantity',ceiling:'1',consumed:'1',reserved:'0'},{unit:'wallSeconds',ceiling:'60',consumed:'60',reserved:'0'}])
  const observations=f.sql.prepare("SELECT result_json FROM execution_receipts WHERE attempt_id=? AND status='confirmed'").all(simultaneous.attemptId)
  assert.equal(observations.length,2);assert.equal(observations.filter(row=>JSON.parse(row.result_json).budgetReconciliation).length,1)
  const b=await f.reserved();await f.refuse(b)
  await assert.rejects(settleReservation(f.db,b.reservationId,'1',Date.now()),{code:'version_conflict'})
  const owned=JSON.stringify(f.budgets(b.grantId));f.sql.prepare('UPDATE execution_attempts SET reservation_ids_json=? WHERE id=?').run(JSON.stringify(a.reservationIds),b.attemptId)
  f.setReadback('confirmed');const command=await f.queue(b.attemptId)
  await assert.rejects(f.service.dispatch(f.context,command.outboxId),/does not own/)
  assert.equal(JSON.stringify(f.budgets(b.grantId)),owned);assert.equal((await f.service.repository.attempt(b.attemptId)).state,'refused')
  f.sql.prepare('UPDATE execution_attempts SET reservation_ids_json=? WHERE id=?').run(JSON.stringify(b.reservationIds),b.attemptId)
  for(const column of ['command_id','input_hash']){
   const original=f.sql.prepare(`SELECT ${column} value FROM authority_reservations WHERE id=?`).get(b.reservationId).value
   f.sql.prepare(`UPDATE authority_reservations SET ${column}=? WHERE id=?`).run(createUlid(),b.reservationId)
   await assert.rejects(f.service.dispatch(f.context,command.outboxId),/does not own/)
   f.sql.prepare(`UPDATE authority_reservations SET ${column}=? WHERE id=?`).run(original,b.reservationId)
  }
  const writes=f.counts().writes
  assert.equal(writes,3) // Only the three historical dispatch refusals wrote.
  f.setReadback('confirmed',()=>{f.sql.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=?").run(f.owner)})
  await assert.rejects(f.service.dispatch(f.context,command.outboxId))
  assert.equal(f.sql.prepare('SELECT state FROM authority_memberships WHERE principal_id=?').get(f.owner).state,'removed')
  assert.equal(JSON.stringify(f.budgets(b.grantId)),owned);assert.equal((await f.service.repository.attempt(b.attemptId)).state,'refused');assert.equal(f.counts().writes,writes)
  assert.ok(f.counts().reads.every(input=>[a.url,simultaneous.url,b.url].includes(input.url)&&input.method==='GET'&&input.body===undefined))
 }finally{f.close()}
})
