import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {undoSetup} from './helpers/records-undo-harness.mjs'
import {outsideDependency} from './helpers/base-outside-dependency.mjs'
import {countedUndoDatabase} from './helpers/records-undo-scale.mjs'
import {authorizeUndoReport} from '../src/domains/records/base-transfer/undo-privacy.server.ts'
import {createPolicyPort} from '../src/domains/authority/policy.server.ts'
import {createApplicationEntityRegistry} from '../src/core/app/composition/entities.server.ts'
import {createUlid} from '../src/core/shared/ids.ts'

contract('RECORDS-005 BASE-SEC-003','1001 real outside dependencies remain complete under bounded current-read projection and late row or membership revocation fails closed',async()=>{
 const x=await undoSetup({count:2,links:false})
 try{
  let job=x.job;while(job.state!=='completed')job=await x.service.resume(x.h.ctx,job.id)
  const outside=await outsideDependency(x),table=outside.descriptor.table.tableId,columns=outside.descriptor.table.writableColumnIds,ids=[outside.recordId]
  const insert=x.h.sql.prepare(`INSERT INTO "${table}" (${columns.map(c=>'"'+c+'"').join(',')}) SELECT ${columns.map(c=>c==='id'?'?':'"'+c+'"').join(',')} FROM "${table}" WHERE id=?`)
  x.h.sql.exec('BEGIN');for(let n=0;n<1000;n++){const id=createUlid();insert.run(id,outside.recordId);ids.push(id)}x.h.sql.exec('COMMIT')
  do{job=await x.service.undo(x.h.ctx,job.id)}while(job.state!=='undone')
  const durable=(await x.service.status(x.h.ctx,job.id)).reversal
  assert.equal(durable.retained,1);assert.equal(durable.conflicts[0].protectedBy.length,1001)
  assert.deepEqual(new Set(durable.conflicts[0].protectedBy.map(d=>d.cause.recordId)),new Set(ids))
  const live=await x.h.runtime(),measured=countedUndoDatabase(x.h.db),policy=createPolicyPort(measured.database,createApplicationEntityRegistry(live.registry)),before=x.h.sql.prepare('SELECT total_changes() n').get().n
  const visible=await authorizeUndoReport(measured.database,policy,x.h.ctx,live.registry,x.appId,durable)
  assert.deepEqual(visible,durable);assert.ok(measured.calls.length<50,'Actual SQL executions: '+measured.calls.length);assert.equal(x.h.sql.prepare('SELECT total_changes() n').get().n,before,'Projection is read only')
  for(const restriction of ['field','row','membership']){
   const rules=structuredClone(outside.rules)
   if(restriction==='field')rules.find(r=>r.entityId===outside.entityId).readableFields=[outside.name.id]
   if(restriction==='row')rules.find(r=>r.entityId===outside.entityId).rows={kind:'condition',fieldId:outside.name.id,op:'eq',value:'Inaccessible'}
   await x.h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),outside.policyId).run()
   await x.h.db.prepare('UPDATE authority_memberships SET state=?,version=version+1 WHERE app_id=?').bind(restriction==='membership'?'revoked':'active',outside.appId).run()
   const hidden=await authorizeUndoReport(x.h.db,live.policy,x.h.ctx,live.registry,x.appId,durable)
   assert.equal(hidden.conflicts[0].protectedBy.length,1001);assert.ok(hidden.conflicts[0].protectedBy.every(d=>d.redacted));assert.ok(!JSON.stringify(hidden).includes(outside.recordId))
  }
  for(const race of ['membership','row']){
   const rules=structuredClone(outside.rules);rules.find(r=>r.entityId===outside.entityId).rows={kind:'condition',fieldId:outside.name.id,op:'eq',value:'Secret outside row'}
   await x.h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),outside.policyId).run();await x.h.db.prepare("UPDATE authority_memberships SET state='active',version=version+1 WHERE app_id=?").bind(outside.appId).run()
   let triggered=false
   const database={...x.h.db,async batch(statements){assert.equal(triggered,false);triggered=true;if(race==='membership')await x.h.db.prepare("UPDATE authority_memberships SET state='revoked',version=version+1 WHERE app_id=?").bind(outside.appId).run();else await x.h.db.prepare(`UPDATE "${table}" SET "${outside.descriptor.fields.get(outside.name.id).column}"='Inaccessible' WHERE id=?`).bind(ids.at(-1)).run();return x.h.db.batch(statements)}}
   await assert.rejects(authorizeUndoReport(database,live.policy,x.h.ctx,live.registry,x.appId,durable),/Report access changed/)
   assert.equal(triggered,true,'Race fires after visible rows were read but before final atomic read fences')
  }
 }finally{x.h.close()}
})
