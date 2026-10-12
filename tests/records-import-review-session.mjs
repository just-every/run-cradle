import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {harness,add} from './helpers/records-manual-harness.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {createBaseImportService} from '../src/domains/records/base-transfer/service.server.ts'

async function renewedSession(h,principal=h.owner){
 const sessionId=createUlid(),time=Date.now(),now=new Date(time).toISOString(),expiresAt=new Date(time+3600000).toISOString()
 await h.db.prepare('INSERT INTO authority_sessions(id,principal_id,token_hash,csrf_hash,authentication_epoch,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,1,?,?,?)').bind(sessionId,principal,createUlid(),createUlid(),time,time,time+3600000).run()
 return {...h.ctx,principal:{...h.ctx.principal,id:principal,humanId:principal,sessionId,issuedAt:now,expiresAt},now,requestId:createUlid()}
}
async function reviewed(h){
 const r=await h.runtime(),service=createBaseImportService(h.db,r.policy,r.registry,r.manual,previewBaseImport),source=prepareCsvSource([{filename:'Rows.csv',bytes:Buffer.from('Name\nOne\nTwo\n')}]),preview=await service.uploadPreview(h.ctx,source,{name:'Session renewal'},allocateImportIdentities(source)),logical={fingerprint:preview.fingerprint,acceptLoss:true},review=await service.review(h.ctx,preview,logical)
 assert.equal(Object.hasOwn(review.schemaImpact,'guards'),false);assert.equal(Object.hasOwn(review.schemaImpact,'adoptionGuards'),false)
 return {review,ack:{...logical,physicalFingerprint:review.physicalFingerprint}}
}
async function restarted(h){const r=await h.runtime();return createBaseImportService(h.db,r.policy,r.registry,r.manual,()=>{throw new Error('Session renewal must use the retained reviewed source')})}
async function assertNoAdoption(h){for(const table of ['record_schemas','manual_record_bases','manual_record_releases','authority_memberships','ik_jobs','ik_originals','ik_provenance'])assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,0,table)}

contract('RECORDS-005 RECORDS-002 BASE-SEC-003','same owner can adopt the exact saved import review with a renewed session while the old revoked session cannot write',async()=>{
 const h=await harness()
 try{
  const {review,ack}=await reviewed(h),ctx=await renewedSession(h)
  await h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run()
  const service=await restarted(h),before=h.sql.prepare('SELECT total_changes() n').get().n
  await assert.rejects(service.adopt(h.ctx,review.reviewId,ack),/authority|denied|session|guard|constraint/i)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,before);await assertNoAdoption(h)
  let job=await service.adopt(ctx,review.reviewId,ack)
  assert.equal(job.fingerprint,review.physicalFingerprint)
  while(job.state!=='completed')job=await service.resume(ctx,job.id)
  const result=await service.status(ctx,job.id);assert.equal(result.progress.appliedRecords,2);assert.equal(result.reconciliation.ok,true)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM manual_record_releases').first()).n,1)
 }finally{h.close()}
})
for(const failure of ['revoked-new-session','removed-principal','removed-owner','other-principal'])contract('RECORDS-005 RECORDS-002 BASE-SEC-003',`review session renewal preserves ${failure} rejection before schema or Kit writes`,async()=>{
 const h=await harness()
 try{
  const {review,ack}=await reviewed(h)
  let ctx=await renewedSession(h)
  await h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run()
  if(failure==='revoked-new-session')await h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),ctx.principal.sessionId).run()
  if(failure==='removed-principal')await h.db.prepare("UPDATE authority_principals SET state='removed' WHERE id=?").bind(h.owner).run()
  if(failure==='removed-owner')await h.db.prepare('UPDATE authority_principals SET initial_owner=0 WHERE id=?').bind(h.owner).run()
  if(failure==='other-principal'){
   const other=createUlid(),time=Date.now()
   await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(other,'Other owner','other-owner@example.test',time,time).run()
   await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',1,?,?)").bind(other,other,time,time).run()
   ctx=await renewedSession(h,other)
  }
  const service=await restarted(h),before=h.sql.prepare('SELECT total_changes() n').get().n
  await assert.rejects(service.adopt(ctx,review.reviewId,ack),/authority|denied|session|guard|constraint|not found/i)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,before);await assertNoAdoption(h)
 }finally{h.close()}
})

for(const changed of ['policy','data','schema'])contract('RECORDS-002 RECORDS-005',`session renewal keeps reviewed ${changed} and destructive data impact fences until a fresh review`,async()=>{
 const h=await harness()
 try{
  const {draft,r}=await h.create(),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
  const record=await add(h,r,schema,{[schema.fields[0].id]:'Retained company',[schema.fields[1].id]:'https://retained.example'})
  const edit=await r.manual.read(h.ctx,draft.appId);edit.tables[0].fields.splice(1,1)
  const preview=await r.manual.preview(h.ctx,edit);assert.deepEqual(preview.impacts[0].recordIds,[record.id]);assert.equal(preview.impacts[0].removedFields[0].populated,1)
  const ctx=await renewedSession(h)
  await h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run()
  if(changed==='policy')await h.db.prepare('UPDATE authority_policies SET version=version+1 WHERE app_id=?').bind(draft.appId).run()
  if(changed==='data')await r.commands.get('record.patch').execute(ctx,{commandId:createUlid(),expected:[{ref:record.ref,version:1}],input:{ref:record.ref,changes:{[schema.fields[1].id]:'https://new-retained.example'}}})
  if(changed==='schema'){
   const rename=await r.manual.read(ctx,draft.appId);rename.tables[0].label='Updated company table'
   const current=await r.manual.preview(ctx,rename);await r.manual.adopt(ctx,createUlid(),current.id)
  }
  const live=await h.runtime(),before=h.sql.prepare('SELECT total_changes() n').get().n
  await assert.rejects(live.manual.adopt(ctx,createUlid(),preview.id),/stale|current|authority|permit/i)
  assert.equal(h.sql.prepare('SELECT total_changes() n').get().n,before)
  assert.equal((await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(draft.appId).first()).version,changed==='schema'?2:1)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM ik_jobs').first()).n,0)
  const fresh=await live.manual.preview(ctx,edit);assert.deepEqual(fresh.impacts[0].recordIds,[record.id]);assert.equal(fresh.impacts[0].removedFields[0].populated,1)
  const adopted=await live.manual.adopt(ctx,createUlid(),fresh.id)
  const current=await h.runtime(),recovery=await current.manual.recovery(ctx,adopted.result.value.releaseId)
  assert.match(JSON.stringify(recovery),/retained.example/)
 }finally{h.close()}
})
