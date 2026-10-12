import './auth-support.mjs';
import {fixture} from './auth-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {createPolicyPort}=await import('../src/domains/authority/policy.server.ts');
const {createCredentialAccess}=await import('../src/domains/connections/credential-access.server.ts');
const {createUlid}=await import('../src/core/shared/ids.ts');
test('nonhuman credential read is original-operation bound, field scoped, revocable, and cannot authorize effects',async()=>{
 const f=fixture();try{
 for(const file of ['0500_execution.sql','0501_connections.sql','0502_auth_payload_retention.sql','0504_execution_authority_binding.sql','0505_execution_authorization.sql','0506_connection_jobs.sql'])f.sql.exec(readFileSync(new URL('../migrations/core/'+file,import.meta.url),'utf8'));
 const id=createUlid,agent=id(),credential=id(),app=id(),entity=id(),field=id(),hidden=id(),record=id(),policyId=id(),connection=id(),attempt=id(),run=id(),command=id(),now=Date.now(),instant=new Date(now).toISOString();
 f.sql.exec('CREATE TABLE credential_records(id TEXT PRIMARY KEY,label TEXT,version INTEGER)');f.sql.prepare('INSERT INTO credential_records VALUES(?,?,1)').run(record,'Visible');
 f.sql.prepare("INSERT INTO authority_principals(id,kind,state,created_at,updated_at) VALUES(?,'agent','active',?,?)").run(agent,now,now);
 const actions=['execution.read','execution.reconcile','model.read','connection.read','model.generate'];
 f.sql.prepare('INSERT INTO authority_credentials(id,principal_id,token_hash,audience,scopes_json,created_at,expires_at,authentication_epoch) VALUES(?,?,?,?,?,?,?,1)').run(credential,agent,'test-hash','cradle',JSON.stringify([{appId:app,actions,purposes:['analysis']}]),now,now+3600000);
 const rules=[{id:policyId,principals:[{id:agent,kind:'agent'}],entityId:entity,rows:{kind:'all',conditions:[]},readableFields:[field],writableFields:[],actions,effect:'allow'}];
 f.sql.prepare('INSERT INTO authority_policies VALUES(?,?,?,?,?,?,?)').run(policyId,app,'Scoped analysis',JSON.stringify(rules),1,now,now);f.sql.prepare('INSERT INTO authority_memberships VALUES(?,?,?,?,?,?)').run(agent,app,policyId,0,'active',1);
 const principal={id:agent,kind:'agent',humanId:null,sessionId:null,credentialId:credential,issuedAt:instant,expiresAt:new Date(now+3600000).toISOString(),authenticationEpoch:1},ctx={principal,requestId:id(),now:instant,ingress:'queue'};
 const expected=[{ref:{appId:app,entityId:entity,recordId:record},version:1}],request={appId:app,action:'model.generate',connectionId:connection,connectionVersion:1,purpose:'analysis',fieldIds:[field],expected};
 f.sql.prepare("INSERT INTO provider_connections(id,app_id,adapter_id,name,state,account_id,scopes_json,ownership_json,version,created_at,updated_at) VALUES(?,?,'openai','Model','connected','account','[]','[]',1,?,?)").run(connection,app,instant,instant);
 f.sql.prepare("INSERT INTO execution_runs(id,app_id,origin_command_id,request_json,actor_json,state,control_epoch,cause_identity,created_at,updated_at) VALUES(?,?,?,?,?,'unknown',0,'{}',?,?)").run(run,app,command,JSON.stringify(request),JSON.stringify(principal),instant,instant);
 f.sql.prepare("INSERT INTO execution_attempts(id,run_id,command_id,connection_id,action,provider,idempotency_key,input_hash,authority_hash,authorization_json,lease_epoch,state,reservation_ids_json,unknown_deadline,custodian_id,created_at,updated_at) VALUES(?,?,?,?,?,'openai',?,'payload','bound',?,0,'unknown','[]',?,?,?,?)").run(attempt,run,command,connection,'model.generate','key',JSON.stringify({inputHash:'bound'}),new Date(now+60000).toISOString(),agent,instant,instant);
 const policy=createPolicyPort(f.db,{get(a,e){return a===app&&e===entity?{id:entity,table:'credential_records',idColumn:'id',fields:[{id:field,column:'label',type:'text',nullable:false}]}:undefined}}),access=createCredentialAccess(f.db,policy);
 const permit=await access(ctx,connection,'readback',{attemptId:attempt});assert.equal(permit.reservationMutations.length,0);assert.equal(permit.action,'execution.reconcile');
 await assert.rejects(access(ctx,connection,'readback',{}));await assert.rejects(access(ctx,id(),'readback',{attemptId:attempt}));await assert.rejects(access({...ctx,principal:{...principal,id:id()}},connection,'readback',{attemptId:attempt}));
 await assert.rejects(policy.authorize(ctx,{...request,inputHash:'x',cost:[],action:'model.generate'}));
 await assert.rejects(policy.authorize(ctx,{...request,inputHash:'x',cost:[],action:'execution.reconcile',fieldIds:[hidden]}));
 f.sql.prepare('UPDATE provider_connections SET version=2 WHERE id=?').run(connection);await assert.rejects(access(ctx,connection,'dispatch',{attemptId:attempt}));assert.ok(await access(ctx,connection,'readback',{attemptId:attempt}));
 f.sql.prepare('UPDATE authority_credentials SET revoked_at=? WHERE id=?').run(now,credential);await assert.rejects(access(ctx,connection,'readback',{attemptId:attempt}));
 }finally{f.close();}
});
