import './typescript-loader.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {RUN_ENTITY_ID,CONNECTION_ENTITY_ID} from '../../src/domains/execution/metadata.server.ts'
import {stagingPolicyRules} from '../../src/domains/evidence/staging.server.ts'
import {canonical,sha256,base64url} from '../../src/adapters/crypto.server.ts'
import {environmentKeyring,seal} from '../../src/domains/connections/crypto.server.ts'
export const testKeyring=environmentKeyring('v1',()=>base64url(new Uint8Array(32).fill(7)))
/** Test-only persisted starting history and real allow/deny policy, never fake authorization. */
export async function executionResolutionFixture(db,operatorIds,{appId=createUlid()}={}){
 const connectionId=createUlid(),releaseId=createUlid(),now=new Date().toISOString(),policies=[]
 for(const [index,principalId] of operatorIds.entries()){
  const policyId=createUlid(),rule=(entityId,actions)=>({id:createUlid(),principals:[{id:principalId,kind:'human'}],entityId,rows:{kind:'all',conditions:[]},readableFields:[],writableFields:[],purposes:['read'],actions,effect:'allow'})
  const rules=[rule(RUN_ENTITY_ID,['execution.read',...(index===0?['execution.reconcile','attempt.resolve','run.retry']:[])]),rule(CONNECTION_ENTITY_ID,['connection.read']),...(index===0?stagingPolicyRules(principalId,createUlid(),createUlid()):[])]
  await db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policyId,appId,index===0?'Effect operator':'Effect viewer',JSON.stringify(rules),Date.now(),Date.now()).run()
  await db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,0,'active',1)").bind(principalId,appId,policyId).run();policies.push({id:policyId,rules})
 }
 await db.prepare("INSERT INTO provider_connections(id,app_id,adapter_id,name,state,account_id,scopes_json,ownership_json,version,created_at,updated_at) VALUES(?,?,'resend','Evidence review mail','connected','sender@example.test','[]','[]',1,?,?)").bind(connectionId,appId,now,now).run()
 async function unknown({state='unknown',reservation=false}={}){
  const runId=createUlid(),attemptId=createUlid(),commandId=createUlid(),at=new Date().toISOString(),input={from:'sender@example.test',to:'recipient@example.test',subject:'Existing external effect',text:'Test-only original body'},inputHash=await sha256(canonical(input)),idempotencyKey=`cradle/${commandId}`,grantId=reservation?createUlid():null,reservationId=reservation?createUlid():null
  const request={appId,action:'mail.send',connectionId,connectionVersion:1,provider:'resend',input:null,expected:[],cost:[],grantId,grantVersion:reservation?1:null,releaseId,schemaVersion:1,controlEpoch:0,caseId:null,definitionId:null,definitionVersion:null,trigger:'test-only accepted effect with lost response',causeRunIds:[],causeDefinitionIds:[],unknownDeadline:new Date(Date.now()+600000).toISOString(),custodianId:operatorIds[0],deadline:new Date(Date.now()+3600000).toISOString()}
  await db.prepare('INSERT INTO execution_runs(id,app_id,origin_command_id,request_json,actor_json,state,version,control_epoch,lease_epoch,cause_identity,created_at,updated_at) VALUES(?,?,?,?,?,?,1,0,0,?,?,?)').bind(runId,appId,commandId,canonical(request),canonical({id:operatorIds[0],kind:'human'}),state==='dispatching'?'running':'unknown','{}',at,at).run()
  if(reservation){await db.prepare("INSERT INTO authority_grants(id,issuer_id,delegate_id,app_id,spec_json,impact_hash,state,version,starts_at,expires_at,created_at,updated_at) VALUES(?,?,?,?,'{}','test','active',1,0,?,?,?)").bind(grantId,operatorIds[0],operatorIds[0],appId,Date.now()+3600000,Date.now(),Date.now()).run();await db.prepare("INSERT INTO authority_budgets(grant_id,unit,ceiling,reserved,consumed,version) VALUES(?,'quantity','1','1','0',1)").bind(grantId).run();await db.prepare("INSERT INTO authority_reservations(id,grant_id,grant_version,command_id,unit,amount,state,created_at,updated_at,app_id,action,owner_principal_id,attempt_id,input_hash,binding_hash) VALUES(?,?,1,?,'quantity','1','reserved',?,?,?,'mail.send',?,?,?,'test')").bind(reservationId,grantId,commandId,Date.now(),Date.now(),appId,operatorIds[0],attemptId,inputHash).run()}
  await db.prepare('INSERT INTO execution_attempts(id,run_id,command_id,connection_id,action,provider,idempotency_key,input_hash,authority_hash,authorization_json,sealed_input,state,version,lease_epoch,reservation_ids_json,started_at,first_possible_effect_at,external_id,unknown_deadline,custodian_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,?,?,?,?,?,?)').bind(attemptId,runId,commandId,connectionId,'mail.send','resend',idempotencyKey,inputHash,inputHash,canonical({commandId}),canonical(await seal(testKeyring,'resolution-test',connectionId,`attempt:${attemptId}`,canonical(input))),state,canonical(reservation?[reservationId]:[]),at,at,'provider-original',request.unknownDeadline,operatorIds[0],at,at).run()
  await db.prepare('INSERT INTO execution_run_attempts(run_id,attempt_id) VALUES(?,?)').bind(runId,attemptId).run()
  return {runId,attemptId,commandId,grantId,reservationId,version:1,inputHash,idempotencyKey}
 }
 return {appId,connectionId,releaseId,policies,unknown}
}
