import type { Snapshot, Candidate } from './contracts';
import { validateSnapshot } from './grounding';
import { checkPortfolio, currentAtSnapshot, selection } from './checker';
import { exactOracle } from './oracle';
import { digest, q, cmp, mul } from './exact';
import type { ReplayScore } from './evaluation';
/** Sequential case baseline: locally preferred choices in original group order, first globally feasible completion. */
export function caseLoopBaseline(s:Snapshot,limit=100000){
 let attempts=0,result:Candidate|null=null;
 const choices=s.groups.map(g=>s.choices.filter(x=>x.groupId===g).sort((a,b)=>cmp(mul(q(a.outageMinutes),q(a.weight)),mul(q(b.outageMinutes),q(b.weight)))||a.id.localeCompare(b.id)));
 const visit=(i:number,ids:string[]):void=>{if(result||attempts>=limit)return;if(i===choices.length){attempts++;const candidate=selection(s,ids);if(checkPortfolio(s,candidate,currentAtSnapshot(s)).state==='checked')result=candidate;return;}for(const c of choices[i])visit(i+1,[...ids,c.id]);};visit(0,[]);return {candidate:result,attempts,unsolved:result===null};
}
export type ComparisonMode='case_loop'|'frontier_only'|'fast_only'|'evaluated_hybrid'|'incumbent'|'agent_from_scratch';
export interface ReplayCandidatePort {run(snapshot:Snapshot,mode:ComparisonMode):Promise<{candidate:Candidate;firstValidatedMs:number|null;completedMs:number;attempts:number;costMinor:string|null;humanMinutes:string|null}>}
/** Evaluator supplies cutoff snapshots only. Later observed outcomes are deliberately absent from this API. */
export async function evaluateReplay(input:{snapshot:unknown;partition:'development'|'sealed';mode:ComparisonMode;runner:ReplayCandidatePort}):Promise<ReplayScore>{
 const s=await validateSnapshot(input.snapshot),choicesHash=await digest({choices:s.choices,constraints:s.constraints,budgets:s.budgets,resources:s.resources,authority:s.authority}),baseline=caseLoopBaseline(s),baselineCheck=baseline.candidate?checkPortfolio(s,baseline.candidate,currentAtSnapshot(s)):null,oracle=exactOracle(s);
 const base:ReplayScore={snapshotId:s.id,partition:input.partition,candidate:null,baseline:baselineCheck?{objective:baselineCheck.objective,feasible:baselineCheck.state==='checked',cutoff:s.cutoff,choicesHash}:null,lowerBound:oracle.lowerBound,cutoff:s.cutoff,choicesHash,allSourceChecksPassed:true,unsolvedReason:null,firstValidatedMs:null,completedMs:null,attempts:0,costMinor:null,humanMinutes:null};
 try{const result=await input.runner.run(s,input.mode);base.candidate=checkPortfolio(s,result.candidate,currentAtSnapshot(s));Object.assign(base,{firstValidatedMs:result.firstValidatedMs,completedMs:result.completedMs,attempts:result.attempts,costMinor:result.costMinor,humanMinutes:result.humanMinutes});if(base.candidate.state!=='checked')base.unsolvedReason=base.candidate.state;if(!baselineCheck)base.unsolvedReason='baseline_unsolved';if(oracle.kind!=='exact')base.unsolvedReason='independent_optimum_not_solved';}
 catch(error){base.unsolvedReason=error instanceof Error?error.message:'candidate_unsolved';}
 return base;
}
export async function compareModes(snapshot:unknown,partition:'development'|'sealed',runner:ReplayCandidatePort,modes:ComparisonMode[]){const results=await Promise.all(modes.map(async mode=>({mode,score:await evaluateReplay({snapshot,partition,mode,runner})})));return{results,missingComparisons:(['case_loop','frontier_only','fast_only','evaluated_hybrid','incumbent','agent_from_scratch'] as ComparisonMode[]).filter(x=>!modes.includes(x)),claim:'historical_expected_objective_only'};}
