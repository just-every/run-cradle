import {includePreparedEffects} from '../operations/admission-bridge.server';
import {ApiError} from '../../core/registry/errors';
import type { RequestContext } from '../authority/ports';
import type { ConstructionService } from '../construction/service.server';
import type { Strategy, PortfolioProblem, StoredSnapshot } from './service-contracts';
import type { IntelligenceService } from './service.server';
import type { InvestigationInput } from './investigation';
import { valueOfInformation } from './investigation';
import { checkPortfolio } from './checker';
import { validateSnapshot } from './grounding';
import { createUlid } from '../../core/shared/ids';
import type { SqlMutation, SqlPredicate } from '../admission/ports';
export interface InvestigationExecutionPort {prepare(ctx:RequestContext,input:{commandId:string;investigationId:string;action:string;actionInput:unknown;decisionId:string|null}):Promise<{guards:SqlPredicate[];mutations:SqlMutation[];runId:string;effectPlans?:import('../admission/ports').AdmissionPlan<unknown>[]}>}
export class ExpertService {
 constructor(readonly intelligence:IntelligenceService,readonly construction:ConstructionService|null,readonly investigationExecution:InvestigationExecutionPort|null){}
 async instrument(ctx:RequestContext,commandId:string,strategyId:string){
 return this.intelligence.repository.command(ctx,commandId,'strategy.instrument',{strategyId},{collection:'strategies',id:strategyId},async ctx=>{
  if(!this.construction)throw new ApiError('unconfigured','construction_runner_unconfigured');
  const strategy=await this.intelligence.repository.read<Strategy>(ctx,'strategies',strategyId);
  if(strategy.state!=='checked'||Date.parse(strategy.expiresAt)<=Date.parse(ctx.now))throw new Error('checked_current_strategy_required');
  const run={id:commandId,appId:strategy.appId,ownerId:strategy.ownerId,version:1,state:'running',createdAt:ctx.now,updatedAt:ctx.now,strategyId,prepareCommandId:createUlid(),buildCommandId:createUlid(),candidateId:null as string|null};
  await this.intelligence.repository.save(ctx,commandId,'strategy.instrument','explorations',run,null);
  try{const candidate=await this.construction.prepare(ctx,run.prepareCommandId,{appId:strategy.appId,brief:`Construct the complete useful editable instrument required by this independently checked strategy. ${strategy.formulation.instrumentBrief}\nStrategy: ${strategy.summary}\nPreserve existing owner source. Include working controls to inspect source-bound constraints, change assumptions, rerun alternatives and show exact costs/conditional outcomes. All live effects remain typed host commands with current authority. Do not fabricate available resources or observed savings.`,sourceIds:strategy.sourceVersions.map(x=>x.id),parentReleaseId:null});
  const built=await this.construction.build(ctx,run.buildCommandId,candidate.id);
  const result={...run,version:2,state:'completed',candidateId:built.id,requiresIndependentEvaluation:true,adopted:false};await this.intelligence.repository.save(ctx,createUlid(),'strategy.instrument','explorations',result,1);return result;}catch(error){const failed={...run,version:2,state:'failed',failure:error instanceof Error?error.message:'Instrument construction failed.'};await this.intelligence.repository.save(ctx,createUlid(),'strategy.instrument','explorations',failed,1);return failed;}
 });
 }
 async linkBranch(ctx:RequestContext,commandId:string,parentId:string,branchId:string,condition:string){
 return this.intelligence.repository.command(ctx,commandId,'strategy.branch',{parentId,branchId,condition},{collection:'strategies',id:parentId},async ctx=>{

  if(!condition.trim())throw new Error('branch_condition_required');const repo=this.intelligence.repository;
  const parent=await repo.read<Strategy>(ctx,'strategies',parentId),branch=await repo.read<Strategy>(ctx,'strategies',branchId);
  if(parent.appId!==branch.appId||parent.ownerId!==branch.ownerId||parent.id===branch.id||parent.branches.length>=8)throw new Error('invalid_contingent_branch');
  const next={...parent,version:parent.version+1,updatedAt:ctx.now,branches:[...parent.branches,{condition,strategyId:branch.id,invalidated:branch.state==='stale'}]};await repo.save(ctx,commandId,'strategy.branch','strategies',next,parent.version);return next;
 
 });
 }
 async activateBranch(ctx:RequestContext,commandId:string,parentId:string,branchId:string,decisionId:string|null){
 return this.intelligence.repository.command(ctx,commandId,'strategy.branch',{parentId,branchId,decisionId},{collection:'strategies',id:parentId},async ctx=>{

  const repo=this.intelligence.repository,parent=await repo.read<Strategy>(ctx,'strategies',parentId),edge=parent.branches.find(b=>b.strategyId===branchId);
  if(!edge||edge.invalidated)throw new Error('stale_contingent_branch');
  const branch=await repo.read<Strategy>(ctx,'strategies',branchId),problem=await repo.read<PortfolioProblem>(ctx,'problems',branch.problemId),row=await repo.read<StoredSnapshot>(ctx,'snapshots',problem.snapshotId),snapshot=await validateSnapshot(row.snapshot);
  const check=checkPortfolio(snapshot,branch.candidate,await this.intelligence.sources.current(ctx,snapshot));
  if(check.state!=='checked'){const result={strategy:{...branch,state:'stale',version:branch.version+1,updatedAt:ctx.now},state:'requires_recompute',issues:check.issues};const plan=await repo.plan(ctx,commandId,'strategy.branch','strategies',result.strategy,branch.version);await repo.admission.commit(ctx,{...plan,committedResult:result});return result;}
  return this.intelligence.accept(ctx,commandId,{strategyId:branchId,decisionId});
 
 });
 }
 async proposeInvestigation(ctx:RequestContext,commandId:string,input:{problemId:string;question:string;value:InvestigationInput;evidenceAlreadyChecked:string[];action:string|null;actionInput:unknown}){
 return this.intelligence.repository.command(ctx,commandId,'investigation.prepare',input,{collection:'problems',id:input.problemId},async ctx=>{

  if(!input.question.trim())throw new Error('question_required');const repo=this.intelligence.repository,p=await repo.read<PortfolioProblem>(ctx,'problems',input.problemId);
  const assessment=valueOfInformation(input.value),now=ctx.now;
  const investigation={id:createUlid(),appId:p.appId,ownerId:p.ownerId,version:1,state:'proposed',createdAt:now,updatedAt:now,...input,assessment,runId:null};
  await repo.save(ctx,commandId,'investigation.prepare','investigations',investigation,null);return investigation;
 
 });
 }
 async startInvestigation(ctx:RequestContext,commandId:string,id:string,decisionId:string|null){
 return this.intelligence.repository.command(ctx,commandId,'investigation.start',{id,decisionId},{collection:'investigations',id},async ctx=>{

  if(!this.investigationExecution)throw new ApiError('unconfigured','investigation_execution_unconfigured');const repo=this.intelligence.repository;
  const value=await repo.read<Awaited<ReturnType<ExpertService['proposeInvestigation']>>>(ctx,'investigations',id);
  const problem=await repo.read<PortfolioProblem>(ctx,'problems',value.problemId),snapshot=await repo.read<StoredSnapshot>(ctx,'snapshots',problem.snapshotId);if(snapshot.snapshot.provenance!=='operational')throw new ApiError('forbidden','Historical and synthetic investigations cannot start operational effects.');
  if(value.state!=='proposed'||value.assessment.decision!=='investigate'||!value.action)throw new Error('investigation_not_ready');
  const prepared=await this.investigationExecution.prepare(ctx,{commandId,investigationId:id,action:value.action,actionInput:value.actionInput,decisionId});
  const next={...value,version:value.version+1,updatedAt:ctx.now,state:'running',runId:prepared.runId};const admission=await repo.plan(ctx,commandId,'investigation.start','investigations',next,value.version,prepared.guards,prepared.mutations);await repo.admission.commit(ctx,includePreparedEffects(admission,prepared.effectPlans??[]));return next;
 
 });
 }
}
