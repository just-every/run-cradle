import './helpers/typescript-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {migratedD1} from './helpers/sqlite-d1.mjs'
import {createFixtureAuth} from './helpers/base-fixture-auth.mjs'
import {executionResolutionFixture,testKeyring} from './helpers/execution-resolution-fixture.mjs'
import {STAGING_ENTITY,STAGING_FILES,stagingPolicyEntity} from '../src/domains/evidence/staging.server.ts'
import {createUlid} from '../src/core/shared/ids.ts'
import {canonical,sha256} from '../src/adapters/crypto.server.ts'
import {createPolicyPort} from '../src/domains/authority/policy.server.ts'
import {createReplayAccess,createRequestContextFactory} from '../src/domains/authority/context.server.ts'
import {executionPolicyEntities} from '../src/domains/execution/metadata.server.ts'
import {createAdmissionService} from '../src/domains/admission/service.server.ts'
import {createExecutionService} from '../src/domains/execution/service.server.ts'
import {createExecutionBudget} from '../src/domains/execution/budget-bridge.server.ts'
import {createCommandRegistry} from '../src/core/registry/commands.ts'
import {createCommandHttp} from '../src/core/registry/http.ts'
import {createExecutionHttp} from '../src/domains/execution/routes.server.ts'
import {registerExecutionCommands} from '../src/domains/execution/commands.server.ts'
import {createExecutionHandlers} from '../src/domains/execution/handlers.server.ts'
import {createWebhookPlanner} from '../src/domains/connections/webhook-plan.server.ts'
import {trustedPredicate} from '../src/domains/admission/sql.server.ts'
const origin='http://127.0.0.1:4233',host=new URL(origin).host
async function setup(){
 const h=migratedD1(),ids=[createUlid(),createUlid()]
 for(const [i,id] of ids.entries()){await h.db.prepare('INSERT INTO operators(id,created_at,updated_at,name,email) VALUES(?,?,?,?,?)').bind(id,Date.now(),Date.now(),i?'Viewer':'Operator',`${i?'viewer':'owner'}@resolution.example.test`).run();await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(id,id,Date.now(),Date.now()).run()}
 const auth=await createFixtureAuth(h.db,{appOrigin:origin,sessionSecret:'test-only-human-resolution-secret-32-bytes',mode:'development'},ids[0]),sessions=await Promise.all(ids.map(id=>auth.signIn(id)))
 const f=await executionResolutionFixture(h.db,ids),registry={get:(app,id)=>id===STAGING_ENTITY?stagingPolicyEntity(app):executionPolicyEntities.find(e=>e.id===id)},policy=createPolicyPort(h.db,registry),admission=createAdmissionService(h.db,createReplayAccess(h.db,policy,registry)),authenticate=createRequestContextFactory(h.db,auth.configuration)
 const context=await authenticate(new Request(origin+'/api/v1/runs/'+createUlid(),{headers:{host,cookie:sessions[0].cookie}}))
 let sends=0,readbacks=0,provider=async()=>({state:'confirmed',externalId:'provider-original',value:{accepted:true},receiptHash:'provider',requestId:null})
 const adapter={id:'resend',version:'test-network-edge',canReplay:()=>true,preflight:async()=>{},execute:async()=>{sends++;return provider()},reconcile:async()=>{readbacks++;return provider()}}
 const deps={db:h.db,admission,policy,workspaceId:'resolution-test',keyring:testKeyring,adapters:new Map([['resend',adapter]]),currentGuards:async()=>[trustedPredicate('1')],...createExecutionBudget(h.db),backgroundContext:async()=>context}
 const service=createExecutionService(deps),commands=createCommandRegistry(admission);registerExecutionCommands(commands,deps)
 const http=createCommandHttp({commands,admission,authenticate}),reads=createExecutionHttp(service,authenticate)
 const send=(body,session=sessions[0])=>http.fetch(new Request(origin+'/api/v1/commands/attempt.resolve',{method:'POST',headers:{host,origin,'content-type':'application/json',...(session?{cookie:session.cookie,'x-csrf-token':session.csrf}:{})},body:JSON.stringify(body)}))
 const body=(a,outcome='done')=>({commandId:createUlid(),expected:[],input:{attemptId:a.attemptId,expectedVersion:a.version,outcome,evidence:{summary:'Recipient supplied the original provider confirmation.',reference:'support-ticket/742'}}})
 return {...h,...f,ids,sessions,context,deps,service,admission,send,body,reads,counts:()=>({sends,readbacks}),setProvider:value=>{provider=value}}
}

