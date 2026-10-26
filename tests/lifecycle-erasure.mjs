import {peerImport,custodyMatches} from './helpers/erasure-custody.mjs'
import {checkpointParity} from './helpers/erasure-checkpoint.mjs'
import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {fixture,identity,control} from './helpers/lifecycle-erasure-fixture.mjs'
import {compressedPdf,encodedText,gzipMetadata} from './helpers/erasure-attachments.mjs'
import {beginStage} from '../vendor/base/modules/import-kit/src/d1/staging-lifecycle.ts'
import {stored} from '../vendor/base/modules/import-kit/src/d1/jobs.ts'
import {createNativeImportTarget} from '../src/domains/records/base-transfer/target.server.ts'
import {importAuthority} from '../src/domains/records/base-transfer/authority.server.ts'
import {createPortability} from '@runeditrun/rer/modules/portability'
import {portabilityPolicy} from '../scripts/portability/policy.mjs'
import {migratedD1} from './helpers/sqlite-d1.mjs'
import {derivedSearch} from '../scripts/portability/records.mjs'
import {portableRecordSchema} from '../src/domains/records/portable-schema.server.ts'
import {objectBucket,png} from './helpers/erasure-attachments.mjs'
import {applyPreview} from './helpers/base-exit-runtime.mjs'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {createFixtureAuth} from './helpers/base-fixture-auth.mjs'
import {executionResolutionFixture,testKeyring} from './helpers/execution-resolution-fixture.mjs'
import {STAGING_ENTITY,stagingPolicyEntity} from '../src/domains/evidence/staging.server.ts'
import {executionPolicyEntities} from '../src/domains/execution/metadata.server.ts'
import {createPolicyPort} from '../src/domains/authority/policy.server.ts'
import {createReplayAccess,createRequestContextFactory} from '../src/domains/authority/context.server.ts'
import {createAdmissionService} from '../src/domains/admission/service.server.ts'
import {createExecutionBudget} from '../src/domains/execution/budget-bridge.server.ts'
import {createCommandRegistry} from '../src/core/registry/commands.ts'
import {createCommandHttp} from '../src/core/registry/http.ts'
import {registerExecutionCommands} from '../src/domains/execution/commands.server.ts'
import {trustedPredicate} from '../src/domains/admission/sql.server.ts'
import {createUlid} from '../src/core/shared/ids.ts'
import {launchAuthorityRuntime,LAUNCH_APP_ID,launchEntities} from './helpers/launch-authority-runtime.mjs'

