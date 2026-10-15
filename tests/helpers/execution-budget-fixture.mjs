import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {migratedD1} from './sqlite-d1.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {executionResolutionFixture,testKeyring} from './execution-resolution-fixture.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {createPolicyPort} from '../../src/domains/authority/policy.server.ts'
import {createReplayAccess,createRequestContextFactory} from '../../src/domains/authority/context.server.ts'
import {executionPolicyEntities,RUN_ENTITY_ID} from '../../src/domains/execution/metadata.server.ts'
import {createAdmissionService} from '../../src/domains/admission/service.server.ts'
import {createExecutionService} from '../../src/domains/execution/service.server.ts'
import {createExecutionBudget} from '../../src/domains/execution/budget-bridge.server.ts'
import {createCommandRegistry} from '../../src/core/registry/commands.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {registerExecutionCommands} from '../../src/domains/execution/commands.server.ts'
import {trustedPredicate,eq} from '../../src/domains/admission/sql.server.ts'
import {calendarAdapter} from '../../src/adapters/calendar.server.ts'
import {ProviderTransport} from '../../src/adapters/transport.server.ts'
import {canonical,sha256} from '../../src/adapters/crypto.server.ts'
import {seal} from '../../src/domains/connections/crypto.server.ts'
import {createConnectionService} from '../../src/domains/connections/service.server.ts'
import {attemptsTable,receiptsTable,runsTable} from '../../src/domains/execution/tables.server.ts'
import {executionBudgetEdge} from './execution-budget-edge.mjs'

