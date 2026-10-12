import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=require('../node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild');
const {Miniflare,convertV4MiniflareOptions}=require('../node_modules/.pnpm/miniflare@5.20260907.0-alpha/node_modules/miniflare');
test('production admission compiler: D1 contention, rollback, replay and lineage',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'cradle-admission-'));
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-07',d1Databases:{DB:'isolated-admission'}}));
 try{
  await build({entryPoints:['tests/admission-runtime-entry.ts'],outfile:join(temp,'runtime.mjs'),bundle:true,platform:'node',format:'esm'});
  const r=await import(join(temp,'runtime.mjs')); const db=await mf.getD1Database('DB');
  const migration=await readFile('migrations/core/0300_atomic_admission.sql','utf8');await db.exec(migration.replace(/\n/g,' '));for(const file of ['9023_lifecycle_erasure.sql','9024_lifecycle_file_writes.sql'])await db.exec((await readFile('migrations/updates/'+file,'utf8')).split('\n').filter(line=>!line.trim().startsWith('--')).join(' '));
  await db.exec("CREATE TABLE resources(id TEXT PRIMARY KEY,version INTEGER,value INTEGER);CREATE TABLE authority(id TEXT PRIMARY KEY,remaining INTEGER CHECK(remaining>=0),active INTEGER);INSERT INTO resources VALUES('one',1,0),('two',1,0);INSERT INTO authority VALUES('grant',1,1);");
  const table=r.registerTable('resources',['id','version','value']),budget=r.registerTable('authority',['id','remaining','active']);
  const principal={id:r.createUlid(),kind:'human',humanId:null,sessionId:null,credentialId:null,issuedAt:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00.000Z',authenticationEpoch:1};
  const ctx={principal,requestId:r.createUlid(),now:new Date().toISOString(),ingress:'http'}; const app=r.createUlid();
  let canReplay=true;
  const service=r.createAdmissionService(db,{authorizeReplay:async(c,row)=>{assert.equal(c.principal.id,row.actorId);if(!canReplay)throw new Error('Current field or row access revoked')},executionStatus:async()=>null,additionalGuards:c=>[r.erasureAdmissionGuard(c.now)]});
  const hash=await r.canonicalHash({value:1});
  function plan(id=r.createUlid(),resource='one',version=1,extra={}){return {commandId:id,action:'test.change',appId:app,canonicalInputHash:hash,permit:{actor:{id:principal.id,kind:'human'},action:'test.change',appId:app,grantId:null,grantVersion:null,policyVersion:1,validUntil:'2099-01-01T00:00:00.000Z',guards:[r.trustedPredicate("EXISTS(SELECT 1 FROM authority WHERE id='grant' AND remaining>=1 AND active=1)")],reservationMutations:[{kind:'update',table:budget,set:{remaining:0},where:r.eq(budget,'id','grant'),expectedRows:1}],reservationIds:[]},guards:[r.exists(table,r.and(r.eq(table,'id',resource),r.eq(table,'version',version)))],mutations:[{kind:'update',table,set:{version:version+1,value:1},where:r.and(r.eq(table,'id',resource),r.eq(table,'version',version)),expectedRows:1}],audit:[{action:'test.change',subject:{appId:app,entityId:app,recordId:app},changes:[],sourceIds:[],personalContentRefs:[]}],events:[{name:'changed',version:1,subject:null,payload:{ok:true},causeRunIds:[]}],outbox:[{action:'notify',version:1,input:{ok:true},notBefore:ctx.now,grantId:null,subject:null,sourceReleaseId:app,causeRunIds:[]}],committedResult:{value:1},changed:[{ref:{appId:app,entityId:app,recordId:app},version:version+1}],...extra};}
  const snapshot=async()=>{const out={};for(const name of ['resources','authority','command_admissions','admission_audit','admission_events','admission_outbox','admission_assertions'])out[name]=(await db.prepare(`SELECT * FROM ${name} ORDER BY 1`).all()).results;return out;};
  const before=await snapshot(); const bad=plan();bad.mutations[0].expectedRows=2;
  await assert.rejects(service.commit(ctx,bad),/no longer matches/);assert.deepEqual(await snapshot(),before);
  const fail=plan();fail.mutations.push({kind:'insert',table,row:{id:'one',version:1,value:0}});await assert.rejects(service.commit(ctx,fail),/required, unique or referenced/);assert.deepEqual(await snapshot(),before);
  const first=plan(),second=plan();const race=await Promise.allSettled([service.commit(ctx,first),service.commit(ctx,second)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
  const winner=race[0].status==='fulfilled'?first:second;const once=await snapshot();const replay=await service.commit(ctx,winner);assert.equal(replay.replay,true);assert.equal(replay.result.changed[0].version,2);assert.deepEqual(await snapshot(),once);
  await assert.rejects(service.commit(ctx,{...winner,canonicalInputHash:await r.canonicalHash({value:2})}),/different canonical/);assert.deepEqual(await snapshot(),once);
  assert.equal(once.admission_audit.length,1);assert.equal(once.admission_events.length,1);assert.equal(once.admission_outbox.length,1);assert.equal(once.admission_assertions.length,0);
  await db.exec("UPDATE resources SET version=1,value=0;UPDATE authority SET remaining=1;");
  const separate=await Promise.allSettled([service.commit(ctx,plan(undefined,'one')),service.commit(ctx,plan(undefined,'two'))]);assert.equal(separate.filter(x=>x.status==='fulfilled').length,1);
  await db.exec('UPDATE authority SET remaining=1,active=0');const revoked=await snapshot();await assert.rejects(service.commit(ctx,plan(undefined,'one',2)),/no longer matches/);assert.deepEqual(await snapshot(),revoked);
  assert.throws(()=>r.compileAdmission(ctx,{...plan(),permit:{...plan().permit,validUntil:'2000-01-01T00:00:00.000Z'}}),/expired/);
  assert.throws(()=>r.compileAdmission(ctx,{...plan(),guards:[{sql:'1',values:[]}]}),/Untrusted/);
  const status=await service.status(ctx,winner.commandId);assert.equal(status.state,'accepted');
  canReplay=false;await assert.rejects(service.status(ctx,winner.commandId),/access revoked/);await assert.rejects(service.commit(ctx,winner),/access revoked/);canReplay=true;
  const columns=Array.from({length:80},(_,i)=>'c'+i);await db.prepare('CREATE TABLE wide(id TEXT PRIMARY KEY,'+columns.map(c=>c+' TEXT').join(',')+')').run();const wide=r.registerTable('wide',['id',...columns]);const widePlan=plan();widePlan.guards=[];widePlan.permit={...widePlan.permit,guards:[],reservationMutations:[]};widePlan.mutations=[{kind:'insert',table:wide,row:{id:'one',...Object.fromEntries(columns.map((c,i)=>[c,String(9007199254740993n+BigInt(i))]))}}];await service.commit(ctx,widePlan);assert.equal((await db.prepare('SELECT c79 FROM wide').first()).c79,'9007199254741072');const updateWide={...widePlan,commandId:r.createUlid(),mutations:[{kind:'update',table:wide,set:Object.fromEntries(columns.map(c=>[c,'2'])),where:r.eq(wide,'id','one'),expectedRows:1}]};await service.commit(ctx,updateWide);assert.equal((await db.prepare('SELECT c79 FROM wide').first()).c79,'2');
  await db.exec('CREATE TABLE fk_test(id TEXT PRIMARY KEY,parent TEXT REFERENCES wide(id))');const fk=r.registerTable('fk_test',['id','parent']),invalidFk={...widePlan,commandId:r.createUlid(),mutations:[{kind:'insert',table:fk,row:{id:'bad',parent:'missing'}}]};await assert.rejects(service.commit(ctx,invalidFk),/required, unique or referenced/);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM fk_test').first()).n,0);assert.equal(await db.prepare('SELECT command_id FROM command_admissions WHERE command_id=?').bind(invalidFk.commandId).first(),null);

  const grouped={...widePlan,commandId:r.createUlid(),mutations:['one','two'].map(id=>({kind:'update',table,set:{value:73},where:r.eq(table,'id',id),expectedRows:1}))};const beforeGroup=await snapshot();
  await assert.rejects(service.commit(ctx,{...grouped,mutations:grouped.mutations.map((m,i)=>({...m,expectedRows:i===0?2:0}))}),/no longer matches/);assert.deepEqual(await snapshot(),beforeGroup);
  await assert.rejects(service.commit(ctx,{...grouped,mutations:[grouped.mutations[0],grouped.mutations[0]]}),/no longer matches/);assert.deepEqual(await snapshot(),beforeGroup);
  await service.commit(ctx,grouped);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM resources WHERE value=73').first()).n,2);
  await db.exec('CREATE TABLE personal_text(id TEXT PRIMARY KEY,content TEXT NOT NULL)');
  const personal=r.registerTable('personal_text',['id','content']),literal='Canary " Person';
  for(const [id,content]of [['one','Unique plain '+literal],['two',JSON.stringify({[literal]:'Unique JSON '+literal})]])await db.prepare('INSERT INTO personal_text VALUES(?,?)').bind(id,content).run();
  const redact={...widePlan,commandId:r.createUlid(),mutations:[{kind:'replaceText',table:personal,column:'content',needles:[literal],replacement:'Anonymous person',where:r.trustedPredicate('1'),expectedRows:2}]};
  await db.prepare('INSERT INTO personal_text VALUES(?,?)').bind('concurrent',literal).run();
  await assert.rejects(service.commit(ctx,redact),/no longer matches/,'Count race rolls replacement back atomically');
  assert.equal((await db.prepare("SELECT content FROM personal_text WHERE id='one'").first()).content,'Unique plain '+literal);
  redact.mutations[0].expectedRows=3;
  await db.exec("CREATE TRIGGER retain_literal BEFORE UPDATE ON personal_text WHEN old.id='concurrent' BEGIN SELECT RAISE(IGNORE); END");
  await assert.rejects(service.commit(ctx,redact),/no longer matches/,'A retained literal refuses and rolls back all replacements');
  assert.equal((await db.prepare("SELECT content FROM personal_text WHERE id='one'").first()).content,'Unique plain '+literal);
  await db.exec('DROP TRIGGER retain_literal');
  await db.exec("CREATE TRIGGER late_literal AFTER UPDATE ON personal_text WHEN old.id='one' BEGIN INSERT INTO personal_text VALUES('late',old.content); END");
  await assert.rejects(service.commit(ctx,redact),/no longer matches/,'A late literal added during replacement refuses atomically');
  assert.equal((await db.prepare("SELECT count(*) n FROM personal_text WHERE id='late'").first()).n,0);
  await db.exec('DROP TRIGGER late_literal');
  await service.commit(ctx,redact);
  assert.equal((await db.prepare("SELECT content FROM personal_text WHERE id='one'").first()).content,'Unique plain Anonymous person');
  assert.deepEqual(JSON.parse((await db.prepare("SELECT content FROM personal_text WHERE id='two'").first()).content),{'Anonymous person':'Unique JSON Anonymous person'});
  assert.equal((await service.commit(ctx,redact)).replay,true,'Replacement replay never applies a second mutation');
  const failedInserts={...widePlan,commandId:r.createUlid(),mutations:['three','four'].map(id=>({kind:'insert',table,row:{id,version:1,value:0},check:r.trustedPredicate('0')}))};await assert.rejects(service.commit(ctx,failedInserts),/no longer matches/);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM resources').first()).n,2);
  const erasedAt=new Date(Date.parse(ctx.now)+10).toISOString(),fresh={...ctx,now:new Date(Date.parse(ctx.now)+20).toISOString()};
  await db.prepare("INSERT INTO lifecycle_erasures VALUES(?,?, 'member',?,'Anonymous','complete',?,?)").bind(r.createUlid(),app,r.createUlid(),ctx.now,erasedAt).run();
  const buffered={...widePlan,commandId:r.createUlid(),mutations:[{kind:'update',table:wide,set:{c0:'Old personal text'},where:r.eq(wide,'id','one'),expectedRows:1}]};
  await assert.rejects(service.commit(ctx,buffered),/no longer matches|guards rejected/);assert.equal((await db.prepare('SELECT c0 FROM wide').first()).c0,'2');
  assert.equal((await service.commit(ctx,winner)).replay,true,'Committed replay remains available across erasure without repeating effects');
  await assert.rejects(r.reserveFileWrite(db,'private/old-request',ctx.now),/invalidated/,'A delayed reservation cannot follow a newer completed erasure');
  await service.commit(fresh,{...buffered,commandId:r.createUlid(),mutations:[{kind:'update',table:wide,set:{c0:'Fresh edit'},where:r.eq(wide,'id','one'),expectedRows:1}]});assert.equal((await db.prepare('SELECT c0 FROM wide').first()).c0,'Fresh edit');


 }finally{await mf.dispose();await rm(temp,{recursive:true,force:true});}
});
