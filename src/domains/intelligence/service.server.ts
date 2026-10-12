import {includePreparedEffects} from '../operations/admission-bridge.server';
import {ApiError} from '../../core/registry/errors';
import { createUlid } from '../../core/shared/ids';
import type { Money } from '../../contracts/primitives';
import type { RequestContext } from '../authority/ports';
import type { EvidencePort } from '../evidence/ports';
import type { ModelPort } from '../execution/model-ports';
import type { IntelligenceSourcePort, OptimizerPort, StrategyExecutionPort } from './ports';
import type { Snapshot } from './contracts';
import { formulationSchema, candidateSchema } from './contracts';
import { canonical, digest } from './exact';
import { validateSnapshot } from './grounding';
import { currentAtSnapshot } from './checker';
import { checkPortfolio } from './checker';
import {diagnoseFeasibility} from './diagnostics';
import { exactOracle } from './oracle';
import { assessCausalClaim } from './investigation';
import { IntelligenceRepository } from './repository.server';
import type { StoredSnapshot, PortfolioProblem, Strategy, Exploration } from './service-contracts';
import { z } from 'zod';
import {routeTask} from './routing';
import type {Competence} from './routing';
export class IntelligenceService {
 constructor(readonly repository:IntelligenceRepository,readonly sources:IntelligenceSourcePort,readonly evidence:EvidencePort,readonly model:ModelPort|null,readonly optimizer:OptimizerPort|null,readonly execution:StrategyExecutionPort|null,readonly routing:{profiles:Competence[];minimumPassRate:string;maximumP95Ms:number;latencyCostMinorPerMs:string}|null=null){repository.sourceRead=(ctx,id,version)=>sources.load(ctx,id,version);}
 async ingest(ctx:RequestContext,commandId:string,input:unknown){
 return this.repository.command(ctx,commandId,'portfolio.prepare',input,{appId:(input as Snapshot).appId},async ctx=>{

  const snapshot=await validateSnapshot(input);
  await this.repository.policy.authorize(ctx,{appId:snapshot.appId,action:'portfolio.prepare',expected:[],cost:[],inputHash:await digest(snapshot),commandId});
  for(const source of snapshot.sources){const actual=await this.sources.load(ctx,source.id,source.version);if(canonical(actual)!==canonical(source))throw new Error('snapshot_source_forgery');}
  const row:StoredSnapshot={id:snapshot.id,appId:snapshot.appId,ownerId:snapshot.ownerId,version:snapshot.version,state:'available',createdAt:ctx.now,updatedAt:ctx.now,snapshot};
  await this.repository.save(ctx,commandId,'portfolio.prepare','snapshots',row,null);return row;
 
 });
 }
 async prepare(ctx:RequestContext,commandId:string,input:{snapshotId:string;mandateId:string}){
 return this.repository.command(ctx,commandId,'portfolio.prepare',input,{collection:'snapshots',id:input.snapshotId},async ctx=>{

  const stored=await this.repository.read<StoredSnapshot>(ctx,'snapshots',input.snapshotId),s=await validateSnapshot(stored.snapshot);
  const problem:PortfolioProblem={id:createUlid(),appId:s.appId,ownerId:s.ownerId,version:1,state:'prepared',createdAt:ctx.now,updatedAt:ctx.now,snapshotId:s.id,mandateId:input.mandateId,cutoff:s.cutoff,horizonEnd:s.horizonEnd,objectives:[{id:'weighted-outage',label:'Weighted outage',unit:'weighted_minute',direction:'min',priority:1}],constraints:s.constraints,resourceVersions:s.resources,allowedChoices:[...new Set(s.choices.map(x=>x.kind))],unknowns:s.choices.filter(x=>x.knownCompatibility==='unknown').map(x=>`compatibility:${x.id}`)};
  await this.repository.save(ctx,commandId,'portfolio.prepare','problems',problem,null);return problem;
 
 });
 }
 async explore(ctx:RequestContext,commandId:string,input:{problemId:string;profiles:{profileId:string;fieldIds:string[];maximumCost:Money}[];maximumBranches:number;wallSeconds:number}){
 return this.repository.command(ctx,commandId,'portfolio.explore',input,{collection:'problems',id:input.problemId},async ctx=>{

  if(!this.model)throw new ApiError('unconfigured','model_unconfigured');if(!this.routing)throw new ApiError('unconfigured','measured_routing_unconfigured');if(!this.optimizer)throw new ApiError('unconfigured','optimizer_runner_unconfigured');
  if(!Number.isInteger(input.maximumBranches)||input.maximumBranches<1||input.maximumBranches>8||!input.profiles.length||input.profiles.length>input.maximumBranches)throw new Error('branch_budget_exceeded');
  for(const profile of input.profiles){const route=routeTask(this.routing.profiles.filter(x=>x.profileId===profile.profileId),{task:'portfolio',requiresCode:true,fields:profile.fieldIds,now:ctx.now,minimumPassRate:this.routing.minimumPassRate,maximumP95Ms:this.routing.maximumP95Ms,latencyCostMinorPerMs:this.routing.latencyCostMinorPerMs});if(route.state!=='ready')throw new Error('model_competence_not_established');}
  input={...input,profiles:[...input.profiles].sort((a,b)=>{const ranking=routeTask(this.routing!.profiles.filter(x=>x.profileId===a.profileId||x.profileId===b.profileId),{task:'portfolio',requiresCode:true,fields:[...new Set([...a.fieldIds,...b.fieldIds])],now:ctx.now,minimumPassRate:this.routing!.minimumPassRate,maximumP95Ms:this.routing!.maximumP95Ms,latencyCostMinorPerMs:this.routing!.latencyCostMinorPerMs});return ranking.state==='ready'&&ranking.profile.profileId===a.profileId?-1:1;})};
  const problem=await this.repository.read<PortfolioProblem>(ctx,'problems',input.problemId),stored=await this.repository.read<StoredSnapshot>(ctx,'snapshots',problem.snapshotId),s=await validateSnapshot(stored.snapshot);
  const run:Exploration={id:commandId,appId:s.appId,ownerId:s.ownerId,version:1,state:'running',createdAt:ctx.now,updatedAt:ctx.now,problemId:problem.id,strategyIds:[],failures:[],startedAt:ctx.now,firstValidatedAt:null,completedAt:null};
  const admission=await this.repository.save(ctx,commandId,'portfolio.explore','explorations',run,null,await this.sources.guards(ctx,s));
  if(admission.replay)return this.repository.read<Exploration>(ctx,'explorations',commandId);
  const results=await Promise.allSettled(input.profiles.map(async profile=>{
   // Authorize the entire normalized snapshot before placing it in task input, not only the displayed context.
   await this.sources.authorizeProjection(ctx,s,profile.profileId,profile.fieldIds);
   const historical=s.provenance==='authorized_historical';const purpose=historical?'historical.portfolio_formulation':'portfolio_formulation';
   const refs=historical?s.sources.map(x=>({id:x.id,version:x.version,sha256:x.sha256,ownerAppId:s.appId,effectiveAt:x.effectiveAt,knownAt:x.knownAt,sourceReleaseId:null})):await Promise.all(s.sources.map(async x=>(await this.evidence.source(ctx,x.id)).ref));
   if(refs.some(r=>!s.sources.some(x=>x.id===r.id&&x.version===r.version&&x.sha256===r.sha256)))throw new Error('source_changed_before_context');
   const context=await this.evidence.buildContext(ctx,{appId:s.appId,purpose,refs,fieldIds:profile.fieldIds,profileId:profile.profileId,...(historical?{historicalCutoff:s.cutoff}:{})});
   const generated=await this.model!.generate(ctx,{purpose,profileId:profile.profileId,context,input:{snapshot:s,candidateSchema:z.toJSONSchema(candidateSchema),instruction:'Derive a runnable optimizer for these exact constraints. Return alternative strategies through separate calls, never relax a hard constraint.'},outputSchemaId:'intelligence.formulation',outputSchemaVersion:1,maximumCost:profile.maximumCost,deadline:new Date(Date.now()+300000).toISOString()},v=>formulationSchema.parse(v));
   const f=generated.value;
   if(canonical([...f.constraintIds].sort())!==canonical(s.constraints.map(x=>x.id).sort())||f.sourceIds.some(x=>!s.sources.some(y=>y.id===x)))throw new Error('formulation_source_or_constraint_coverage');
   for(const claim of f.causalClaims)if(assessCausalClaim(claim).state==='investigate')throw new Error('unsupported_causal_explanation_requires_investigation');
   const optimized=await this.optimizer!.run(ctx,{jobId:createUlid(),formulation:f,snapshot:s,wallSeconds:input.wallSeconds});
   const current=historical?currentAtSnapshot(s):await this.sources.current(ctx,s),check=checkPortfolio(s,optimized.candidate,current),oracle=exactOracle(s);
   const authorityIssues=historical?{issues:[],guards:[]}:await this.sources.checkAuthority(ctx,s,optimized.candidate.selectedIds);check.issues.push(...authorityIssues.issues);if(authorityIssues.issues.length)check.state='infeasible';
   const now=new Date().toISOString(),strategy:Strategy={id:createUlid(),appId:s.appId,ownerId:s.ownerId,version:1,state:check.state,createdAt:now,updatedAt:now,problemId:problem.id,mode:s.provenance,summary:f.explanation,candidate:optimized.candidate,check,sourceVersions:s.sources.map(x=>({id:x.id,version:x.version,sha256:x.sha256})),resourceVersions:s.resources,expiresAt:new Date(Math.min(Date.parse(s.horizonEnd),Date.now()+3600000)).toISOString(),optimizerArtifactId:optimized.sourceHash,checkerArtifactId:'portfolio-checker/1',verificationId:createUlid(),optimality:{kind:oracle.kind,lowerBound:oracle.lowerBound,objective:oracle.objective},formulation:f,modelCall:generated.call,firstValidatedAt:check.state==='checked'?now:null,completedAt:now,caseIds:[],decisionIds:[],branches:[]};
   await this.repository.save(ctx,createUlid(),'portfolio.explore','strategies',strategy,null,[...await this.sources.guards(ctx,s),...authorityIssues.guards]);return strategy;
  }));
  results.forEach((result,i)=>{if(result.status==='fulfilled'){run.strategyIds.push(result.value.id);const t=result.value.firstValidatedAt;if(t&&(!run.firstValidatedAt||t<run.firstValidatedAt))run.firstValidatedAt=t;}else run.failures.push({profileId:input.profiles[i].profileId,message:result.reason instanceof Error?result.reason.message:'exploration_failed'});});
  run.version++;run.updatedAt=new Date().toISOString();run.completedAt=run.updatedAt;run.state=run.strategyIds.length?'completed':'failed';await this.repository.save(ctx,createUlid(),'portfolio.explore','explorations',run,1);return run;
 
 });
 }
 async inspect(ctx:RequestContext,problemId:string){const problem=await this.repository.read<PortfolioProblem>(ctx,'problems',problemId),stored=await this.repository.read<StoredSnapshot>(ctx,'snapshots',problem.snapshotId);return diagnoseFeasibility(await validateSnapshot(stored.snapshot));}
 async accept(ctx:RequestContext,commandId:string,input:{strategyId:string;decisionId:string|null}){
 return this.repository.command(ctx,commandId,'strategy.accept',input,{collection:'strategies',id:input.strategyId},async ctx=>{

  if(!this.execution)throw new ApiError('unconfigured','continuing_operation_unconfigured');
  const strategy=await this.repository.read<Strategy>(ctx,'strategies',input.strategyId),problem=await this.repository.read<PortfolioProblem>(ctx,'problems',strategy.problemId),stored=await this.repository.read<StoredSnapshot>(ctx,'snapshots',problem.snapshotId),s=await validateSnapshot(stored.snapshot);
  if(s.provenance!=='operational')throw new ApiError('forbidden','Historical and synthetic strategies are read-only; prepare and recheck a current operational snapshot before any effect.');
  if(strategy.state!=='checked'||Date.parse(strategy.expiresAt)<=Date.parse(ctx.now))throw new Error('stale_or_conditional_strategy');
  const checked=checkPortfolio(s,strategy.candidate,await this.sources.current(ctx,s));const authorityIssues=await this.sources.checkAuthority(ctx,s,strategy.candidate.selectedIds);if(checked.state!=='checked'||authorityIssues.issues.length)throw new Error('strategy_requires_recompute');
  const prepared=await this.execution.prepare(ctx,{commandId,mandateId:problem.mandateId,strategyId:strategy.id,snapshot:s,candidate:strategy.candidate,decisionId:input.decisionId});
  const next={...strategy,state:'accepted',version:strategy.version+1,updatedAt:ctx.now,caseIds:prepared.caseIds,decisionIds:prepared.decisionIds};
  const acceptance=await this.repository.plan(ctx,commandId,'strategy.accept','strategies',next,strategy.version,[...await this.sources.guards(ctx,s),...authorityIssues.guards,...prepared.guards],prepared.mutations);const result={strategy:next,caseIds:prepared.caseIds,decisionIds:prepared.decisionIds};await this.repository.admission.commit(ctx,includePreparedEffects({...acceptance,committedResult:result},prepared.effectPlans??[]));return result;
 
 });
 }
 async recompute(ctx:RequestContext,commandId:string,input:{problemId:string;snapshotId:string;reason:string}){
 return this.repository.command(ctx,commandId,'portfolio.recompute',input,{collection:'problems',id:input.problemId},async ctx=>{

  if(!input.reason.trim())throw new Error('reason_required');const p=await this.repository.read<PortfolioProblem>(ctx,'problems',input.problemId),stored=await this.repository.read<StoredSnapshot>(ctx,'snapshots',input.snapshotId),s=await validateSnapshot(stored.snapshot);
  if(s.appId!==p.appId||s.ownerId!==p.ownerId)throw new Error('snapshot_owner_mismatch');
  const old=await this.repository.forProblem<Strategy>(ctx,p.id);
  const mutations=old.map(strategy=>this.repository.mutation('strategies',{...strategy,state:'stale',version:strategy.version+1,updatedAt:ctx.now,branches:strategy.branches.map(b=>({...b,invalidated:true}))},strategy.version));
  const next={...p,version:p.version+1,updatedAt:ctx.now,snapshotId:s.id,cutoff:s.cutoff,horizonEnd:s.horizonEnd,constraints:s.constraints,resourceVersions:s.resources};
  await this.repository.save(ctx,commandId,'portfolio.recompute','problems',next,p.version,await this.sources.guards(ctx,s),mutations);return next;
 
 });
 }
}