test('real session/policy command: evidence, identity, replay, staleness, two decisions and authority fences',async()=>{
 const f=await setup();try{
  const dispatching=await f.unknown({state:'dispatching'});assert.equal((await f.send(f.body(dispatching,'not_done'))).status,409)
  const a=await f.unknown({reservation:true}),command=f.body(a),before=Date.now()
  assert.equal((await f.send(command,null)).status,401)
  assert.equal((await f.send(command,f.sessions[1])).status,403)
  for(const input of [{...command.input,evidence:{summary:' ',reference:'x'}},{...command.input,actorId:f.ids[1]},{...command.input,resolvedAt:'2000-01-01T00:00:00.000Z'},{...command.input,expectedVersion:2}])assert.ok([400,409].includes((await f.send({...command,input})).status))
  const response=await f.send(command);assert.equal(response.status,200,await response.clone().text());const saved=(await response.json()).data.value
  assert.equal(saved.reconciliationMethod,'human_evidence');assert.equal(saved.humanResolution.actorId,f.ids[0]);assert.ok(Date.parse(saved.humanResolution.resolvedAt)>=before);assert.deepEqual(saved.humanResolution.evidence,command.input.evidence);assert.equal(saved.humanResolution.originalEffect.idempotencyKey,a.idempotencyKey);assert.equal(saved.humanResolution.originalEffect.inputHash,a.inputHash)
  const replay=await f.send(command);assert.equal(replay.status,200,await replay.clone().text());assert.deepEqual((await replay.json()).data.value,saved)
  assert.equal((await f.send({...command,input:{...command.input,evidence:{...command.input.evidence,summary:'Changed'}}})).status,409)
  assert.equal((await f.send({...command,input:{...command.input,outcome:'not_done'}})).status,409)
  assert.equal((await f.send(f.body({...a,version:2},'not_done'))).status,409)
  assert.equal((await f.db.prepare("SELECT count(*) AS n FROM execution_receipts WHERE attempt_id=? AND method='human_evidence'").bind(a.attemptId).first()).n,1)
  assert.equal((await f.db.prepare('SELECT state FROM authority_reservations WHERE id=?').bind(a.reservationId).first()).state,'consumed')
  const view=await f.reads.fetch(new Request(origin+`/api/v1/attempts/${a.attemptId}/review`,{headers:{host,cookie:f.sessions[1].cookie}}));assert.equal(view.status,200);assert.equal((await view.json()).data.canResolve,false)
  const b=await f.unknown(),race=await Promise.all([f.send(f.body(b)),f.send(f.body(b,'not_done'))]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await f.db.prepare("SELECT count(*) AS n FROM execution_receipts WHERE attempt_id=? AND method='human_evidence'").bind(b.attemptId).first()).n,1)
  const c=await f.unknown(),plan=await f.service.resolution.prepare(f.context,createUlid(),f.body(c).input)
  await f.db.prepare('UPDATE authority_policies SET version=version+1 WHERE id=?').bind(f.policies[0].id).run();await assert.rejects(f.admission.commit(f.context,plan));assert.equal((await f.service.repository.attempt(c.attemptId)).state,'unknown')
  const rules=f.policies[0].rules.map(rule=>({...rule,actions:rule.actions.filter(a=>a!=='attempt.resolve')}));await f.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),f.policies[0].id).run();assert.equal((await f.send(command)).status,403)
 }finally{f.close()}
})

