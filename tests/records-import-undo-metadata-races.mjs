import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {portableFixture} from './helpers/base-exit-fixture.mjs'
import {applyPreview} from './helpers/base-exit-runtime.mjs'
import {prepareJsonSource,allocateJsonIdentities} from '../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../src/domains/records/base-transfer/plan-json.ts'
import {importAuthority} from '../src/domains/records/base-transfer/authority.server.ts'
import {createNativeImportTarget} from '../src/domains/records/base-transfer/target.server.ts'
import {undoD1Import} from '../vendor/base/modules/import-kit/src/d1/index.ts'

for(const kind of ['view','form'])contract('RECORDS-005 RECORDS-006',`${kind} same-version edit after classification rejects the entire metadata/native reversal and report publication`,async()=>{
 const h=await harness()
 try{
  const snapshot=portableFixture(),source=prepareJsonSource({filename:'metadata-race.json',bytes:new TextEncoder().encode(JSON.stringify(snapshot))}),identities=allocateJsonIdentities(snapshot,'copy'),preview=previewJsonImport(source,{name:'Metadata race'},identities),applied=await applyPreview(h,preview),authority=await importAuthority(h.db,applied.r.policy,h.ctx,identities.appId),target=createNativeImportTarget(applied.r.registry),id=kind==='view'?preview.portableViews[0].id:preview.portableForms[0].id,table=kind==='view'?'record_views':'record_forms'
  const footprint=async()=>{const tables=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'ik_%' OR name='record_import_revisions') ORDER BY name").all()).results,all=[];for(const row of tables)all.push([row.name,(await h.db.prepare('SELECT * FROM "'+row.name+'"').all()).results.map(r=>JSON.stringify(r)).sort()]);return JSON.stringify({all,native:await target.list(h.db,identities.appId)})}
  let before,observed=0
  const targets={...target,async preparePreservedUndo(...args){const decision=await target.preparePreservedUndo(...args);observed++;await h.db.prepare(`UPDATE ${table} SET definition_json=json_set(definition_json,?,'Raced metadata') WHERE id=?`).bind(kind==='view'?'$.name':'$.title',id).run();before=await footprint();return decision}},context={destination:identities.appId,namespace:source.namespace,mappingVersion:'cradle-native-base-v1',storage:{database:h.db,targets},authorization:{principalId:h.owner,predicate:()=>authority},batchSize:20,maxBatches:1}
  await assert.rejects(undoD1Import(applied.job.id,context),/IMPORT_ATOMIC_GUARD/);assert.equal(observed,1);assert.equal(await footprint(),before)
 }finally{h.close()}
})
