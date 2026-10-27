import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {portableFixture} from './helpers/base-exit-fixture.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {applyPreview} from './helpers/base-exit-runtime.mjs'
import {prepareJsonSource,allocateJsonIdentities} from '../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../src/domains/records/base-transfer/plan-json.ts'
import {createBaseImportService} from '../src/domains/records/base-transfer/service.server.ts'
import {baseImportHttp} from '../src/domains/records/base-transfer/http.server.ts'
import {RECORD_VIEW_ENTITY_ID,RECORD_FORM_ENTITY_ID} from '../src/domains/records/contracts.ts'
import {createUlid} from '../src/core/shared/ids.ts'

async function metadataConflictCase(kind,edit){
 const h=await harness()
 try{
  const snapshot=portableFixture(),bytes=new TextEncoder().encode(JSON.stringify(snapshot)),source=prepareJsonSource({filename:'metadata.json',bytes}),ids=allocateJsonIdentities(snapshot,'copy'),preview=previewJsonImport(source,{name:snapshot.base.name},ids),applied=await applyPreview(h,preview),r=applied.r,id=kind==='view'?preview.portableViews[0].id:preview.portableForms[0].id,table=kind==='view'?'record_views':'record_forms',metadata=kind==='view'?await r.services.metadata.readView(h.ctx,id):await r.services.metadata.readForm(h.ctx,id),{version,createdAt,updatedAt,id:_,schema,...definition}=metadata,label='Owner edited '+kind
  if(kind==='view')definition.name=label;else definition.title=label
  if(edit==='public-save'){
   const command=await r.commands.get(kind+'.save').execute(h.ctx,{commandId:createUlid(),expected:[{ref:{appId:ids.appId,entityId:kind==='view'?RECORD_VIEW_ENTITY_ID:RECORD_FORM_ENTITY_ID,recordId:id},version}],input:{id,[kind]:definition}});assert.equal(command.result.value.version,2)
  }else await h.db.prepare(`UPDATE ${table} SET definition_json=json_set(definition_json,?,?) WHERE id=?`).bind(kind==='view'?'$.name':'$.title',label,id).run()
  const originalAttribution=await h.db.prepare('SELECT * FROM ik_provenance WHERE job_id=? AND target_kind=? AND target_id=?').bind(applied.job.id,kind,id).first(),editedRow=await h.db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first()
  let job=await applied.service.undo(h.ctx,applied.job.id);for(let n=0;job.state==='undoing'&&n<100;n++)job=await applied.service.undo(h.ctx,job.id)
  assert.equal(job.state,'undone');const fresh=await h.runtime(),service=createBaseImportService(h.db,fresh.policy,fresh.registry,fresh.manual,()=>{throw new Error('Restart has no source parser')}),status=await service.status(h.ctx,job.id)
  assert.equal(status.job.state,'undone');assert.equal(status.reconciliation.ok,false);assert.deepEqual(status.reconciliation.mismatched,[kind+':'+id]);assert.equal(status.reversal.terminal,true);assert.equal(status.reversal.remaining,0);assert.equal(status.reversal.retained,1)
  const conflict=status.reversal.conflicts[0];assert.equal(conflict.reason,'edited');assert.equal(conflict.targetKind,kind);assert.equal(conflict.targetId,id);assert.equal(conflict.evidence.metadataKind,kind);assert.equal(conflict.evidence.recordPrimary,label);assert.equal(conflict.evidence.appliedRecordVersion,1);assert.equal(conflict.evidence.observedRecordVersion,edit==='public-save'?2:1);assert.notEqual(conflict.expected.valueHash,conflict.observed.valueHash)
  assert.deepEqual(await h.db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first(),editedRow);assert.equal(JSON.parse(editedRow.definition_json)[kind==='view'?'name':'title'],label);assert.deepEqual(await h.db.prepare('SELECT * FROM ik_provenance WHERE id=?').bind(originalAttribution.id).first(),originalAttribution)
  for(const descriptor of fresh.registry.list(ids.appId))assert.equal((await h.db.prepare(`SELECT COUNT(*) n FROM "${descriptor.table.tableId}"`).first()).n,0)
  for(const [target,physical]of [['view','record_views'],['form','record_forms']])assert.equal((await h.db.prepare(`SELECT COUNT(*) n FROM ${physical} WHERE app_id=?`).bind(ids.appId).first()).n,target===kind?1:0)
  assert.deepEqual(status.report.tables,preview.report.tables);assert.equal((await service.originals(h.ctx,job.id))[0].original.base64,Buffer.from(bytes).toString('base64'));assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_schemas WHERE app_id=?').bind(ids.appId).first()).n,2)
  const authenticate=async()=>h.ctx,http=baseImportHttp(service,{prepare:prepareJsonSource,identities:allocateJsonIdentities},authenticate,authenticate),response=await http.request('http://localhost/api/v1/records/base-import/jobs/'+job.id+'/report.json');assert.equal(response.status,200);assert.deepEqual(await response.json(),status)
  assert.equal((await service.resume(h.ctx,job.id)).state,'undone');assert.deepEqual(await service.status(h.ctx,job.id),status);assert.deepEqual(await h.db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first(),editedRow)
 }finally{h.close()}
}

contract('RECORDS-005 RECORDS-006','owner-edited metadata matrix remains intact with terminal undo, exact attribution and durable downloadable conflict evidence',async()=>{
 for(const kind of ['view','form'])for(const edit of ['public-save','same-version']){
  try{await metadataConflictCase(kind,edit)}catch(error){throw new Error(`RECORDS-005 RECORDS-006 ${edit} ${kind}: ${error.message}`,{cause:error})}
 }
})
