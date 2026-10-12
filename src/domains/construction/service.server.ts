import { createUlid } from '../../core/shared/ids';
import type { RequestContext } from '../authority/ports';
import { candidateEntityId } from './contracts';
import type { CandidatePrepare, CandidateRevise, CandidateDetail, Evaluation } from './contracts';
import type { ConstructionModelPort, ConstructionSourcesPort, ConstructionBuildPort, IndependentEvaluationPort } from './ports';
import { sourceGenerationContract } from './ports';
import { ConstructionRepository } from './repository.server';
import { bundle, canonical, digest, stableId, mergeSources, validateAppSource } from './source';
export class ConstructionService {
  constructor(readonly repository:ConstructionRepository, readonly sources:ConstructionSourcesPort, readonly model:ConstructionModelPort, readonly builder:ConstructionBuildPort, readonly evaluator:IndependentEvaluationPort) {}
  async prepare(ctx:RequestContext,commandId:string,input:CandidatePrepare) {
    if (!input.appId || !input.brief.trim() || input.brief.length>32000 || input.sourceIds.length>100) throw new Error('invalid_candidate_brief');
    const requestHash=await digest(canonical(input)),replay=await this.repository.admission.replay<import('./contracts').Candidate>(ctx,commandId,'candidate.prepare',input.appId,requestHash);if(replay?.result.state==='committed')return replay.result.value;
    await this.repository.policy.authorize(ctx,{appId:input.appId,action:'candidate.prepare',expected:[],targetEntityId:candidateEntityId,cost:[],inputHash:await digest(canonical(input)),commandId});
    const materials=await this.sources.context(ctx,input.appId,input.sourceIds,'application_construction');
    const current=await this.sources.current(ctx,input.appId);
    const generated=await this.model.generate(ctx,{appId:input.appId,instruction:input.brief,materials,current,baseline:current,proposed:null,contract:sourceGenerationContract},validateAppSource);
    const source={id:await stableId({commandId,kind:"source"}),appId:input.appId,sha256:await digest(bundle(generated.value.files)),files:generated.value.files,parentId:current?.id??null,producerId:generated.producerId,createdAt:ctx.now};
    await this.sources.persist(ctx,source);
    const candidate:CandidateDetail={ownerBaselineSnapshotId:current?.id??null,candidate:{id:await stableId({commandId,kind:'candidate'}),version:1,createdAt:ctx.now,updatedAt:ctx.now,appId:input.appId,brief:input.brief,parentReleaseId:input.parentReleaseId,sourceSnapshotId:source.id,sourceHash:source.sha256,state:'preparing',previewUrl:null,diff:generated.value.diff,impact:generated.value.impact,evaluationIds:[],recoveryPlanId:generated.value.recoveryPlanId,failure:null},source,generated:generated.value,build:null};
    await this.repository.save(ctx,commandId,'candidate.prepare',candidate,null,requestHash);
    return candidate.candidate;
  }
  async revise(ctx:RequestContext,commandId:string,input:CandidateRevise) {
    const detail=await this.repository.get(ctx,input.candidateId);
    const requestHash=await digest(canonical(input)),replay=await this.repository.admission.replay<import('./contracts').Candidate>(ctx,commandId,'candidate.revise',detail.candidate.appId!,requestHash);if(replay?.result.state==='committed')return replay.result.value;
    if (['adopted','rejected'].includes(detail.candidate.state)) throw new Error('terminal_candidate');
    const current=await this.sources.snapshot(ctx,input.sourceSnapshotId),head=await this.sources.current(ctx,detail.candidate.appId!);
    const ownerCurrent=head?.id===current.id;
    const baseline=ownerCurrent&&detail.ownerBaselineSnapshotId?await this.sources.snapshot(ctx,detail.ownerBaselineSnapshotId):detail.source;
    if (current.appId!==detail.candidate.appId) throw new Error('source_app_mismatch');
    let ancestor=current,depth=0;while(ancestor.id!==baseline.id&&ancestor.parentId&&depth++<256){ancestor=await this.sources.snapshot(ctx,ancestor.parentId);if(ancestor.appId!==current.appId)throw new Error('source_custody_conflict');}
    if(ancestor.id!==baseline.id)throw new Error('source_custody_conflict');
    const materials=await this.sources.context(ctx,detail.candidate.appId!,[],'application_rule_correction');
    const generated=await this.model.generate(ctx,{appId:detail.candidate.appId!,instruction:input.instruction,materials,current,baseline,proposed:detail.source,contract:sourceGenerationContract},validateAppSource);
    const merged=mergeSources(baseline.files,current.files,generated.value.files);
    if (merged.conflicts.length) return {state:'conflict' as const,conflicts:merged.conflicts,sourceSnapshotId:current.id};
    const source={id:await stableId({commandId,kind:"source"}),appId:detail.candidate.appId!,sha256:await digest(bundle(merged.files)),files:merged.files,parentId:current.id,producerId:generated.producerId,createdAt:ctx.now};
    await this.sources.persist(ctx,source);
    const next={...detail,ownerBaselineSnapshotId:ownerCurrent?current.id:detail.ownerBaselineSnapshotId,source,generated:{...generated.value,files:merged.files},build:null,candidate:{...detail.candidate,version:detail.candidate.version+1,updatedAt:ctx.now,sourceSnapshotId:source.id,sourceHash:source.sha256,state:'preparing' as const,previewUrl:null,evaluationIds:[],diff:generated.value.diff,impact:generated.value.impact,recoveryPlanId:generated.value.recoveryPlanId}};
    await this.repository.save(ctx,commandId,'candidate.revise',next,detail.candidate.version,requestHash); return next.candidate;
  }
  async build(ctx:RequestContext,commandId:string,id:string) {
    const detail=await this.repository.get(ctx,id);
    const requestHash=await digest(canonical({id})),replay=await this.repository.admission.replay<import('./contracts').Candidate>(ctx,commandId,'candidate.build',detail.candidate.appId!,requestHash);if(replay?.result.state==='committed')return replay.result.value;
    if (!['preparing','building','failed'].includes(detail.candidate.state)) throw new Error('invalid_transition');
    let result:import('./contracts').BuildResult;
    try{result=await this.builder.build(ctx,detail);await this.builder.verify(ctx,result);}
    catch(error){const failure={...detail,candidate:{...detail.candidate,version:detail.candidate.version+1,updatedAt:ctx.now,state:'failed' as const,previewUrl:null,failure:{requestId:ctx.requestId,operation:'candidate.build',code:'evaluation_failed' as const,message:'The isolated source build failed. Inspect the authorized runner job evidence.',retry:'after_change' as const}}};await this.repository.save(ctx,commandId,'candidate.build',failure,detail.candidate.version,requestHash);throw error;}

    if(result.sourceHash!==detail.source.sha256) throw new Error('build_source_mismatch');
    const next={...detail,build:result,candidate:{...detail.candidate,version:detail.candidate.version+1,updatedAt:ctx.now,state:result.state==='succeeded'?'preview_ready' as const:'failed' as const,previewUrl:result.state==='succeeded'?result.previewUrl:null}};
    await this.repository.save(ctx,commandId,'candidate.build',next,detail.candidate.version,requestHash); return next.candidate;
  }
  async evaluate(ctx:RequestContext,commandId:string,id:string,datasetId:string,mode:Evaluation['mode']) {
    const detail=await this.repository.get(ctx,id);const requestHash=await digest(canonical({id,datasetId,mode})),replay=await this.repository.admission.replay<Evaluation>(ctx,commandId,'candidate.evaluate',detail.candidate.appId!,requestHash);if(replay?.result.state==='committed')return replay.result.value; if(detail.build?.state!=='succeeded') throw new Error('candidate_not_built');
    const result=await this.evaluator.evaluate(ctx,{candidate:detail,datasetId,mode});
    await this.evaluator.verify(ctx,result);
    if(result.evaluatorId===detail.source.producerId || result.producerCanGrade!==false || result.sourceHash!==detail.source.sha256 || (mode==='held_out'&&!result.sealedBeforeGeneration)) throw new Error('evaluation_not_independent');
    await this.repository.addEvaluation(ctx,commandId,result,requestHash); return result;
  }
  async reject(ctx:RequestContext,commandId:string,id:string,reason:string) {
    if (!reason.trim()) throw new Error('reason_required'); const detail=await this.repository.get(ctx,id);
    const requestHash=await digest(canonical({id,reason})),replay=await this.repository.admission.replay<import('./contracts').Candidate>(ctx,commandId,'candidate.reject',detail.candidate.appId!,requestHash);if(replay?.result.state==='committed')return replay.result.value;
    if(detail.candidate.state==='adopted') throw new Error('already_adopted');
    const next={...detail,candidate:{...detail.candidate,version:detail.candidate.version+1,updatedAt:ctx.now,state:'rejected' as const}};
    await this.repository.save(ctx,commandId,'candidate.reject',next,detail.candidate.version,requestHash); return next.candidate;
  }
}
