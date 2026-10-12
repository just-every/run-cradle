import './helpers/typescript-loader.mjs'
import {contract} from './contract.mjs'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {openImportD1} from './helpers/records-import-d1-runtime.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {decimalSource,decimalRows} from './helpers/records-api-decimal-source.mjs'
import {allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {createBaseImportService} from '../src/domains/records/base-transfer/service.server.ts'
import {loadReview} from '../src/domains/records/base-transfer/storage-review.server.ts'
import {createUlid} from '../src/core/shared/ids.ts'

contract('RECORDS-005','RECORDS-004 actual D1 retains exact API digits through serialized job, readback, reconciliation and CSV exit/reimport',async()=>{
 const tokens=['0.123456789012345678','0.123456789012345679','0.12345678901234567890123456789012','9007199254740991.1','-1.23e-7','42','"42"','-0'],expected=[...tokens.slice(0,4),'-0.000000123','42','42','0']
 const {source}=await decimalSource([decimalRows(tokens)]),ids=allocateImportIdentities(source),p=previewBaseImport(source,{name:'Durable exact API'},ids),directory=await mkdtemp(join(tmpdir(),'cradle-api-decimal-')),storage=await openImportD1(directory,true)
 try{
  const h=await harness({...storage,close:()=>{}}),r=await h.runtime(),service=createBaseImportService(storage.db,r.policy,r.registry,r.manual,previewBaseImport),ack={fingerprint:p.fingerprint,acceptLoss:true},review=await service.review(h.ctx,p,ack)
  const retained=await loadReview(storage.db,review.reviewId,h.ctx.principal.id)
  assert.deepEqual(retained.detail.source.tables[0].rows[0].numericOrigins.amount,source.tables[0].rows[0].numericOrigins.amount)
  assert.equal(previewBaseImport(retained.detail.source,retained.detail.options,retained.detail.identities).fingerprint,p.fingerprint)
  const job=await service.adopt(h.ctx,review.reviewId,{...ack,physicalFingerprint:review.physicalFingerprint}),live=await h.runtime(),restart=createBaseImportService(storage.db,live.policy,live.registry,live.manual,()=>{throw new Error('Resume must use serialized job without reparsing source')})
  let applied=await restart.resume(h.ctx,job.id);while(applied.state!=='completed')applied=await restart.resume(h.ctx,job.id)
  const status=await restart.status(h.ctx,job.id);assert.equal(status.reconciliation.ok,true);assert.equal(status.progress.appliedRecords,tokens.length);assert.equal(status.report.tables[0].columns[1].converted,tokens.length-1)
  const identity=ids.tables.table,appId=ids.appId,entityId=identity.entityId,scope=await live.policy.scope(h.ctx,{appId,entityId,purpose:'read'})
  for(const [index,value]of expected.entries()){
   const record=await live.services.reader.record(h.ctx,scope,{appId,entityId,recordId:identity.records[`r${index}`]})
   assert.equal(record.fields[identity.fields.amount].state,'value');assert.equal(record.fields[identity.fields.amount].value,value)
  }
  const originals=await restart.originals(h.ctx,job.id)
  for(const artifact of source.bundle.artifacts){const retained=originals.find(a=>a.name===artifact.name);assert.equal(retained.sha256,artifact.sha256);assert.equal(retained.original.base64,artifact.original.base64)}
  const csv=await live.csv.exportCsv(h.ctx,{appId,entityId,query:{sort:[{fieldId:identity.fields.name,direction:'asc'}]}})
  for(const value of expected)assert.ok(csv.csv.includes(value))
  const draft=await live.manual.read(h.ctx,appId),original=draft.tables.find(t=>t.id===entityId),fieldIds=new Map(original.fields.map(f=>[f.id,createUlid()])),fresh={...original,id:createUlid(),label:'Exact restored',primaryFieldId:fieldIds.get(original.primaryFieldId),fields:original.fields.map(f=>({...f,id:fieldIds.get(f.id)}))}
  draft.tables.push(fresh)
  const schema=await live.manual.preview(h.ctx,draft);await live.manual.adopt(h.ctx,createUlid(),schema.id)
  const restored=await h.runtime(),request={appId,entityId:fresh.id,csv:csv.csv,mapping:fresh.fields.map(f=>({column:f.label,fieldId:f.id})),mergeFieldId:fieldIds.get(identity.fields.name)},csvPlan=await restored.csv.preview(h.ctx,request)
  assert.equal(csvPlan.creates,tokens.length);await restored.csv.commit(h.ctx,createUlid(),csvPlan.id)
  const restoredScope=await restored.policy.scope(h.ctx,{appId,entityId:fresh.id,purpose:'read'}),rows=await restored.services.reader.query(h.ctx,restoredScope,{sort:[{fieldId:fieldIds.get(identity.fields.name),direction:'asc'}]})
  assert.deepEqual(rows.items.map(row=>row.fields[fieldIds.get(identity.fields.amount)].value),expected)
  assert.equal((await restored.csv.exportCsv(h.ctx,{appId,entityId:fresh.id,query:{sort:[{fieldId:fieldIds.get(identity.fields.name),direction:'asc'}]}})).csv,csv.csv)
  assert.equal((await storage.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 }finally{await storage.close();await rm(directory,{recursive:true,force:true})}
})
