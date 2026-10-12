import test from 'node:test';import assert from 'node:assert/strict';
import {knownAt,correctFact,invalidationClosure} from '../src/domains/knowledge/temporal.ts';
import {verifyProcedure,reuseProcedure} from '../src/domains/knowledge/procedures.ts';
import {routeTask} from '../src/domains/intelligence/routing.ts';
import {valueOfInformation,assessCausalClaim} from '../src/domains/intelligence/investigation.ts';
test('synthetic: late knowledge does not rewrite historical cutoff; correction invalidates descendants only',()=>{
 const fact={id:'fact',version:1,ownerId:'owner',appId:'app',kind:'source_assertion',subject:{appId:'app',entityId:'asset',recordId:'asset'},predicate:'identity',value:'old',effectiveAt:'2026-01-01',knownAt:'2026-01-02',sourceVersions:[{id:'s',version:1,sha256:'hash'}],supersedesVersion:null,state:'valid',dependencies:[]};
 const next=correctFact(fact,{value:'new',effectiveAt:'2026-01-01',knownAt:'2026-02-01',sourceVersions:[{id:'s',version:2,sha256:'hash2'}],reason:'late correction',actorKind:'human'});
 assert.equal(knownAt([fact,next],'2026-01-15','2026-01-15','owner')[0].value,'old');assert.equal(knownAt([fact,next],'2026-02-02','2026-02-02','owner')[0].value,'new');assert.deepEqual(knownAt([fact],'2026-02-02','2026-02-02','other'),[]);
 assert.deepEqual(invalidationClosure([{id:'plan',dependencies:['fact'],state:'checked'},{id:'branch',dependencies:['plan'],state:'checked'},{id:'other',dependencies:['different'],state:'checked'}],['fact']),['plan','branch']);
});
test('synthetic: routing measures complete-task competence, correction cost and typed-code compatibility',()=>{
 const base={modelVersion:'v1',task:'portfolio',generatesCode:true,independentEvaluatorId:'judge',producerId:'producer',evaluationVersion:'e1',passed:10,eligible:10,costMinor:'100',correctionCostMinor:'0',p95Ms:100,contextFields:['f'],expiresAt:'2027-01-01'};
 const request={task:'portfolio',requiresCode:true,fields:['f'],now:'2026-09-27',minimumPassRate:'9/10',maximumP95Ms:1000,latencyCostMinorPerMs:'0'};
 assert.equal(routeTask([{...base,profileId:'frontier',role:'frontier'},{...base,profileId:'fast',role:'fast_generative',costMinor:'50'},{...base,profileId:'typed',role:'typed_decision',generatesCode:false,costMinor:'1'}],request).profile.profileId,'fast');
 assert.equal(routeTask([{...base,profileId:'bad',role:'frontier',passed:8}],request).state,'unconfigured');
});
test('synthetic: information choice counts delay and budget, unsupported causal story is investigated',()=>{
 const v={unit:'weighted_minute',actNowCost:'100',investigationCost:'5',delayCost:'10',disruptionCost:'0',budgetRemaining:'20',probabilityEvidenceIds:['s'],answers:[{answer:'compatible',probability:'1/2',bestCostAfterAnswer:'0',strategyIds:['spare']},{answer:'incompatible',probability:'1/2',bestCostAfterAnswer:'100',strategyIds:['repair']}]};
 assert.equal(valueOfInformation(v).decision,'investigate');assert.equal(valueOfInformation({...v,delayCost:'100'}).decision,'act_now');assert.equal(valueOfInformation({...v,budgetRemaining:'1'}).decision,'budget_exhausted');assert.equal(valueOfInformation({...v,probabilityEvidenceIds:[]}).decision,'conditional');
 assert.equal(assessCausalClaim({kind:'causal',claim:'Contractor caused faults',evidenceIds:['correlation'],identification:null,confounders:[]}).state,'investigate');
});
test('synthetic: procedure cannot self-grade, cross owner or silently reuse changed assumptions',()=>{
 const p={id:'p',version:1,ownerId:'owner',privateToOwner:true,title:'Allocate',sourceHash:'source',checkerVersion:'check1',state:'candidate',assumptions:{capacity:'1'},evaluationIds:[],reusedBy:[]};
 const e={id:'e',producerId:'producer',evaluatorId:'judge',sourceHash:'source',checkerVersion:'check1',evaluationVersion:'eval1',heldOut:true,eligible:10,passed:10,failures:[],assumptions:{capacity:'1'}};
 assert.throws(()=>verifyProcedure(p,{...e,evaluatorId:'producer'}));const verified=verifyProcedure(p,e);
 const input={ownerId:'owner',sourceHash:'source',checkerVersion:'check1',assumptions:{capacity:'1'},caseId:'case'};assert.equal(reuseProcedure(verified,input).state,'reused');assert.equal(reuseProcedure(verified,{...input,assumptions:{capacity:'2'}}).state,'reevaluation_required');assert.throws(()=>reuseProcedure(verified,{...input,ownerId:'other'}));
});
test('synthetic: sourced conversion preserves large exact minor units and declared rounding',async()=>{
 const {convertMoney}=await import('../src/domains/intelligence/conversion.ts');
 const rate={from:'AUD',to:'GBP',rate:'1/2',sourceId:'rate',sourceVersion:1,sourceHash:'a'.repeat(64),knownAt:'2026-01-01',validUntil:'2026-02-01',rounding:'half_up'};
 assert.equal(convertMoney({minor:'900719925474099312345',currency:'AUD',scale:2},2,rate,'2026-01-02').minor,'450359962737049656173');
 assert.throws(()=>convertMoney({minor:'1',currency:'USD',scale:2},2,rate,'2026-01-02'));
 assert.throws(()=>convertMoney({minor:'1',currency:'AUD',scale:2},2,rate,'2026-03-02'));
});
