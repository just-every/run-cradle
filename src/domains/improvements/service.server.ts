import { createUlid } from '../../core/shared/ids';
import type { RequestContext,PolicyPort } from '../authority/ports';
import type { AdmissionPort } from '../admission/ports';
import { registerTable,trustedPredicate } from '../admission/sql.server';
import { canonical,digest,stableId } from '../construction/source';
import type { ConstructionService } from '../construction/service.server';
import type { ReleaseService } from '../releases/service.server';
import type { Improvement,ImprovementScorecard } from './contracts';
import { assessScorecard } from './measurement';
export interface ImprovementEvidencePort {
 cohort(ctx:RequestContext,id:string):Promise<{appId:string;evidenceIds:string[];baseline:ImprovementScorecard;qualityFloor:Improvement['qualityFloor']}>;
 investigate(ctx:RequestContext,cohortId:string,question:string):Promise<{hypothesis:string;alternativeCauses:string[];investigation:Improvement['investigation'];impact:Improvement['impact'];candidateBrief:string;sourceIds:string[];parentReleaseId:string|null}>;
 scorecard(ctx:RequestContext,cohortId:string,window:Improvement['measurementWindow']):Promise<ImprovementScorecard>;
 stopAdmissions(ctx:RequestContext,releaseId:string,reason:string):Promise<void>;
 recoveryAuthorization(ctx:RequestContext,releaseId:string,reasons:string[]):Promise<{decisionId:string|null;grantId:string|null}|null>;
 prepareRecoveryDecision(ctx:RequestContext,releaseId:string,reasons:string[]):Promise<void>;
}
const table=registerTable('app_improvements',['id','app_id','version','state','cohort_id','detail_json','created_at','updated_at']);
export class ImprovementService {
 constructor(readonly db:D1Database,readonly policy:PolicyPort,readonly admission:AdmissionPort,readonly evidence:ImprovementEvidencePort,readonly construction:ConstructionService,readonly releases:ReleaseService){}
 async get(ctx:RequestContext,id:string):Promise<Improvement>{const row=await this.db.prepare('SELECT app_id,detail_json FROM app_improvements WHERE id=?').bind(id).first<{app_id:string;detail_json:string}>();if(!row)throw new Error('not_found');await this.policy.authorize(ctx,{appId:row.app_id,action:'improvement.read',expected:[],cost:[],inputHash:await digest(id)});return JSON.parse(row.detail_json);}
 async save(ctx:RequestContext,commandId:string,action:string,value:Improvement,previous:number|null,requestHash?:string){
  const inputHash=requestHash??await digest(canonical(value));const permit=await this.policy.authorize(ctx,{appId:value.appId,action,expected:[],cost:[],inputHash,commandId});
  const row={id:value.id,app_id:value.appId,version:value.version,state:value.state,cohort_id:value.cohortId,detail_json:canonical(value),created_at:value.createdAt,updated_at:value.updatedAt};
  return this.admission.commit(ctx,{commandId,action,appId:value.appId,canonicalInputHash:inputHash,permit,guards:[],mutations:[previous===null?{kind:'insert',table,row}:{kind:'update',table,set:row,where:trustedPredicate('id=? AND version=?',[value.id,previous]),expectedRows:1}],audit:[{action,subject:null,changes:[],sourceIds:value.evidenceIds,personalContentRefs:[]}],events:[],outbox:[],committedResult:value});
 }
 async investigate(ctx:RequestContext,commandId:string,input:{cohortId:string;question:string}){
  const cohort=await this.evidence.cohort(ctx,input.cohortId);if(!cohort.evidenceIds.length||cohort.baseline.eligible<=0)throw new Error('insufficient_cohort');
  const requestHash=await digest(canonical(input)),replay=await this.admission.replay<Improvement>(ctx,commandId,'improvement.investigate',cohort.appId,requestHash);if(replay?.result.state==='committed')return replay.result.value;
  const investigation=await this.evidence.investigate(ctx,input.cohortId,input.question);
  if(!investigation.alternativeCauses.length||!investigation.investigation.retrievalChecked||!investigation.investigation.contextChecked||!investigation.investigation.instructionsChecked)throw new Error('investigate_existing_context_first');
  const improvement:Improvement={id:await stableId({commandId,kind:"improvement"}),version:1,createdAt:ctx.now,updatedAt:ctx.now,appId:cohort.appId,cohortId:input.cohortId,hypothesis:investigation.hypothesis,alternativeCauses:investigation.alternativeCauses,evidenceIds:cohort.evidenceIds,state:'investigating',candidateId:null,baselineScorecardId:cohort.baseline.id,evaluationIds:[],releaseId:null,measurementWindow:cohort.baseline.window,impact:investigation.impact,investigation:investigation.investigation,qualityFloor:cohort.qualityFloor};
  await this.save(ctx,await stableId({commandId,kind:'investigation-stage'}),'improvement.investigate',improvement,null);
  // Concrete source generation uses the same evaluated construction path, never a process-only success label.
  const candidate=await this.construction.prepare({...ctx,requestId:await stableId({commandId,kind:"candidate-model"})},await stableId({commandId,kind:"candidate"}),{appId:cohort.appId,brief:investigation.candidateBrief,sourceIds:investigation.sourceIds,parentReleaseId:investigation.parentReleaseId});
  const next={...improvement,version:2,state:'candidate' as const,candidateId:candidate.id};await this.save(ctx,commandId,'improvement.investigate',next,1,requestHash);return next;
 }
 async evaluate(ctx:RequestContext,commandId:string,input:{improvementId:string;candidateId:string;datasets:{id:string;mode:'historical'|'held_out'|'shadow'}[]}){
  const current=await this.get(ctx,input.improvementId);const requestHash=await digest(canonical(input)),replay=await this.admission.replay<Improvement>(ctx,commandId,'improvement.evaluate',current.appId,requestHash);if(replay?.result.state==='committed')return replay.result.value;if(current.candidateId!==input.candidateId)throw new Error('candidate_mismatch');
  for(const mode of ['historical','held_out','shadow'])if(!input.datasets.some(d=>d.mode===mode))throw new Error(`missing_${mode}`);
  const evaluations=[];for(const dataset of input.datasets)evaluations.push(await this.construction.evaluate(ctx,await stableId({commandId,dataset,kind:"evaluation"}),input.candidateId,dataset.id,dataset.mode));
  const next={...current,version:current.version+1,updatedAt:ctx.now,state:evaluations.every(e=>e.state==='passed')?'ready' as const:'inconclusive' as const,evaluationIds:evaluations.map(e=>e.id)};
  await this.save(ctx,commandId,'improvement.evaluate',next,current.version,requestHash);return next;
 }
 async decide(ctx:RequestContext,commandId:string,input:{improvementId:string;outcome:'adopt'|'keep_current'|'change_rule';reason:string;decisionId:string|null;releaseGrantId:string|null}){
  const current=await this.get(ctx,input.improvementId);const requestHash=await digest(canonical(input)),replay=await this.admission.replay<Improvement>(ctx,commandId,'improvement.decide',current.appId,requestHash);if(replay?.result.state==='committed')return replay.result.value;if(!input.reason.trim())throw new Error('reason_required');
  if(input.outcome!=='adopt'){const next={...current,version:current.version+1,updatedAt:ctx.now,state:input.outcome==='keep_current'?'rejected' as const:'investigating' as const};await this.save(ctx,commandId,'improvement.decide',next,current.version,requestHash);return next;}
  if(current.state!=='ready'||!current.candidateId)throw new Error('improvement_not_evaluated');
  const detail=await this.construction.repository.get(ctx,current.candidateId);
  const adopted=await this.releases.adopt(ctx,await stableId({commandId,kind:"adoption"}),{candidateId:current.candidateId,decisionId:input.decisionId,releaseGrantId:input.releaseGrantId,expectedLiveReleaseId:detail.candidate.parentReleaseId});
  if(adopted.result.state!=='committed')throw new Error('release_not_committed');
  const next={...current,version:current.version+1,updatedAt:ctx.now,state:'adopted' as const,releaseId:adopted.result.value.id};await this.save(ctx,commandId,'improvement.decide',next,current.version,requestHash);return next;
 }
 async measure(ctx:RequestContext,commandId:string,id:string,window:Improvement['measurementWindow']){
  const current=await this.get(ctx,id);if(!current.releaseId||!['adopted','inconclusive'].includes(current.state))throw new Error('improvement_not_live');
  const score=await this.evidence.scorecard(ctx,current.cohortId,window);if(score.mode!=='live'||!score.releaseIds.includes(current.releaseId))throw new Error('measurement_release_mismatch');
  const assessment=assessScorecard(score,current.qualityFloor);
  let recovered=false;
  if(assessment.state==='regressed'){
   await this.evidence.stopAdmissions(ctx,current.releaseId,assessment.reasons.join('; '));
   const authorization=await this.evidence.recoveryAuthorization(ctx,current.releaseId,assessment.reasons);
   if(authorization){const release=await this.releases.get(ctx,current.releaseId);await this.releases.recover(ctx,await stableId({commandId,kind:"recovery"}),{releaseId:release.id,recoveryPlanId:release.recoveryPlanId,reason:assessment.reasons.join('; '),...authorization});recovered=true;}
   else await this.evidence.prepareRecoveryDecision(ctx,current.releaseId,assessment.reasons);
  }
  const next={...current,version:current.version+1,updatedAt:ctx.now,measurementWindow:window,state:recovered?'recovered' as const:assessment.state==='regressed'?'regressed' as const:assessment.state==='inconclusive'?'inconclusive' as const:'adopted' as const};await this.save(ctx,commandId,'improvement.measure',next,current.version);return{improvement:next,scorecard:score,assessment};
 }
}
