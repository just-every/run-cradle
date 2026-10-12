import type { Snapshot, Candidate, CurrentVersions, CheckIssue, CheckResult } from './contracts';
import { candidateSchema } from './contracts';
import { q, cmp, add, mul, fmt } from './exact';
import { assertGrounded, assertPayload, assertValidatedSnapshot } from './grounding';
/** Independent feasibility interpreter. Never consumes solver totals or solver constraints. */
export function checkPortfolio(s:Snapshot,input:unknown,current:CurrentVersions):CheckResult {
 assertValidatedSnapshot(s);
 const candidate=candidateSchema.parse(input),issues:CheckIssue[]=[];
 const issue=(constraintId:string,code:string,message=code)=>issues.push({constraintId,code,message});
 let stale=false;
 if(candidate.snapshotId!==s.id||candidate.snapshotVersion!==s.version||current.snapshotVersion!==s.version){stale=true;issue('snapshot','stale_snapshot');}
 for(const [kind,items,versions] of [['resource',s.resources,current.resources],['source',s.sources,current.sources],['authority',s.authority,current.authority]] as const)for(const x of items)if(versions[x.id]!==x.version){stale=true;issue(x.id,`stale_${kind}`);}
 try{assertPayload(s,s.policyProof,{groups:s.groups,resources:s.resources,budgets:s.budgets,authority:s.authority});}catch{issue('policy','source_value_mismatch');}
 if(new Set(candidate.selectedIds).size!==candidate.selectedIds.length)issue('selection','duplicate_choice');
 const chosen=s.choices.filter(x=>candidate.selectedIds.includes(x.id));
 if(chosen.length!==candidate.selectedIds.length)issue('selection','unknown_choice');
 for(const group of s.groups)if(chosen.filter(x=>x.groupId===group).length!==1)issue(group,'exactly_one_choice_required');
 const expected=s.constraints.map(x=>x.id).sort();
 if(JSON.stringify([...candidate.coveredConstraintIds].sort())!==JSON.stringify(expected))issue('coverage','constraint_coverage_mismatch');
 const cash=new Map<string,{minor:bigint;currency:string;scale:number}>();let objective=q('0');
 const assumptions=new Set<string>();
 for(const option of chosen){
  try{assertGrounded(s,option);}catch{issue(option.id,'source_value_mismatch');}
  if(Date.parse(option.validUntil)<=Date.parse(current.now))issue(option.id,'choice_terms_expired');
  if(option.knownCompatibility==='incompatible')issue(option.id,'incompatible');
  option.assumptions.forEach(a=>assumptions.add(a));
  if(option.knownCompatibility==='unknown'){assumptions.add(`compatibility:${option.id}`);}
  objective=add(objective,mul(q(option.outageMinutes),q(option.weight)));
  const key=option.cost.currency,previous=cash.get(key);
  if(previous&&previous.scale!==option.cost.scale)issue(option.id,'currency_scale_mismatch');
  cash.set(key,{minor:(previous?.minor??0n)+BigInt(option.cost.minor),currency:key,scale:option.cost.scale});
  if(option.action!=='none'){
   const grant=s.authority.find(x=>x.id===option.authorityRef);
   if(!grant||grant.revoked||!grant.actions.includes(option.action)||Date.parse(grant.expiresAt)<=Date.parse(current.now))issue(option.id,'authority_missing_or_expired');
   else if(grant.maximum.currency!==option.cost.currency||grant.maximum.scale!==option.cost.scale||BigInt(grant.maximum.minor)<BigInt(option.cost.minor))issue(option.id,'authority_amount_or_currency');
  }
 }
 for(const grant of s.authority){const spent=chosen.filter(x=>x.authorityRef===grant.id).reduce((a,x)=>a+BigInt(x.cost.minor),0n);if(spent>BigInt(grant.maximum.minor))issue(grant.id,'authority_aggregate_budget');}
 for(const amount of cash.values()){const budget=s.budgets.find(x=>x.currency===amount.currency);if(!budget||budget.scale!==amount.scale||BigInt(budget.minor)<amount.minor)issue(amount.currency,'cash_limit');}
 for(const resource of s.resources){
  const uses=chosen.flatMap(x=>x.resources).filter(x=>x.resourceId===resource.id);
  const points=[...new Set(uses.flatMap(x=>[x.startMinute,x.endMinute]))];
  for(const minute of points){const use=uses.filter(x=>x.startMinute<=minute&&minute<x.endMinute).reduce((a,x)=>add(a,q(x.quantity)),q('0'));if(cmp(use,q(resource.capacity))>0){issue(resource.id,'resource_capacity',`Capacity exceeded at minute ${minute}`);break;}}
 }
 for(const c of s.constraints){
  try{assertGrounded(s,c);}catch{issue(c.id,'source_value_mismatch');}
  const total=c.terms.filter(x=>candidate.selectedIds.includes(x.choiceId)).reduce((a,t)=>add(a,q(t.coefficient)),q('0'));
  const comparison=cmp(total,q(c.bound));
  if((c.relation==='le'&&comparison>0)||(c.relation==='ge'&&comparison<0)||(c.relation==='eq'&&comparison!==0))issue(c.id,'business_constraint',c.label);
 }
 if(JSON.stringify([...assumptions].sort())!==JSON.stringify([...new Set(candidate.assumptionIds)].sort()))issue('assumptions','assumption_coverage_mismatch');
 return {state:stale?'stale':issues.length?'infeasible':assumptions.size?'conditional':'checked',issues,objective:fmt(objective),objectiveUnit:'weighted_minute',cash:[...cash.values()].map(x=>({...x,minor:String(x.minor)})),assumptions:[...assumptions],checkerVersion:'portfolio-checker/1'};
}
export function currentAtSnapshot(s:Snapshot):CurrentVersions{return{snapshotVersion:s.version,resources:Object.fromEntries(s.resources.map(x=>[x.id,x.version])),sources:Object.fromEntries(s.sources.map(x=>[x.id,x.version])),authority:Object.fromEntries(s.authority.map(x=>[x.id,x.version])),now:s.cutoff};}
export function selection(s:Snapshot,selectedIds:string[]):Candidate{return{snapshotId:s.id,snapshotVersion:s.version,selectedIds,coveredConstraintIds:s.constraints.map(x=>x.id),assumptionIds:[...new Set(s.choices.filter(x=>selectedIds.includes(x.id)).flatMap(x=>[...x.assumptions,...(x.knownCompatibility==='unknown'?[`compatibility:${x.id}`]:[])]))]};}
