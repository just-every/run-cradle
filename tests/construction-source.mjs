import './helpers/typescript-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSources, validateAppSource, validateFiles, bundle, digest } from '../src/domains/construction/source.ts';
import { assertEvaluationFloor } from '../src/domains/releases/guards.ts';
import { assessScorecard } from '../src/domains/improvements/measurement.ts';
test('owner code, additions, removals survive three-way generation; concurrent edits retain all versions',()=>{
 const base=[{path:'server.ts',content:'original'},{path:'remove.ts',content:'old'}],current=[{path:'server.ts',content:'owner custom'},{path:'manual.ts',content:'owner addition'}],generated=[{path:'server.ts',content:'original'},{path:'remove.ts',content:'old'},{path:'new.ts',content:'generated'}];
 const merged=mergeSources(base,current,generated);assert.deepEqual(merged.conflicts,[]);assert.deepEqual(merged.files,[{path:'manual.ts',content:'owner addition'},{path:'new.ts',content:'generated'},{path:'server.ts',content:'owner custom'}]);
 const conflict=mergeSources(base,current,[{path:'server.ts',content:'generated replacement'}]);assert.equal(conflict.conflicts.length,1);assert.deepEqual(conflict.conflicts[0],{path:'server.ts',baseline:'original',current:'owner custom',generated:'generated replacement'});assert.equal(conflict.files.find(f=>f.path==='server.ts').content,'owner custom');
});
test('source validation blocks traversal and active grants; large editable source encodes without argument overflow',async()=>{
 assert.throws(()=>validateFiles([{path:'../secret',content:'bad'}]));assert.throws(()=>validateFiles([{path:'a',content:'one'},{path:'a',content:'two'}]));
 const content='const x=1;\n'.repeat(20000),encoded=bundle([{path:'large.js',content}]);assert.equal(Buffer.from(JSON.parse(encoded).files[0].content,'base64').toString(),content);assert.match(await digest(encoded),/^[a-f0-9]{64}$/);
 assert.throws(()=>validateAppSource({files:[{path:'app.js',content:'x'}],sourcePolicy:{grantsActive:true,contextExpanded:true}}));
});
test('adoption requires independent complete historical, sealed held-out and shadow checks on exact source',()=>{
 const detail={source:{sha256:'hash',producerId:'producer'},candidate:{sourceHash:'hash'},build:{state:'succeeded',sourceHash:'hash'}};
 const values=['historical','held_out','shadow'].map(mode=>({mode,sourceHash:'hash',state:'passed',producerCanGrade:false,evaluatorId:'independent',eligible:2,evaluated:2,passed:2,skipped:[],artifactIds:['signed'],checkerHash:'checker',datasetHash:'data',sealedBeforeGeneration:true}));
 assert.doesNotThrow(()=>assertEvaluationFloor(detail,values));
 for(const change of [{evaluatorId:'producer'},{state:'inconclusive'},{sourceHash:'other'},{eligible:0},{evaluated:1},{passed:1},{skipped:[{reason:'failed',count:1}]},{sealedBeforeGeneration:false}])assert.throws(()=>assertEvaluationFloor(detail,values.map(v=>v.mode==='held_out'?{...v,...change}:v)));
});
test('scorecards preserve missing/open/failed exposure and count burden by role',()=>{
 const score={eligible:10,open:2,failed:1,abandoned:1,cancelled:0,rightCensored:2,metrics:[{name:'human_minutes',value:'2.1',numerator:'21',denominator:'10',role:'staff',missing:0}]};
 assert.equal(assessScorecard(score,[{metric:'human_minutes',maximum:'2'}]).state,'regressed');
 assert.equal(assessScorecard({...score,metrics:[{...score.metrics[0],value:null,missing:2}]},[{metric:'human_minutes',maximum:'3'}]).state,'inconclusive');
 assert.equal(assessScorecard({...score,open:0,rightCensored:0},[{metric:'human_minutes',maximum:'2.100000000000000000000001'}]).state,'passed');
 assert.equal(assessScorecard({...score,eligible:0},[{metric:'human_minutes',maximum:'3'}]).state,'inconclusive');
});
