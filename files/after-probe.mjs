import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {launchAuthorityRuntime,createUlid,LAUNCH_APP_ID} from '../run-cradle/tests/helpers/launch-authority-runtime.mjs';
import {customFieldDeletionFixture} from './retained-fixture-adapted.mjs';
import {lifecycleDoors} from '../run-cradle/tests/helpers/launch-operator-lifecycle.mjs';
import {createPortability,readArchive} from '../run-cradle/node_modules/@runeditrun/rer/modules/portability/index.mjs';
import {installationPortabilityPolicy} from '../run-cradle/src/domains/portability/installation-policy.mjs';
import {installationBucket} from '../run-cradle/src/domains/portability/installation-bucket.mjs';
import {derivedSearch} from '../run-cradle/src/domains/portability/derived-search.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex'),receipts=[];
const h=await launchAuthorityRuntime({}, {installedLaunchDefinitions:true,installationOwner:true});
try{
 const f=await customFieldDeletionFixture(h,()=>h.ownerSession,h.owner,'diagnostic');
 const d=lifecycleDoors(h,h.ownerSession),count=async(sql,...args)=>(await h.db.prepare(sql).bind(...args).first()).n;
 // Add a real retained preview through the upload and preview doors.
 const call=async(action,input)=>d.commit(action,input),campaign=(await f.snapshot()).campaigns[0].campaign;
 const staged=await call('source.stage',{appId:LAUNCH_APP_ID,purpose:'import'}),csv=`Code,Summary\r\n${campaign.code},Retained preview content\r\n`;
 const uploaded=await call('upload.begin',{appId:LAUNCH_APP_ID,subject:staged.subject,filename:'synthetic-cradle-preview.csv',mediaType:'text/csv',bytes:Buffer.byteLength(csv),sha256:hash(csv)});
 const put=await h.request(h.ownerSession,uploaded.uploadUrl,{method:'PUT',headers:{'content-type':'text/csv'},body:csv});assert.equal(put.status,200,await put.text());
 const previewResponse=await h.request(h.ownerSession,'/api/v1/launch/imports/preview',{method:'POST',body:JSON.stringify({commandId:createUlid(),expected:[],input:{kind:'campaign',fileId:uploaded.file.id,mapping:[{column:'Code',field:'code'},{column:'Summary',field:'statusSummary'}]}})});
 assert.equal(previewResponse.status,200,await previewResponse.clone().text());const preview=(await previewResponse.json()).data.value;
 const previews=(await h.db.prepare('SELECT * FROM portability_previews ORDER BY id').all()).results,previewRows=(await h.db.prepare('SELECT * FROM portability_preview_rows ORDER BY id').all()).results;assert.ok(previewRows.length);
 // SAME ordinary two-export retained-before script, with native current imports.
 await f.storedRows();await f.storedRows();
 const snapshots=await count("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name GLOB 'rer_portability_snap_*'");assert.equal(snapshots,0);
 const ordinary=(await h.db.prepare("SELECT id FROM rer_portability_jobs WHERE kind='export' AND phase='complete' ORDER BY id").all()).results;assert.equal(ordinary.length,2);
 const archiveBytes=async id=>{const r=await h.request(h.ownerSession,`/api/v1/archive-jobs/${id}/content`);assert.equal(r.status,200,await r.clone().text());return r.text()};
 const archives=await Promise.all(ordinary.map(async({id})=>({id,bytes:await archiveBytes(id)})));
 for(const a of archives){const rows=[];for await(const record of readArchive(new Response(a.bytes).body))for(const item of record.items??[])if(item.kind==='row')rows.push(item);assert.deepEqual(rows.filter(r=>r.table==='portability_previews').map(r=>r.row).sort((a,b)=>a.id.localeCompare(b.id)),previews);assert.deepEqual(rows.filter(r=>r.table==='portability_preview_rows').map(r=>r.row).sort((a,b)=>a.id.localeCompare(b.id)),previewRows);}
 const p=await h.addPerson({name:'Archive erasure control'});await d.commit('member.remove',{memberId:p.id,reason:'Diagnostic erasure'},d.memberRef(await d.member(p.id)));
 const expected=d.memberRef(await d.member(p.id)),erasure=()=>d.command('member.erase',{memberId:p.id,reason:'Diagnostic erasure'},expected);
 const controls=await f.snapshot(),beforeEpoch=(await h.db.prepare('SELECT epoch FROM rer_portability_state').first()).epoch;
 for(const [phase,sql]of [['native',`CREATE TRIGGER probe_abort AFTER UPDATE ON operators WHEN NEW.id='${p.id}' AND NEW.email<>OLD.email BEGIN SELECT RAISE(ABORT,'synthetic native boundary'); END`],['checkpoint',"CREATE TRIGGER probe_abort AFTER UPDATE OF epoch ON rer_portability_state BEGIN SELECT RAISE(ABORT,'synthetic checkpoint boundary'); END"]]){
  await h.db.prepare(sql).run();const failed=await erasure();assert.equal(failed.status,500,JSON.stringify(failed));await h.db.prepare('DROP TRIGGER probe_abort').run();assert.equal((await d.member(p.id)).state,'removed');assert.deepEqual(await f.snapshot(),controls);assert.equal((await h.db.prepare('SELECT epoch FROM rer_portability_state').first()).epoch,beforeEpoch);for(const a of archives)assert.equal(await archiveBytes(a.id),a.bytes);receipts.push({phase,status:failed.status,publicArchivesByteIdentical:true,nativeAndAuthorityUnchanged:true});
 }
 await h.restart();const after=await erasure();assert.equal(after.status,200,JSON.stringify(after));assert.equal(after.body.data.value.confirmed,true);for(const a of ordinary)assert.equal((await h.request(h.ownerSession,`/api/v1/archive-jobs/${a.id}/content`)).status,404);
 assert.deepEqual(await f.snapshot(),controls);assert.equal((await h.request(p.session,'/api/v1/session')).status,401);
 receipts.push({phase:'ordinary-two-export-after',exports:ordinary.length,snapshotTables:snapshots,status:after.status,confirmed:true,previewRows:previewRows.length,fullPreviewContentPreserved:true,unaffectedControls:true});
 // Populated prior storage: Base's unchanged export engine creates the released
 // snapshot representation. No baseline erasure is run. The edition must migrate
 // its custody atomically through the public erasure door, including refusal.
 const q=await h.addPerson({name:'Synthetic Legacy Subject'}),original=await h.db.prepare('SELECT name,email FROM operators WHERE id=?').bind(q.id).first();
 const warehouse=await h.runtime.getR2Bucket('WAREHOUSE'),files=await h.runtime.getR2Bucket('FILES');
 const service=await createPortability({db:h.db,buckets:{FILES:installationBucket(h.db,files),WAREHOUSE:warehouse},policy:{...installationPortabilityPolicy(warehouse),derivedTables:await derivedSearch(h.db)}});
 const legacy=[];for(let i=0;i<2;i++){const id=await service.exports.create(h.owner);while((await service.exports.status(id)).phase!=='complete')await service.exports.advance(id,{maxParts:100});legacy.push({id,bytes:await new Response(await service.exports.download(id)).text()});}
 const oldTables=await count("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name GLOB 'rer_portability_snap_*'");assert.ok(oldTables>=916);
 await d.commit('member.remove',{memberId:q.id,reason:'Legacy erasure'},d.memberRef(await d.member(q.id)));
 const request={commandId:createUlid(),expected:d.memberRef(await d.member(q.id)),input:{memberId:q.id,reason:'Legacy erasure'}};
 const eraseLegacy=async()=>{const r=await h.request(h.ownerSession,'/api/v1/commands/member.erase',{method:'POST',body:JSON.stringify(request)});return {status:r.status,body:await r.json()}};
 await h.db.prepare(`CREATE TRIGGER probe_abort AFTER DELETE ON rer_portability_jobs BEGIN SELECT RAISE(ABORT,'synthetic durable retirement boundary'); END`).run();
 const failed=await eraseLegacy();assert.equal(failed.status,500,JSON.stringify(failed));await h.db.prepare('DROP TRIGGER probe_abort').run();assert.equal((await d.member(q.id)).state,'removed');for(const a of legacy)assert.equal(await archiveBytes(a.id),a.bytes);
 assert.ok(await count("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name GLOB 'rer_portability_retire_*'"));
 await h.restart();const result=await eraseLegacy();assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.data.value.confirmed,true);assert.equal(await count("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name GLOB 'rer_portability_snap_*'"),0);
 assert.equal(await count('SELECT count(*) n FROM operators WHERE name=? OR email=?',original.name,original.email),0);assert.deepEqual(await f.snapshot(),controls);
 const epoch=(await h.db.prepare('SELECT epoch FROM rer_portability_state').first()).epoch;const replay=await eraseLegacy();assert.equal(replay.status,200,JSON.stringify(replay));assert.equal((await h.db.prepare('SELECT epoch FROM rer_portability_state').first()).epoch,epoch);
 const currentService=await createPortability({db:h.db,buckets:{FILES:installationBucket(h.db,await h.runtime.getR2Bucket('FILES')),WAREHOUSE:await h.runtime.getR2Bucket('WAREHOUSE')},policy:{...installationPortabilityPolicy(await h.runtime.getR2Bucket('WAREHOUSE')),derivedTables:await derivedSearch(h.db)}});
 for(const a of legacy){assert.equal((await h.request(h.ownerSession,`/api/v1/archive-jobs/${a.id}/content`)).status,404);const records=a.bytes.trim().split('\n').map(JSON.parse),id=await currentService.imports.create(records[0],h.owner);try{for(const part of records.filter(r=>r.kind==='part'))await currentService.imports.uploadPart(id,part.index,part);await assert.rejects(currentService.imports.finalize(id,records.at(-1)),e=>e.code==='erasure_epoch');}finally{await currentService.imports.abort(id);}}
 receipts.push({phase:'populated-legacy-transition',exports:legacy.length,snapshotTablesBefore:oldTables,failedRetirementStatus:failed.status,failedArchivesByteIdentical:true,restarted:true,erasureStatus:result.status,confirmed:true,snapshotTablesAfter:0,personResurrection:false,staleImportRefused:true,replayEpochStable:true,unaffectedControls:true});
 console.log('CUSTODY_AFTER '+JSON.stringify(receipts));await writeFile(new URL('./after-receipt.json',import.meta.url),JSON.stringify({receipts},null,2)+'\n');
}finally{await h.close();}
