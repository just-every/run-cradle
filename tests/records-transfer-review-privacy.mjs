import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {undoSetup} from './helpers/records-undo-harness.mjs'
import {outsideDependency} from './helpers/base-outside-dependency.mjs'
import {createBaseImportService} from '../src/domains/records/base-transfer/service.server.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {baseImportHttp} from '../src/domains/records/base-transfer/http.server.ts'
const count=h=>h.sql.prepare('SELECT total_changes() n').get().n
contract('RECORDS-005','actual review requires semantic loss acknowledgment and rejects aliased targets before all review writes',async()=>{
 const h=await harness();try{const r=await h.runtime(),service=createBaseImportService(h.db,r.policy,r.registry,r.manual,previewBaseImport),source=prepareCsvSource([{filename:'Semantics.csv',bytes:new TextEncoder().encode('Name,Formula,When\nExample,unchanged,2026-10-08T00:00:00Z\nOther,unchanged,2026-10-08T00:00:00Z')}]);source.format='api';source.tables[0].columns[1].sourceType='formula';source.tables[0].columns[2].sourceType='dateTime';const options={name:'Semantic review'},ids=allocateImportIdentities(source),preview=await service.preview(source,options,ids),before=count(h)
 assert.equal(preview.report.tables[0].columns.reduce((n,c)=>n+c.converted,0),0);await assert.rejects(service.review(h.ctx,preview,{fingerprint:preview.fingerprint,acceptLoss:false}),/semantic losses/);assert.equal(count(h),before)
 const alias=structuredClone(ids);alias.tables['Semantics.csv'].records['row-2']=alias.tables['Semantics.csv'].records['row-1'];await assert.rejects(service.preview(source,options,alias),/Duplicate destination/);assert.equal(count(h),before)
 const edited=await service.preview(source,{name:'Changed mapping'},ids);await assert.rejects(service.review(h.ctx,edited,{fingerprint:preview.fingerprint,acceptLoss:true}),/Mapping changed/);assert.equal(count(h),before)
 const review=await service.review(h.ctx,preview,{fingerprint:preview.fingerprint,acceptLoss:true});assert.ok(review.reviewId);const reviewed=count(h);await assert.rejects(service.adopt(h.ctx,review.reviewId,{physicalFingerprint:review.physicalFingerprint,fingerprint:preview.fingerprint,acceptLoss:false}),/acknowledgment/);assert.equal(count(h),reviewed)
 }finally{h.close()}
})
contract('RECORDS-005 BASE-SEC-003','durable external undo dependencies preserve records but status and download obey current app, row and field read access',async()=>{
 const x=await undoSetup({count:2,links:false});try{
  let job=x.job;while(job.state!=='completed')job=await x.service.resume(x.h.ctx,job.id)
  const outside=await outsideDependency(x);job=await x.service.undo(x.h.ctx,job.id);for(let n=0;job.state!=='undone'&&n<20;n++)job=await x.service.undo(x.h.ctx,job.id);assert.equal(job.state,'undone')
  const report=await x.service.status(x.h.ctx,job.id),conflict=report.reversal.conflicts.find(c=>c.targetId===x.ids[0]);assert.equal(report.reversal.retained,1);assert.equal(conflict.reason,'dependency');assert.equal(conflict.protectedBy[0].cause.recordId,outside.recordId)
  assert.equal((await x.h.db.prepare(`SELECT COUNT(*) n FROM "${x.descriptor.table.tableId}"`).first()).n,1);assert.equal((await x.h.db.prepare(`SELECT "${outside.descriptor.fields.get(outside.link.id).column}" target FROM "${outside.descriptor.table.tableId}" WHERE id=?`).bind(outside.recordId).first()).target,x.ids[0])
  const http=baseImportHttp(x.service,{prepare:prepareCsvSource,identities:allocateImportIdentities},async()=>x.h.ctx,async()=>x.h.ctx)
  for(const restriction of ['membership','row','field']){
   const rules=structuredClone(outside.rules);if(restriction==='row')rules.find(r=>r.entityId===outside.entityId).rows={kind:'condition',fieldId:outside.name.id,op:'eq',value:'A different row'};if(restriction==='field')rules.find(r=>r.entityId===outside.entityId).readableFields=[outside.name.id]
   await x.h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),outside.policyId).run();await x.h.db.prepare('UPDATE authority_memberships SET state=?,version=version+1 WHERE app_id=?').bind(restriction==='membership'?'revoked':'active',outside.appId).run()
   const before=count(x.h),status=await x.service.status(x.h.ctx,job.id),response=await http.request('http://localhost/api/v1/records/base-import/jobs/'+job.id+'/report.json');assert.equal(response.status,200);const download=await response.json();assert.deepEqual(download,status);assert.equal(count(x.h),before)
   assert.equal(status.reversal.retained,1);assert.equal(status.reversal.conflicts[0].reason,'dependency');assert.equal(status.reversal.conflicts[0].protectedBy.length,1);assert.equal(status.reversal.conflicts[0].protectedBy[0].redacted,true)
   const serialized=JSON.stringify(status);for(const hidden of [outside.appId,outside.entityId,outside.recordId,outside.name.id,outside.link.id,'Hidden app table','Hidden dependency label','Secret outside row'])assert.ok(!serialized.includes(hidden),restriction+': '+hidden)
  }
  await x.h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(outside.rules),outside.policyId).run();assert.equal((await x.service.status(x.h.ctx,job.id)).reversal.conflicts[0].protectedBy[0].cause.recordId,outside.recordId,'Current read access can reveal the original durable cause again')
  assert.equal((await x.h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 }finally{x.h.close()}
})
