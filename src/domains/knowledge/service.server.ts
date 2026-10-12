import {boundIdentity} from '../intelligence/commands.server';
import {hiddenArtifact} from '../intelligence/visibility';
import {createUlid} from '../../core/shared/ids';
import {ApiError} from '../../core/registry/errors';
import type { RequestContext } from '../authority/ports';
import { registerTable, trustedPredicate } from '../admission/sql.server';
import type { SqlMutation } from '../admission/ports';
import { IntelligenceRepository } from '../intelligence/repository.server';
import type { Stored } from '../intelligence/repository.server';
import type { IntelligenceSourcePort } from '../intelligence/ports';
import { canonical, digest } from '../intelligence/exact';
import { correctFact, knownAt } from './temporal';
import type { TemporalFact } from './temporal';
import { verifyProcedure, reuseProcedure } from './procedures';
import type { Procedure } from './procedures';
import {temporalFactSchema} from './validators';
import type {IsolatedOptimizer} from '../intelligence/runner.server';
import {validateSnapshot} from '../intelligence/grounding';
import {currentAtSnapshot,checkPortfolio} from '../intelligence/checker';
import type {StoredSnapshot} from '../intelligence/service-contracts';
import type { Strategy } from '../intelligence/service-contracts';
import type { ProcedureEvaluationPort } from './evaluator.server';
const revisions=registerTable('knowledge_fact_revisions',['id','version','app_id','owner_id','known_at','effective_at','kind','data_json']);
const dependencies=registerTable('knowledge_dependencies',['id','app_id','parent_id','child_id','invalidated_at']);
export class KnowledgeService {
 constructor(readonly repository:IntelligenceRepository,readonly sources:IntelligenceSourcePort,readonly evaluator:ProcedureEvaluationPort|null=null,readonly runner:IsolatedOptimizer|null=null){}
 async facts(ctx:RequestContext,appId:string,ownerId:string,cutoff:string,effectiveAt:string){
  await this.repository.policy.authorize(ctx,{appId,action:'facts.read',expected:[],cost:[],inputHash:await digest({appId,ownerId,cutoff,effectiveAt})});
  const rows=await this.repository.db.prepare('SELECT data_json FROM knowledge_fact_revisions WHERE app_id=? AND owner_id=? AND known_at<=? AND effective_at<=? ORDER BY id,version').bind(appId,ownerId,cutoff,effectiveAt).all<{data_json:string}>();const visible=knownAt(rows.results.map(x=>JSON.parse(x.data_json)),cutoff,effectiveAt,ownerId);const permitted:TemporalFact[]=[];for(const fact of visible){try{for(const source of fact.sourceVersions)await this.sources.load(ctx,source.id,source.version);permitted.push(fact);}catch(error){if(!hiddenArtifact(error))throw error;}}return permitted;
 }
 async append(ctx:RequestContext,commandId:string,fact:TemporalFact,previousVersion:number|null){
 return this.repository.command(ctx,commandId,previousVersion===null?'fact.record':'fact.correct',{fact,previousVersion},{appId:fact.appId},async ctx=>{

  fact=temporalFactSchema.parse(fact);if(fact.subject.appId!==fact.appId)throw new Error('fact_subject_app_mismatch');
  if(fact.kind==='observation'&&!['human','connector'].includes(ctx.principal.kind))throw new Error('observation_requires_direct_source_admission');
  if(Date.parse(fact.knownAt)>Date.parse(ctx.now)||!fact.sourceVersions.length||!fact.predicate.trim()||fact.version!==(previousVersion??0)+1)throw new Error('invalid_fact_revision');
  if(fact.kind==='preference'&&ctx.principal.kind!=='human')throw new Error('preference_requires_human');
  for(const ref of fact.sourceVersions){const source=await this.sources.load(ctx,ref.id,ref.version);if(source.sha256!==ref.sha256||Date.parse(source.knownAt)>Date.parse(fact.knownAt))throw new Error('fact_source_mismatch');}
  const action=previousVersion===null?'fact.record':'fact.correct',inputHash=boundIdentity(ctx,commandId)?.canonicalInputHash??await digest(fact),permit=await this.repository.policy.authorize(ctx,{appId:fact.appId,action,expected:[],cost:[],inputHash,commandId});
  const descendants=await this.repository.db.prepare('WITH RECURSIVE affected(id) AS (SELECT ? UNION SELECT k.child_id FROM knowledge_dependencies k JOIN affected a ON k.parent_id=a.id WHERE k.app_id=?) SELECT id FROM affected').bind(fact.id,fact.appId).all<{id:string}>();
  const mutations:SqlMutation[]=[{kind:'insert',table:revisions,row:{id:fact.id,version:fact.version,app_id:fact.appId,owner_id:fact.ownerId,known_at:fact.knownAt,effective_at:fact.effectiveAt,kind:fact.kind,data_json:canonical(fact)}}];
  const newEdges:SqlMutation[]=[];for(const parent of new Set([...fact.dependencies,...fact.sourceVersions.map(x=>`source:${x.id}`)]))newEdges.push({kind:'insert',table:dependencies,row:{id:createUlid(),app_id:fact.appId,parent_id:parent,child_id:fact.id,invalidated_at:null}});
  for(const item of descendants.results)mutations.push({kind:'update',table:dependencies,set:{invalidated_at:ctx.now},where:trustedPredicate('app_id=? AND child_id=? AND invalidated_at IS NULL',[fact.appId,item.id]),expectedRows:(await this.repository.db.prepare('SELECT COUNT(*) count FROM knowledge_dependencies WHERE app_id=? AND child_id=? AND invalidated_at IS NULL').bind(fact.appId,item.id).first<{count:number}>())!.count});
  for(const item of descendants.results){const row=await this.repository.db.prepare('SELECT data_json FROM intelligence_strategies WHERE id=? AND app_id=?').bind(item.id,fact.appId).first<{data_json:string}>();if(row){const strategy=JSON.parse(row.data_json) as Strategy;mutations.push(this.repository.mutation('strategies',{...strategy,state:'stale',version:strategy.version+1,updatedAt:ctx.now,branches:strategy.branches.map(b=>({...b,invalidated:true}))},strategy.version));}}
  const guard=previousVersion===null?trustedPredicate('NOT EXISTS(SELECT 1 FROM knowledge_fact_revisions WHERE id=?)',[fact.id]):trustedPredicate('(SELECT MAX(version) FROM knowledge_fact_revisions WHERE id=? AND app_id=?)=?',[fact.id,fact.appId,previousVersion]);
  await this.repository.admission.commit(ctx,{commandId,action,appId:fact.appId,canonicalInputHash:inputHash,permit,guards:[guard],mutations:[...mutations,...newEdges],audit:[{action,subject:fact.subject,changes:[],sourceIds:fact.sourceVersions.map(x=>x.id),personalContentRefs:[fact.id]}],events:[{name:'knowledge.invalidated',version:1,subject:fact.subject,payload:{factId:fact.id,dependentIds:descendants.results.map(x=>x.id)},causeRunIds:[]}],outbox:[],committedResult:fact});return fact;
 
 });
 }
 async correct(ctx:RequestContext,commandId:string,id:string,expectedVersion:number,input:Parameters<typeof correctFact>[1]){
 return this.repository.command(ctx,commandId,'fact.correct',{id,expectedVersion,input},{factId:id},async ctx=>{
const row=await this.repository.db.prepare('SELECT data_json FROM knowledge_fact_revisions WHERE id=? ORDER BY version DESC LIMIT 1').bind(id).first<{data_json:string}>();if(!row)throw new Error('not_found');const original=JSON.parse(row.data_json) as TemporalFact;if(original.version!==expectedVersion)throw new Error('version_conflict');return this.append(ctx,commandId,correctFact(original,{...input,actorKind:ctx.principal.kind}),original.version);
 });
 }
 async invalidate(ctx:RequestContext,commandId:string,appId:string,changedIds:string[]){
 return this.repository.command(ctx,commandId,'knowledge.invalidate',{appId,changedIds},{appId},async ctx=>{

  if(!changedIds.length)throw new Error('changed_dependencies_required');const affected=new Set<string>();
  for(const id of changedIds){const rows=await this.repository.db.prepare('WITH RECURSIVE affected(id) AS (SELECT ? UNION SELECT k.child_id FROM knowledge_dependencies k JOIN affected a ON k.parent_id=a.id WHERE k.app_id=?) SELECT id FROM affected').bind(id,appId).all<{id:string}>();rows.results.forEach(x=>affected.add(x.id));}
  const mutations:SqlMutation[]=[];
  for(const id of affected){for(const collection of ['strategies','procedures'] as const){const table=collection==='strategies'?'intelligence_strategies':'knowledge_procedures';const row=await this.repository.db.prepare(`SELECT data_json FROM ${table} WHERE id=? AND app_id=?`).bind(id,appId).first<{data_json:string}>();if(row){const value=JSON.parse(row.data_json) as Stored;mutations.push(this.repository.mutation(collection,{...value,state:collection==='strategies'?'stale':'invalidated',version:value.version+1,updatedAt:ctx.now},value.version));}}}
  const action='knowledge.invalidate',inputHash=boundIdentity(ctx,commandId)?.canonicalInputHash??await digest({appId,changedIds}),permit=await this.repository.policy.authorize(ctx,{appId,action,expected:[],cost:[],inputHash,commandId});
  await this.repository.admission.commit(ctx,{commandId,action,appId,canonicalInputHash:inputHash,permit,guards:[],mutations,audit:[{action,subject:null,changes:[],sourceIds:changedIds.filter(x=>x.startsWith('source:')).map(x=>x.slice(7)),personalContentRefs:[]}],events:[],outbox:[],committedResult:{invalidatedIds:[...affected]}});return{invalidatedIds:[...affected]};
 
 });
 }
 async retainProcedure(ctx:RequestContext,commandId:string,strategyId:string,input:{title:string;assumptions:Record<string,string>}){
 return this.repository.command(ctx,commandId,'procedure.retain',{strategyId,input},{collection:'strategies',id:strategyId},async ctx=>{

  const strategy=await this.repository.read<Strategy>(ctx,'strategies',strategyId);if(strategy.state!=='checked'||!input.title.trim())throw new Error('checked_strategy_required');
  const procedure:Procedure&Stored&{sourceVersions:Strategy['sourceVersions'];strategyId:string}={id:createUlid(),appId:strategy.appId,ownerId:strategy.ownerId,version:1,createdAt:ctx.now,updatedAt:ctx.now,state:'candidate',privateToOwner:true,sourceVersions:strategy.sourceVersions,strategyId:strategy.id,title:input.title,sourceHash:strategy.optimizerArtifactId,checkerVersion:strategy.checkerArtifactId,assumptions:input.assumptions,evaluationIds:[],reusedBy:[]};
  const edge:SqlMutation={kind:'insert',table:dependencies,row:{id:createUlid(),app_id:strategy.appId,parent_id:strategyId,child_id:procedure.id,invalidated_at:null}};
  await this.repository.save(ctx,commandId,'procedure.retain','procedures',procedure,null,[],[edge]);return procedure;
 
 });
 }
 async evaluateProcedure(ctx:RequestContext,commandId:string,id:string,datasetId:string){
 return this.repository.command(ctx,commandId,'procedure.evaluate',{id,datasetId},{collection:'procedures',id},async ctx=>{
if(!this.evaluator)throw new ApiError('unconfigured','independent_procedure_evaluator_unconfigured');const p=await this.repository.read<Procedure&Stored>(ctx,'procedures',id);const evaluation=await this.evaluator.evaluate(ctx,p,datasetId);const next={...verifyProcedure(p,evaluation),appId:p.appId,createdAt:p.createdAt,updatedAt:ctx.now};await this.repository.save(ctx,commandId,'procedure.evaluate','procedures',next,p.version);return next;
 });
 }
 async runProcedure(ctx:RequestContext,commandId:string,id:string,input:{snapshotId:string;assumptions:Record<string,string>}){
 return this.repository.command(ctx,commandId,'procedure.run',{id,input},{collection:'procedures',id},async ctx=>{

  if(!this.runner)throw new ApiError('unconfigured','procedure_runner_unconfigured');
  const p=await this.repository.read<Procedure&Stored>(ctx,'procedures',id),row=await this.repository.read<StoredSnapshot>(ctx,'snapshots',input.snapshotId),snapshot=await validateSnapshot(row.snapshot);
  const reuse=reuseProcedure(p,{ownerId:snapshot.ownerId,sourceHash:p.sourceHash,checkerVersion:'portfolio-checker/1',assumptions:input.assumptions,caseId:commandId});if(reuse.state!=='reused')throw new ApiError('evaluation_failed','Changed procedure assumptions require independent reevaluation.');
  const historical=snapshot.provenance==='authorized_historical';const output=await this.runner.runStored(ctx,p.sourceHash,snapshot),check=checkPortfolio(snapshot,output.candidate,historical?currentAtSnapshot(snapshot):await this.sources.current(ctx,snapshot));const authority=historical?{issues:[],guards:[]}:await this.sources.checkAuthority(ctx,snapshot,output.candidate.selectedIds);check.issues.push(...authority.issues);if(authority.issues.length)check.state='infeasible';
  const result={id:commandId,appId:p.appId,ownerId:p.ownerId,version:1,state:check.state,createdAt:ctx.now,updatedAt:ctx.now,kind:'procedure_run',procedureId:p.id,procedureVersion:p.version,snapshotId:snapshot.id,sourceHash:p.sourceHash,checkerVersion:p.checkerVersion,candidate:output.candidate,check,artifactHash:output.artifactHash};
  await this.repository.save(ctx,commandId,'procedure.run','explorations',result,null,[...await this.sources.guards(ctx,snapshot),...authority.guards],[this.repository.mutation('procedures',{...reuse.procedure,appId:p.appId,createdAt:p.createdAt,updatedAt:ctx.now},p.version)]);return result;
 
 });
 }
 async reuse(ctx:RequestContext,commandId:string,id:string,input:Parameters<typeof reuseProcedure>[1]){
 return this.repository.command(ctx,commandId,'procedure.reuse',{id,input},{collection:'procedures',id},async ctx=>{
const p=await this.repository.read<Procedure&Stored>(ctx,'procedures',id);const result=reuseProcedure(p,input);const plan=await this.repository.plan(ctx,commandId,'procedure.reuse','procedures',{...result.procedure,appId:p.appId,createdAt:p.createdAt,updatedAt:ctx.now},p.version);await this.repository.admission.commit(ctx,{...plan,committedResult:result});return result;
 });
 }
}
