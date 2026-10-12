import test from 'node:test';import assert from 'node:assert/strict';import {snapshot} from './intelligence-fixture.mjs';
import {EvidencePortfolioSources} from '../src/domains/intelligence/source-adapter.server.ts';
test('synthetic: exact action authority checks remain per quote while shared remaining budget is checked jointly without writes',async()=>{
 const s=await snapshot({cost:()=> '150000',budget:'500000'}),calls=[];let ceiling='200000';
 const db={prepare(sql){assert.match(sql,/^SELECT/);return {bind(){return {async first(){return {ceiling,consumed:'0',reserved:'0',version:1};}};}};}};
 const policy={async authorize(ctx,request){calls.push(request);assert.equal(request.cost[0].minor,'150000');assert.ok(request.inputHash);assert.equal(request.expected.length,1);return{guards:[],reservationMutations:[{unsafeToCommit:true}]};}};
 const source=new EvidencePortfolioSources({}, {}, {},policy,db);const issues=await source.checkAuthority({now:s.cutoff},s,['c0-0','c1-0']);assert.equal(calls.length,2);assert.equal(issues.issues[0].code,'aggregate_authority_budget');
 ceiling='400000';assert.deepEqual((await source.checkAuthority({now:s.cutoff},s,['c0-0','c1-0'])).issues,[]);
 policy.authorize=async()=>{throw Error('exact quote approval expired');};assert.ok((await source.checkAuthority({now:s.cutoff},s,['c0-0','c1-0'])).issues.some(x=>x.code==='authority_not_current'));
});
