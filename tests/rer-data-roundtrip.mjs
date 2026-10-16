import {privateExports} from './helpers/rer-private-exports.mjs';
import {retainedThroughClock} from './helpers/rer-retention-clock.mjs';
import {retentionRows} from './helpers/rer-retention.mjs';
import {withRerEmittedWorker} from './helpers/rer-emitted-worker.mjs';
import {sourceCampaignDeletion} from './helpers/rer-source-campaign.mjs';
import {randomBytes} from 'node:crypto';
import {sourceErasure,identityMatches,hasIdentityCopy} from './helpers/rer-source-erasure.mjs';
import {archiveIntegrity,rebind} from './helpers/rer-archive-integrity.mjs';
import {retirementUpgrade,personalImport,capturePersonalArchive,refusedOldArchive,retiredPersonalImport} from './helpers/rer-erasure-archive.mjs';
import assert from 'node:assert/strict';
import {copyFile,readFile,readdir,writeFile,appendFile,rm,mkdir,mkdtemp,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {contract} from './contract.mjs';
import {freshLocalCopy} from './helpers/local-signin-copy.mjs';
import {bindings,seedData,visibleData,ownedData} from './helpers/rer-data-fixture.mjs';
import {restoredSignIn} from './helpers/rer-restored-signin.mjs';
import {sourceAuthority} from './helpers/rer-source-authority.mjs';
import {sha256,canonicalJson} from '@runeditrun/rer/modules/portability';
const semantics=records=>({tables:records[0].tables,excludedColumns:records[0].excludedColumns,objects:records[0].objects,payloads:records[0].payloads,requiredConfiguration:records[0].requiredConfiguration,items:records.filter(r=>r.kind==='part').flatMap(p=>p.items)});
const archive=async(root,name)=>JSON.parse('['+(await readFile(join(root,name),'utf8')).trim().split('\n').join(',')+']');
contract('SC-03 SC-06 SC-08','real rer setup twice, complete generated DB/FILES fresh-install restore, authority hold and confirmed reset',async()=>{
 const source=await freshLocalCopy(),target=await freshLocalCopy();
 let complete=false;
 try{
  await source.rer(['check','--profile','first-party']);await target.rer(['check','--profile','first-party']);
  await source.rer(['install','--non-interactive']);await target.rer(['install','--non-interactive']);
  const upgrades=(await readdir(join(source.source,'migrations/updates'))).filter(name=>/^902[345]_/.test(name));
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  await writeFile(join(source.source,'answers.json'),JSON.stringify({OWNER_EMAIL:'archive-owner@example.test'}),{mode:0o600});
  await source.rer(['setup','--answers','answers.json','--port',String(port),'--non-interactive']);
  const privateBytes=await readFile(join(source.source,'.dev.vars'));
  const owner=await bindings(source.source,async({DB})=>(await DB.prepare('SELECT id FROM oa_operators ORDER BY id').all()).results);
  await source.rer(['setup','--non-interactive']);assert.ok((await readFile(join(source.source,'.dev.vars'))).equals(privateBytes),'Exact private bytes survive repeat setup');
  assert.deepEqual(await bindings(source.source,async({DB})=>(await DB.prepare('SELECT id FROM oa_operators ORDER BY id').all()).results),owner,'No second owner');
  await appendFile(join(source.source,'.dev.vars'),'\nCONNECTION_ENCRYPTION_KEY='+randomBytes(32).toString('base64')+'\n');
  const origin=`http://127.0.0.1:${port}`,prior=await sourceAuthority(source,origin);
  const sourceOwner=await bindings(source.source,async({DB})=>DB.prepare('SELECT id FROM authority_principals WHERE initial_owner=1').first());
  await seedData(source.source);
  const authorityRows=()=>bindings(source.source,async({DB})=>{const result={};for(const table of ['authority_grants','authority_memberships','authority_policies'])result[table]=(await DB.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()).results;return result});
  // Construct the preceding schema in this disposable, populated D1; preserve every
  // older applied-ledger row and its timestamp. Production has no missing-schema fallback.
  const oldSearch=(await readFile(join(source.source,'migrations/core/0702_launch_search.sql'),'utf8')).split('\n').filter(line=>line.startsWith('CREATE TRIGGER '));
  await bindings(source.source,async({DB})=>{for(const sql of oldSearch){const name=/CREATE TRIGGER ([a-z_]+)/.exec(sql)[1];await DB.prepare('DROP TRIGGER '+name).run();await DB.prepare(sql).run()}for(const table of ['lifecycle_erasure_blobs','lifecycle_erasures','lifecycle_file_writes','launch_search_rows'])await DB.prepare('DROP TABLE '+table).run();for(const name of upgrades)await DB.prepare('DELETE FROM d1_migrations WHERE name=?').bind(name).run()});
  const priorLedger=await bindings(source.source,async({DB})=>(await DB.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results);
  const beforeUpgrade={authority:await authorityRows(),visible:await visibleData(source.source)};
  await source.command(['run','db:migrate:local']);
  const afterLedger=await bindings(source.source,async({DB})=>(await DB.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results);assert.deepEqual(afterLedger.filter(row=>!upgrades.includes(row.name)),priorLedger,'Every prior migration receipt and timestamp is preserved');

  assert.deepEqual(await authorityRows(),beforeUpgrade.authority,'Forward lifecycle migrations preserve every grant, membership and policy row');
  assert.deepEqual(await visibleData(source.source),beforeUpgrade.visible,'Forward lifecycle migrations preserve prior records, generated values, search and files');
  await retirementUpgrade(source);
  let erased,oldManifest,personalJob;
  await withRerEmittedWorker(source,origin,async(_runtime,{offline})=>{assert.equal((await fetch(origin+'/api/v1/apps',{headers:{cookie:prior.cookie}})).status,200);assert.deepEqual(await authorityRows(),beforeUpgrade.authority,'First public ingress after upgrade creates no authority rows or activation')
  console.log('FORWARD_UPGRADE_9023_9024_9025: prior populated D1; complete grants/memberships/policies and record/search/file snapshots equal');
  erased=await sourceErasure(source,origin,prior,async identity=>{personalJob=await personalImport(origin,prior.cookie);oldManifest=await offline(()=>capturePersonalArchive(source,identity))},()=>offline(async()=>{}));await retiredPersonalImport(source,personalJob);const csrfToken=(await(await fetch(origin+'/auth/csrf',{headers:{cookie:prior.cookie}})).json()).csrfToken;await privateExports({origin,cookie:prior.cookie,csrfToken,records:prior.records},'post-erasure');await sourceCampaignDeletion(source,origin,prior);});await retainedThroughClock(source,port);const before=await visibleData(source.source);
  assert.equal(await bindings(source.source,async({DB})=>(await DB.prepare('SELECT COUNT(*) AS n FROM automations WHERE id=? AND enabled=1').bind(prior.records.automationId).first()).n),1,'The archived updated-record automation is enabled in the source');
  await source.rer(['export','--output','exports/first.rer','--non-interactive']);
  const first=await archive(source.source,'exports/first.rer');
  const archiveBytes=await readFile(join(source.source,'exports/first.rer'),'utf8'),privateValues=await source.readVars();
  const secrets=['SESSION_SECRET','SETUP_TOKEN','CONNECTION_ENCRYPTION_KEY'].flatMap(name=>privateValues[name]?[privateValues[name]]:[]);
  assert.equal(secrets.filter(value=>archiveBytes.includes(value)).length,0,'Installation archive contains no setup/session/connection secrets');
  console.log('ARCHIVE_SECRET_SCAN: '+secrets.length+' configured secret values; 0 matches');
  assert.ok(!hasIdentityCopy(archiveBytes),'Erased identity is absent from the whole archive');
  assert.ok(!first[0].objects.some(object=>[erased.key,...erased.compressedKeys].includes(object.key)),'Later public archive omits all personal FILES objects');
  assert.ok(first[0].objects.some(object=>object.key==='privacy/control-compressed.pdf'),'Later public archive retains the unrelated compressed control');
  assert.ok(!first[0].objects.some(object=>object.key.startsWith('execution/')),'Sealed execution bytes are omitted');
  await mkdir(join(target.source,'exports'),{mode:0o700,recursive:true});await copyFile(join(source.source,'exports/first.rer'),join(target.source,'exports/first.rer'));
  const damaged=structuredClone(first);damaged.at(-1).contentHash='0'.repeat(64);
  await writeFile(join(target.source,'damaged.rer'),damaged.map(r=>JSON.stringify(r)).join('\n')+'\n',{mode:0o600});
  await target.command(['run','db:migrate:local']);
  const empty=await ownedData(target.source,first[0].tables);
  await refusedOldArchive(source,target,first,empty,oldManifest);
  await archiveIntegrity(source,target,first,empty);
  await assert.rejects(target.rer(['import','--input','damaged.rer','--yes','--non-interactive']),error=>error.exitCode===1&&error.errorCode==='transfer_failed','Integrity failure must refuse without committing business rows');
  assert.deepEqual(await ownedData(target.source,first[0].tables),empty,'Integrity failure changes no owned DB cell or FILES object');
  const hostile=structuredClone(first),physical=hostile[0].tables.find(table=>table.name.startsWith('r_'));
  assert.ok(physical,'The real manual record schema participates in the archive');
  physical.sql+='; DROP TABLE workspace;';
  hostile[0].schema=await sha256(canonicalJson(hostile[0].tables.map(({name,sql})=>({name,sql}))));
  rebind(hostile);
  await writeFile(join(target.source,'hostile.rer'),hostile.map(record=>JSON.stringify(record)).join('\n')+'\n',{mode:0o600});
  await assert.rejects(target.rer(['import','--input','hostile.rer','--yes','--non-interactive']),error=>error.exitCode===4&&error.errorCode==='restore_refused','A checksummed archive cannot author or execute destructive SQL');
  assert.deepEqual(await ownedData(target.source,first[0].tables),empty,'Refused schema authoring changes no DB cell or FILES object');
  assert.equal(await bindings(target.source,async({DB})=>(await DB.prepare('SELECT COUNT(*) AS n FROM campaigns').first()).n),0,'Failed archive leaves an empty target');
  await assert.rejects(target.rer(['import','--input','exports/first.rer','--non-interactive']),error=>error.exitCode===4&&error.errorCode==='safety_refusal','Import requires explicit confirmation');
  await target.rer(['import','--input','exports/first.rer','--yes','--non-interactive']);
  await retentionRows(target.source,'after-installation-restore');
  const effects=()=>bindings(target.source,async({DB})=>{const n=async table=>(await DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;return {events:await n('record_automation_events'),runs:await n('automation_runs'),actions:await n('launch_automation_actions'),notifications:await n('channel_events')+await n('channel_notifications')+await n('notifications'),deliveries:await n('integration_deliveries')}});
  const restoredEffects=await effects();
  await target.rer(['export','--output','exports/second.rer','--non-interactive']);
  assert.deepEqual(semantics(await archive(target.source,'exports/second.rer')),semantics(first),'All archived DB cells and FILES payloads are equal');
  assert.deepEqual((await identityMatches(target.source)).matches,[],'Restore does not revive erased identity literals');
  assert.equal(await bindings(target.source,async({DB})=>(await DB.prepare('SELECT state FROM authority_principals WHERE id=?').bind(erased.person).first()).state),'erased','An erased principal never becomes merely removed on restore');
  const after=await visibleData(target.source);assert.deepEqual(after.objects,before.objects,'FILES bytes and metadata are equal');
  assert.deepEqual(after.search,before.search,'All visible launch and manual-record search data is rebuilt equally');
  for(const expected of before.generated){
   const actual=after.generated.find(t=>t.name===expected.name);assert.ok(actual,'Generated table restored');
   assert.ok(expected.rows.length,'Each generated-column table has business rows');
   assert.deepEqual(actual.rows.map(row=>Object.fromEntries(expected.generated.map(name=>[name,row[name]]))),expected.rows.map(row=>Object.fromEntries(expected.generated.map(name=>[name,row[name]]))),'Every visible generated value is equal');
  }
  await bindings(target.source,async({DB})=>{
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM oa_operators').first()).n,0,'Source auth never transfers');
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM oa_sessions').first()).n,0,'Source sessions never transfer');
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM authority_credentials').first()).n,0,'Source machine credentials never transfer');
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM automations WHERE enabled<>0').first()).n,0,'Background definitions are disabled');
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM record_automation_destinations').first()).n,0,'Webhook credentials do not transfer');
   assert.equal((await DB.prepare('SELECT cradle_restore_hold FROM ik_jobs WHERE id=?').bind(prior.records.jobId).first()).cradle_restore_hold,1,'Reviewed import and originals transfer held');
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM record_automation_versions WHERE credential_id IS NOT NULL').first()).n,0,'User automation credential references are cleared');
   assert.deepEqual((await DB.prepare("SELECT state FROM integration_deliveries WHERE namespace='archive' ORDER BY id").all()).results,[{state:'rejected'},{state:'uncertain'}],'No imported provider delivery can restart');
  });
  await assert.rejects(target.rer(['import','--input','exports/first.rer','--yes','--non-interactive']),error=>error.exitCode===4&&error.errorCode==='restore_refused','A populated destination is refused');
  await writeFile(join(target.source,'answers.json'),JSON.stringify({OWNER_EMAIL:'archive-owner@example.test'}),{mode:0o600});
  await target.rer(['setup','--answers','answers.json','--port',String(port),'--non-interactive']);
  await restoredSignIn(target,origin,prior);
  await bindings(target.source,async({DB})=>{
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM oa_operators').first()).n,1,'Fresh restore admits exactly one owner');
   assert.equal((await DB.prepare('SELECT id FROM authority_principals WHERE initial_owner=1').first()).id,sourceOwner.id,'Fresh credentials preserve the returning owner’s historical identity');
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM automations WHERE enabled<>0').first()).n,0,'Owner admission cannot reactivate imported definitions');
  });
  assert.deepEqual(await effects(),restoredEffects,'The restored enabled updated-record automation fires nothing on the owner edit after restore');console.log('RESTORE_EFFECT_COUNTS '+JSON.stringify(restoredEffects));
  await bindings(target.source,async({DB})=>{
   assert.equal((await DB.prepare('SELECT pending FROM cradle_restore').first()).pending,0,'Fresh ordinary owner admission completes the restore binding');
  });
  await target.rer(['export','--output','exports/admitted.rer','--non-interactive']);
  assert.ok((await archive(target.source,'exports/admitted.rer'))[0].tables.length,'The admitted installation remains exportable');
  await assert.rejects(source.rer(['reset','--non-interactive']),error=>error.exitCode===4&&error.errorCode==='safety_refusal','Reset requires explicit confirmation');
  await source.rer(['reset','--yes','--non-interactive']);
  assert.ok((await readFile(join(source.source,'exports/first.rer'))).length,'Reset preserves archives');
  await source.command(['run','db:migrate:local']);
  const clean=await ownedData(source.source,first[0].tables);
  await source.node(['--input-type=module','-e',String.raw`import {readFile,writeFile} from 'node:fs/promises'; await writeFile('truncated.rer',(await readFile('exports/first.rer','utf8')).split('\n').slice(0,-2).join('\n')+'\n',{mode:0o600})`]);
  await assert.rejects(source.rer(['import','--input','truncated.rer','--yes','--non-interactive']),error=>error.exitCode===1&&error.errorCode==='transfer_failed');
  assert.deepEqual(await ownedData(source.source,first[0].tables),clean,'Truncated archive refusal leaves recovery target clean');
  await source.rer(['import','--input','exports/first.rer','--yes','--non-interactive']);
  await source.rer(['export','--output','exports/recovered.rer','--non-interactive']);
  assert.deepEqual(semantics(await archive(source.source,'exports/recovered.rer')),semantics(first),'Destructive recovery restores all archived cells and objects');
  await source.rer(['setup','--answers','answers.json','--port',String(port),'--non-interactive']);
  await restoredSignIn(source,origin,prior);
  assert.deepEqual((await identityMatches(source.source)).matches,[],'Recovered install keeps the operator erased');
  const logSecrets=[...new Set([...secrets,...[await source.readVars(),await target.readVars()].flatMap(vars=>['SESSION_SECRET','SETUP_TOKEN','CONNECTION_ENCRYPTION_KEY'].flatMap(name=>vars[name]?[vars[name]]:[]))])];
  for(const copy of [source,target]){const logs=await readFile(join(copy.root,'journey.log'),'utf8');const matches=logSecrets.filter(value=>logs.includes(value)).length;assert.equal(matches,0,'Captured CLI/server logs contain no configured secrets');console.log('CLI_SERVER_SECRET_SCAN '+JSON.stringify({installation:copy===source?'source':'target',values:logSecrets.length,matches,exclusion:'Private owner outbox issuance is authorized and remains outside public receipts'}))}
  console.log(`RER_DATA_ROUNDTRIP PASS: ${first[0].tables.length} owned tables, ${first[0].tables.reduce((n,t)=>n+t.count,0)} rows, ${before.generated.length} generated-column tables, ${before.objects.length} FILES objects; all DB cells/generated values/FILES/search equal, repeat setup, holds and reset`);
  complete=true;
 }finally{
  for(const copy of [source,target]){await copy.rer(['dev','--stop']).catch(()=>{});await copy.rer(['preview','--stop']).catch(()=>{});await copy.log.close();}
  if(complete)for(const copy of [source,target])await rm(copy.root,{recursive:true,force:true});
  else{
   await mkdir('tmp',{recursive:true});const retained=await mkdtemp('tmp/rer-data-failure-');
   await rename(source.root,join(retained,'source'));await rename(target.root,join(retained,'target'));
   console.log('Native transfer failure fixtures retained privately at '+retained);
  }
 }
});
