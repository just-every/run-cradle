import assert from 'node:assert/strict'
import {fork} from 'node:child_process'
import {once} from 'node:events'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {contract} from './contract.mjs'
for(const format of ['json','csv'])contract('RECORDS-005 RECORDS-006',`${format} actual process-group SIGKILL after native progress resumes stored accepted plan, reconciles and undoes`,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'base-exit-restart-')),receipt=join(directory,'receipt.json'),childFile=new URL('./helpers/base-exit-restart-child.mjs',import.meta.url);let child
 try{
  const launch=mode=>{const process=fork(childFile,[mode,format,join(directory,'d1'),receipt],{detached:true,stdio:['ignore','ignore','pipe','ipc'],execArgv:['--import',new URL('./helpers/typescript-loader.mjs',import.meta.url).pathname]});let errors='';process.stderr.on('data',chunk=>errors+=chunk);return {process,errors:()=>errors}}
  const started=launch('start');child=started.process;const exited=once(child,'exit'),[message]=await Promise.race([once(child,'message'),exited.then(([code])=>{throw new Error(`restart setup exited ${code}: ${started.errors()}`)})]);assert.ok(message.checkpoint>0);process.kill(-child.pid,'SIGKILL');assert.equal((await exited)[1],'SIGKILL');child=undefined
  assert.deepEqual(Object.keys(JSON.parse(await readFile(receipt,'utf8'))).sort(),['ctx','jobId']);const restarted=launch('resume');child=restarted.process;const [code]=await once(child,'exit');child=undefined;assert.equal(code,0,restarted.errors());const result=JSON.parse(await readFile(receipt+'.result','utf8'));assert.equal(result.records,27);assert.equal(result.reconciliation,true);assert.equal(result.state,'undone')
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,'SIGKILL')}catch{child.kill('SIGKILL')}await once(child,'exit').catch(()=>{})}await rm(directory,{recursive:true,force:true})}
})
