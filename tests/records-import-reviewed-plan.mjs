import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {createBaseImportService} from '../src/domains/records/base-transfer/service.server.ts'

contract('RECORDS-005 RECORDS-002','owner-visible physical review fingerprint rejects substituted acknowledgement and changed native effects before adoption',async()=>{
 const h=await harness()
 try{
  const r=await h.runtime(),service=createBaseImportService(h.db,r.policy,r.registry,r.manual,previewBaseImport)
  const source=prepareCsvSource([{filename:'Rows.csv',bytes:Buffer.from('Name,Count\nOne,1\nTwo,2\n')}]),ids=allocateImportIdentities(source),preview=await service.uploadPreview(h.ctx,source,{name:'Exact review'},ids),logical={fingerprint:preview.fingerprint,acceptLoss:true}
  const review=await service.review(h.ctx,preview,logical),ack={...logical,physicalFingerprint:review.physicalFingerprint}
  assert.match(review.physicalFingerprint,/^[a-f0-9]{64}$/);assert.notEqual(review.physicalFingerprint,review.fingerprint)
  assert.equal(review.plannedAt,h.ctx.now)
  assert.equal(review.planSize.limit,300_000_000);assert.ok(review.planSize.bytes>0)
  const stored=await h.db.prepare('SELECT * FROM record_import_reviews WHERE id=?').bind(review.reviewId).first()
  assert.equal(stored.fingerprint,preview.fingerprint);assert.equal(stored.physical_fingerprint,review.physicalFingerprint);assert.equal(stored.created_at,review.plannedAt)
  const before=h.sql.prepare('SELECT total_changes() n').get().n
  await assert.rejects(service.adopt(h.ctx,review.reviewId,{...ack,physicalFingerprint:'0'.repeat(64)}),/physical plan acknowledgment/)
  await assert.rejects(service.adopt(h.ctx,review.reviewId,logical),/physical plan acknowledgment/)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,before)
  const manual=await h.db.prepare('SELECT detail_json FROM manual_record_previews WHERE id=?').bind(stored.schema_preview_id).first(),changed=JSON.parse(manual.detail_json)
  // A later stored schema edit changes actual initial row effects even though
  // the original source and logical mapping review are untouched.
  changed.schemas[0].lifecycle={states:['active','archived'],initial:'archived',transitions:[]}
  await h.db.prepare('UPDATE manual_record_previews SET detail_json=? WHERE id=?').bind(JSON.stringify(changed),stored.schema_preview_id).run()
  const afterEdit=h.sql.prepare('SELECT total_changes() n').get().n
  await assert.rejects(service.adopt(h.ctx,review.reviewId,ack),/physical plan or reviewed schema changed/)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,afterEdit)
  for(const table of ['record_schemas','manual_record_bases','authority_memberships','ik_jobs'])assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,0,table)
  await h.db.prepare('UPDATE manual_record_previews SET detail_json=? WHERE id=?').bind(manual.detail_json,stored.schema_preview_id).run()
  // A real restart reads only durable review/source/schema, and the job keeps
  // the exact fingerprint the owner acknowledged before the restart.
  const restarted=createBaseImportService(h.db,r.policy,r.registry,r.manual,()=>{throw new Error('Adoption must not remap retained input')})
  const job=await restarted.adopt(h.ctx,review.reviewId,ack)
  assert.equal(job.fingerprint,review.physicalFingerprint)
  const {loadPlans}=await import('../vendor/base/modules/import-kit/src/d1/plans.ts')
  const {canonicalJson}=await import('../vendor/base/modules/import-kit/src/d1/index.ts')
  const persisted=(await loadPlans([await h.db.prepare('SELECT * FROM ik_jobs WHERE id=?').bind(job.id).first()],h.db)).get(job.id)
  const {fingerprint,...content}=persisted
  assert.equal(Buffer.byteLength(canonicalJson(content)),review.planSize.bytes,'Displayed size is the exact durable plan content measured independently')
  assert.equal((await h.db.prepare('SELECT fingerprint FROM ik_jobs WHERE id=?').bind(job.id).first()).fingerprint,review.physicalFingerprint)
 }finally{h.close()}
})

