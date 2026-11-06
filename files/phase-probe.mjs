import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {launchAuthorityRuntime,createUlid} from '../run-cradle/tests/helpers/launch-authority-runtime.mjs';
import {lifecycleDoors} from '../run-cradle/tests/helpers/launch-operator-lifecycle.mjs';
import {createPortability,readArchive} from '../run-cradle/node_modules/@runeditrun/rer/modules/portability/index.mjs';
import {installationPortabilityPolicy} from '../run-cradle/src/domains/portability/installation-policy.mjs';
import {installationBucket} from '../run-cradle/src/domains/portability/installation-bucket.mjs';
import {derivedSearch} from '../run-cradle/src/domains/portability/derived-search.mjs';
const h=await launchAuthorityRuntime({}, {installedLaunchDefinitions:true,installationOwner:true}),receipts=[];
try{
 const d=lifecycleDoors(h,h.ownerSession),scalar=async(sql,...values)=>(await h.db.prepare(sql).bind(...values).first()).n;
 const p=await h.addPerson({name:'Synthetic Interrupted Person'}),person=await h.db.prepare('SELECT name,email FROM operators WHERE id=?').bind(p.id).first();
 const files=await h.runtime.getR2Bucket('FILES'),warehouse=await h.runtime.getR2Bucket('WAREHOUSE'),service=await createPortability({db:h.db,buckets:{FILES:installationBucket(h.db,files),WAREHOUSE:warehouse},policy:{...installationPortabilityPolicy(warehouse),derivedTables:await derivedSearch(h.db)}});
 const id=await service.exports.create(h.owner);while((await service.exports.status(id)).phase!=='complete')await service.exports.advance(id,{maxParts:100});
 await d.commit('member.remove',{memberId:p.id,reason:'Interrupted erasure'},d.memberRef(await d.member(p.id)));
 const request={commandId:createUlid(),expected:d.memberRef(await d.member(p.id)),input:{memberId:p.id,reason:'Interrupted erasure'}},trigger=()=>h.request(h.ownerSession,'/api/v1/commands/member.erase',{method:'POST',body:JSON.stringify(request)});
 await interrupt(h,'const result = await cleanup.advance(value.input.memberId);',trigger);
 // Native transaction committed, response was interrupted before its cleanup.
 assert.equal((await h.db.prepare('SELECT state FROM authority_principals WHERE id=?').bind(p.id).first()).state,'erased');assert.equal(await scalar('SELECT count(*) n FROM operators WHERE name=? OR email=?',person.name,person.email),0);
 assert.equal(await scalar('SELECT count(*) n FROM rer_portability_jobs WHERE id=?',id),0);
 const tables=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'rer_portability_snap_*'").all()).results;assert.ok(tables.length);
 for(const {name}of tables)assert.equal(await scalar('SELECT count(*) n FROM "'+name+'"'),0,'Every legacy copy was cleared inside the one committed transaction');
 assert.notEqual((await h.request(h.ownerSession,`/api/v1/archive-jobs/${id}/content`)).status,200);
 const resumed=await trigger(),body=await resumed.json();assert.equal(resumed.status,200,JSON.stringify(body));assert.equal(body.data.value.confirmed,true);
 assert.equal(await scalar("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name GLOB 'rer_portability_snap_*'"),0);
 receipts.push({phase:'restart-after-atomic-retirement-before-collection',emptyUnaddressableTables:tables.length,personalRows:0,archiveAccessible:false,restartRetryStatus:resumed.status,confirmed:true});
 // Inject a durable corruption exactly after Base's verified completion record,
 // before the edition verifies and discards its alternate snapshot copy.
 await h.db.prepare('CREATE TABLE rer_portability_probe_backup(job TEXT,part INTEGER,segment INTEGER,data TEXT)').run();
 await h.db.prepare("CREATE TRIGGER probe_compaction BEFORE UPDATE OF phase ON rer_portability_jobs WHEN NEW.kind='export' AND NEW.phase='complete' BEGIN INSERT INTO rer_portability_probe_backup SELECT job,part,segment,data FROM rer_portability_segments WHERE job=NEW.id; END").run();
 await h.db.prepare("CREATE TRIGGER probe_compaction_corrupt AFTER UPDATE OF phase ON rer_portability_jobs WHEN NEW.kind='export' AND NEW.phase='complete' BEGIN UPDATE rer_portability_segments SET data=replace(data,'\"items\":[','\"items\":[{} ,') WHERE job=NEW.id AND part=0 AND segment=0; END").run();
 const started=await h.request(h.ownerSession,'/api/v1/commands/export.start',{method:'POST',body:JSON.stringify({scope:'installation',format:'archive'})});assert.equal(started.status,200);const fresh=(await started.json()).data.id;
 let failed;for(let i=0;i<100;i++){const r=await h.request(h.ownerSession,`/api/v1/archive-jobs/${fresh}/advance`,{method:'POST',body:'{}'});if(r.status!==200){failed=r.status;break;}}assert.equal(failed,400);
 const held=await scalar("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name GLOB 'rer_portability_snap_*'");assert.ok(held>0,'Verifier failure keeps the alternate copy');
 await h.db.batch([h.db.prepare('DROP TRIGGER probe_compaction'),h.db.prepare('DROP TRIGGER probe_compaction_corrupt'),h.db.prepare('UPDATE rer_portability_segments SET data=(SELECT b.data FROM rer_portability_probe_backup b WHERE b.job=rer_portability_segments.job AND b.part=rer_portability_segments.part AND b.segment=rer_portability_segments.segment) WHERE job=?').bind(fresh)]);
 await h.restart();const retried=await h.request(h.ownerSession,`/api/v1/archive-jobs/${fresh}/advance`,{method:'POST',body:'{}'});assert.equal(retried.status,200,await retried.clone().text());assert.equal((await retried.json()).data.phase,'complete');
 const download=await h.request(h.ownerSession,`/api/v1/archive-jobs/${fresh}/content`);assert.equal(download.status,200);for await(const _ of readArchive(download.body)){}
 assert.equal(await scalar("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name GLOB 'rer_portability_snap_*'"),0);
 receipts.push({phase:'verification-before-compaction',failureStatus:failed,retainedAlternateTables:held,restarted:true,retryStatus:retried.status,fullArchiveVerified:true,snapshotTablesAfter:0});
 console.log('CUSTODY_PHASES '+JSON.stringify(receipts));await writeFile(new URL('./phase-receipt.json',import.meta.url),JSON.stringify({receipts},null,2)+'\n');
}finally{await h.close();}

