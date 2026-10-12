import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {createBaseImportService} from '../src/domains/records/base-transfer/service.server.ts'
import {canonicalJsonBytes,PLAN_BYTES_LIMIT} from '../vendor/base/modules/import-kit/src/plan/size.ts'

contract('RECORDS-005 BASE-INPUT-001','actual kit combined source cap refuses valid individual CSV limits during upload preview with zero database writes',async()=>{
 const h=await harness()
 try {
  // Capacity-only input: 20 files, each 75 rows of 90,000 characters. It is
  // below every original per-file/row/table/field/cell limit, but original
  // custody plus parsed content exceeds the kit's additional combined cap.
  const bytes=Buffer.from('Name,Content\r\n'+Array.from({length:75},(_,i)=>`Row ${i+1},${'x'.repeat(90000)}`).join('\r\n')+'\r\n')
  assert.ok(bytes.byteLength<10485760)
  const source=prepareCsvSource(Array.from({length:20},(_,i)=>({filename:`Capacity ${i+1}.csv`,bytes})))
  const measured=canonicalJsonBytes(source.bundle);assert.ok(measured>PLAN_BYTES_LIMIT)
  const runtime=await h.runtime(),before=h.sql.prepare('SELECT total_changes() n').get().n,service=createBaseImportService(h.db,runtime.policy,runtime.registry,runtime.manual,()=>{throw new Error('Over-cap upload must be refused before preview materialization')})
  await assert.rejects(service.uploadPreview(h.ctx,source,{name:'Combined capacity'},allocateImportIdentities(source)),error=>{assert.match(error.message,new RegExp(`limit ${PLAN_BYTES_LIMIT} bytes`));assert.match(error.message,new RegExp(`size ${measured} bytes`));assert.match(error.message,/Nothing was written/);return true})
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,before)
  for(const name of ['manual_record_previews','record_import_reviews','record_schemas','manual_record_bases','ik_jobs','ik_sources','ik_originals','ik_provenance'])assert.equal(h.sql.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n,0,name)
 }finally{h.close()}
})
contract('RECORDS-005 RECORDS-002','valid upload native preflight writes zero and adoption still binds current fingerprint and authority',async()=>{
 const h=await harness()
 try {
  const source=prepareCsvSource([{filename:'Rows.csv',bytes:Buffer.from('Name,Number\r\nOne,1\r\nTwo,2\r\n')}]),ids=allocateImportIdentities(source),runtime=await h.runtime(),service=createBaseImportService(h.db,runtime.policy,runtime.registry,runtime.manual,previewBaseImport),before=h.sql.prepare('SELECT total_changes() n').get().n
  const preview=await service.uploadPreview(h.ctx,source,{name:'Reviewed'},ids)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,before)
  assert.equal(preview.planSize.limit,PLAN_BYTES_LIMIT);assert.ok(preview.planSize.bytes>canonicalJsonBytes(source.bundle));assert.ok(preview.planSize.bytes<=preview.planSize.limit)
  const ack={fingerprint:preview.fingerprint,acceptLoss:true},review=await service.review(h.ctx,preview,ack)
  await assert.rejects(service.adopt(h.ctx,review.reviewId,{...ack,fingerprint:'0'.repeat(64)}),/Current mapping/)
  await h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run()
  const afterRevocation=h.sql.prepare('SELECT total_changes() n').get().n
  await assert.rejects(service.adopt(h.ctx,review.reviewId,{...ack,physicalFingerprint:review.physicalFingerprint}),/authority|denied|session|guard|constraint/i)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,afterRevocation)
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM record_schemas').get().n,0)
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM ik_jobs').get().n,0)
 }finally{h.close()}
})