contract('BASE-DATA-001 BASE-DATA-003','public erasure before the first installation transfer creates its checkpoint atomically',async()=>{
 const h=await fixture()
 try{
  const {draft}=await h.create(),appId=draft.appId;await h.assign(appId)
  await h.db.prepare("INSERT INTO channel_progress_owed(event_id,subject_type,subject_id,starter_id,outcome,created_at) VALUES(?,'warehouse-export',?,?,'completed',?)").bind('synthetic-cradle-4201','synthetic-cradle-4202',h.person,new Date().toISOString()).run()
  const owed=()=>h.sql.prepare('SELECT count(*) n FROM channel_progress_owed WHERE starter_id=?').get(h.person).n
  assert.equal(owed(),1)
  assert.equal(h.sql.prepare('SELECT count(*) n FROM rer_portability_state').get().n,0)
  assert.equal((await h.send('remove',{appId},h.sql.prepare('SELECT version FROM authority_principals WHERE id=?').get(h.person).version)).status,200)
  assert.equal(owed(),1,'Removing access does not discard the pending erasure inventory')
  const version=h.sql.prepare('SELECT version FROM authority_principals WHERE id=?').get(h.person).version,response=await h.send('erase',{appId},version)
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.value.confirmed,true)
  assert.equal(body.data.value.erasureState,'complete')
  const progressPlace=body.data.value.plan.places.find(place=>place.store==='channel_progress_owed')
  assert.ok(progressPlace,'Confirmed erasure inventories owed progress starter references')
  assert.equal(progressPlace.action,'delete');assert.equal(progressPlace.rows,1)
  assert.equal(owed(),0,'The erasure transaction retires every owed row naming the starter')
  const state=h.sql.prepare('SELECT source_identity,epoch FROM rer_portability_state').get()
  assert.ok(state.source_identity&&state.epoch>0);assert.equal(h.sql.prepare('SELECT epoch FROM rer_portability_epochs WHERE source=?').get(state.source_identity).epoch,state.epoch)
  assert.ok(h.sql.prepare('SELECT count(*) n FROM rer_portability_journal WHERE source=?').get(state.source_identity).n>0)
  assert.deepEqual(await custodyMatches(h,[identity.name,identity.email]),{matches:0,stores:[]})
 }finally{h.close()}
 await verifyLiveImportStarterErasure()
})

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
  const personal=[await h.file(compressedPdf(content),{key:'private/'+identity.email+'/attachment.pdf'}),await h.file(encodedText(content,'gzip'),{type:'text/plain',encoding:'gzip'}),await h.file(encodedText(content,'deflate'),{type:'text/plain',encoding:'deflate'})]
  for(const [bytes,encoding] of [[gzipMetadata('innocent',{name:content}),'gzip'],[Buffer.concat([encodedText('first ','gzip'),gzipMetadata('innocent',{comment:content})]),'gzip'],[gzipMetadata(encodedText('innocent','gzip'),{comment:content}),'gzip,gzip'],[encodedText(gzipMetadata('innocent',{name:content}),'deflate'),'gzip,deflate']])personal.push(await h.file(bytes,{type:'text/plain',encoding}))
  const other=await h.file(compressedPdf(control.name+' '+control.email),{owner:h.owner})
  const otherGzip=await h.file(gzipMetadata('innocent',{name:control.name,comment:control.email}),{owner:h.owner,type:'text/plain',encoding:'gzip'}),cleanGzip=h.bucket.snapshot().filter(([key])=>key===otherGzip.key)
  const cleanFiles=h.bucket.snapshot().filter(([key])=>key===other.key),cleanRows=JSON.stringify((await h.db.prepare('SELECT * FROM "'+unrelated.table+'" ORDER BY id').all()).results)
  const cleanCustody=()=>JSON.stringify(h.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'ik_*' ORDER BY name").all().flatMap(({name})=>{const cols=h.sql.prepare('PRAGMA table_info("'+name+'")').all().map(c=>c.name);const field=cols.includes('job_id')?'job_id':name==='ik_jobs'?'id':null;return field?[[name,h.sql.prepare('SELECT * FROM "'+name+'" WHERE "'+field+'"=?').all(unrelated.job.id)]]:[]}))
  const beforeIdentity=await custodyMatches(h,[identity.name,identity.email]);assert.ok(beforeIdentity.matches>0)
  const beforeClean=cleanCustody(),erase=()=>h.send('erase',{appId},version)
  // Opaque, corrupt and unknown encodings are explicit failures, with zero native
  // or custody mutation. The owner resolves only these temporary fixture objects.
  for(const [bytes,type,encoding] of [[Buffer.from([0,255,1]),'application/octet-stream'],[compressedPdf(content,'LZWDecode'),'application/pdf'],[Buffer.from([0xff,0xfe,0]),'text/plain'],[Buffer.from('not gzip'),'text/plain','gzip'],[Buffer.from(content),'text/plain','br'],[gzipMetadata('innocent',{extra:Buffer.from(content)}),'text/plain','gzip'],[encodedText(Buffer.concat([encodedText('first ','gzip'),gzipMetadata('innocent',{extra:Buffer.from(content)})]),'gzip'),'text/plain','gzip,gzip']]){
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
  // Capture a real pre-erasure archive. CLI abort leaves private manifest metadata;
  // erasure must retire that custody itself, alongside a completed local snapshot.
  // The downloaded archive stays outside the installation and cannot be deleted
  // by erasure; the restore checkpoint is what prevents its return.
  const portability=await createPortability({db:h.db,buckets:{FILES:h.bucket},policy:{...portabilityPolicy,derivedTables:await derivedSearch(h.db)}}),exportId=await portability.exports.create('privacy-test')
  while((await portability.exports.status(exportId)).phase!=='complete')await portability.exports.advance(exportId,{maxParts:100})
  const archive=(await new Response(await portability.exports.download(exportId)).text()).trim().split('\n').map(JSON.parse)
  await portability.exports.abort(exportId)
  assert.ok(h.sql.prepare('SELECT metadata FROM rer_portability_jobs WHERE id=?').get(exportId).metadata.includes(identity.email),'Real export abort retains a personal object key in its manifest')
  const completedExport=await portability.exports.create('privacy-test')
  const refuseActive=async()=>{const before=h.snapshot(),objects=h.bucket.snapshot(),response=await erase();assert.equal(response.status,409);assert.match((await response.json()).error.message,/active installation transfers/);assert.equal(h.snapshot(),before);assert.deepEqual(h.bucket.snapshot(),objects)}
  await refuseActive()
  while((await portability.exports.status(completedExport)).phase!=='complete')await portability.exports.advance(completedExport,{maxParts:100})
  const stagedImport=await portability.imports.create(archive[0],'privacy-test');await portability.imports.uploadPart(stagedImport,0,archive.find(record=>record.kind==='part'));await refuseActive();await portability.imports.abort(stagedImport)
  // Transfers starting after inspection must roll back native writes, and custody
  // introduced by a later retirement trigger must roll back the entire batch too.
  for(const [table,event,condition] of [['operators','UPDATE',`NEW.id='${h.person}' AND NEW.email<>OLD.email`],['ik_d1_erasure_journal','INSERT','1']]){
   h.sql.exec(`CREATE TRIGGER privacy_transfer_race AFTER ${event} ON ${table} WHEN ${condition} BEGIN INSERT INTO rer_portability_jobs(id,kind,actor,phase,metadata) VALUES('racing-transfer','import','owner','staging','{}'); END`)
   const before=h.snapshot(),objects=h.bucket.snapshot(),response=await erase();assert.notEqual(response.status,200);assert.equal(h.snapshot(),before,'Late transfer rolls back native erasure, transfer invalidation and checkpoint');assert.deepEqual(h.bucket.snapshot(),objects);h.sql.exec('DROP TRIGGER privacy_transfer_race')
  }
  const runtime=await h.runtime(),authority=await importAuthority(h.db,runtime.policy,h.ctx,mixed.preview.identities.appId)
  const stale={destination:mixed.preview.identities.appId,namespace:'mixed-custody',mappingVersion:'cradle-native-base-v1',storage:{database:h.db,targets:createNativeImportTarget(runtime.registry)},authorization:{principalId:h.owner,predicate:()=>authority},reviewedFingerprint:mixed.job.fingerprint}
  assert.equal((await stored(mixed.job.id,stale)).plan.entries.length,2)
  const retainedDownload=await portability.exports.download(completedExport)
  // Real transfers can start while R2 deletion is outside the native transaction.
  // Keep one completed archive and one active export at that boundary.
  const deleteObject=h.bucket.delete.bind(h.bucket);let cleanupExport,activeCleanupExport,cleanupArchive
  h.bucket.delete=async key=>{if(!cleanupExport){cleanupExport=await portability.exports.create('cleanup-race');while((await portability.exports.status(cleanupExport)).phase!=='complete')await portability.exports.advance(cleanupExport,{maxParts:100});cleanupArchive=(await new Response(await portability.exports.download(cleanupExport)).text()).trim().split('\n').map(JSON.parse);assert.ok(JSON.stringify(cleanupArchive[0]).includes(identity.email));activeCleanupExport=await portability.exports.create('active-cleanup-race')}return deleteObject(key)}
  const response=await erase(),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.value.confirmed,false);assert.equal(body.data.value.erasureState,'pending','Active transfer during blob deletion prevents confirmation')
  h.bucket.delete=deleteObject
  assert.equal(h.sql.prepare('SELECT epoch FROM rer_portability_state').get().epoch,cleanupArchive[0].epoch,'Pending cleanup does not advance its final checkpoint')
  const pending=await h.resumeErasure();assert.equal(pending.status,200,await pending.clone().text());assert.equal((await pending.json()).data.state,'pending')
  await portability.exports.abort(activeCleanupExport)
  h.sql.exec("CREATE TRIGGER privacy_cleanup_race AFTER UPDATE ON lifecycle_erasures WHEN NEW.state='complete' BEGIN INSERT INTO rer_portability_jobs(id,kind,actor,phase,metadata) VALUES('late-cleanup-transfer','export','owner','building','{}'); END")
  const beforeCleanup=h.snapshot(),failedCleanup=await h.resumeErasure();assert.notEqual(failedCleanup.status,200);assert.equal(h.snapshot(),beforeCleanup,'Late cleanup transfer rolls back invalidation, receipt completion and final checkpoint');h.sql.exec('DROP TRIGGER privacy_cleanup_race')
  for(const resumed of await Promise.all([h.resumeErasure(),h.resumeErasure()])){assert.equal(resumed.status,200);assert.equal((await resumed.json()).data.state,'complete','Concurrent receipt resumes after the active transfer is cancelled are safe')}
  assert.equal(h.sql.prepare('SELECT count(*) n FROM rer_portability_jobs').get().n,0,'Erasure retires complete and aborted installation transfers')
  assert.equal(h.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name GLOB 'rer_portability_snap_*' OR name GLOB 'rer_portability_stage_*'").get().n,0,'Snapshot and staging tables are dropped atomically')
  await assert.rejects(portability.exports.download(completedExport),error=>error.code==='job_not_found')
  await assert.rejects(portability.exports.advance(exportId),error=>error.code==='job_not_found')
  await assert.rejects(new Response(retainedDownload).text(),error=>error.code==='part_missing','A download opened before erasure cannot finish its invalidated archive')
  const finalEpoch=h.sql.prepare('SELECT epoch FROM rer_portability_state').get().epoch,postCompletion=await portability.exports.create('after-confirmation')
  assert.equal((await h.resumeErasure()).status,200);assert.equal(h.sql.prepare('SELECT epoch FROM rer_portability_state').get().epoch,finalEpoch,'Completed receipt replay cannot advance the checkpoint or invalidate a new transfer');assert.equal((await portability.exports.status(postCompletion)).phase,'building');await portability.exports.abort(postCompletion)
  for(const file of personal)assert.equal(await h.bucket.head(file.key),null)
  assert.deepEqual(h.bucket.snapshot().filter(([key])=>key===other.key),cleanFiles,'Unrelated compressed PDF bytes and metadata remain exact')
  assert.deepEqual(h.bucket.snapshot().filter(([key])=>key===otherGzip.key),cleanGzip,'Unrelated gzip header, payload and object metadata remain exact')
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
  async function refused(api,options,candidate=archive){const id=await api.imports.create(candidate[0],'privacy-test');try{for(const part of candidate.filter(r=>r.kind==='part'))await api.imports.uploadPart(id,part.index,part);await assert.rejects(api.imports.finalize(id,{...candidate.at(-1),...options}),error=>error.code==='erasure_epoch')}finally{await api.imports.abort(id)}}
  await refused(portability,{})
  await refused(portability,{},cleanupArchive)
  target=migratedD1();for(const plan of portableRecordSchema([h.sql.prepare('SELECT schema_json FROM record_schemas').all().map(r=>JSON.parse(r.schema_json))]))target.sql.exec(plan.sql);const fresh=await createPortability({db:target.db,buckets:{FILES:objectBucket()},policy:{...portabilityPolicy,derivedTables:await derivedSearch(target.db)}})
  await refused(fresh,{laterJournal:later})
  await refused(fresh,{laterJournal:later},cleanupArchive)
  assert.equal(target.sql.prepare('SELECT count(*) n FROM operators').get().n,0,'Later journal refuses old archive on a fresh target')
  console.log('ERASURE_CUSTODY_COUNTS '+JSON.stringify({before:beforeCounts,journals:journals.map(j=>({...j,stores_json:JSON.parse(j.stores_json)})),after:beforeCounts.map(({store})=>({store,rows:h.sql.prepare('SELECT count(*) n FROM '+store).get().n}))}))
 }finally{target?.close();h.close()}
})

