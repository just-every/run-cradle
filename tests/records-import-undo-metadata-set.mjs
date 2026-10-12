import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {portableFixture} from './helpers/base-exit-fixture.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {applyPreview} from './helpers/base-exit-runtime.mjs'
import {prepareJsonSource,allocateJsonIdentities} from '../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../src/domains/records/base-transfer/plan-json.ts'
import {createNativeImportTarget} from '../src/domains/records/base-transfer/target.server.ts'
import {exactUndoGuardsPass} from './helpers/records-undo-scale.mjs'

contract('RECORDS-005 RECORDS-006','metadata absence uses the complete composed native set and exact retained marker closure',async()=>{
 const h=await harness()
 try{
  const fixture=portableFixture(),bytes=new TextEncoder().encode(JSON.stringify(fixture)),source=prepareJsonSource({filename:'metadata.json',bytes}),preview=previewJsonImport(source,{name:fixture.base.name},allocateJsonIdentities(fixture,'copy')),applied=await applyPreview(h,preview),target=createNativeImportTarget(applied.r.registry),rows=await target.list(h.db,preview.identities.appId),effects=rows.map((expected,index)=>({expected,provenance:{id:'metadata-set-'+index},retained:false})),metadata=effects.filter(effect=>['view','form'].includes(effect.expected.targetKind))
  assert.ok(metadata.some(effect=>effect.expected.targetKind==='view'));assert.ok(metadata.some(effect=>effect.expected.targetKind==='form'))
  for(const effect of metadata)await h.db.prepare(`DELETE FROM ${effect.expected.targetKind==='view'?'record_views':'record_forms'} WHERE id=?`).bind(effect.expected.targetId).run()
  const snapshot=await target.preparePreservedUndo(h.db,preview.identities.appId,effects)
  assert.ok(snapshot.nativeRows.every(row=>!['view','form'].includes(row.targetKind)));assert.ok(snapshot.observations.every(observation=>!Object.hasOwn(observation,'guard')));assert.equal(snapshot.observations.filter(observation=>observation.current===null).length,metadata.length);assert.equal(await exactUndoGuardsPass(h.db,snapshot.guards),true)
  const restored=metadata[0].expected;await h.db.batch(target.write(restored).map(statement=>h.db.prepare(statement.sql).bind(...statement.params)));assert.equal(await exactUndoGuardsPass(h.db,snapshot.guards),false,'Whole-set guards reject metadata appearing after classification')
  await h.db.prepare('UPDATE record_import_revisions SET revision=? WHERE app_id=? AND target_kind=? AND record_id=?').bind('forged',restored.destination,restored.targetKind,restored.targetId).run();await assert.rejects(target.preparePreservedUndo(h.db,preview.identities.appId,effects),/IMPORT_NATIVE_ATTRIBUTION_CHANGED/)
 }finally{h.close()}
})