test('human done/not_done survives queue redelivery, recovery, service restart, webhook and delayed provider settlement',async()=>{
 const f=await setup();try{
  for(const outcome of ['done','not_done']){
   const a=await f.unknown({reservation:true}),response=await f.send(f.body(a,outcome));assert.equal(response.status,200,await response.clone().text());const receipt=(await response.json()).data.value
   const restarted=createExecutionService(f.deps);await restarted.run(f.context,a.runId);assert.equal((await restarted.recover(f.context,a.attemptId)).id,receipt.id);assert.equal((await restarted.reconcile(f.context,a.attemptId)).id,receipt.id)
   await assert.rejects(restarted.retry(f.context,a.runId,createUlid()))
   const commandId=createUlid(),canonicalInputHash=await sha256(canonical({runId:a.runId,source:'test-redelivery'})),permit=await f.deps.policy.authorize(f.context,{appId:f.appId,action:'execution.reconcile',expected:[],cost:[],inputHash:canonicalInputHash})
   await f.admission.commit(f.context,{commandId,action:permit.action,appId:f.appId,canonicalInputHash,permit,guards:[],mutations:[],audit:[],events:[],outbox:[{action:'execution.dispatch',version:1,input:{runId:a.runId},notBefore:new Date().toISOString(),grantId:null,subject:null,sourceReleaseId:f.releaseId,causeRunIds:[]}],committedResult:{runId:a.runId}})
   const outbox=await f.db.prepare('SELECT id FROM admission_outbox WHERE command_id=?').bind(commandId).first(),handlers=createExecutionHandlers(f.deps);let ack=0,retry=0;const message={body:{outboxId:outbox.id},ack(){ack++},retry(){retry++}};await handlers.queue({messages:[message,message]});await handlers.scheduled();assert.equal(ack,2);assert.equal(retry,0)
   assert.equal((await restarted.repository.attempt(a.attemptId)).receipt_id,receipt.id);assert.equal((await f.db.prepare('SELECT state FROM authority_reservations WHERE id=?').bind(a.reservationId).first()).state,outcome==='done'?'consumed':'released')
  }
  assert.deepEqual(f.counts(),{sends:0,readbacks:0})
  const delayed=await f.unknown({reservation:true});let arrived,release;const waiting=new Promise(resolve=>{arrived=resolve});f.setProvider(async()=>{arrived();await new Promise(resolve=>{release=resolve});return {state:'confirmed',externalId:'provider-original',value:{accepted:true},receiptHash:'late',requestId:null}})
  const readback=f.service.reconcile(f.context,delayed.attemptId);await waiting;const decided=await f.send(f.body(delayed,'not_done'));assert.equal(decided.status,200,await decided.clone().text());const decision=(await decided.json()).data.value;release();await readback
  assert.equal((await f.service.repository.attempt(delayed.attemptId)).receipt_id,decision.id);assert.equal((await f.service.repository.run(delayed.runId)).state,'failed');assert.equal((await f.db.prepare('SELECT state FROM authority_reservations WHERE id=?').bind(delayed.reservationId).first()).state,'released');assert.equal((await f.db.prepare('SELECT count(*) AS n FROM execution_receipts WHERE attempt_id=?').bind(delayed.attemptId).first()).n,2)
  const atomic=await f.unknown({reservation:true});let armed=true;f.setProvider(async()=>({state:'confirmed',externalId:'provider-original',value:{accepted:true},receiptHash:'atomic-late',requestId:null}))
  const interleaved=createExecutionService({...f.deps,admission:{...f.admission,async commit(ctx,plan){if(armed&&plan.committedResult?.receiptId){armed=false;const resolved=await f.send(f.body(atomic,'not_done'));assert.equal(resolved.status,200,await resolved.clone().text())}return f.admission.commit(ctx,plan)}}})
  await interleaved.reconcile(f.context,atomic.attemptId);assert.equal((await f.service.repository.attempt(atomic.attemptId)).state,'refused');assert.equal((await f.db.prepare('SELECT state FROM authority_reservations WHERE id=?').bind(atomic.reservationId).first()).state,'released');assert.equal((await f.db.prepare('SELECT count(*) AS n FROM execution_receipts WHERE attempt_id=?').bind(atomic.attemptId).first()).n,2)
  const webhook=await createWebhookPlanner(f.db,async()=>f.context,async()=>{throw new Error('A webhook cannot replace a human outcome')})(f.connectionId,'resend',{type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:'provider-original'}});assert.equal(webhook.events.length,1);assert.equal(webhook.outbox.length,0);assert.equal(webhook.mutations.length,0)
 }finally{f.close()}
})


