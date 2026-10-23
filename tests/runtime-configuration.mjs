import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
test('emitted Worker rejects missing production secrets and reports actual bound resource health',async()=>{
 const port=Number(process.env.CRADLE_TEST_PORT ?? 0)
 let origin=`http://127.0.0.1:${port}`
 assert.equal(await fetch(origin+'/health').catch(()=>null),null,'Refuse another listener')
 const dir=await mkdtemp(path.join(tmpdir(),'cradle-config-'))
 const worker=spawn(process.execPath,['tests/helpers/compiled-worker.mjs','--port',String(port),'--persist-to',dir],{detached:true,stdio:['ignore','pipe','pipe']})
 let output='';worker.stdout.on('data',c=>{output+=c;const listener=output.match(/Emitted Worker listening at (http:\/\/127\.0\.0\.1:\d+)/);if(listener)origin=listener[1]});worker.stderr.on('data',c=>output+=c)
 try{
  let response;for(let i=0;i<100;i++){response=await fetch(origin+'/health').catch(()=>null);if(response)break;await new Promise(r=>setTimeout(r,100))}
  assert.ok(response,output);assert.equal(response.status,503);const body=await response.json();assert.ok(body.missing.includes('OWNER_EMAIL'));assert.ok(body.missing.includes('SESSION_SECRET'));assert.ok(body.missing.includes('APP_ORIGIN'));assert.equal(body.database,'available');assert.equal(body.storage,'available');assert.equal(body.queue,'available')
  const denied=await fetch(origin+'/');assert.equal(denied.status,503);assert.equal((await denied.json()).error.code,'unconfigured')
 }finally{
  if(worker.exitCode===null){const exit=new Promise(resolve=>worker.once('exit',resolve));process.kill(-worker.pid,'SIGTERM');const timer=setTimeout(()=>{try{process.kill(-worker.pid,'SIGKILL')}catch{}},5000);await exit;clearTimeout(timer)}
  await rm(dir,{recursive:true,force:true})
 }
})