contract('BASE-DATA-001 BASE-DATA-003','erasure completes beside other people\'s uninspectable files and confirmed name-only import copies',async()=>{
 const h=await fixture()
 try{
  // An import that names the person without their email: a name alone never identifies them.
  const source=prepareCsvSource([{filename:'Tasks.csv',bytes:Buffer.from('Task,Assignee\r\nFix roof,'+identity.name+'\r\nPaint fence,'+control.name+'\r\n')}],'tasks')
  const preview=previewBaseImport(source,{name:'Tasks'},allocateImportIdentities(source));await applyPreview(h,preview)
  const appId=preview.identities.appId,version=()=>h.sql.prepare('SELECT version FROM authority_principals WHERE id=?').get(h.person).version;await h.assign(appId)
  assert.equal((await h.send('remove',{appId},version())).status,200)
  // Other people's photo, ragged CSV, unsupported PDF and a 31 KB PDF that inflates to 30 MiB.
  for(const [bytes,type] of [[png(),'image/png'],[Buffer.from('Item,Qty\nBolts,4\nNotes: reorder next week\n'),'text/csv'],[compressedPdf('Quarterly plan','LZWDecode'),'application/pdf'],[compressedPdf('a'.repeat(30*1024*1024)),'application/pdf']])await h.file(bytes,{owner:h.owner,type})
  const objects=h.bucket.snapshot(),refused=await h.send('erase',{appId},version()),copies=(await refused.json()).error.erasureCopies
  assert.equal(refused.status,409);assert.ok(copies.length>0)
  const response=await h.send('erase',{appId,keepCopies:copies.map(copy=>copy.store)},version()),body=await response.json()
  assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.data.value.plan.kept.find(copy=>copy.reason==='not_inspected')?.rows,3,'Uninspectable files are reported, not silently skipped')
  assert.deepEqual(h.bucket.snapshot(),objects,'Other people\'s files stay byte-identical')
  assert.equal(h.sql.prepare('SELECT count(*) n FROM operators WHERE name=? OR email=?').get(identity.name,identity.email).n,0)
 }finally{h.close()}
})

