import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {contract} from './contract.mjs'
import {undoSetup,undoSqlite} from './helpers/records-undo-harness.mjs'
import {createUlid} from '../src/core/shared/ids.ts'

contract('RECORDS-005','disk and process restart continues bounded reversal from only stored job and current sign-in, with identical downloadable terminal report',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-preserved-undo-')),filename=join(directory,'native.sqlite'),input=join(directory,'job.json'),output=join(directory,'report.json'),x=await undoSetup({storage:undoSqlite(filename),count:25})
 let closed=false
 try{
  let job=x.job;while(job.state!=='completed')job=await x.service.resume(x.h.ctx,job.id)
  const ref={appId:x.appId,entityId:x.table.entityId,recordId:x.ids[0]}
  await x.r.commands.get('record.patch').execute(x.h.ctx,{commandId:createUlid(),expected:[{ref,version:1}],input:{ref,changes:{[x.table.fields['column-1']]:'Survives process restart'}}})
  job=await x.service.undo(x.h.ctx,job.id);assert.equal(job.state,'undoing');const first=await x.service.status(x.h.ctx,job.id);assert.equal(first.reversal.total,50);assert.ok(first.reversal.remaining>=30)
  await writeFile(input,JSON.stringify({ctx:x.h.ctx,jobId:job.id}));x.h.close();closed=true
  await promisify(execFile)(process.execPath,['--import','./tests/helpers/typescript-loader.mjs','tests/helpers/records-undo-restart.mjs',filename,input,output],{cwd:process.cwd(),env:process.env})
  const result=JSON.parse(await readFile(output,'utf8'));assert.equal(result.status.job.state,'undone');assert.equal(result.status.reversal.retained,1);assert.equal(result.status.reversal.reversed,49);assert.equal(result.status.reversal.remaining,0);assert.equal(result.status.report.tables[0].created,25);assert.ok(result.batches>=2);assert.deepEqual(result.status,result.download);assert.equal(result.originals[0].original.base64,x.bytes.toString('base64'))
  assert.deepEqual(Object.keys(JSON.parse(await readFile(input,'utf8'))).sort(),['ctx','jobId'],'Child process receives no source bytes, mapping, native IDs or in-memory plan')
  await promisify(execFile)(process.execPath,['--import','./tests/helpers/typescript-loader.mjs','tests/helpers/records-undo-restart.mjs',filename,input,output],{cwd:process.cwd(),env:process.env})
  const repeated=JSON.parse(await readFile(output,'utf8'));assert.deepEqual(repeated.status,result.status);assert.deepEqual(repeated.originals,result.originals);assert.equal(repeated.batches,0)
 }finally{if(!closed)x.h.close();await rm(directory,{recursive:true,force:true})}
})
