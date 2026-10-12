import { createUlid } from '../../core/shared/ids';
import type { RequestContext } from '../authority/ports';
import type { CandidateDetail,Evaluation } from './contracts';
import type { IndependentEvaluationPort } from './ports';
import { RunnerClient,type ArtifactReference } from './runner-client.server';
import { digest,canonical,stableId } from './source';
export type SealedEvaluationSet={id:string;appId:string;mode:Evaluation['mode'];sha256:string;sealedAt:string;producerExcluded:boolean;evaluatorId:string;checker:ArtifactReference;inputs:ArtifactReference;eligible:number;scorecardId:string};
export interface EvaluationDatasetPort {
 get(ctx:RequestContext,id:string):Promise<SealedEvaluationSet>;
 candidateSource(ctx:RequestContext,candidate:CandidateDetail):Promise<ArtifactReference>;
 checkerInput(ctx:RequestContext,dataset:SealedEvaluationSet,candidateOutput:{sha256:string;bytes:Uint8Array}):Promise<ArtifactReference>;
 record(ctx:RequestContext,evaluation:Evaluation,attestations:string[]):Promise<void>;
 verify(ctx:RequestContext,evaluation:Evaluation):Promise<void>;
 adoptionGuards(ctx:RequestContext,evaluation:Evaluation):Promise<import('../admission/ports').SqlPredicate[]>;
}
export class SourceEvaluator implements IndependentEvaluationPort {
 constructor(readonly runner:RunnerClient,readonly datasets:EvaluationDatasetPort){}
 async evaluate(ctx:RequestContext,input:{candidate:CandidateDetail;datasetId:string;mode:Evaluation['mode']}):Promise<Evaluation>{
  const dataset=await this.datasets.get(ctx,input.datasetId),candidate=input.candidate;
  if(dataset.appId!==candidate.candidate.appId||dataset.mode!==input.mode||!dataset.producerExcluded||dataset.evaluatorId===candidate.source.producerId||dataset.eligible<1)throw new Error('dataset_not_independent');
  if(input.mode==='held_out'&&dataset.sealedAt>candidate.source.createdAt)throw new Error('held_out_not_presealed');
  const source=await this.datasets.candidateSource(ctx,candidate);if(source.sha256!==candidate.source.sha256)throw new Error('evaluation_source_mismatch');
  const evaluationId=await stableId({requestId:ctx.requestId,candidateId:candidate.candidate.id,datasetId:dataset.id,mode:input.mode}),limits={cpuSeconds:60,memoryBytes:268435456,wallSeconds:120};
  const run=await this.runner.execute({jobId:`eval-${evaluationId}`,kind:'evaluate',sourceArtifact:source,inputArtifact:dataset.inputs,networkAllowlist:[],limits,outputSchemaHash:await digest('cradle.candidate-outputs.v1')});
  const output=run.payload.artifacts[0];if(!output)throw new Error('candidate_outputs_missing');
  const checkerInput=await this.datasets.checkerInput(ctx,dataset,{sha256:output.sha256,bytes:await this.runner.artifact(output.sha256)});
  const checked=await this.runner.execute({jobId:`check-${evaluationId}`,kind:'evaluate',sourceArtifact:dataset.checker,inputArtifact:checkerInput,networkAllowlist:[],limits,outputSchemaHash:await digest('cradle.independent-check.v1')});
  const checkArtifact=checked.payload.artifacts[0];if(!checkArtifact)throw new Error('checker_output_missing');
  const bundle=JSON.parse(new TextDecoder().decode(await this.runner.artifact(checkArtifact.sha256))) as {files:{path:string;content:string}[]};
  const file=bundle.files.find(f=>f.path==='evaluation.json');if(!file)throw new Error('independent_result_missing');
  const result=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content),c=>c.charCodeAt(0)))) as {eligible:number;evaluated:number;passed:number;skipped:{reason:string;count:number}[]};
  if(result.eligible!==dataset.eligible||![result.eligible,result.evaluated,result.passed].every(Number.isSafeInteger)||result.passed<0||result.evaluated<result.passed||result.evaluated>result.eligible||!Array.isArray(result.skipped))throw new Error('invalid_independent_result');
  const state=result.evaluated!==result.eligible||result.skipped.length?'inconclusive':result.passed===result.evaluated?'passed':'failed';
  const evaluation:Evaluation={id:evaluationId,version:1,createdAt:ctx.now,updatedAt:ctx.now,candidateId:candidate.candidate.id,mode:input.mode,datasetId:dataset.id,evaluatorId:dataset.evaluatorId,state,eligible:result.eligible,evaluated:result.evaluated,passed:result.passed,skipped:result.skipped,artifactIds:[output.id,checkArtifact.id],scorecardId:dataset.scorecardId,producerCanGrade:false,sourceHash:candidate.source.sha256,datasetHash:dataset.sha256,checkerHash:dataset.checker.sha256,sealedBeforeGeneration:dataset.sealedAt<=candidate.source.createdAt};
  await this.datasets.record(ctx,evaluation,[canonical(run),canonical(checked)]);return evaluation;
 }
 adoptionGuards(ctx:RequestContext,evaluation:Evaluation){return this.datasets.adoptionGuards(ctx,evaluation);}
 verify(ctx:RequestContext,evaluation:Evaluation){return this.datasets.verify(ctx,evaluation);}
}