test('attachment authority and availability are checked again at the human resolution commit',async()=>{
 const f=await setup();try{
  async function file({appId=f.appId,owner=f.ids[0],state='available',lifecycle='active'}={}){
   const recordId=createUlid(),fileId=createUlid(),at=new Date().toISOString()
   await f.db.prepare("INSERT INTO evidence_staging(id,app_id,owner_id,purpose,lifecycle,created_at,updated_at) VALUES(?,?,?,'source',?,?,?)").bind(recordId,appId,owner,lifecycle,at,at).run()
   await f.db.prepare("INSERT INTO evidence_files(id,app_id,entity_id,record_id,field_ids,filename,media_type,bytes,sha256,object_key,state,version,created_at,updated_at) VALUES(?,?,?,?,?,'provider-proof.txt','text/plain',12,?,?,?,1,?,?)").bind(fileId,appId,STAGING_ENTITY,recordId,JSON.stringify([STAGING_FILES]),'a'.repeat(64),`private/test/${fileId}`,state,at,at).run()
   return fileId
  }
  const a=await f.unknown(),command=f.body(a)
  for(const fileId of [createUlid(),await file({appId:createUlid()}),await file({owner:f.ids[1]}),await file({state:'uploading'}),await file({state:'rejected'}),await file({lifecycle:'erased'})]){
   const response=await f.send({...command,input:{...command.input,evidence:{...command.input.evidence,fileId}}});assert.equal(response.status,403);assert.equal((await response.json()).error.message,'Evidence attachment must be an available file in your private source intake for this app.')
  }
  const fileId=await file(),input={...command.input,evidence:{...command.input.evidence,fileId}},plan=await f.service.resolution.prepare(f.context,command.commandId,input)
  await f.db.prepare("UPDATE evidence_files SET state='deleted',version=version+1 WHERE id=?").bind(fileId).run();await assert.rejects(f.admission.commit(f.context,plan));assert.equal((await f.service.repository.attempt(a.attemptId)).state,'unknown')
  const readable=await file(),allowed={...command,input:{...command.input,evidence:{...command.input.evidence,fileId:readable}}},response=await f.send(allowed);assert.equal(response.status,200,await response.clone().text());const receipt=(await response.json()).data.value;assert.equal(receipt.evidenceFileId,readable);assert.equal(receipt.humanResolution.evidence.fileId,readable);assert.equal(receipt.humanResolution.evidence.fileSha256,'a'.repeat(64))
  const next=await f.unknown(),bound=await f.service.resolution.prepare(f.context,createUlid(),{...f.body(next).input,evidence:{...command.input.evidence,fileId:readable}})
  const rules=f.policies[0].rules.filter(rule=>rule.entityId!==STAGING_ENTITY);await f.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),f.policies[0].id).run();await assert.rejects(f.admission.commit(f.context,bound));assert.equal((await f.send(allowed)).status,403)
 }finally{f.close()}
})