contract('BASE-DATA-001','erasing an operator who recorded a human effect resolution removes their name and email from its receipt',async()=>{
 const h=await fixture()
 try{
  const {draft}=await h.create(),appId=draft.appId,host=new URL(h.origin).host
  const auth=await createFixtureAuth(h.db,{appOrigin:h.origin,sessionSecret:'test-only-erasure-session-secret-long-enough',mode:'development'},h.owner),session=await auth.signIn(h.person)
  const f=await executionResolutionFixture(h.db,[h.person],{appId}),registry={get:(app,id)=>id===STAGING_ENTITY?stagingPolicyEntity(app):executionPolicyEntities.find(e=>e.id===id)}
  const policy=createPolicyPort(h.db,registry),admission=createAdmissionService(h.db,createReplayAccess(h.db,policy,registry)),authenticate=createRequestContextFactory(h.db,auth.configuration)
  const ctx=await authenticate(new Request(h.origin+'/api/v1/runs/'+createUlid(),{headers:{host,cookie:session.cookie}})),commands=createCommandRegistry(admission)
  registerExecutionCommands(commands,{db:h.db,admission,policy,workspaceId:'resolution-test',keyring:testKeyring,adapters:new Map(),currentGuards:async()=>[trustedPredicate('1')],...createExecutionBudget(h.db),backgroundContext:async()=>ctx})
  const a=await f.unknown(),resolved=await createCommandHttp({commands,admission,authenticate}).fetch(new Request(h.origin+'/api/v1/commands/attempt.resolve',{method:'POST',headers:{host,origin:h.origin,'content-type':'application/json',cookie:session.cookie,'x-csrf-token':session.csrf},body:JSON.stringify({commandId:createUlid(),expected:[],input:{attemptId:a.attemptId,expectedVersion:1,outcome:'done',evidence:{summary:identity.name+' phoned the recipient, who confirmed delivery.',reference:'call log kept by '+identity.email}}})}))
  assert.equal(resolved.status,200,await resolved.clone().text())
  const holding=()=>h.sql.prepare("SELECT count(*) n FROM execution_receipts WHERE method='human_evidence' AND (instr(result_json,?)>0 OR instr(result_json,?)>0)").get(identity.name,identity.email).n
  assert.equal(holding(),1)
  assert.equal((await h.send('remove',{appId},h.sql.prepare('SELECT version FROM authority_principals WHERE id=?').get(h.person).version)).status,200)
  const response=await h.send('erase',{appId},h.sql.prepare('SELECT version FROM authority_principals WHERE id=?').get(h.person).version)
  assert.equal(response.status,200,await response.clone().text());assert.equal(holding(),0)
  const receipt=JSON.parse(h.sql.prepare("SELECT result_json FROM execution_receipts WHERE method='human_evidence'").get().result_json).humanResolution
  assert.equal(receipt.actorId,h.person);assert.equal(receipt.outcome,'done','The decision and its actor stay; only identity text is anonymised')
 }finally{h.close()}
})

