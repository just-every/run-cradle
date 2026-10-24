import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
/** A real due-time scheduler retry, without replacing app clocks or editing the sealed request. */
export async function recordCalendarRetry({h,worker,provider,call,patch,drain,binding,syncPath,start,end}){
 const before=provider.writes.length
 provider.rateLimitOnce('move');await patch({[start]:'2026-11-17',[end]:'2026-11-18'});await call(syncPath+'/sync',{commandId:createUlid()});await drain()
 const event=await binding(),attempt=await h.db.prepare('SELECT id,run_id,state,idempotency_key,input_hash FROM execution_attempts WHERE id=?').bind(event.attempt_id).first(),run=await h.db.prepare('SELECT state,next_wake_at FROM execution_runs WHERE id=?').bind(attempt.run_id).first()
 assert.equal(attempt.state,'refused');assert.equal(run.state,'waiting');assert.equal(provider.writes.length,before+1);assert.equal(provider.writes.at(-1).outcome,429);assert.equal(provider.writes.at(-1).applied,false)
 const delay=Math.max(0,Date.parse(run.next_wake_at)-Date.now())+100
 assert.ok(delay<=61000,'The first definite refusal uses the existing bounded one-minute retry')
 console.log('CALENDAR_DEFINITE_429 waiting for original request due time')
 await new Promise(resolve=>setTimeout(resolve,delay))
 assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()})).outcome,'ok');await drain()
 const attempts=(await h.db.prepare('SELECT state,idempotency_key,input_hash FROM execution_attempts WHERE run_id=? ORDER BY created_at,id').bind(attempt.run_id).all()).results
 assert.equal(attempts.length,2);assert.equal(attempts.at(-1).state,'confirmed');assert.ok(attempts.every(a=>a.idempotency_key===attempt.idempotency_key&&a.input_hash===attempt.input_hash),'Retry preserves the original effect key and input hash')
 const retried=provider.writes.slice(before);assert.equal(retried.length,2);assert.equal(retried[0].method,retried[1].method);assert.equal(retried[0].url,retried[1].url);assert.deepEqual(retried[0].body,retried[1].body,'Definite429 retries the same provider request');assert.equal((await binding()).state,'synced')
}
