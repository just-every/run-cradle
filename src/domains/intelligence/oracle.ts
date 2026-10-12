import { assertValidatedSnapshot } from './grounding';
import type { Snapshot } from './contracts';
import { q, cmp, mul, add, fmt } from './exact';
/** Separate exhaustive evaluator: no dependency on the candidate checker or candidate program. */
export function exactOracle(s:Snapshot,maximumAssignments=1_000_000){
 assertValidatedSnapshot(s);
 if(!Number.isSafeInteger(maximumAssignments)||maximumAssignments<1)throw new Error('invalid_search_limit');
 const groups=s.groups.map(g=>s.choices.filter(c=>c.groupId===g));
 let visited=0,complete=true,best:typeof s.choices|null=null,bestValue:ReturnType<typeof q>|null=null;
 const feasible=(xs:typeof s.choices)=>{
  if(xs.some(x=>Date.parse(x.validUntil)<=Date.parse(s.cutoff)||x.assumptions.length||x.knownCompatibility==='unknown'||x.knownCompatibility==='incompatible'))return false;
  for(const x of xs){const grant=s.authority.find(a=>a.id===x.authorityRef);if(x.action!=='none'&&(!grant||grant.revoked||Date.parse(grant.expiresAt)<=Date.parse(s.cutoff)||!grant.actions.includes(x.action)||grant.maximum.currency!==x.cost.currency||grant.maximum.scale!==x.cost.scale))return false;}
  for(const a of s.authority)if(xs.filter(x=>x.authorityRef===a.id).reduce((total,x)=>total+BigInt(x.cost.minor),0n)>BigInt(a.maximum.minor))return false;
  for(const currency of new Set(xs.map(x=>x.cost.currency))){const b=s.budgets.find(b=>b.currency===currency);const amounts=xs.filter(x=>x.cost.currency===currency);if(!b||amounts.some(x=>x.cost.scale!==b.scale)||amounts.reduce((total,x)=>total+BigInt(x.cost.minor),0n)>BigInt(b.minor))return false;}
  for(const r of s.resources){const intervals=xs.flatMap(x=>x.resources).filter(u=>u.resourceId===r.id);for(const t of intervals.flatMap(u=>[u.startMinute,u.endMinute])){let used=q('0');for(const u of intervals)if(t>=u.startMinute&&t<u.endMinute)used=add(used,q(u.quantity));if(cmp(used,q(r.capacity))>0)return false;}}
  for(const c of s.constraints){let lhs=q('0');for(const x of xs)for(const t of c.terms)if(t.choiceId===x.id)lhs=add(lhs,q(t.coefficient));const d=cmp(lhs,q(c.bound));if(c.relation==='eq'?d!==0:c.relation==='le'?d>0:d<0)return false;}
  return true;
 };
 const visit=(i:number,xs:typeof s.choices):void=>{if(!complete)return;if(i===groups.length){if(visited>=maximumAssignments){complete=false;return;}visited++;if(!feasible(xs))return;const cost=xs.reduce((t,x)=>add(t,mul(q(x.outageMinutes),q(x.weight))),q('0'));if(bestValue===null||cmp(cost,bestValue)<0){bestValue=cost;best=xs;}return;}for(const choice of groups[i])visit(i+1,[...xs,choice]);};
 visit(0,[]);
 // Relax all coupling constraints. Nonnegative independent group minima certify a lower bound.
 const relaxed=groups.reduce((total,choices)=>{const values=choices.map(x=>mul(q(x.outageMinutes),q(x.weight)));return add(total,values.length?values.reduce((a,b)=>cmp(a,b)<=0?a:b):q('0'));},q('0'));
 const selected=best as typeof s.choices|null;
 return{kind:complete?(selected?'exact':'infeasible'):'bounded',lowerBound:complete&&bestValue!==null?fmt(bestValue):groups.some(x=>!x.length)?null:fmt(relaxed),objective:bestValue===null?null:fmt(bestValue),selectedIds:selected?.map(x=>x.id)??null,visited,complete,oracleVersion:'exhaustive-portfolio/1'};
}
