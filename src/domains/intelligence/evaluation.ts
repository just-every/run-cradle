import type { Snapshot, CheckResult } from './contracts';
import { q, cmp, sub, mul } from './exact';
export type ReplayScore={snapshotId:string;partition:'development'|'sealed';candidate:CheckResult|null;baseline:{objective:string;feasible:boolean;cutoff:string;choicesHash:string}|null;lowerBound:string|null;cutoff:string;choicesHash:string;allSourceChecksPassed:boolean;unsolvedReason:string|null;firstValidatedMs:number|null;completedMs:number|null;attempts:number;costMinor:string|null;humanMinutes:string|null};
export function qualityPass(row:ReplayScore){
 if(row.unsolvedReason||!row.candidate||row.candidate.state!=='checked'||!row.baseline?.feasible||!row.lowerBound||!row.allSourceChecksPassed)return false;
 if(row.baseline.cutoff!==row.cutoff||row.baseline.choicesHash!==row.choicesHash)return false;
 const c=q(row.candidate.objective),b=q(row.baseline.objective),l=q(row.lowerBound);
 if(cmp(l,c)>0||cmp(l,q('0'))<0)return false;
 return cmp(c,b)<=0&&cmp(sub(c,l),mul(q('1/10'),cmp(b,q('60'))>=0?b:q('60')))<=0;
}
export function reportSealed(expectedIds:string[],rows:ReplayScore[]){
 if(expectedIds.length!==10||new Set(expectedIds).size!==10)throw new Error('ten_sealed_snapshots_required');
 if(new Set(rows.map(x=>x.snapshotId)).size!==rows.length)throw new Error('duplicate_score');
 if(rows.some(x=>x.partition!=='sealed'||!expectedIds.includes(x.snapshotId)))throw new Error('unexpected_score');
 const results=expectedIds.map(id=>{const row=rows.find(x=>x.snapshotId===id);return{id,passed:row?qualityPass(row):false,reason:row?.unsolvedReason??(row?'quality_or_fidelity_check':'not_evaluated')};});
 return {eligible:10,evaluated:rows.length,passed:results.filter(x=>x.passed).length,accepted:results.filter(x=>x.passed).length>=9,results,claim:'historical_expected_objective_only' as const};
}
export type DatasetManifest={ownerId:string;authorizationId:string;provenance:'authorized_historical'|'synthetic_test';development:Snapshot[];sealed:{id:string;partition:Snapshot['partition'];sourceVersions:{id:string;version:number;sha256:string}[]}[];evaluatorId:string;producerId:string;sealedAt:string};
export function validateDataset(manifest:DatasetManifest){
 if(!Number.isFinite(Date.parse(manifest.sealedAt)))throw new Error('invalid_seal_time');
 if(manifest.development.length!==20||manifest.sealed.length!==10)throw new Error('dataset_requires_20_development_10_sealed');
 if(!manifest.authorizationId||manifest.evaluatorId===manifest.producerId)throw new Error('independent_custody_required');
 const all=[...manifest.development,...manifest.sealed];if(new Set(all.map(x=>x.id)).size!==30)throw new Error('duplicate_snapshot');
 for(const key of ['incidentIds','assetIds','storeIds','duplicateSourceGroups'] as const){const dev=new Set(manifest.development.flatMap(s=>s.partition[key]));if(manifest.sealed.some(s=>s.partition[key].some(x=>dev.has(x))))throw new Error(`holdout_leakage_${key}`);}
 const devSources=new Set(manifest.development.flatMap(s=>s.sources.map(x=>`${x.id}:${x.version}:${x.sha256}`)));if(manifest.sealed.some(s=>s.sourceVersions.some(x=>devSources.has(`${x.id}:${x.version}:${x.sha256}`))))throw new Error('holdout_source_leakage');
 if(manifest.development.some(s=>s.ownerId!==manifest.ownerId||s.provenance!==manifest.provenance))throw new Error('dataset_custody_mismatch');
 return {development:manifest.development,sealedIds:manifest.sealed.map(x=>x.id),claim:manifest.provenance==='synthetic_test'?'mathematical_test_only':'historical_evaluation_pending'};
}