contract('RECORDS-005 RECORDS-002','interruption after schema adoption retries the same durable review without remapping or duplicate jobs',async()=>{
 const h=await harness(),prepare=h.db.prepare.bind(h.db)
 try{
  const r=await h.runtime(),service=createBaseImportService(h.db,r.policy,r.registry,r.manual,previewBaseImport),source=prepareCsvSource([{filename:'Rows.csv',bytes:Buffer.from('Name\nOne\nTwo\n')}]),ids=allocateImportIdentities(source),preview=await service.uploadPreview(h.ctx,source,{name:'Adoption recovery'},ids),logical={fingerprint:preview.fingerprint,acceptLoss:true},review=await service.review(h.ctx,preview,logical),ack={...logical,physicalFingerprint:review.physicalFingerprint}
  let interrupted=false
  h.db.prepare=sql=>{if(!interrupted&&/INSERT(?: OR \w+)? INTO ik_jobs\b/.test(sql)){interrupted=true;throw new Error('Test interruption before import job commit')}return prepare(sql)}
  await assert.rejects(service.adopt(h.ctx,review.reviewId,ack),/Test interruption/)
  h.db.prepare=prepare;assert.equal(interrupted,true)
  assert.equal((await prepare('SELECT count(*) n FROM manual_record_bases').first()).n,1,'Authorized empty schema adoption is durable')
  assert.equal((await prepare('SELECT count(*) n FROM ik_jobs').first()).n,0)
  const live=await h.runtime(),restarted=createBaseImportService(h.db,live.policy,live.registry,live.manual,()=>{throw new Error('Retry must use retained review without source parsing')})
  let job=await restarted.adopt(h.ctx,review.reviewId,ack)
  assert.equal(job.fingerprint,review.physicalFingerprint)
  assert.equal((await restarted.adopt(h.ctx,review.reviewId,ack)).id,job.id)
  while(job.state!=='completed')job=await restarted.resume(h.ctx,job.id)
  assert.equal((await prepare('SELECT count(*) n FROM ik_jobs').first()).n,1)
  const status=await restarted.status(h.ctx,job.id);assert.equal(status.progress.appliedRecords,2);assert.equal(status.reconciliation.ok,true)
 }finally{h.db.prepare=prepare;h.close()}
})