/** A real emitted import is interrupted after its durable journal, while its
 * apply fence is live. Public ownership handover makes its starter erasable. */
async function verifyLiveImportStarterErasure(){
 const h=await launchAuthorityRuntime({}, {installedLaunchDefinitions:true,installationOwner:true})
 let inspector
 try{
  const starter={id:h.owner,session:h.ownerSession},successor=await h.addPerson({legacy:true,name:'synthetic-cradle-4301'})
  const raw=async(person,route,body)=>{const response=await h.request(person.session,route,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});return {status:response.status,value:await response.json()}}
  const json=async(person,route,body)=>{const response=await raw(person,route,body);assert.equal(response.status,200,JSON.stringify(response));return response.value.data}
  const command=async(person,action,input,expected=[])=>{const data=await json(person,'/api/v1/commands/'+action,{commandId:createUlid(),input,expected});assert.equal(data.state,'committed');return data.value}
  const settings=await json(starter,'/api/v1/settings')
  await command(starter,'settings.update',{version:settings.version,changes:{timezone:'UTC',quietHoursStart:'00:00',quietHoursEnd:'00:00'}})
  for(const person of [starter,successor]){const p=(await json(person,'/api/v1/settings')).preferences;await command(person,'preferences.update',{version:p.version,preferences:{timezone:'UTC',mutedKinds:[],digestEnabled:false,progressEnabled:true}})}
  for(const a of (await h.db.prepare('SELECT id,version FROM automations WHERE enabled=1').all()).results)await command(starter,'launch.automation.disable',{id:a.id},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:a.id},version:a.version}])
  const filename='synthetic-cradle-4302.csv',text='Name\n'+Array.from({length:25},(_,i)=>'synthetic-cradle-'+(4400+i)).join('\n')+'\n',options={name:'synthetic-cradle-4303',tables:{[filename]:{columns:{'column-1':{type:'text'}}}}},prefix='/api/v1/records/base-import'
  const upload=async(route,preview)=>{const body=new FormData();body.append('files',new Blob([text],{type:'text/csv'}),filename);body.set('options',JSON.stringify(options));if(preview){body.set('identities',JSON.stringify(preview.identities));body.set('fingerprint',preview.fingerprint);body.set('acceptLoss','true')}const response=await fetch(h.origin+prefix+route,{method:'POST',headers:{cookie:starter.session.cookie,origin:h.origin,'x-csrf-token':starter.session.csrf},body});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value.data}
  const preview=await upload('/preview'),review=await upload('/review',preview),job=await json(starter,prefix+'/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true}),route=prefix+'/jobs/'+job.id
  assert.equal((await json(starter,route+'/resume',{})).state,'applying')
  const before=(await json(starter,route)).progress.appliedRecords
  assert.ok(before>0&&before<25,'Live-import erasure starts with a real bounded partial import')
  inspector=await interruptImportJournal(h,()=>raw(starter,route+'/resume',{}))
  const eventId='base-import:'+job.id+':failed',scalar=async(sql,...values)=>(await h.db.prepare(sql).bind(...values).first()).n
  const attempts=()=>scalar('SELECT count(*) n FROM channel_progress_attempts WHERE event_id=?',eventId),owed=()=>scalar('SELECT count(*) n FROM channel_progress_owed WHERE starter_id=?',starter.id)
  assert.equal(await attempts(),1,'The interrupted import retains its actual admitted attempt token')
  assert.equal(await owed(),1,'The interrupted import retains its actual write-ahead failure')
  assert.equal(await scalar("SELECT count(*) n FROM channel_progress_attempts WHERE event_id=? AND live_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')",eventId),1,'Erasure exercises a live import attempt lease')
  const askedAt=(await h.mailMessages()).length,asked=await h.request(starter.session,'/auth/step-up',{method:'POST',body:JSON.stringify({action:'owner:transfer',returnTo:'/app/settings'})})
  assert.equal(asked.status,202,await asked.text())
  const links=(await h.mailMessages()).slice(askedAt).flatMap(message=>[...message.content.find(part=>part.type==='text/plain').value.matchAll(/https?:\/\/\S+/g)].map(match=>new URL(match[0]))).filter(url=>url.pathname==='/auth/confirm')
  assert.equal(links.length,1,'Live-import erasure confirms ownership handover through the fresh public email link')
  const confirmed=await h.request(starter.session,'/auth/confirm',{method:'POST',body:JSON.stringify({token:links[0].searchParams.get('token')}),redirect:'manual'});assert.equal(confirmed.status,303)
  const member=(await json(starter,'/api/v1/members?appId='+LAUNCH_APP_ID)).items.find(person=>person.id===successor.id)
  assert.ok(member)
  const expected=(id,version)=>[{ref:{appId:LAUNCH_APP_ID,entityId:'00000000000000000000000101',recordId:id},version}]
  await command(starter,'member.transfer-ownership',{memberId:successor.id},expected(successor.id,member.version))
  successor.session=await h.signIn(successor.id);starter.session=await h.signIn(starter.id)
  assert.equal((await h.db.prepare('SELECT id FROM authority_principals WHERE initial_owner=1').first()).id,successor.id)
  const version=async()=>(await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(starter.id).first()).version
  await command(successor,'member.remove',{memberId:starter.id,reason:'synthetic-cradle-4304'},expected(starter.id,await version()))
  const mailStart=(await h.mailMessages()).length,erased=await command(successor,'member.erase',{memberId:starter.id,reason:'synthetic-cradle-4305'},expected(starter.id,await version()))
  assert.equal(erased.confirmed,true);assert.equal(erased.erasureState,'complete')
  for(const [store,rows]of [['channel_progress_attempts',1],['channel_progress_owed',1]]){const place=erased.plan.places.find(item=>item.store===store);assert.ok(place,'Live-import erasure inventories '+store);assert.equal(place.action,'delete');assert.equal(place.rows,rows,'Live-import erasure reports the true '+store+' count')}
  assert.equal(await attempts(),0,'Erasure removes the live import token in its native transaction')
  assert.equal(await owed(),0,'Erasure removes every owed row naming the import starter')
  assert.equal(await scalar('SELECT count(*) n FROM notifications WHERE operator_id=?',starter.id),0)
  assert.equal(await scalar('SELECT count(*) n FROM channel_deliveries WHERE operator_id=?',starter.id),0)
  const denied=await raw(starter,route+'/resume',{})
  assert.ok([401,403,404].includes(denied.status),'An erased starter cannot resume the interrupted import')
  const successorResume=await raw(successor,route+'/resume',{})
  assert.ok([403,404].includes(successorResume.status),'Ownership handover never lets the replacement owner apply the erased starter import')
  const at=Date.now()
  for(const offset of [60000,360000,3600000,86400000])assert.equal((await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at+offset})).outcome,'ok')
  assert.equal(await scalar('SELECT count(*) n FROM ik_provenance WHERE job_id=?',job.id),before,'Later public resumes and scheduled ticks apply none of the erased starter remaining import')
  assert.equal(await attempts(),0);assert.equal(await owed(),0)
  assert.equal(await scalar("SELECT count(*) n FROM notifications WHERE kind='progress' AND subject_id=?",job.id),0,'No import outcome reaches any operator after starter erasure')
  assert.equal((await h.mailMessages()).length,mailStart,'No later provider-edge mail revives the erased starter or redirects their outcome')
  console.log('LIVE_IMPORT_ERASURE '+JSON.stringify({beforeApplied:before,attemptsBefore:1,owedBefore:1,attemptsAfter:0,owedAfter:0,state:erased.erasureState,laterMail:0}))
 }finally{inspector?.close();await h.close()}
}

