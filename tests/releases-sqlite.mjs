import './helpers/typescript-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {RunnerService} from '../authoring/runner/service.mjs';import {DockerRuntime} from '../authoring/runner/runtime.mjs';import {createRunnerServer} from '../authoring/runner/server.mjs';
const {RunnerClient}=await import('../src/domains/construction/runner-client.server.ts');const {IsolatedSqlite}=await import('../src/domains/releases/isolated-db.server.ts');
const live=process.env.CRADLE_TEST_DOCKER_HOST;
test('actual isolated SQLite rehearsal preserves prior data and rolls back failed unique migration',{skip:!live},async()=>{
 process.env.DOCKER_HOST=live;const state=await mkdtemp(join(tmpdir(),'cradle-sqlite-rehearsal-')),keys=generateKeyPairSync('ed25519'),token=randomBytes(32).toString('hex');
 const service=new RunnerService({stateDirectory:state,jobDirectory:'/tmp/cradle-authoring-jobs-20260927',runtime:new DockerRuntime({image:process.env.CRADLE_TEST_IMAGE,runtime:'runc',dedicatedVm:true}),privateKey:keys.privateKey,artifactOrigins:[],token});await service.open();const server=createRunnerServer(service,{token});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const client=new RunnerClient({url:`http://127.0.0.1:${server.address().port}`,token,publicKey:keys.publicKey.export({type:'spki',format:'pem'}),allowLocalDevelopment:true});const isolated=new IsolatedSqlite(client);
 try{
  await isolated.execute([{sql:'CREATE TABLE records(id TEXT PRIMARY KEY,value TEXT)',values:[],kind:'run'},{sql:'INSERT INTO records VALUES(?,?)',values:['owner','custom'],kind:'run'}]);
  const initial=await isolated.identity();const db=isolated.binding();assert.equal((await db.prepare('SELECT value FROM records WHERE id=?').bind('owner').first()).value,'custom');
  const before=await isolated.identity();await assert.rejects(isolated.execute([{sql:'UPDATE records SET value=? WHERE id=?',values:['bad','owner'],kind:'run'},{sql:'INSERT INTO records VALUES(?,?)',values:['owner','duplicate'],kind:'run'}]));assert.equal(await isolated.identity(),before);
  assert.equal((await db.prepare('SELECT value FROM records').first()).value,'custom');
  await isolated.execute([{sql:'CREATE TABLE records_v2(id TEXT PRIMARY KEY,value TEXT,verified INTEGER NOT NULL)',values:[],kind:'run'},{sql:'INSERT INTO records_v2 SELECT id,value,1 FROM records',values:[],kind:'run'}]);
  assert.equal((await db.prepare('SELECT value,verified FROM records_v2').first()).verified,1);assert.equal((await db.prepare('SELECT value FROM records').first()).value,'custom');assert.ok(isolated.artifacts.length>=5);assert.notEqual(await isolated.identity(),initial);
 }finally{await isolated.close();await new Promise(r=>server.close(r));await service.close();await rm(state,{recursive:true,force:true});}
});