export async function executionBudgetFixture(){
 const h=migratedD1(),owner=createUlid(),origin='http://127.0.0.1:4233',host=new URL(origin).host,now=Date.now()
 await h.db.prepare('INSERT INTO operators(id,created_at,updated_at,name,email) VALUES(?,?,?,?,?)').bind(owner,now,now,'Operator','owner@budget.example.test').run()
 await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(owner,owner,now,now).run()
 const auth=await createFixtureAuth(h.db,{appOrigin:origin,sessionSecret:'test-only-budget-readback-secret-32-bytes',mode:'development'},owner),session=await auth.signIn(owner)
 const f=await executionResolutionFixture(h.db,[owner]),rules=f.policies[0].rules.map(rule=>rule.entityId===RUN_ENTITY_ID?{...rule,actions:[...rule.actions,'attempt.reconcile']}:rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=? WHERE id=?').bind(JSON.stringify(rules),f.policies[0].id).run()
 const registry={get:(_app,id)=>executionPolicyEntities.find(e=>e.id===id)},policy=createPolicyPort(h.db,registry),admission=createAdmissionService(h.db,createReplayAccess(h.db,policy,registry)),authenticate=createRequestContextFactory(h.db,auth.configuration)
 const context=await authenticate(new Request(origin+'/app',{headers:{host,cookie:session.cookie}}))
 const edge=executionBudgetEdge(),transport=new ProviderTransport(edge.fetch)
 const account='budget-calendar@example.test',at=new Date().toISOString(),expiresAt=new Date(Date.now()+3600000).toISOString()
 await h.db.prepare("UPDATE provider_connections SET adapter_id='google-calendar',account_id=? WHERE id=?").bind(account,f.connectionId).run()
 const sealed=await seal(testKeyring,'resolution-test',f.connectionId,'oauth-tokens',canonical({accessToken:'test-only-budget-calendar-token',refreshToken:'test-only-refresh',expiresAt,scopes:[]}))
 await h.db.prepare('INSERT INTO connection_credentials(connection_id,sealed_json,expires_at,version,created_at,updated_at) VALUES(?,?,?,1,?,?)').bind(f.connectionId,canonical(sealed),expiresAt,at,at).run()
 const connections=createConnectionService({db:h.db,admission,policy,workspaceId:'resolution-test',keyring:testKeyring,appOrigin:origin,context:async()=>context,transport,secret:async()=>undefined,oauth:()=>{throw new Error('Unexpired fixture consent must not refresh')}})
 const adapter=calendarAdapter(connections.credentials,transport)
 const deps={db:h.db,admission,policy,workspaceId:'resolution-test',keyring:testKeyring,adapters:new Map([['google-calendar',adapter]]),currentGuards:async()=>[trustedPredicate("EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND state='connected' AND revoked_at IS NULL)",[f.connectionId])],...createExecutionBudget(h.db),backgroundContext:async()=>context}
 const service=createExecutionService(deps),commands=createCommandRegistry(admission);registerExecutionCommands(commands,deps)
 const http=createCommandHttp({commands,admission,authenticate})
 const queue=async(attemptId,commandId=createUlid())=>{
  const response=await http.fetch(new Request(origin+'/api/v1/commands/attempt.reconcile',{method:'POST',headers:{host,origin,'content-type':'application/json',cookie:session.cookie,'x-csrf-token':session.csrf},body:JSON.stringify({commandId,expected:[],input:{attemptId}})}))
  assert.equal(response.status,200,await response.clone().text())
  const row=await h.db.prepare('SELECT id FROM admission_outbox WHERE command_id=?').bind(commandId).first()
  return {commandId,outboxId:row.id}
 }
 const reconcile=async(a,worker=service)=>{const command=await queue(a.attemptId);await worker.dispatch(context,command.outboxId);return command}
 const budgets=grantId=>h.sql.prepare('SELECT unit,ceiling,consumed,reserved FROM authority_budgets WHERE grant_id=? ORDER BY unit').all(grantId).map(row=>({...row}))
 async function reserved(){
  const a=await f.unknown({reservation:true})
  h.sql.prepare("INSERT INTO authority_budgets(grant_id,unit,ceiling,reserved,consumed,version) VALUES(?,'wallSeconds','60','60','0',1)").run(a.grantId)
  const wallId=createUlid()
  h.sql.prepare("INSERT INTO authority_reservations SELECT ?,grant_id,grant_version,command_id,'wallSeconds','60',state,created_at,updated_at,app_id,action,owner_principal_id,attempt_id,input_hash,binding_hash FROM authority_reservations WHERE id=?").run(wallId,a.reservationId)
  h.sql.prepare('UPDATE execution_attempts SET reservation_ids_json=? WHERE id=?').run(JSON.stringify([a.reservationId,wallId]),a.attemptId)
  const input={calendarId:account,summary:'Original budget-bound calendar reservation',start:'2090-01-02T01:00:00.000Z',end:'2090-01-02T02:00:00.000Z',timezone:'Australia/Brisbane',agreedSlotEvidenceId:createUlid(),operation:'reserve'},inputHash=await sha256(canonical(input))
  const request={...JSON.parse((await service.repository.run(a.runId)).request_json),action:'calendar.reserve',provider:'google-calendar'}
  await h.db.prepare('UPDATE execution_runs SET request_json=? WHERE id=?').bind(canonical(request),a.runId).run()
  await h.db.prepare("UPDATE execution_attempts SET action='calendar.reserve',provider='google-calendar',input_hash=?,authority_hash=?,authorization_json=?,sealed_input=?,external_id=NULL WHERE id=?").bind(inputHash,inputHash,canonical({commandId:a.commandId,inputHash}),canonical(await seal(testKeyring,'resolution-test',f.connectionId,`attempt:${a.attemptId}`,canonical(input))),a.attemptId).run()
  await h.db.prepare("UPDATE authority_reservations SET action='calendar.reserve',input_hash=? WHERE attempt_id=?").bind(inputHash,a.attemptId).run()
  const binding=edge.register({...a,inputHash,reservationIds:[a.reservationId,wallId]},input)
  return {...binding,request}
 }
 async function refuse(a){
  // Persist historical dispatch refusal, using real credential access, adapter,
  // transport, budget settlement and admission. Subsequent commands only read.
  const result=await edge.originalDispatch(()=>adapter.execute({attemptId:a.attemptId,commandId:a.commandId,connectionId:f.connectionId,idempotencyKey:a.idempotencyKey,canonicalInputHash:a.inputHash,input:a.input,deadline:a.request.deadline,firstPossibleEffectAt:new Date().toISOString(),externalId:null}))
  assert.equal(result.state,'refused')
  const id=createUlid(),at=new Date().toISOString(),settlement=await deps.settlement(context,a.request,a.reservationIds,result,{commandId:a.commandId,attemptId:a.attemptId,inputHash:a.inputHash})
  const permit=await policy.authorize(context,{appId:f.appId,action:'execution.reconcile',expected:[],cost:[],connectionId:f.connectionId,inputHash:a.inputHash})
  await admission.commit(context,{commandId:createUlid(),action:permit.action,appId:f.appId,canonicalInputHash:a.inputHash,permit,guards:settlement.guards,mutations:[...settlement.mutations,
   {kind:'insert',table:receiptsTable,row:{id,attempt_id:a.attemptId,provider:'google-calendar',external_id:null,status:result.state,evidence_file_id:null,observed_at:at,reconciled_at:null,method:null,message:result.message,result_json:canonical(result),created_at:at,updated_at:at,version:1}},
   {kind:'update',table:attemptsTable,set:{state:'refused',receipt_id:id,version:2},where:eq(attemptsTable,'id',a.attemptId),expectedRows:1},
   {kind:'update',table:runsTable,set:{state:'failed',version:2},where:eq(runsTable,'id',a.runId),expectedRows:1}
  ],audit:[],events:[],outbox:[],committedResult:{receiptId:id}})
 }
 return {...h,...f,owner,context,deps,service,queue,reconcile,budgets,reserved,refuse,counts:edge.counts,setReadback:edge.setReadback}
}
