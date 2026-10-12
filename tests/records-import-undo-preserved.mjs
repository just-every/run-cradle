import './helpers/records-tsx-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {undoSetup} from './helpers/records-undo-harness.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {add} from './helpers/records-manual-harness.mjs'
import {baseImportHttp} from '../src/domains/records/base-transfer/http.server.ts'
const {continuingImportOperation,importProgressKey}=await import('../src/ui/records/base-import/api.ts')
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {resumeD1Import,undoD1Import,rollbackD1Import,readD1ImportUndoReport,readD1ImportOriginals} from '../vendor/base/modules/import-kit/src/d1/index.ts'

async function finish(job,step,terminal){for(let n=0;job.state!==terminal&&n<1000;n++)job=await step(job.id);assert.equal(job.state,terminal);return job}
async function patch(x,id,changes){const ref={appId:x.appId,entityId:x.table.entityId,recordId:id};return x.r.commands.get('record.patch').execute(x.h.ctx,{commandId:createUlid(),expected:[{ref,version:1}],input:{ref,changes}})}
const rows=x=>x.h.db.prepare(`SELECT * FROM "${x.descriptor.table.tableId}" ORDER BY id`).all()

for(const cardinality of ['one','many'])for(const batchSize of [1,4,20])contract('RECORDS-005',`${cardinality}, batch ${batchSize}: preserved scalar edit removes every unchanged independent link and row and retains truthful custody`,async()=>{
 const x=await undoSetup({direct:true,cardinality,batchSize})
 try{
  await finish(x.job,id=>resumeD1Import(id,x.context),'completed')
  await patch(x,x.ids[0],{[x.table.fields['column-1']]:'Owner edited'})
  const attribution=await x.h.db.prepare('SELECT * FROM ik_provenance WHERE job_id=? AND target_kind=? AND target_id=?').bind(x.job.id,'record:'+x.table.entityId,x.ids[0]).first(),originals=await readD1ImportOriginals(x.job.id,x.context)
  await finish(await undoD1Import(x.job.id,x.context),id=>undoD1Import(id,x.context),'undone')
  const remaining=(await rows(x)).results;assert.equal(remaining.length,1);assert.equal(remaining[0].id,x.ids[0]);assert.equal(remaining[0][x.descriptor.fields.get(x.table.fields['column-1']).column],'Owner edited')
  const relation=x.descriptor.fields.get(x.table.fields['column-2']);if(relation.join)assert.equal((await x.h.db.prepare(`SELECT COUNT(*) n FROM "${relation.join.table.tableId}"`).first()).n,0);else assert.equal(remaining[0][relation.column],null)
  const report=await readD1ImportUndoReport(x.job.id,x.context);assert.equal(report.dispositions.length,26);assert.equal(report.dispositions.filter(d=>d.disposition==='reversed').length,25);const conflict=report.dispositions.find(d=>d.disposition==='retained');assert.equal(conflict.reason,'edited');assert.equal(conflict.entity.recordId,x.ids[0]);assert.equal(conflict.evidence.tableLabel,'Nodes');assert.equal(conflict.evidence.recordPrimary,'Owner edited');assert.equal(conflict.evidence.appliedRecordVersion,1);assert.equal(conflict.evidence.observedRecordVersion,2);assert.notEqual(conflict.expected.valueHash,conflict.observed.valueHash)
  assert.deepEqual(await x.h.db.prepare('SELECT * FROM ik_provenance WHERE id=?').bind(attribution.id).first(),attribution,'Retained applied attribution and fingerprint are immutable')
  assert.ok(await x.h.db.prepare('SELECT 1 FROM ik_sources WHERE identity=?').bind(attribution.source_identity).first(),'A retained effect keeps its active source')
  assert.deepEqual(await readD1ImportOriginals(x.job.id,x.context),originals)
  const repeated=await undoD1Import(x.job.id,x.context);assert.equal(repeated.state,'undone');assert.deepEqual(await readD1ImportUndoReport(x.job.id,x.context),report)
  await assert.rejects(undoD1Import(x.job.id,{...x.context,reversalPolicy:'strict'}),/REVERSAL_POLICY/)
  assert.equal((await x.h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 }finally{x.h.close()}
})
contract('RECORDS-005','actual service report downloads terminal preserved conflicts and original conversion accounting after fresh runtime',async()=>{
 const x=await undoSetup()
 try{
  await finish(x.job,id=>x.service.resume(x.h.ctx,id),'completed')
  await patch(x,x.ids[0],{[x.table.fields['column-1']]:'Retained owner edit'})
  let job=await x.service.undo(x.h.ctx,x.job.id),first=await x.service.status(x.h.ctx,x.job.id)
  assert.equal(job.state,'undoing');assert.ok(first.reversal.processed>0);assert.ok(first.reversal.remaining>0)
  const restart=x.restart();job=await finish(job,id=>restart.undo(x.h.ctx,id),'undone');const status=await restart.status(x.h.ctx,job.id)
  assert.equal(status.report.tables[0].created,13);assert.equal(status.report.tables[0].rowsRead,13);assert.equal(status.reversal.retained,1);assert.equal(status.reversal.remaining,0);assert.equal(status.reversal.terminal,true);assert.deepEqual(status.report.undo,status.reversal)
  assert.equal(status.reconciliation.ok,false);assert.deepEqual(status.reconciliation.mismatched,['record:'+x.table.entityId+':'+x.ids[0]])
  const authenticate=async()=>x.h.ctx,http=baseImportHttp(restart,{prepare:prepareCsvSource,identities:allocateImportIdentities},authenticate,authenticate),response=await http.request('http://localhost/api/v1/records/base-import/jobs/'+job.id+'/report.json')
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition'),/attachment/);assert.deepEqual(await response.json(),status)
  assert.equal((await restart.originals(x.h.ctx,job.id))[0].original.base64,x.bytes.toString('base64'))
  assert.equal((await x.h.db.prepare('SELECT COUNT(*) n FROM record_schemas WHERE app_id=?').bind(x.appId).first()).n,1)
  assert.deepEqual(await restart.status(x.h.ctx,job.id),status)
 }finally{x.h.close()}
})
contract('RECORDS-005','changed link preserves owner and referenced unchanged target while unrelated effects reverse',async()=>{
 const x=await undoSetup({count:3})
 try{
  await finish(x.job,id=>x.service.resume(x.h.ctx,id),'completed')
  await patch(x,x.ids[0],{[x.table.fields['column-2']]:[{appId:x.appId,entityId:x.table.entityId,recordId:x.ids[2]}]})
  await finish(await x.service.undo(x.h.ctx,x.job.id),id=>x.service.undo(x.h.ctx,id),'undone')
  const remaining=(await rows(x)).results.map(row=>row.id).sort();assert.deepEqual(remaining,[x.ids[0],x.ids[2]].sort())
  const report=(await x.service.status(x.h.ctx,x.job.id)).reversal;assert.equal(report.retained,3);const target=report.conflicts.find(c=>c.targetKind.startsWith('record:')&&c.targetId===x.ids[2]);assert.equal(target.reason,'dependency');assert.equal(target.protectedBy[0].cause.recordId,x.ids[0]);assert.equal(target.protectedBy[0].cause.field,x.table.fields['column-2']);assert.equal(target.protectedBy[0].cause.targetId,x.ids[2]);assert.equal((await x.h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 }finally{x.h.close()}
})
contract('RECORDS-005','new incoming outside-import record protects its target without detaching newer data',async()=>{
 const x=await undoSetup({count:3})
 try{
  await finish(x.job,id=>x.service.resume(x.h.ctx,id),'completed')
  const created=await add(x.h,x.r,x.descriptor.schema,{[x.table.fields['column-1']]:'New outside import',[x.table.fields['column-2']]:[{appId:x.appId,entityId:x.table.entityId,recordId:x.ids[1]}]})
  await finish(await x.service.undo(x.h.ctx,x.job.id),id=>x.service.undo(x.h.ctx,id),'undone')
  assert.deepEqual((await rows(x)).results.map(row=>row.id).sort(),[created.ref.recordId,x.ids[1]].sort())
  const report=(await x.service.status(x.h.ctx,x.job.id)).reversal;assert.equal(report.retained,1);assert.equal(report.conflicts[0].reason,'dependency');assert.equal(report.conflicts[0].protectedBy[0].cause.recordId,created.ref.recordId)
  const join=x.descriptor.fields.get(x.table.fields['column-2']).join.table.tableId;assert.deepEqual((await x.h.db.prepare(`SELECT record_id,value FROM "${join}"`).all()).results.map(row=>({...row})),[{record_id:created.ref.recordId,value:x.ids[1]}])
 }finally{x.h.close()}
})
for(const mode of ['all-edited','empty','rejected','partial','partial-edited'])contract('RECORDS-005',`${mode} reversal reaches its terminal state with durable original custody`,async()=>{
 const x=await undoSetup({count:mode==='empty'?0:3,rejected:mode==='rejected',direct:mode.startsWith('partial'),batchSize:1})
 try{
  let job=mode.startsWith('partial')?await resumeD1Import(x.job.id,x.context):await finish(x.job,id=>x.service.resume(x.h.ctx,id),'completed')
  if(mode==='all-edited')for(const id of x.ids)await patch(x,id,{[x.table.fields['column-1']]:'Edited '+id})
  if(mode==='partial-edited')await patch(x,x.ids[0],{[x.table.fields['column-1']]:'Edited partial record'})
  job=mode.startsWith('partial')?await finish(await rollbackD1Import(job.id,x.context),id=>rollbackD1Import(id,x.context),'rolled_back'):await finish(await x.service.undo(x.h.ctx,job.id),id=>x.service.undo(x.h.ctx,id),'undone')
  assert.equal((await rows(x)).results.length,mode==='all-edited'?3:mode==='partial-edited'?1:0)
  const report=await readD1ImportUndoReport(job.id,x.context);assert.equal(report.dispositions.filter(d=>d.disposition==='retained').length,mode==='all-edited'?3:mode==='partial-edited'?1:0)
  assert.equal((await readD1ImportOriginals(job.id,x.context))[0].original.base64,x.bytes.toString('base64'))
  assert.equal((await x.h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 }finally{x.h.close()}
})

contract('RECORDS-005','actual durable service statuses drive every reverse UI batch without using the unchanged forward checkpoint',async()=>{
 const x=await undoSetup({count:25})
 try{
  await finish(x.job,id=>x.service.resume(x.h.ctx,id),'completed')
  let status=await x.service.status(x.h.ctx,x.job.id);assert.equal(status.reversal,undefined)
  const checkpoint=status.job.checkpoint;let batches=0
  do{
   const prior=importProgressKey(status)
   await x.service.undo(x.h.ctx,x.job.id);status=await x.service.status(x.h.ctx,x.job.id);batches++
   assert.equal(status.job.checkpoint,checkpoint);assert.notEqual(importProgressKey(status),prior);assert.equal(continuingImportOperation(status),'undo');assert.equal(status.reversal.terminal,status.job.state==='undone')
  }while(status.job.state!=='undone'&&batches<100)
  assert.equal(status.job.state,'undone');assert.ok(batches>=3);assert.equal(status.reversal.processed,50);assert.equal(status.reversal.remaining,0)
  const terminal=importProgressKey(status);await x.service.undo(x.h.ctx,x.job.id);assert.equal(importProgressKey(await x.service.status(x.h.ctx,x.job.id)),terminal)
 }finally{x.h.close()}
})
