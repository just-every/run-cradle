import './auth-support.mjs';
import {fixture} from './auth-support.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const {createApiKeyWriter}=await import('../src/domains/connections/api-keys.server.ts');
const {environmentKeyring,open}=await import('../src/domains/connections/crypto.server.ts');
const {createUlid}=await import('../src/core/shared/ids.ts');
test('API key setup seals secrets before admission, binds version and denies non-session callers',async()=>{const f=fixture();try{
 f.sql.exec(readFileSync(new URL('../migrations/core/0501_connections.sql',import.meta.url),'utf8'));const id=createUlid(),app=createUlid(),now=new Date().toISOString();f.sql.prepare("INSERT INTO provider_connections(id,app_id,adapter_id,name,state,account_id,scopes_json,ownership_json,control_epoch,version,created_at,updated_at) VALUES(?,?,'resend','Mail','unconfigured','sender@example.test','[]','[]',0,1,?,?)").run(id,app,now,now);
 const keyring=environmentKeyring('v1',()=>Buffer.alloc(32,8).toString('base64'));let plan;const writer=createApiKeyWriter({db:f.db,keyring,workspaceId:'workspace',policy:{authorize:async(_ctx,r)=>({action:r.action,appId:r.appId,guards:[],reservationIds:[],reservationMutations:[]})},admission:{replay:async()=>null,commit:async(_ctx,p)=>{plan=p;return {result:{state:'committed',value:p.committedResult}}}}});
 const ctx={principal:{id:f.id,kind:'human',sessionId:createUlid()},now},input={commandId:createUlid(),expectedVersion:1,dispatchSecret:'dispatch-test-secret-only',readbackSecret:'readback-test-secret-only'};
 const result=await writer(ctx,id,input);assert.equal(result.result.value.version,2);assert.ok(!JSON.stringify(plan).includes(input.dispatchSecret));assert.ok(!JSON.stringify(plan).includes(input.readbackSecret));const encrypted=plan.mutations[0].row.sealed_json;const keys=JSON.parse(await open(keyring,'workspace',id,'api-keys',JSON.parse(encrypted)));assert.equal(keys.dispatch,input.dispatchSecret);assert.equal(keys.readback,input.readbackSecret);
 await assert.rejects(writer({...ctx,principal:{...ctx.principal,sessionId:null}},id,input),/current human session/);await assert.rejects(writer(ctx,id,{...input,expectedVersion:2}),/changed/);
 }finally{f.close();}});
