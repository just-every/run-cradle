import { q, cmp, add, mul, fmt } from './exact';
export type Competence={profileId:string;modelVersion:string;task:string;role:'frontier'|'fast_generative'|'typed_decision';generatesCode:boolean;independentEvaluatorId:string;producerId:string;evaluationVersion:string;passed:number;eligible:number;costMinor:string;correctionCostMinor:string;p95Ms:number;contextFields:string[];expiresAt:string};
export function routeTask(profiles:Competence[],request:{task:string;requiresCode:boolean;fields:string[];now:string;minimumPassRate:string;maximumP95Ms:number;latencyCostMinorPerMs:string}){
 const accepted=profiles.filter(p=>p.task===request.task&&p.eligible>0&&p.passed>=0&&p.passed<=p.eligible&&p.producerId!==p.independentEvaluatorId&&Date.parse(p.expiresAt)>Date.parse(request.now)&&(!request.requiresCode||p.generatesCode)&&request.fields.every(f=>p.contextFields.includes(f))&&p.p95Ms<=request.maximumP95Ms&&cmp(q(`${p.passed}/${p.eligible}`),q(request.minimumPassRate))>=0);
 const score=(p:Competence)=>add(add(q(p.costMinor),q(p.correctionCostMinor)),mul(q(String(p.p95Ms)),q(request.latencyCostMinorPerMs)));
 accepted.sort((a,b)=>cmp(score(a),score(b))||a.profileId.localeCompare(b.profileId));
 return accepted.length?{state:'ready' as const,profile:accepted[0],estimatedTotalCostMinor:fmt(score(accepted[0])),evaluatedAlternatives:accepted.map(x=>x.profileId)}:{state:'unconfigured' as const,reason:'No current independently evaluated model meets this task, quality, context and latency floor.'};
}
