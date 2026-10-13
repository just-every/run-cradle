import {peerImport,custodyMatches} from './helpers/erasure-custody.mjs'
import {checkpointParity} from './helpers/erasure-checkpoint.mjs'
import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {fixture,identity,control} from './helpers/lifecycle-erasure-fixture.mjs'
import {compressedPdf,encodedText} from './helpers/erasure-attachments.mjs'
import {beginStage} from '../vendor/base/modules/import-kit/src/d1/staging-lifecycle.ts'
import {stored} from '../vendor/base/modules/import-kit/src/d1/jobs.ts'
import {createNativeImportTarget} from '../src/domains/records/base-transfer/target.server.ts'
import {importAuthority} from '../src/domains/records/base-transfer/authority.server.ts'
import {createPortability} from '@runeditrun/rer/modules/portability'
import {portabilityPolicy} from '../scripts/portability/policy.mjs'
import {migratedD1} from './helpers/sqlite-d1.mjs'
import {derivedSearch} from '../scripts/portability/records.mjs'
import {portableRecordSchema} from '../src/domains/records/portable-schema.server.ts'
import {objectBucket} from './helpers/erasure-attachments.mjs'

contract('BASE-DATA-001 BASE-DATA-003 RECORDS-005','public person erasure decodes compressed files, retires custody atomically, preserves controls and fences old archives',async()=>{
 await checkpointParity()
 const h=await fixture();let target
 try{
  const retired=await h.imported([identity],identity.email),mixed=await h.imported([identity,control],'mixed-custody'),unrelated=await h.imported([control],'independent-custody')
  const peer=await peerImport(h,mixed,unrelated,control);assert.equal((await peer.undo()).state,'undone');const peerBytes=()=>JSON.stringify(h.sql.prepare('SELECT * FROM ik_d1_reversal_reports WHERE job_id=?').all(peer.job.id)),beforePeer=peerBytes();assert.notEqual(beforePeer,'[]')
  const retiredReview=h.sql.prepare('SELECT operation_key FROM ik_jobs WHERE id=?').get(retired.job.id).operation_key,mixedReview=h.sql.prepare('SELECT operation_key FROM ik_jobs WHERE id=?').get(mixed.job.id).operation_key
  assert.equal((await retired.service.undo(h.ctx,retired.job.id)).state,'undone')
  const appId=retired.preview.identities.appId;await h.assign(appId)
  const stageAuthority=await importAuthority(h.db,retired.r.policy,h.ctx,appId),stageContext={destination:appId,namespace:identity.email,mappingVersion:'cradle-native-base-v1',storage:{database:h.db,targets:createNativeImportTarget(retired.r.registry)},authorization:{principalId:h.owner,predicate:()=>stageAuthority}}
  await beginStage({id:'private-person-stage',generation:'private-person-generation',destination:appId,namespace:identity.email,mapping_version:stageContext.mappingVersion,principal_id:h.owner,fingerprint:retired.job.fingerprint,operation_key:'private-person-upload',total:0,pages:0,layout_hash:retired.job.fingerprint,reversal_policy:'preserve-conflicts'},stageContext)
  assert.equal(h.sql.prepare('SELECT count(*) n FROM ik_d1_staging').get().n,1)
  assert.ok(h.sql.prepare('SELECT count(*) n FROM ik_d1_reversal_reports WHERE job_id=?').get(retired.job.id).n>0)
  const beforeCounts=['ik_originals','ik_jobs','ik_d1_staging','ik_d1_reversal_reports','record_import_reviews','record_import_review_chunks'].map(store=>({store,rows:h.sql.prepare('SELECT count(*) n FROM '+store).get().n}))
  const memberVersion=h.sql.prepare('SELECT version FROM authority_principals WHERE id=?').get(h.person).version
  const removed=await h.send('remove',{appId},memberVersion);assert.equal(removed.status,200,await removed.clone().text())
  const version=(await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(h.person).first()).version
  const content=identity.name+' '+identity.email
  const personal=[await h.file(compressedPdf(content)),await h.file(encodedText(content,'gzip'),{type:'text/plain',encoding:'gzip'}),await h.file(encodedText(content,'deflate'),{type:'text/plain',encoding:'deflate'})]
  const other=await h.file(compressedPdf(control.name+' '+control.email),{owner:h.owner})
  const cleanFiles=h.bucket.snapshot().filter(([key])=>key===other.key),cleanRows=JSON.stringify((await h.db.prepare('SELECT * FROM "'+unrelated.table+'" ORDER BY id').all()).results)
  const cleanCustody=()=>JSON.stringify(h.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'ik_*' ORDER BY name").all().flatMap(({name})=>{const cols=h.sql.prepare('PRAGMA table_info("'+name+'")').all().map(c=>c.name);const field=cols.includes('job_id')?'job_id':name==='ik_jobs'?'id':null;return field?[[name,h.sql.prepare('SELECT * FROM "'+name+'" WHERE "'+field+'"=?').all(unrelated.job.id)]]:[]}))
  const beforeIdentity=await custodyMatches(h,[identity.name,identity.email]);assert.ok(beforeIdentity.matches>0)
  const beforeClean=cleanCustody(),erase=()=>h.send('erase',{appId},version)
  // Opaque, corrupt and unknown encodings are explicit failures, with zero native
  // or custody mutation. The owner resolves only these temporary fixture objects.
  for(const [bytes,type,encoding] of [[Buffer.from([0,255,1]),'application/octet-stream'],[compressedPdf(content,'LZWDecode'),'application/pdf'],[Buffer.from([0xff,0xfe,0]),'text/plain'],[Buffer.from('not gzip'),'text/plain','gzip'],[Buffer.from(content),'text/plain','br']]){
   const bad=await h.file(bytes,{type,encoding}),before=h.snapshot(),objects=h.bucket.snapshot(),response=await erase()
   assert.equal(response.status,409,await response.clone().text());assert.match((await response.json()).error.message,/cannot inspect/)
   assert.equal(h.snapshot(),before,'Refusal changes no native/custody/checkpoint row');assert.deepEqual(h.bucket.snapshot(),objects)
   await h.bucket.delete(bad.key);await h.db.prepare('DELETE FROM evidence_files WHERE id=?').bind(bad.id).run()
  }
  // A native-trigger failure and a late custody insertion into another destination
  // both roll back all destinations and the native erasure/checkpoint together.
  for(const trigger of ["SELECT RAISE(ABORT,'privacy native failure');",`UPDATE ik_jobs SET namespace='${identity.email}' WHERE id='${unrelated.job.id}';`,`INSERT INTO ik_d1_stream_revisions(stream_id,destination,namespace,mapping_version,principal_id,fingerprint,operation_key,total,layout_hash) VALUES('late-stream','late-destination','${identity.email}','test-mapping','${h.owner}','test-fingerprint','late-operation',0,'test-layout');`]){
   h.sql.exec(`CREATE TRIGGER privacy_race AFTER UPDATE ON operators WHEN NEW.id='${h.person}' AND NEW.email<>OLD.email BEGIN ${trigger} END`)
   const before=h.snapshot(),objects=h.bucket.snapshot(),response=await erase();assert.notEqual(response.status,200)
   assert.equal(h.snapshot(),before,'Late failure rolls back all native and import scopes');assert.deepEqual(h.bucket.snapshot(),objects);h.sql.exec('DROP TRIGGER privacy_race')
  }
  // Capture a real pre-erasure archive, then remove its local transfer custody.
  // The downloaded archive stays outside the installation and cannot be deleted
  // by erasure; the restore checkpoint is what prevents its return.
  const portability=await createPortability({db:h.db,buckets:{FILES:h.bucket},policy:{...portabilityPolicy,derivedTables:await derivedSearch(h.db)}}),exportId=await portability.exports.create('privacy-test')
  while((await portability.exports.status(exportId)).phase!=='complete')await portability.exports.advance(exportId,{maxParts:100})
  const archive=(await new Response(await portability.exports.download(exportId)).text()).trim().split('\n').map(JSON.parse)
  await portability.exports.abort(exportId)
  const runtime=await h.runtime(),authority=await importAuthority(h.db,runtime.policy,h.ctx,mixed.preview.identities.appId)
  const stale={destination:mixed.preview.identities.appId,namespace:'mixed-custody',mappingVersion:'cradle-native-base-v1',storage:{database:h.db,targets:createNativeImportTarget(runtime.registry)},authorization:{principalId:h.owner,predicate:()=>authority},reviewedFingerprint:mixed.job.fingerprint}
  assert.equal((await stored(mixed.job.id,stale)).plan.entries.length,2)
  const response=await erase(),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.value.confirmed,true)
  for(const file of personal)assert.equal(await h.bucket.head(file.key),null)
  assert.deepEqual(h.bucket.snapshot().filter(([key])=>key===other.key),cleanFiles,'Unrelated compressed PDF bytes and metadata remain exact')
  assert.equal(JSON.stringify((await h.db.prepare('SELECT * FROM "'+unrelated.table+'" ORDER BY id').all()).results),cleanRows)
  assert.equal(peerBytes(),beforePeer,'Same-destination unrelated reversal report stays byte-identical');assert.equal((await peer.undo()).state,'undone')
  const afterIdentity=await custodyMatches(h,[identity.name,identity.email]);assert.deepEqual(afterIdentity,{matches:0,stores:[]});console.log('ERASURE_IDENTITY_MATCHES '+JSON.stringify({before:beforeIdentity,after:afterIdentity}))
  assert.equal(cleanCustody(),beforeClean,'Independent originals, plan, stages, provenance and reports remain exact')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM record_import_reviews WHERE id IN (?,?)').bind(retiredReview,mixedReview).first()).n,0)
  await assert.rejects(retired.service.undo(h.ctx,retired.job.id),/retired/)
  await assert.rejects(stored(mixed.job.id,stale),/REVIEW_FINGERPRINT_MISMATCH/)
  const retained=await stored(mixed.job.id,{...stale,reviewedFingerprint:undefined});assert.equal(retained.plan.entries.filter(e=>e.erased).length,1);assert.equal(retained.plan.entries.filter(e=>!e.erased).length,1)
  assert.equal((await unrelated.service.undo(h.ctx,unrelated.job.id)).state,'undone','Unrelated import undo remains usable')
  assert.equal((await mixed.service.undo(h.ctx,mixed.job.id)).state,'undone','Mixed import undoes only remaining effects')
  const journals=h.sql.prepare('SELECT destination,records_erased,jobs_retired,stores_json FROM ik_d1_erasure_journal ORDER BY destination').all()
  assert.ok(journals.some(j=>j.jobs_retired>0));assert.ok(journals.some(j=>j.records_erased>0))
  const counts=journals.flatMap(j=>JSON.parse(j.stores_json));for(const store of ['ik_originals','ik_jobs','ik_d1_staging','ik_d1_reversal_reports'])assert.ok(counts.some(c=>c.store===store&&c.rows>0),store+' has actual erased row counts')
  const state=h.sql.prepare('SELECT source_identity,epoch FROM rer_portability_state').get(),later={sourceIdentity:state.source_identity,epoch:state.epoch,journal:h.sql.prepare('SELECT tombstone FROM rer_portability_journal WHERE source=? ORDER BY tombstone').all(state.source_identity).map(r=>r.tombstone)}
  assert.ok(later.epoch>archive[0].epoch)
  // The current database rejects its old checkpoint before any restore write.
  async function refused(api,options){const id=await api.imports.create(archive[0],'privacy-test');try{for(const part of archive.filter(r=>r.kind==='part'))await api.imports.uploadPart(id,part.index,part);await assert.rejects(api.imports.finalize(id,{...archive.at(-1),...options}),error=>error.code==='erasure_epoch')}finally{await api.imports.abort(id)}}
  await refused(portability,{})
  target=migratedD1();for(const plan of portableRecordSchema([h.sql.prepare('SELECT schema_json FROM record_schemas').all().map(r=>JSON.parse(r.schema_json))]))target.sql.exec(plan.sql);const fresh=await createPortability({db:target.db,buckets:{FILES:objectBucket()},policy:{...portabilityPolicy,derivedTables:await derivedSearch(target.db)}})
  await refused(fresh,{laterJournal:later})
  assert.equal(target.sql.prepare('SELECT count(*) n FROM operators').get().n,0,'Later journal refuses old archive on a fresh target')
  console.log('ERASURE_CUSTODY_COUNTS '+JSON.stringify({before:beforeCounts,journals:journals.map(j=>({...j,stores_json:JSON.parse(j.stores_json)})),after:beforeCounts.map(({store})=>({store,rows:h.sql.prepare('SELECT count(*) n FROM '+store).get().n}))}))
 }finally{target?.close();h.close()}
})
