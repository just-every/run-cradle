import assert from 'node:assert/strict'
import {mock} from 'node:test'
import {contract} from './contract.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {expandedSource,guardExpandedJoins,counts} from './helpers/records-import-expanded-cap.mjs'
import {allocateImportIdentities,prepareCsvSource} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {createBaseImportService} from '../src/domains/records/base-transfer/service.server.ts'
import {canonicalJsonBytes,PLAN_BYTES_LIMIT} from '../vendor/base/modules/import-kit/src/plan/size.ts'
import {canonicalHash} from '../src/domains/records/base-transfer/canonical-stream.ts'

contract('RECORDS-005 BASE-INPUT-001','expanded legal CSV preview reaches actual Kit size refusal before aggregate encoding, including direct review and retained adoption',async()=>{
 const h=await harness();let restoreJoins=()=>{}
 try{
  const source=expandedSource(),ids=allocateImportIdentities(source),options={name:'Expanded capacity'},sourceBytes=canonicalJsonBytes(source.bundle)
  assert.ok(sourceBytes<PLAN_BYTES_LIMIT,`source-only cap must admit this regression (${sourceBytes})`)
  let expanded
  const runtime=await h.runtime(),builder=(...args)=>(expanded=previewBaseImport(...args)),service=createBaseImportService(h.db,runtime.policy,runtime.registry,runtime.manual,builder)
  const {largestJoin,restore}=guardExpandedJoins();restoreJoins=restore
  const before=counts(h),changes=h.sql.prepare('SELECT total_changes() n').get().n
  const refuses=error=>{assert.equal(error.code,'capacity_limit');assert.match(error.message,new RegExp(`limit ${PLAN_BYTES_LIMIT} bytes`));const bytes=/current measured (?:source|plan) size (\d+) bytes/.exec(error.message);assert.ok(bytes,error.message);assert.ok(Number(bytes[1])>PLAN_BYTES_LIMIT);assert.match(error.message,/Nothing was written/);return true}
  await assert.rejects(service.uploadPreview(h.ctx,source,options,ids),refuses)
  assert.ok(canonicalJsonBytes(expanded)>550000000)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,changes);assert.deepEqual(counts(h),before)
  // Direct callers can submit a previously materialised/replayed preview;
  // review must still rebuild and physically preflight before manual.preview.
  const replay={...expanded,source:{...source,tables:source.tables.map(table=>({...table,rows:table.rows.map(row=>({...row,values:{...row.values}}))}))}}
  await assert.rejects(service.review(h.ctx,replay,{fingerprint:expanded.fingerprint,acceptLoss:true}),refuses)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,changes);assert.deepEqual(counts(h),before)

  // Save a genuine small review of the same schema, then exercise the retained
  // adoption boundary with the expanded detail. Only JSON transport decoding
  // is instrumented: it returns the exact shared-reference logical detail in
  // place of allocating its >550 MB joined encoding. Real SQLite, checksum,
  // authority, schema lookup, native planning and write paths still execute.
  const tinyBytes=Buffer.from('Name,Content\r\n'+Array.from({length:64},(_,i)=>`Row ${i+1},short`).join('\r\n')+'\r\n'),tiny=prepareCsvSource(Array.from({length:20},(_,i)=>({filename:`Capacity ${i+1}.csv`,bytes:tinyBytes}))),small=previewBaseImport(tiny,options,ids),review=await service.review(h.ctx,small,{fingerprint:small.fingerprint,acceptLoss:true})
  const detail=replay,row=h.sql.prepare('SELECT * FROM record_import_reviews WHERE id=?').get(review.reviewId),detailHash=canonicalHash(detail),boundHash=canonicalHash({detailHash,physicalFingerprint:row.physical_fingerprint,schemaFingerprint:row.schema_fingerprint,plannedAt:row.created_at,principalId:row.principal_id,appId:row.app_id,schemaPreviewId:row.schema_preview_id})
  h.sql.prepare('UPDATE record_import_reviews SET fingerprint=?,detail_hash=?,detail_json=? WHERE id=?').run(detail.fingerprint,boundHash,'{"chunks":1}',review.reviewId)
  h.sql.prepare('DELETE FROM record_import_review_chunks WHERE review_id=?').run(review.reviewId)
  const marker='"bounded expanded review transport"'
  h.sql.prepare('INSERT INTO record_import_review_chunks(review_id,ordinal,body) VALUES(?,0,?)').run(review.reviewId,marker)
  const parse=JSON.parse
  mock.method(JSON,'parse',(text,...args)=>text===marker?detail:Reflect.apply(parse,JSON,[text,...args]))
  const retainedBefore=counts(h),retainedChanges=h.sql.prepare('SELECT total_changes() n').get().n
  await assert.rejects(service.adopt(h.ctx,review.reviewId,{fingerprint:detail.fingerprint,physicalFingerprint:row.physical_fingerprint,acceptLoss:true}),refuses)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,retainedChanges);assert.deepEqual(counts(h),retainedBefore)
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM record_schemas').get().n,0);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM ik_jobs').get().n,0)
  assert.ok(largestJoin()<32*1024*1024)
 }finally{restoreJoins();mock.restoreAll();h.close()}
})
