import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {contract} from './contract.mjs'
import {openImportD1} from './helpers/records-import-d1-runtime.mjs'
import {undoSetup} from './helpers/records-undo-harness.mjs'
import {storedUndoService} from './helpers/records-undo-stored-service.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {baseImportHttp} from '../src/domains/records/base-transfer/http.server.ts'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'

contract('RECORDS-005','actual workerd D1 restarts a mixed-conflict multi-batch undo and checks current authority for its durable report download',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-preserved-d1-'));let storage=await openImportD1(directory,true)
 try{
  const x=await undoSetup({storage:{...storage,close:()=>{}},count:25});let job=x.job
  while(job.state!=='completed')job=await x.service.resume(x.h.ctx,job.id)
  const ref={appId:x.appId,entityId:x.table.entityId,recordId:x.ids[0]};await x.r.commands.get('record.patch').execute(x.h.ctx,{commandId:createUlid(),expected:[{ref,version:1}],input:{ref,changes:{[x.table.fields['column-1']]:'D1 edited record'}}})
  job=await x.service.undo(x.h.ctx,job.id);assert.equal(job.state,'undoing');const before=await x.service.status(x.h.ctx,job.id);assert.ok(before.reversal.remaining>0)
  await storage.close();storage=await openImportD1(directory,false)
  const service=await storedUndoService(storage.db);let batches=0
  for(;job.state!=='undone'&&batches<100;batches++)job=await service.undo(x.h.ctx,job.id)
  assert.equal(job.state,'undone');assert.ok(batches>=2);const status=await service.status(x.h.ctx,job.id);assert.equal(status.reversal.reversed,49);assert.equal(status.reversal.retained,1);assert.equal(status.reversal.remaining,0);assert.equal(status.reversal.conflicts[0].evidence.observedRecordVersion,2)
  const authenticate=async request=>{assert.equal(request.headers.get('x-test-principal'),x.h.owner);return x.h.ctx},http=baseImportHttp(service,{prepare:prepareCsvSource,identities:allocateImportIdentities},authenticate,authenticate),download=await http.request('http://localhost/api/v1/records/base-import/jobs/'+job.id+'/report.json',{headers:{'x-test-principal':x.h.owner}});assert.equal(download.status,200);assert.deepEqual(await download.json(),status)
  assert.equal((await service.originals(x.h.ctx,job.id))[0].original.base64,x.bytes.toString('base64'));assert.equal((await storage.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
  const native=await storage.db.prepare(`SELECT id,"${x.descriptor.fields.get(x.table.fields['column-1']).column}" AS name FROM "${x.descriptor.table.tableId}"`).all();assert.deepEqual(native.results,[{id:x.ids[0],name:'D1 edited record'}]);assert.equal((await service.undo(x.h.ctx,job.id)).state,'undone');assert.deepEqual(await service.status(x.h.ctx,job.id),status)
 }finally{await storage.close();await rm(directory,{recursive:true,force:true})}
})
