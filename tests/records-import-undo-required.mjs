import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {requiredUndoSetup,assertRequiredNativeValidity} from './helpers/records-undo-required.mjs'
import {undoD1Import,readD1ImportUndoReport,readD1ImportOriginals} from '../vendor/base/modules/import-kit/src/d1/index.ts'
import {createUlid} from '../src/core/shared/ids.ts'
import {add} from './helpers/records-manual-harness.mjs'

async function patch(x,node,label){const ref={appId:x.appId,entityId:node.descriptor.schema.id,recordId:node.id};await x.r.commands.get('record.patch').execute(x.h.ctx,{commandId:createUlid(),expected:[{ref,version:1}],input:{ref,changes:{[node.name]:label}}})}
async function finish(x,job){for(let n=0;job.state!=='undone'&&n<100;n++){job=await undoD1Import(job.id,x.context);await assertRequiredNativeValidity(x,assert)}assert.equal(job.state,'undone');return job}
for(const batchSize of [1,4,20])for(const edited of ['none','grand','parent','child'])contract('RECORDS-005 RECORDS-006',`required ONE ancestor closure and atomic required MANY ownership, batch ${batchSize}, edited ${edited}`,async()=>{
 const x=await requiredUndoSetup(batchSize)
 try{
  if(edited!=='none')await patch(x,x.nodes[edited],'Edited '+edited)
  await finish(x,x.job)
  const expected=new Set(edited==='child'?['grand','parent','child']:edited==='parent'?['grand','parent']:edited==='grand'?['grand']:[])
  for(const [name,node]of Object.entries(x.nodes))assert.equal(!!await x.h.db.prepare(`SELECT 1 FROM "${node.descriptor.table.tableId}" WHERE id=?`).bind(node.id).first(),expected.has(name),name)
  const report=await readD1ImportUndoReport(x.job.id,x.context),retained=report.dispositions.filter(d=>d.disposition==='retained');assert.equal(retained.filter(d=>d.targetKind.startsWith('record:')).length,expected.size)
  if(edited!=='none'){assert.equal(retained.find(d=>d.targetId===x.nodes[edited].id&&d.targetKind.startsWith('record:')).reason,'edited');for(const item of retained.filter(d=>d.targetId!==x.nodes[edited].id&&d.targetKind.startsWith('record:'))){assert.equal(item.reason,'dependency');assert.ok(item.protectedBy.length>0)}}
  assert.equal((await readD1ImportOriginals(x.job.id,x.context))[0].original.base64,Buffer.from(x.bytes).toString('base64'))
  assert.equal((await x.service.status(x.h.ctx,x.job.id)).reversal.terminal,true)
 }finally{x.h.close()}
})
contract('RECORDS-005 RECORDS-006','an owner edited between batch-one reversals still has every required join and protects its remaining ancestors',async()=>{
 const x=await requiredUndoSetup(1)
 try{
  let job=await undoD1Import(x.job.id,x.context);await assertRequiredNativeValidity(x,assert);assert.equal(job.state,'undoing')
  let selected
  for(const node of [x.nodes.child,x.nodes.parent])if(await x.h.db.prepare(`SELECT 1 FROM "${node.descriptor.table.tableId}" WHERE id=?`).bind(node.id).first()){selected=node;break}
  assert.ok(selected,'At least one required owner remains after the first work group');await patch(x,selected,'Edited between reverse groups');await finish(x,job)
  assert.ok(await x.h.db.prepare(`SELECT 1 FROM "${selected.descriptor.table.tableId}" WHERE id=?`).bind(selected.id).first());await assertRequiredNativeValidity(x,assert)
 }finally{x.h.close()}
})
contract('RECORDS-005 RECORDS-006','a new incoming required child protects imported ancestors without preserving an unchanged imported sibling',async()=>{
 const x=await requiredUndoSetup(1)
 try{
  const child=x.nodes.child,parent=x.nodes.parent,fields=[...child.descriptor.fields.values()],relationFields=fields.filter(f=>f.field.type==='relation'),ref={appId:x.appId,entityId:parent.descriptor.schema.id,recordId:parent.id},values={[child.name]:'New child'}
  for(const field of relationFields)values[field.field.id]=field.join?[ref]:ref
  const newer=await add(x.h,x.r,child.descriptor.schema,values);await finish(x,x.job)
  assert.ok(await x.h.db.prepare(`SELECT 1 FROM "${child.descriptor.table.tableId}" WHERE id=?`).bind(newer.ref.recordId).first());assert.equal(await x.h.db.prepare(`SELECT 1 FROM "${child.descriptor.table.tableId}" WHERE id=?`).bind(child.id).first(),null)
  const report=await readD1ImportUndoReport(x.job.id,x.context),parentConflict=report.dispositions.find(d=>d.targetKind.startsWith('record:')&&d.targetId===parent.id);assert.equal(parentConflict.reason,'dependency');assert.ok(parentConflict.protectedBy.some(cause=>cause.cause.recordId===newer.ref.recordId));await assertRequiredNativeValidity(x,assert)
 }finally{x.h.close()}
})
contract('RECORDS-005 RECORDS-006','same-version edit of a required MANY tuple protects owner, edited target and required ONE ancestor',async()=>{
 const x=await requiredUndoSetup(1)
 try{
  const parent=x.nodes.parent,field=[...parent.descriptor.fields.values()].find(f=>f.field.type==='relation'&&f.join)
  await x.h.db.prepare(`UPDATE "${field.join.table.tableId}" SET value=? WHERE record_id=?`).bind(x.nodes.free.id,parent.id).run();await finish(x,x.job)
  const report=await readD1ImportUndoReport(x.job.id,x.context),link=report.dispositions.find(d=>d.targetKind==='link:'+parent.descriptor.schema.id+':'+field.field.id);assert.equal(link.reason,'edited');assert.equal(link.evidence.appliedRecordVersion,1);assert.equal(link.evidence.observedRecordVersion,1);assert.notEqual(link.expected.ownedHash,link.observed.ownedHash)
  for(const node of [x.nodes.parent,x.nodes.grand,x.nodes.free])assert.ok(await x.h.db.prepare(`SELECT 1 FROM "${node.descriptor.table.tableId}" WHERE id=?`).bind(node.id).first())
  assert.equal(await x.h.db.prepare(`SELECT 1 FROM "${x.nodes.child.descriptor.table.tableId}" WHERE id=?`).bind(x.nodes.child.id).first(),null);await assertRequiredNativeValidity(x,assert)
 }finally{x.h.close()}
})