async function interrupt(h,needle,trigger){
 const endpoint=new URL(await h.runtime.getInspectorURL());endpoint.protocol='http:';endpoint.pathname='/json';const target=(await(await fetch(endpoint)).json()).find(item=>String(item.id).startsWith('core:user:'));assert.ok(target);
 const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),scripts=[];let serial=0,hit;
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 ws.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id&&pending.has(value.id)){const request=pending.get(value.id);pending.delete(value.id);value.error?request.reject(new Error(value.error.message)):request.resolve(value.result);}if(value.method==='Debugger.scriptParsed')scripts.push(value.params);if(value.method==='Debugger.paused')hit?.(value.params);});
 try{
  await command('Debugger.enable');let point;
  for(const script of scripts){const {scriptSource}=await command('Debugger.getScriptSource',{scriptId:script.scriptId}),at=scriptSource.indexOf(needle);if(at<0)continue;assert.equal(scriptSource.indexOf(needle,at+1),-1);const before=scriptSource.slice(0,at);point=await command('Debugger.setBreakpoint',{location:{scriptId:script.scriptId,lineNumber:before.split('\n').length-1,columnNumber:at-(before.lastIndexOf('\n')+1)}});break;}assert.ok(point,'The actual durable phase boundary exists in the emitted Worker');
  const paused=new Promise(resolve=>{hit=data=>{if(data.hitBreakpoints?.includes(point.breakpointId))resolve();}}),request=trigger().then(value=>({status:value.status}),error=>({error:String(error)}));
  await paused;await h.restart();ws.close();await request;
 }finally{ws.close();}
}
