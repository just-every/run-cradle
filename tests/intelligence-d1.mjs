// Synthetic local-workerd D1 proof. Test-only policy/provider ports; production admission/repository/service.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
import {IntelligenceRepository} from '../src/domains/intelligence/repository.server.ts';import {IntelligenceService} from '../src/domains/intelligence/service.server.ts';import {createAdmissionService} from '../src/domains/admission/service.server.ts';import {createUlid} from '../src/core/shared/ids.ts';import {registerTable,trustedPredicate} from '../src/domains/admission/sql.server.ts';import {snapshot} from './intelligence-fixture.mjs';import {selection,checkPortfolio,currentAtSnapshot} from '../src/domains/intelligence/checker.ts';
import {KnowledgeService} from '../src/domains/knowledge/service.server.ts';
import {createIntelligenceRoutes} from '../src/domains/intelligence/http.server.ts';
import {ApiError} from '../src/core/registry/errors.ts';
import {prepareKnowledgeErasure} from '../src/domains/knowledge/erasure.server.ts';
const require=createRequire(import.meta.url);const{Miniflare,convertV4MiniflareOptions}=require('../node_modules/.pnpm/miniflare@5.20260907.0-alpha/node_modules/miniflare');
test('synthetic D1: competing strategy admissions reserve only once, preserve loser, reject revocation and replay once',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-07',d1Databases:{DB:'intelligence-isolated'}}));
 try{
  const db=await mf.getD1Database('DB');for(const path of ['migrations/core/0300_atomic_admission.sql','migrations/core/0900_intelligence.sql'])await db.exec((await readFile(path,'utf8')).replace(/\n/g,' '));
  await db.exec("CREATE TABLE test_spare(id TEXT PRIMARY KEY,version INTEGER NOT NULL,available INTEGER NOT NULL);INSERT INTO test_spare VALUES('spare',1,1);CREATE TABLE test_permission(active INTEGER);INSERT INTO test_permission VALUES(1);");
  const table=registerTable('test_spare',['id','version','available']);
  const ctx={principal:{id:createUlid(),kind:'human',humanId:null,sessionId:null,credentialId:null,issuedAt:'2026-09-20T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',authenticationEpoch:1},requestId:createUlid(),now:'2026-09-20T00:00:00.000Z',ingress:'http'};
  const policy={async authorize(c,r){return{actor:{id:c.principal.id,kind:'human'},action:r.action,appId:r.appId,grantId:null,grantVersion:null,policyVersion:1,validUntil:'2099-01-01T00:00:00.000Z',guards:[trustedPredicate('EXISTS(SELECT 1 FROM test_permission WHERE active=1)')],reservationMutations:[],reservationIds:[]};}};
  const admission=createAdmissionService(db,{authorizeReplay:async()=>{},executionStatus:async()=>null}),repository=new IntelligenceRepository(db,policy,admission),s=await snapshot();
  // This isolated test labels its synthetic source as operational solely to exercise the real operational admission branch.
  const operational=structuredClone(s);operational.provenance='operational';
  const sources={load:async(c,id)=>s.sources.find(x=>x.id===id),authorizeProjection:async()=>{},current:async()=>currentAtSnapshot(s),guards:async()=>[trustedPredicate("EXISTS(SELECT 1 FROM test_spare WHERE id='spare' AND version=1 AND available=1)")],checkAuthority:async()=>({issues:[],guards:[]})};
  const execution={async prepare(){return{caseIds:[],decisionIds:[],guards:[trustedPredicate("EXISTS(SELECT 1 FROM test_spare WHERE version=1 AND available=1)")],mutations:[{kind:'update',table,set:{version:2,available:0},where:trustedPredicate("id='spare' AND version=1"),expectedRows:1}]};}};
  const service=new IntelligenceService(repository,sources,{},null,null,execution);
  await service.ingest(ctx,createUlid(),operational);const p=await service.prepare(ctx,createUlid(),{snapshotId:s.id,mandateId:'test-mandate'});
  const http=createIntelligenceRoutes({service,authenticate:async request=>{if(request.headers.get('authorization')!=='test')throw new ApiError('signed_out','Sign in required.');return ctx;}});
  const denied=await http.request(`/problems/${p.id}`);assert.equal(denied.status,401);
  const allowed=await http.request(`/problems/${p.id}`,{headers:{authorization:'test'}});assert.equal(allowed.status,200);assert.equal((await allowed.json()).data.snapshotId,s.id);
  const disabled=await http.request('/portfolio/explore',{method:'POST',headers:{authorization:'test','content-type':'application/json'},body:JSON.stringify({commandId:createUlid(),input:{problemId:p.id,maximumBranches:1,maximumCost:{minor:'100',currency:'AUD',scale:2}}})});assert.equal(disabled.status,503);assert.equal((await disabled.json()).error.code,'unconfigured');
  const manual=await http.request(`/problems/${p.id}/feasibility`,{headers:{authorization:'test'}});assert.equal(manual.status,200);assert.equal((await manual.json()).data.state,'feasible');
  const make=()=>({id:createUlid(),appId:s.appId,ownerId:s.ownerId,version:1,state:'checked',createdAt:ctx.now,updatedAt:ctx.now,problemId:p.id,candidate:selection(s,['c0-0','c1-1']),expiresAt:'2099-01-01T00:00:00.000Z',branches:[]});
  const [a,b]=[make(),make()];await repository.save(ctx,createUlid(),'portfolio.explore','strategies',a,null);await repository.save(ctx,createUlid(),'portfolio.explore','strategies',b,null);
  const result=await Promise.allSettled([service.accept(ctx,createUlid(),{strategyId:a.id,decisionId:null}),service.accept(ctx,createUlid(),{strategyId:b.id,decisionId:null})]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  const rows=(await db.prepare('SELECT state FROM intelligence_strategies').all()).results;assert.equal(rows.filter(x=>x.state==='accepted').length,1);assert.equal(rows.filter(x=>x.state==='checked').length,1);
  assert.equal((await db.prepare("SELECT version FROM test_spare WHERE id='spare'").first()).version,2);
  const problem=await repository.read(ctx,'problems',p.id),plan=await repository.plan(ctx,createUlid(),'portfolio.recompute','problems',{...problem,version:2,updatedAt:ctx.now},1);
  await db.exec('UPDATE test_permission SET active=0');await assert.rejects(admission.commit(ctx,plan));assert.equal((await repository.read(ctx,'problems',p.id)).version,1);
  await db.exec('UPDATE test_permission SET active=1');await admission.commit(ctx,plan);const replay=await admission.commit(ctx,plan);assert.equal(replay.replay,true);assert.equal((await repository.read(ctx,'problems',p.id)).version,2);
  const knowledge=new KnowledgeService(repository,sources);
  const existing=s.sources[0];const fact={id:'asset-fact',version:1,ownerId:s.ownerId,appId:s.appId,kind:'source_assertion',subject:{appId:s.appId,entityId:'asset',recordId:'a'},predicate:'compatible',value:'unknown',effectiveAt:ctx.now,knownAt:ctx.now,sourceVersions:[{id:existing.id,version:existing.version,sha256:existing.sha256}],supersedesVersion:null,state:'valid',dependencies:[]};
  await knowledge.append(ctx,createUlid(),fact,null);
  const old=await knowledge.facts(ctx,s.appId,s.ownerId,ctx.now,ctx.now);assert.equal(old[0].value,'unknown');
  const later={...ctx,now:'2026-09-21T00:00:00.000Z'};await knowledge.correct(later,createUlid(),fact.id,1,{value:'compatible',knownAt:later.now,effectiveAt:ctx.now,sourceVersions:fact.sourceVersions,reason:'source adjudicated',actorKind:'human'});
  assert.equal((await knowledge.facts(later,s.appId,s.ownerId,ctx.now,ctx.now))[0].value,'unknown');assert.equal((await knowledge.facts(later,s.appId,s.ownerId,later.now,later.now))[0].value,'compatible');
  await assert.rejects(knowledge.correct(later,createUlid(),fact.id,1,{value:'forged',knownAt:later.now,effectiveAt:ctx.now,sourceVersions:fact.sourceVersions,reason:'stale',actorKind:'human'}),/version_conflict/);
  const erasure=await prepareKnowledgeErasure(db,s.appId,existing.id,later.now);assert.ok(erasure.redactedIds.includes(fact.id));const erasePermit=await policy.authorize(later,{appId:s.appId,action:'knowledge.erase'});await admission.commit(later,{commandId:createUlid(),action:'knowledge.erase',appId:s.appId,canonicalInputHash:'0'.repeat(64),permit:erasePermit,guards:erasure.guards,mutations:erasure.mutations,audit:[],events:[],outbox:[],committedResult:{erased:true}});const erasedFacts=(await db.prepare('SELECT data_json FROM knowledge_fact_revisions').all()).results;assert.ok(erasedFacts.every(x=>JSON.parse(x.data_json).value===null));await assert.rejects(repository.read(later,'snapshots',s.id),/not_found/);
  await assert.rejects(service.explore(ctx,createUlid(),{problemId:p.id,profiles:[],maximumBranches:1,wallSeconds:1}),/model_unconfigured/);
 }finally{await mf.dispose();}
});
