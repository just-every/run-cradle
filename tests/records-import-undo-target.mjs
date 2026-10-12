import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {setup} from './helpers/records-import-harness.mjs'
import {add} from './helpers/records-manual-harness.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {resumeD1Import,readD1PersistedImport} from '../vendor/base/modules/import-kit/src/d1/index.ts'

async function applied(cardinality='many') {
 const x=await setup(undefined,cardinality)
 while(x.job.state!=='completed')x.job=await resumeD1Import(x.job.id,x.context)
 const read=await readD1PersistedImport(x.context)
 x.effects=read.provenance.map(provenance=>({provenance,expected:read.rows.find(row=>row.targetKind===provenance.targetKind&&row.targetId===provenance.targetId),retained:false}))
 x.target=x.context.storage.targets;x.descriptor=x.r.registry.get(x.appId,x.tableId)
 x.snapshot=()=>x.target.preparePreservedUndo(x.h.db,x.appId,x.effects)
 x.guardsPass=async snapshot=>(await Promise.all(snapshot.guards.map(g=>x.h.db.prepare('SELECT 1 WHERE '+g.sql).bind(...(g.params??[])).first()))).every(Boolean)
 return x
}
for(const cardinality of ['one','many'])contract('RECORDS-005',`${cardinality} link ownership ignores a scalar patch version while exact undo guards fence every current value`,async()=>{
 const x=await applied(cardinality)
 try{
  const ref={appId:x.appId,entityId:x.tableId,recordId:x.ids[0]}
  await x.r.commands.get('record.patch').execute(x.h.ctx,{commandId:createUlid(),expected:[{ref,version:1}],input:{ref,changes:{[x.name.id]:'123'}}})
  const snapshot=await x.snapshot(),link=x.effects.find(e=>e.expected.targetKind.startsWith('link:')&&e.expected.targetId===x.ids[0]),row=x.effects.find(e=>e.expected.targetKind.startsWith('record:')&&e.expected.targetId===x.ids[0]),current=snapshot.observations.find(o=>o.effectId===link.provenance.id).current
  assert.equal(current.value.recordVersion,2)
  assert.deepEqual(x.target.ownedContent(current),x.target.ownedContent(link.expected))
  assert.notDeepEqual(current,link.expected,'Strict comparison retains the complete row version')
  assert.ok(snapshot.dependencies.some(d=>d.requiredEffectId===row.provenance.id&&d.dependentEffectId===link.provenance.id),'Unchanged optional links reverse before their scalar owner')
  assert.equal(await x.guardsPass(snapshot),true)
  await x.h.db.prepare(`UPDATE "${x.descriptor.table.tableId}" SET "${x.descriptor.fields.get(x.name.id).column}"='456' WHERE id=?`).bind(x.ids[0]).run()
  assert.equal(await x.guardsPass(snapshot),false,'Same-version edits between classification and publication invalidate the entire batch')
 }finally{x.h.close()}
})
contract('RECORDS-005','new incoming native data is protected and both absence and exact edge content are fenced',async()=>{
 const x=await applied()
 try{
  const before=await x.snapshot(),ref={appId:x.appId,entityId:x.tableId,recordId:x.ids[0]}
  const created=await add(x.h,x.r,x.descriptor.schema,{[x.name.id]:'3',[x.relation.id]:[ref]})
  assert.equal(await x.guardsPass(before),false)
  const after=await x.snapshot(),target=x.effects.find(e=>e.expected.targetKind.startsWith('record:')&&e.expected.targetId===x.ids[0]),dependency=after.dependencies.find(d=>d.requiredEffectId===target.provenance.id&&!d.dependentEffectId)
  assert.equal(dependency.cause.recordId,created.ref.recordId)
  assert.equal(dependency.cause.field,x.relation.id)
  assert.equal(dependency.cause.targetId,x.ids[0])
  assert.equal(await x.guardsPass(after),true)
  const join=x.descriptor.fields.get(x.relation.id).join.table.tableId
  await x.h.db.prepare(`UPDATE "${join}" SET value=? WHERE record_id=?`).bind(x.ids[1],created.ref.recordId).run()
  assert.equal(await x.guardsPass(after),false,'Equal-cardinality edge swaps are not accepted')
 }finally{x.h.close()}
})
contract('RECORDS-005','native attribution corruption is not classified as an operator edit',async()=>{
 const x=await applied()
 try{
  await x.h.db.prepare('UPDATE record_import_revisions SET revision=? WHERE app_id=? AND record_id=?').bind('forged-revision',x.appId,x.ids[0]).run()
  await assert.rejects(x.snapshot(),/IMPORT_NATIVE_ATTRIBUTION_CHANGED/)
 }finally{x.h.close()}
})
