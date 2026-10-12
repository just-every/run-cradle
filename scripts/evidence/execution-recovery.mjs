import {readFile,writeFile,unlink} from 'node:fs/promises'
import {spawn} from 'node:child_process'
// One-off evidence extends the existing real-D1 fixture; the original assertions
// are retained verbatim. It is not added to the permanent verification suite.
const file='tests/execution-recovery-evidence.mjs'
const source=await readFile('tests/execution-d1.mjs','utf8')
const insert=`
  // Expired run lease is taken over once; old provider completion is retained as
  // late evidence and cannot overwrite the new lease's confirmed observation.
  const takeover=await create();let finishOld,signalOld,originalKey;
  const oldStarted=new Promise(resolve=>signalOld=resolve);
  const oldAdapter={...adapter,execute:async request=>{originalKey=request.idempotencyKey;signalOld();await new Promise(resolve=>finishOld=resolve);return {state:'confirmed',externalId:'old-observation',value:{accepted:true},receiptHash:'old',requestId:null}}};
  const oldWorker=r.createExecutionService({...deps,adapters:new Map([['resend',oldAdapter]])});
  const oldTask=oldWorker.run(ctx,takeover.runId);await oldStarted;
  await db.prepare('UPDATE execution_runs SET lease_expires_at=? WHERE id=?').bind(new Date(Date.now()-1000).toISOString(),takeover.runId).run();
  const epochBefore=(await service.repository.run(takeover.runId)).lease_epoch;
  const recovery=r.createExecutionService({...deps,adapters:new Map([['resend',{...adapter,canReplay:()=>true,execute:async request=>{assert.equal(request.idempotencyKey,originalKey);return {state:'confirmed',externalId:'new-observation',value:{accepted:true},receiptHash:'new',requestId:null}}}]])});
  await recovery.recover(ctx,takeover.attemptId);const recovered=await recovery.repository.attempt(takeover.attemptId);
  assert.equal(recovered.external_id,'new-observation');assert.equal((await recovery.repository.run(takeover.runId)).lease_epoch,epochBefore+1);
  finishOld();await oldTask;assert.equal((await recovery.repository.attempt(takeover.attemptId)).external_id,'new-observation');
  assert.equal((await db.prepare('SELECT count(*) n FROM execution_receipts WHERE attempt_id=?').bind(takeover.attemptId).first()).n,2);
  // Transport failure after the provider may have accepted persists unknown.
  const timeout=await create();let uncertainCalls=0;
  const outage=r.createExecutionService({...deps,adapters:new Map([['resend',{...adapter,execute:async()=>{uncertainCalls++;throw new Error('Connection closed after possible acceptance')},reconcile:async()=>({state:'unknown',message:'Provider unavailable for readback'})}]])});
  await outage.run(ctx,timeout.runId);assert.equal((await outage.read(ctx,timeout.runId)).state,'unknown');
  await outage.run(ctx,timeout.runId);assert.equal(uncertainCalls,1);assert.equal((await outage.read(ctx,timeout.runId)).state,'unknown');
  console.log('EXECUTION_GAP_EVIDENCE PASS: expired lease takeover increments epoch; late observation retained without overwriting; transport failure persists unknown; provider outage readback never resends');
`
await writeFile(file,source.replace('\n }finally{',insert+'\n }finally{'))
try{
 const child=spawn(process.execPath,['--test','--test-concurrency=1',file],{stdio:'inherit'})
 process.exitCode=await new Promise(resolve=>child.once('exit',resolve))
}finally{await unlink(file)}
