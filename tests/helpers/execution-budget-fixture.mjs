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
import {trustedPredicate} from '../../src/domains/admission/sql.server.ts'

export async function executionBudgetFixture(){
 const h=migratedD1(),owner=createUlid(),origin='http://127.0.0.1:4233',host=new URL(origin).host,now=Date.now()
 await h.db.prepare('INSERT INTO operators(id,created_at,updated_at,name,email) VALUES(?,?,?,?,?)').bind(owner,now,now,'Operator','owner@budget.example.test').run()
 await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(owner,owner,now,now).run()
 const auth=await createFixtureAuth(h.db,{appOrigin:origin,sessionSecret:'test-only-budget-readback-secret-32-bytes',mode:'development'},owner),session=await auth.signIn(owner)
 const f=await executionResolutionFixture(h.db,[owner]),rules=f.policies[0].rules.map(rule=>rule.entityId===RUN_ENTITY_ID?{...rule,actions:[...rule.actions,'attempt.reconcile']}:rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=? WHERE id=?').bind(JSON.stringify(rules),f.policies[0].id).run()
 const registry={get:(_app,id)=>executionPolicyEntities.find(e=>e.id===id)},policy=createPolicyPort(h.db,registry),admission=createAdmissionService(h.db,createReplayAccess(h.db,policy,registry)),authenticate=createRequestContextFactory(h.db,auth.configuration)
 const context=await authenticate(new Request(origin+'/app',{headers:{host,cookie:session.cookie}}))
 let writes=0,reads=[],provider=async()=>({state:'refused',code:'provider_refused',message:'Provider refused the request.'})
 const adapter={id:'resend',version:'test-network-edge',preflight:async()=>{},execute:async()=>{writes++;throw new Error('Readback must never execute')},reconcile:async input=>{reads.push(input);return provider(input)}}
 const deps={db:h.db,admission,policy,workspaceId:'resolution-test',keyring:testKeyring,adapters:new Map([['resend',adapter]]),currentGuards:async()=>[trustedPredicate("EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND state='connected' AND revoked_at IS NULL)",[f.connectionId])],...createExecutionBudget(h.db),backgroundContext:async()=>context}
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
  return {...a,reservationIds:[a.reservationId,wallId]}
 }
 return {...h,...f,owner,context,deps,service,queue,reconcile,budgets,reserved,counts:()=>({writes,reads}),setProvider:value=>{provider=value}}
}
