import assert from 'node:assert/strict'
/** The clock is test-controlled; retry admission and dispatch remain the emitted Worker's own scheduled event. */
export async function cancelAndObserveRetry({page,h,command,audit,workId,booking}){
 async function waitRun(id,state){
  for(let i=0;i<100;i++){const row=await h.db.prepare('SELECT state FROM execution_runs WHERE id=?').bind(id).first();if(row?.state===state)return;await new Promise(resolve=>setTimeout(resolve,100))}
  assert.fail(`Cancellation run did not reach ${state}`)
 }
 await page.getByRole('combobox',{name:'Provider connection',exact:true}).selectOption(h.connections.calendar)
 await page.getByLabel('Cancellation reason',{exact:true}).fill('Contractor cannot attend the agreed time; store requests a fresh reviewed appointment.')
 h.edge.setCancellation('rate-limited')
 const cancellation=await command(page,'repair.cancel-visit',()=>page.getByRole('button',{name:'Cancel booked visit',exact:true}).click())
 await waitRun(cancellation.runId,'waiting')
 await page.reload()
 const cancelled=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Visit cancellation',exact:true})})
 await cancelled.getByText(/A scheduled retry will recheck current authority/).waitFor()
 assert.equal(await page.getByRole('button',{name:'Cancel booked visit',exact:true}).count(),0)
 assert.equal(await page.getByRole('button',{name:'Record contractor completion claim',exact:true}).count(),0)
 assert.equal(await page.getByLabel('Contractor completion report',{exact:true}).count(),0)
 assert.equal(await page.getByRole('button',{name:'Retry known failed request',exact:true}).count(),0)
 const operations=await h.read(`/api/v1/repairs/${workId}/operations`),pending=operations.effects.find(effect=>effect.record.ref.recordId===booking.visitId)
 assert.equal(pending.cancellation,true);assert.equal(pending.runState,'waiting')
 assert.equal(pending.attempt.id,cancellation.attemptId);assert.equal(pending.attempt.runId,cancellation.runId)
 assert.equal(pending.failedCancellation,null)
 await audit(page,'cancellation-waiting-original-key')
 h.edge.setCancellation('confirmed')
 await h.db.prepare("UPDATE execution_runs SET next_wake_at='2020-01-01T00:00:00.000Z' WHERE id=?").bind(cancellation.runId).run()
 const scheduled=await (await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()})
 assert.equal(scheduled.outcome,'ok')
 await waitRun(cancellation.runId,'completed')
 const attempts=(await h.db.prepare('SELECT id,state,idempotency_key FROM execution_attempts WHERE run_id=? ORDER BY created_at,id').bind(cancellation.runId).all()).results
 assert.equal(attempts.length,2);assert.equal(attempts[0].id,cancellation.attemptId);assert.equal(attempts[1].state,'confirmed')
 assert.deepEqual([...new Set(attempts.map(attempt=>attempt.idempotency_key))],[pending.attempt.idempotencyKey])
 await page.getByRole('button',{name:'Refresh',exact:true}).click()
 await command(page,'repair.reconcile-effect',()=>cancelled.getByRole('button',{name:'Apply observed receipt',exact:true}).click())
 return {...cancellation,retryAttemptId:attempts[1].id,scheduledOutcome:scheduled.outcome}
}
