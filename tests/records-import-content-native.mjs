import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {contract} from './contract.mjs'
import {openImportD1} from './helpers/records-import-d1-runtime.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {prepareFixture} from './helpers/records-import-fixture.mjs'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {createBaseImportService} from '../src/domains/records/base-transfer/service.server.ts'

// Source ground truth lists these four task values. The immutable fixture's
// main mapping skips both fields; this additional owner mapping keeps defaults.
const values={progressFormula:['0.75','0.5','1','0'],projectTaskCount:['3','3','3','1']}
for(const format of ['csv','api'])contract('RECORDS-005',`actual D1 default ${format} formula and rollup content retains four exact values and honest behavior counts`,async()=>{
 const fixture=await prepareFixture('project-tracker',format),directory=await mkdtemp(join(tmpdir(),'cradle-content-')),storage=await openImportD1(directory,true)
 try{
  const h=await harness({...storage,close:()=>{}}),r=await h.runtime(),options=structuredClone(fixture.preview.options),table=fixture.mapping.tables.find(t=>t.key==='tasks'),key=fixture.tableKey(table),identity=fixture.preview.identities.tables[key]
  for(const name of Object.keys(values)){const field=table.fields.find(f=>f.key===name);options.tables[key].columns[fixture.columnKey(table,field)]={label:field.label}}
  const preview=previewBaseImport(fixture.source,options,fixture.preview.identities),service=createBaseImportService(storage.db,r.policy,r.registry,r.manual,previewBaseImport),ack={fingerprint:preview.fingerprint,acceptLoss:true},review=await service.review(h.ctx,preview,ack)
  let job=await service.adopt(h.ctx,review.reviewId,{...ack,physicalFingerprint:review.physicalFingerprint})
  for(let n=0;job.state!=='completed'&&n<50;n++)job=await service.resume(h.ctx,job.id)
  assert.equal(job.state,'completed');const status=await service.status(h.ctx,job.id);assert.equal(status.progress.appliedRecords,9);assert.equal(status.reconciliation.ok,true)
  const live=await h.runtime(),descriptor=live.registry.get(preview.identities.appId,identity.entityId),scope=await live.policy.scope(h.ctx,{appId:preview.identities.appId,entityId:identity.entityId,purpose:'read'})
  const rows=fixture.source.tables.find(t=>t.key===key).rows
  for(const [name,expected]of Object.entries(values)){
   const field=table.fields.find(f=>f.key===name),column=fixture.columnKey(table,field),id=identity.fields[column],schema=descriptor.schema.fields.find(f=>f.id===id),report=status.report.tables.find(t=>t.tableKey===key).columns.find(c=>c.columnKey===column)
   // A3 requires numeric formula/rollup outputs to default to Number in both formats.
   assert.equal(schema.type,'number');assert.equal(schema.expression,undefined)
   const actual=[];for(const row of rows){const record=await live.services.reader.record(h.ctx,scope,{appId:preview.identities.appId,entityId:identity.entityId,recordId:identity.records[row.key]});assert.equal(record.fields[id].state,'value');actual.push(record.fields[id].value)}assert.deepEqual(actual,expected)
   assert.deepEqual({converted:report.converted,textChanges:report.textChanges,keptText:report.keptText,notRecreated:report.notRecreated,recomputed:report.recomputed,nonempty:report.nonempty,unparseable:report.unparseable,skippedNonempty:report.skippedNonempty},format==='api'?{converted:4,textChanges:0,keptText:0,notRecreated:4,recomputed:0,nonempty:4,unparseable:0,skippedNonempty:0}:{converted:name==='progressFormula'?4:0,textChanges:name==='progressFormula'?4:0,keptText:0,notRecreated:0,recomputed:0,nonempty:4,unparseable:0,skippedNonempty:0})
  }
  assert.equal(status.report.tables.flatMap(t=>t.links).reduce((n,l)=>n+l.referencesRead,0),19)
 }finally{await storage.close();await rm(directory,{recursive:true,force:true})}
})
