/** Fixed independent structured-output oracle. Candidate source cannot replace this checker. */
export const independentCheckerProgram=String.raw`
import fs from 'node:fs';
const input=JSON.parse(fs.readFileSync('/input/input.json','utf8'));
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
const candidate=input.candidate.files.find(f=>f.path==='predictions.json');
const predictions=candidate?JSON.parse(Buffer.from(candidate.content,'base64')):[];
if(!Array.isArray(predictions)||new Set(predictions.map(p=>p.id)).size!==predictions.length)throw new Error('invalid_candidate_predictions');
let evaluated=0,passed=0;const skipped=[];
for(const truth of input.expected.cases){const prediction=predictions.find(p=>p.id===truth.id);if(!prediction){skipped.push({reason:'candidate_did_not_answer',count:1});continue;}evaluated++;if(canonical(prediction.value)===canonical(truth.expected))passed++;}
if(predictions.some(p=>!input.expected.cases.some(t=>t.id===p.id)))throw new Error('unexpected_case_output');
fs.writeFileSync('/output/evaluation.json',JSON.stringify({eligible:input.expected.cases.length,evaluated,passed,skipped}));
`;
