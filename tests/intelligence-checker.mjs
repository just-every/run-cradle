import test from 'node:test';import assert from 'node:assert/strict';
import {snapshot,reground} from './intelligence-fixture.mjs';
import {validateSnapshot} from '../src/domains/intelligence/grounding.ts';
import {checkPortfolio,currentAtSnapshot,selection} from '../src/domains/intelligence/checker.ts';
import {exactOracle} from '../src/domains/intelligence/oracle.ts';
import {digest,q,fmt,mul} from '../src/domains/intelligence/exact.ts';
import {qualityPass,reportSealed} from '../src/domains/intelligence/evaluation.ts';
test('synthetic: exact oracle and independent checker agree under 80 independently generated perturbations',async()=>{
 let seed=238917;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let trial=0;trial<80;trial++){
  const n=2+random()%5;const s=await snapshot({groups:n,budget:String(200+random()%2200),capacity:String(random()%3),cost:()=>String(100+random()%600),outage:()=>String(random()%500)});
  let optimum=null;
  for(let bits=0;bits<2**n;bits++){const ids=Array.from({length:n},(_,i)=>`c${i}-${(bits>>i)&1}`);const checked=checkPortfolio(s,selection(s,ids),currentAtSnapshot(s));if(checked.state==='checked'&&(optimum===null||BigInt(checked.objective)<BigInt(optimum)))optimum=checked.objective;}
  const oracle=exactOracle(s);assert.equal(oracle.objective,optimum);assert.equal(oracle.kind,optimum===null?'infeasible':'exact');
  const bounded=exactOracle(s,1);if(optimum!==null&&bounded.lowerBound!==null)assert.ok(BigInt(bounded.lowerBound)<=BigInt(optimum));
 }
});
test('synthetic: capacity, original constraint coverage, budget, source mutation and stale race fail closed',async()=>{
 const s=await snapshot();assert.equal(checkPortfolio(s,selection(s,['c0-0','c1-1']),currentAtSnapshot(s)).state,'checked');
 assert.equal(checkPortfolio(s,selection(s,['c0-1','c1-1']),currentAtSnapshot(s)).state,'infeasible');
 const raw=structuredClone(s);raw.constraints=[{id:'mustrepair',label:'Opening day requires repair',unit:'choice',relation:'eq',bound:'1',terms:[{choiceId:'c0-0',coefficient:'1'}],proof:{sourceId:'constraint',version:1,path:[]}}];const constrained=await reground(raw);
 const candidate=selection(constrained,['c0-1','c1-0']);assert.equal(checkPortfolio(constrained,candidate,currentAtSnapshot(constrained)).issues[0].constraintId,'mustrepair');candidate.coveredConstraintIds=[];assert.ok(checkPortfolio(constrained,candidate,currentAtSnapshot(constrained)).issues.some(x=>x.code==='constraint_coverage_mismatch'));
 const current=currentAtSnapshot(s);current.resources.spare++;assert.equal(checkPortfolio(s,selection(s,['c0-0','c1-1']),current).state,'stale');
 assert.throws(()=>checkPortfolio(structuredClone(s),selection(s,['c0-0','c1-1']),currentAtSnapshot(s)),/validated_snapshot/);
 const forged=structuredClone(s);forged.choices[0].cost.minor='0';await assert.rejects(validateSnapshot(forged),/source_value/);
 const later=structuredClone(s);later.sources[0].knownAt='2026-09-21T00:00:00.000Z';await assert.rejects(validateSnapshot(later),/after_cutoff/);
});
test('synthetic: grounded malformed graph and physical units cannot be admitted',async()=>{
 const s=await snapshot();for(const mutate of [s=>s.choices[0].outageMinutes='-1',s=>s.choices[0].weight='-1',s=>s.resources[0].capacity='-1',s=>s.choices[1].resources[0].quantity='-1',s=>s.choices[1].resources[0].resourceId='unknown',s=>s.choices[1].resources[0].endMinute=0,s=>s.choices[0].groupId='unknown',s=>s.groups.push(s.groups[0]),s=>s.choices.push(s.choices[0])]){const bad=structuredClone(s);mutate(bad);await assert.rejects(reground(bad));}
 const mixed=structuredClone(s);mixed.choices[0].cost.currency='GBP';const m=await reground(mixed);assert.equal(checkPortfolio(m,selection(m,['c0-0','c1-0']),currentAtSnapshot(m)).state,'infeasible');
 const unknown=structuredClone(s);unknown.choices[1].knownCompatibility='unknown';const u=await reground(unknown);assert.equal(checkPortfolio(u,selection(u,['c0-1','c1-0']),currentAtSnapshot(u)).state,'conditional');
 assert.equal(fmt(mul(q('900719925474099312345'),q('3/2'))),'2702159776422297937035/2');
});
test('synthetic: quality denominator retains missing, uncertain and unsolved snapshots; weighted hour is sixty minutes',async()=>{
 const s=await snapshot(),candidate=checkPortfolio(s,selection(s,['c0-0','c1-1']),currentAtSnapshot(s));
 const row={snapshotId:'0',partition:'sealed',candidate:{...candidate,objective:'6'},baseline:{objective:'1',feasible:true,cutoff:'cutoff',choicesHash:'same'},lowerBound:'0',cutoff:'cutoff',choicesHash:'same',allSourceChecksPassed:true,unsolvedReason:null,firstValidatedMs:50,completedMs:500,attempts:1,costMinor:null,humanMinutes:null};assert.equal(qualityPass(row),false);
 row.baseline.objective='6';assert.equal(qualityPass(row),true);
 const ids=Array.from({length:10},(_,i)=>String(i));assert.equal(reportSealed(ids,ids.slice(0,8).map(id=>({...row,snapshotId:id}))).accepted,false);assert.equal(reportSealed(ids,ids.slice(0,9).map(id=>({...row,snapshotId:id}))).accepted,true);
 assert.equal(qualityPass({...row,unsolvedReason:'search_limit'}),false);assert.equal(qualityPass({...row,baseline:{...row.baseline,choicesHash:'different'}}),false);
});
test('synthetic: matched comparison harness records failed modes and missing comparisons without excluding them',async()=>{
 const {compareModes,caseLoopBaseline}=await import('../src/domains/intelligence/replay.ts');const s=await snapshot();
 const report=await compareModes(s,'sealed',{async run(s,mode){if(mode==='fast_only')throw Error('unconfigured');return{candidate:caseLoopBaseline(s).candidate,firstValidatedMs:10,completedMs:30,attempts:1,costMinor:'1',humanMinutes:null};}},['case_loop','fast_only']);
 assert.equal(report.results[1].score.unsolvedReason,'unconfigured');assert.equal(report.results[0].score.baseline.cutoff,s.cutoff);assert.ok(report.missingComparisons.includes('incumbent'));assert.equal(report.results[0].score.firstValidatedMs,10);
});
test('synthetic: sealed custody verifies grouping before evaluating and exposes only sealed IDs',async()=>{
 const {validateDataset}=await import('../src/domains/intelligence/evaluation.ts');const original=await snapshot();
 const partition=i=>({incidentIds:[`incident${i}`],assetIds:[`asset${i}`],storeIds:[`store${i}`],duplicateSourceGroups:[`duplicate${i}`]});
 const development=Array.from({length:20},(_,i)=>({...original,id:`dev${i}`,partition:partition(i),sources:original.sources.map(s=>({...s,id:`${i}-${s.id}`}))}));
 const sealed=Array.from({length:10},(_,i)=>({id:`sealed${i}`,partition:partition(i+20),sourceVersions:[{id:`sealed-source${i}`,version:1,sha256:'a'.repeat(64)}]}));
 const manifest={ownerId:'owner',authorizationId:'test-only',provenance:'synthetic_test',development,sealed,evaluatorId:'independent',producerId:'producer',sealedAt:'2026-09-01T00:00:00Z'};
 assert.deepEqual(validateDataset(manifest).sealedIds,sealed.map(x=>x.id));assert.equal(validateDataset(manifest).claim,'mathematical_test_only');
 assert.throws(()=>validateDataset({...manifest,evaluatorId:'producer'}),/independent/);
 const leaked=structuredClone(manifest);leaked.sealed[0].partition.assetIds=['asset0'];assert.throws(()=>validateDataset(leaked),/holdout_leakage/);
 const duplicate=structuredClone(manifest);duplicate.sealed[0].sourceVersions=[development[0].sources[0]];assert.throws(()=>validateDataset(duplicate),/holdout_source/);
});
