import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, hash, mac, authenticate, attest, verifyAttestation, redact } from '../authoring/runner/integrity.mjs';
import { parseBundle, materialize, collect } from '../authoring/runner/bundle.mjs';
import { Store } from '../authoring/runner/store.mjs';
import { dockerArgs, validateJob, DockerRuntime } from '../authoring/runner/runtime.mjs';
import { RunnerService } from '../authoring/runner/service.mjs';
import { DeploymentService } from '../authoring/runner/deployments.mjs';
import { publicAddress } from '../authoring/runner/download.mjs';
import { prepareHostOnlyFile, deniedHostFileRead } from './helpers/authoring-host-file.mjs';
const keys=generateKeyPairSync('ed25519');
const enc=files=>Buffer.from(canonical({version:1,files:Object.entries(files).map(([path,content])=>({path,content:Buffer.from(content).toString('base64')}))}));
const job={jobId:'test-job-0001',kind:'build',networkAllowlist:[],limits:{cpuSeconds:5,wallSeconds:10,memoryBytes:67108864},outputSchemaHash:hash('schema')};
test('request authentication binds method/path/body, expires, and rejects replay durably',async()=>{
 const token=randomBytes(32).toString('hex'), body=Buffer.from('{"a":1}'), ts=String(Date.now()), nonce=randomBytes(24).toString('hex');
 const headers={'x-cradle-timestamp':ts,'x-cradle-nonce':nonce,'x-cradle-signature':mac(token,'POST','/jobs',ts,nonce,body)};
 assert.equal(authenticate(headers,'POST','/jobs',body,token).nonce,nonce);
 assert.throws(()=>authenticate(headers,'GET','/jobs',body,token));
 assert.throws(()=>authenticate(headers,'POST','/jobs',Buffer.from('{}'),token));
 assert.throws(()=>authenticate(headers,'POST','/jobs',body,token,Number(ts)+60001));
 const dir=await mkdtemp(join(tmpdir(),'cradle-auth-test-')); let store=new Store(join(dir,'s.db'));
 store.nonce(nonce,Number(ts)+60000); store.close(); store=new Store(join(dir,'s.db')); assert.throws(()=>store.nonce(nonce,Number(ts)+60000)); store.close(); await rm(dir,{recursive:true});
});
test('signed artifacts cannot be forged; logs redact credentials',()=>{
 const e=attest({sourceHash:hash('a'),state:'succeeded'},keys.privateKey); assert.ok(verifyAttestation(e,keys.publicKey)); e.payload.sourceHash=hash('b'); assert.equal(verifyAttestation(e,keys.publicKey),false);
 assert.equal(redact('token=secretvalue hello',['hello']),'token=[REDACTED] [REDACTED]');
});
test('source path, symlink and network fail closed; isolation flags explicit',async()=>{
 assert.throws(()=>parseBundle(enc({'../escape':'bad'}))); assert.throws(()=>validateJob({...job,networkAllowlist:['https://example.com']}));
 for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fd00::1']) assert.equal(publicAddress(ip),false);
 const args=dockerArgs({job,root:'/tmp/jobs/one',image:`node@sha256:${'a'.repeat(64)}`},['node','main.mjs']);
 for(const flag of ['--read-only','--network','none','--cap-drop','ALL','no-new-privileges','--pids-limit','--memory','--ulimit']) assert.ok(args.includes(flag));
 assert.throws(()=>new DockerRuntime({image:'node',runtime:'runc'}));
 const dir=await mkdtemp(join(tmpdir(),'cradle-output-test-')); const {symlink}=await import('node:fs/promises'); await symlink('/etc/passwd',join(dir,'escape')); await assert.rejects(collect(dir),/unsafe_output/); await rm(dir,{recursive:true});
});
test('job idempotency, cancellation and restart preserve terminal identity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cradle-store-test-')); let store=new Store(join(dir,'s.db')); store.submit(job); assert.equal(store.submit(job).id,job.jobId); assert.throws(()=>store.submit({...job,kind:'optimize'}),/idempotency/); assert.equal(store.claim(job.jobId),true); store.cancel(job.jobId); assert.equal(store.finish(job.jobId,'succeeded',{}),false); store.close(); store=new Store(join(dir,'s.db')); assert.equal(store.get(job.jobId).state,'cancelled'); store.close(); await rm(dir,{recursive:true});
});
const live=process.env.CRADLE_TEST_DOCKER_HOST;
test('real isolated source builds screen, executes changed app action, deploys exact bytes and rejects forged build',{skip:!live},async()=>{
 process.env.DOCKER_HOST=live;
 const state=await mkdtemp(join(tmpdir(),'cradle-runner-state-'));
 const jobs='/tmp/cradle-authoring-jobs-20260927'; await mkdir(jobs,{recursive:true});
 const runtime=new DockerRuntime({image:process.env.CRADLE_TEST_IMAGE,runtime:'runc',dedicatedVm:true});
 const runner=new RunnerService({stateDirectory:state,jobDirectory:jobs,runtime,privateKey:keys.privateKey,artifactOrigins:[],token:'test-secret-not-in-guest'});
 await runner.open(); clearInterval(runner.timer);
 try {
 const source=enc({'cradle-build.json':JSON.stringify({commands:{build:['node','build.mjs'],evaluate:['node','check.mjs'],invoke:['node','server.mjs']}}),'build.mjs':`import fs from 'node:fs'; fs.mkdirSync('/output/public');fs.writeFileSync('/output/public/index.html','<h1>Owner-written dispatch</h1>');`, 'check.mjs':`import assert from 'node:assert/strict'; import fs from 'node:fs';assert.equal(process.env.CRADLE_RUNNER_TOKEN,undefined);assert.throws(()=>fs.writeFileSync('/workspace/no','x'));fs.writeFileSync('/output/check.json',JSON.stringify({checked:true}));`, 'server.mjs':`import fs from 'node:fs'; const input=JSON.parse(fs.readFileSync('/input/input.json')); fs.writeFileSync('/output/response.json',JSON.stringify({status:200,body:JSON.stringify({adjusted:input.amount*3,ownerRule:'triple'})}));`});
 const input=Buffer.from('{}'); const actual={...job,jobId:'actual-build-0001',sourceArtifact:{id:'source',sha256:hash(source)},inputArtifact:{id:'input',sha256:hash(input)}};
 runner.store.submit(actual);runner.store.claim(actual.jobId);
 const result=await runner.execute(actual,source,input,new AbortController().signal);
 assert.ok(verifyAttestation(result,keys.publicKey)); assert.equal(result.payload.sourceHash,hash(source));
 const deployment=new DeploymentService(runner); const request={id:'deployment-0001',buildId:actual.jobId,sourceHash:hash(source),artifactHash:result.payload.artifacts[0].sha256};
 assert.throws(()=>deployment.prepare({...request,sourceHash:hash('forged')}),/unverified/);
 deployment.prepare(request); const probe=await deployment.invoke(request.id,{amount:7},{probe:true}); assert.equal(JSON.parse(probe.payload.response.body).adjusted,21); assert.equal(probe.payload.sourceHash,hash(source));
 assert.match((await deployment.asset(request.id,'index.html')).toString(),/Owner-written dispatch/);
 runner.store.activate(request.id);const live=await deployment.invoke(request.id,{amount:11});assert.equal(JSON.parse(live.payload.response.body).adjusted,33);
 runner.store.stopDeployment(request.id);await assert.rejects(deployment.invoke(request.id,{amount:1}),/inactive/);
 const evalJob={...actual,jobId:'actual-evaluate-0001',kind:'evaluate'};runner.store.submit(evalJob);runner.store.claim(evalJob.jobId);const evaluated=await runner.execute(evalJob,source,input,new AbortController().signal);assert.equal(evaluated.payload.state,'succeeded');
 } finally {await runner.close();await rm(state,{recursive:true,force:true});for(const id of ['actual-build-0001','actual-evaluate-0001'])await rm(join(jobs,id),{recursive:true,force:true});}
});
test('real authenticated HTTP upload/job/artifact, replay rejection and cancellation',{skip:!live},async()=>{
 const {createRunnerServer}=await import('../authoring/runner/server.mjs');process.env.DOCKER_HOST=live;
 const state=await mkdtemp(join(tmpdir(),'cradle-http-runner-'));const token=randomBytes(32).toString('hex');
 const runner=new RunnerService({stateDirectory:state,jobDirectory:'/tmp/cradle-authoring-jobs-20260927',runtime:new DockerRuntime({image:process.env.CRADLE_TEST_IMAGE,runtime:'runc',dedicatedVm:true}),privateKey:keys.privateKey,artifactOrigins:[],token});await runner.open();
 const server=createRunnerServer(runner,{token,deployToken:'separate-privileged-test-deploy-token'});await new Promise(resolve=>server.listen(Number(process.env.CRADLE_TEST_PORT??0),'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 async function request(method,path,value,repeat){const body=Buffer.isBuffer(value)?value:Buffer.from(value?canonical(value):'');const ts=String(Date.now()),nonce=randomBytes(24).toString('hex');const headers={'x-cradle-timestamp':ts,'x-cradle-nonce':nonce,'x-cradle-signature':mac(token,method,path,ts,nonce,body)};const response=await fetch(base+path,{method,headers,body:body.length?body:undefined});if(repeat)assert.equal((await fetch(base+path,{method,headers,body:body.length?body:undefined})).status,401);return response;}
 try{
  const source=enc({'cradle-build.json':JSON.stringify({commands:{build:['node','main.mjs']}}),'main.mjs':`import fs from 'node:fs';fs.writeFileSync('/output/result.json',JSON.stringify({answer:6*7}));`}),input=Buffer.from('{}');
  for(const bytes of [source,input]){const r=await request('PUT',`/artifacts/${hash(bytes)}`,bytes,true);assert.equal(r.status,200);assert.ok(verifyAttestation(await r.json(),keys.publicKey));}
  assert.equal((await request('PUT',`/artifacts/${hash('wrong')}`,source)).status,400);
  const requestJob={...job,jobId:'http-source-build-0001',sourceArtifact:{id:hash(source),sha256:hash(source),downloadUrl:`runner:${hash(source)}`},inputArtifact:{id:hash(input),sha256:hash(input),downloadUrl:`runner:${hash(input)}`}};
  assert.equal((await request('POST','/jobs',requestJob,true)).status,200);
  let envelope;const deadline=Date.now()+15000;do{envelope=await(await request('GET',`/jobs/${requestJob.jobId}`)).json();if(['queued','running'].includes(envelope.payload.state))await new Promise(r=>setTimeout(r,100));}while(['queued','running'].includes(envelope.payload.state)&&Date.now()<deadline);
  assert.ok(verifyAttestation(envelope,keys.publicKey));assert.equal(envelope.payload.state,'succeeded');
  const artifact=Buffer.from(await(await request('GET',`/artifacts/${envelope.payload.artifacts[0].sha256}`)).arrayBuffer());assert.equal(hash(artifact),envelope.payload.artifacts[0].sha256);assert.equal(JSON.parse(Buffer.from(parseBundle(artifact).files[0].content,'base64')).answer,42);
  assert.equal((await request('POST','/deployments',{})).status,401);
  const slow=enc({'cradle-build.json':JSON.stringify({commands:{build:['node','slow.mjs']}}),'slow.mjs':'setInterval(()=>{},1000)'});await request('PUT',`/artifacts/${hash(slow)}`,slow);
  const cancelled={...requestJob,jobId:'http-cancel-job-0001',sourceArtifact:{id:hash(slow),sha256:hash(slow),downloadUrl:`runner:${hash(slow)}`}};await request('POST','/jobs',cancelled);await new Promise(r=>setTimeout(r,350));assert.equal((await request('POST',`/jobs/${cancelled.jobId}/cancel`,{})).status,200);assert.equal((await(await request('GET',`/jobs/${cancelled.jobId}`)).json()).payload.state,'cancelled');
 }finally{await new Promise(resolve=>server.close(resolve));await runner.close();await rm(state,{recursive:true,force:true});}
});
test('real hostile source cannot publish symlink artifacts or egress; deadline terminates code',{skip:!live},async()=>{
 process.env.DOCKER_HOST=live;const state=await mkdtemp(join(tmpdir(),'cradle-fault-runner-'));const jobs='/tmp/cradle-authoring-jobs-20260927';
 const runtime=new DockerRuntime({image:process.env.CRADLE_TEST_IMAGE,runtime:'runc',dedicatedVm:true});const runner=new RunnerService({stateDirectory:state,jobDirectory:jobs,runtime,privateKey:keys.privateKey,artifactOrigins:[],token:'host-only-secret'});
 let hostFile;
 try{
  hostFile=await prepareHostOnlyFile({image:runtime.image,binary:runtime.binary});
  await runner.open();clearInterval(runner.timer);
  for(const [id,script,success] of [
   ['fault-egress-0001',`import fs from 'node:fs';import net from 'node:net';import assert from 'node:assert/strict';assert.equal(process.env.CRADLE_RUNNER_TOKEN,undefined);${deniedHostFileRead(hostFile.path)}assert.throws(()=>fs.writeFileSync('/workspace/edited','bad'));const socket=net.connect({host:'1.1.1.1',port:443});await new Promise((resolve,reject)=>{socket.on('connect',()=>reject(new Error('egress allowed')));socket.on('error',resolve);socket.setTimeout(500,()=>{socket.destroy();resolve();});});fs.writeFileSync('/output/proof.json',JSON.stringify({hostFileDenied:true,networkDenied:true,sourceReadOnly:true}));`,true],
   ['fault-symlink-0001',`import fs from 'node:fs';fs.symlinkSync('/input/input.json','/output/leak');`,false],
   ['fault-timeout-0001',`while(true){}`,false],
  ]){
   const source=enc({'cradle-build.json':JSON.stringify({commands:{build:['node','main.mjs']}}),'main.mjs':script}),input=Buffer.from('{}'),request={...job,jobId:id,limits:{...job.limits,cpuSeconds:2,wallSeconds:3},sourceArtifact:{id:hash(source),sha256:hash(source)},inputArtifact:{id:hash(input),sha256:hash(input)}};runner.store.submit(request);runner.store.claim(id);
   const execute=()=>runner.execute(request,source,input,new AbortController().signal);if(success)assert.equal((await execute()).payload.state,'succeeded');else await assert.rejects(execute(),/sandbox_exit/);
   await rm(join(jobs,id),{recursive:true,force:true});
  }
 }finally{try{await runner.close();}finally{try{if(hostFile)await hostFile.cleanup();}finally{await rm(state,{recursive:true,force:true});}}}
});
