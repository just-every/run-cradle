import {createUlid} from '../../core/shared/ids';
import type { RequestContext } from '../authority/ports';
import type { Procedure, ProcedureEvaluation } from './procedures';
import type { Snapshot } from '../intelligence/contracts';
import type { IsolatedOptimizer } from '../intelligence/runner.server';
import { validateSnapshot } from '../intelligence/grounding';
import { checkPortfolio, currentAtSnapshot } from '../intelligence/checker';
import { exactOracle } from '../intelligence/oracle';
import { cmp, q } from '../intelligence/exact';
export interface ProcedureDatasetPort {load(ctx:RequestContext,id:string,ownerId:string):Promise<{id:string;producerId:string;evaluatorId:string;sealedAt:string;generatedAt:string;assumptions:Record<string,string>;snapshots:Snapshot[]}>}
export interface ProcedureEvaluationPort {evaluate(ctx:RequestContext,procedure:Procedure,datasetId:string):Promise<ProcedureEvaluation>}
/** Deterministic evaluator executes source but judges using a distinct checker and exact oracle. */
export class CheckedProcedureEvaluator implements ProcedureEvaluationPort {
 constructor(readonly datasets:ProcedureDatasetPort,readonly optimizer:IsolatedOptimizer){}
 async evaluate(ctx:RequestContext,p:Procedure,datasetId:string):Promise<ProcedureEvaluation>{
  const dataset=await this.datasets.load(ctx,datasetId,p.ownerId);
  if(!Number.isFinite(Date.parse(dataset.sealedAt))||!Number.isFinite(Date.parse(dataset.generatedAt))||dataset.evaluatorId===dataset.producerId||Date.parse(dataset.sealedAt)>=Date.parse(dataset.generatedAt)||!dataset.snapshots.length)throw new Error('independent_sealed_dataset_required');
  let passed=0;const failures:string[]=[];
  for(const raw of dataset.snapshots){try{const s=await validateSnapshot(raw);if(s.ownerId!==p.ownerId)throw new Error('owner_mismatch');const result=await this.optimizer.runStored(ctx,p.sourceHash,s),check=checkPortfolio(s,result.candidate,currentAtSnapshot(s)),oracle=exactOracle(s);if(check.state!=='checked'||oracle.kind!=='exact'||oracle.objective===null||cmp(q(check.objective),q(oracle.objective))!==0)throw new Error('independent_quality_check');passed++;}catch(error){failures.push(`${raw.id}: ${error instanceof Error?error.message:'evaluation_failed'}`);}}
  return{id:createUlid(),producerId:dataset.producerId,evaluatorId:dataset.evaluatorId,sourceHash:p.sourceHash,checkerVersion:'portfolio-checker/1',evaluationVersion:'exact-procedure-evaluation/1',heldOut:true,eligible:dataset.snapshots.length,passed,failures,assumptions:dataset.assumptions};
 }
}