contract('RECORDS-005 BASE-SEC-003','revocation after schema adoption fences job creation and a newly authorized session retries the retained review',async()=>{
 const h=await harness(),prepare=h.db.prepare.bind(h.db)
 try{
  const {createUlid}=await import('../src/core/shared/ids.ts')
  const r=await h.runtime(),service=createBaseImportService(h.db,r.policy,r.registry,r.manual,previewBaseImport),source=prepareCsvSource([{filename:'Rows.csv',bytes:Buffer.from('Name\nOne\nTwo\n')}]),ids=allocateImportIdentities(source),preview=await service.uploadPreview(h.ctx,source,{name:'Revoked adoption'},ids),logical={fingerprint:preview.fingerprint,acceptLoss:true},review=await service.review(h.ctx,preview,logical),ack={...logical,physicalFingerprint:review.physicalFingerprint}
  let revoked=false
  h.db.prepare=sql=>{if(!revoked&&/INSERT(?: OR \w+)? INTO ik_jobs\b/.test(sql)){revoked=true;h.sql.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').run(Date.now(),h.session)}return prepare(sql)}
  await assert.rejects(service.adopt(h.ctx,review.reviewId,ack),/IMPORT_ATOMIC_GUARD|authority|denied|guard/i)
  h.db.prepare=prepare;assert.equal(revoked,true)
  assert.equal((await prepare('SELECT count(*) n FROM manual_record_bases').first()).n,1)
  for(const table of ['ik_jobs','ik_originals','ik_provenance','ik_sources'])assert.equal((await prepare(`SELECT count(*) n FROM ${table}`).first()).n,0,table+' must remain empty after the rejected creation batch')
  const before=h.sql.prepare('SELECT total_changes() n').get().n
  await assert.rejects(service.adopt(h.ctx,review.reviewId,ack),/authority|denied|session|guard|constraint/i)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,before,'Revoked credential cannot retry any writes')
  const freshSession=createUlid(),time=Date.now(),now=new Date(time).toISOString(),expiresAt=new Date(time+3600000).toISOString()
  await prepare('INSERT INTO authority_sessions(id,principal_id,token_hash,csrf_hash,authentication_epoch,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,1,?,?,?)').bind(freshSession,h.owner,createUlid(),createUlid(),time,time,time+3600000).run()
  const current={...h.ctx,principal:{...h.ctx.principal,sessionId:freshSession,issuedAt:now,expiresAt},now,requestId:createUlid()},live=await h.runtime(),restarted=createBaseImportService(h.db,live.policy,live.registry,live.manual,()=>{throw new Error('Authorized retry cannot remap source')})
  let job=await restarted.adopt(current,review.reviewId,ack)
  assert.equal(job.fingerprint,review.physicalFingerprint)
  while(job.state!=='completed')job=await restarted.resume(current,job.id)
  assert.equal((await prepare('SELECT count(*) n FROM manual_record_bases').first()).n,1)
  assert.equal((await prepare('SELECT count(*) n FROM ik_jobs').first()).n,1)
  const status=await restarted.status(current,job.id);assert.equal(status.progress.appliedRecords,2);assert.equal(status.reconciliation.ok,true)
 }finally{h.db.prepare=prepare;h.close()}
})

contract('RECORDS-005 RECORDS-002','lost job-creation response recovers durable custody after a later schema review without remapping',async()=>{
 const h=await harness(),prepare=h.db.prepare.bind(h.db),batch=h.db.batch.bind(h.db)
 try{
  const {createUlid}=await import('../src/core/shared/ids.ts')
  const r=await h.runtime(),service=createBaseImportService(h.db,r.policy,r.registry,r.manual,previewBaseImport),source=prepareCsvSource([{filename:'Rows.csv',bytes:Buffer.from('Name\nOne\nTwo\n')}]),ids=allocateImportIdentities(source),preview=await service.uploadPreview(h.ctx,source,{name:'Lost response'},ids),logical={fingerprint:preview.fingerprint,acceptLoss:true},review=await service.review(h.ctx,preview,logical),ack={...logical,physicalFingerprint:review.physicalFingerprint}
  let lost=false
  h.db.batch=async statements=>{const before=h.sql.prepare('SELECT count(*) n FROM ik_jobs').get().n;const result=await batch(statements);if(!lost&&h.sql.prepare('SELECT count(*) n FROM ik_jobs').get().n>before){lost=true;throw new Error('Test lost response after job commit')}return result}
  await assert.rejects(service.adopt(h.ctx,review.reviewId,ack),/Test lost response/)
  h.db.batch=batch;assert.equal(lost,true)
  const committed=await prepare('SELECT id,fingerprint,state FROM ik_jobs').first();assert.equal(committed.fingerprint,review.physicalFingerprint);assert.equal(committed.state,'queued')
  const owner=await h.runtime(),draft=await owner.manual.read(h.ctx,ids.appId)
  draft.tables[0].label='Renamed after job creation'
  const impact=await owner.manual.preview(h.ctx,draft)
  await owner.manual.adopt(h.ctx,createUlid(),impact.id)
  assert.equal(JSON.parse((await prepare('SELECT schema_json FROM record_schemas WHERE app_id=?').bind(ids.appId).first()).schema_json).version,2)
  const live=await h.runtime(),restarted=createBaseImportService(h.db,live.policy,live.registry,live.manual,()=>{throw new Error('Lost response retry must not remap retained input')})
  const recovered=await restarted.adopt(h.ctx,review.reviewId,ack)
  assert.equal(recovered.id,committed.id);assert.equal(recovered.fingerprint,review.physicalFingerprint);assert.equal(recovered.state,'queued')
  assert.equal((await prepare('SELECT count(*) n FROM ik_jobs').first()).n,1)
  assert.equal((await prepare('SELECT count(*) n FROM manual_record_releases').first()).n,2,'Recovery must not adopt another schema')
  await prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run()
  const before=h.sql.prepare('SELECT total_changes() n').get().n
  await assert.rejects(restarted.adopt(h.ctx,review.reviewId,ack),/authority|denied|session|guard|constraint/i)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,before,'Stored operation key never bypasses current authority')
 }finally{h.db.prepare=prepare;h.db.batch=batch;h.close()}
})