/** Locate the real emitted apply predicate; restart the repository runtime while
 * it is paused after journaling, rather than replacing any application behavior. */
async function interruptImportJournal(h,trigger){
 const endpoint=new URL(await h.runtime.getInspectorURL());endpoint.protocol='http:';endpoint.pathname='/json'
 const target=(await(await fetch(endpoint)).json()).find(item=>String(item.id).startsWith('core:user:'));assert.ok(target)
 const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),scripts=[];let serial=0,hit
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
 ws.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id&&pending.has(value.id)){const request=pending.get(value.id);pending.delete(value.id);value.error?request.reject(new Error(value.error.message)):request.resolve(value.result)}if(value.method==='Debugger.scriptParsed')scripts.push(value.params);if(value.method==='Debugger.paused')hit?.(value.params)})
 const close=()=>ws.close()
 try{
  await command('Debugger.enable')
  const needle=' AND EXISTS(SELECT 1 FROM channel_progress_attempts WHERE event_id=? AND token=? AND live_until>strftime'
  let point
  for(const script of scripts){const {scriptSource}=await command('Debugger.getScriptSource',{scriptId:script.scriptId}),at=scriptSource.indexOf(needle);if(at<0)continue;assert.equal(scriptSource.indexOf(needle,at+1),-1);const before=scriptSource.slice(0,at);point=await command('Debugger.setBreakpoint',{location:{scriptId:script.scriptId,lineNumber:before.split('\n').length-1,columnNumber:at-(before.lastIndexOf('\n')+1)}});break}
  assert.ok(point,'The emitted native import exposes its production attempt predicate to the debugger')
  const paused=new Promise(resolve=>{hit=data=>{if(data.hitBreakpoints?.includes(point.breakpointId))resolve()}}),request=trigger().then(value=>({value}),error=>({error:String(error)}))
  await paused
  await h.restart();close();await request
  return {close}
 }catch(error){close();throw error}
}
