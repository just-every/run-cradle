import type { RequestContext } from '../authority/ports';
import type { CandidateDetail,AdoptionReview } from '../construction/contracts';
import { candidateEntityId } from '../construction/contracts';
import type { ReleaseReviewPort } from './ports';
import type { ConstructionRepository } from '../construction/repository.server';
import { assertEvaluationFloor } from './guards';
export interface ReleaseChoicePort { choices(ctx:RequestContext,candidate:CandidateDetail):Promise<AdoptionReview['choices']>; fieldLabel(ctx:RequestContext,appId:string,fieldId:string):Promise<string|null> }
export class ReleaseReview implements ReleaseReviewPort {
 constructor(readonly candidates:ConstructionRepository,readonly authority:ReleaseChoicePort){}
 async review(ctx:RequestContext,detail:CandidateDetail):Promise<AdoptionReview>{
  const blockers:string[]=[],fieldLabels:Record<string,string>={};
  try{assertEvaluationFloor(detail,await this.candidates.evaluations(ctx,detail.candidate.id));}catch{blockers.push('Complete independent historical, sealed held-out and shadow checks are required.');}
  const file=detail.source.files.find(f=>f.path==='cradle-schema.json');
  if(file){const value=JSON.parse(file.content) as {entities?:{fields?:{id:string;label:string}[]}[]};for(const entity of value.entities??[])for(const field of entity.fields??[])if(typeof field.id==='string'&&typeof field.label==='string'&&field.label.trim())fieldLabels[field.id]=field.label;}
  for(const flow of detail.candidate.impact.egress)for(const fieldId of flow.fields){if(!fieldLabels[fieldId]){const label=await this.authority.fieldLabel(ctx,detail.candidate.appId!,fieldId);if(label)fieldLabels[fieldId]=label;else blockers.push('An exact named field scope is missing from the egress review.');}}
  const choices=await this.authority.choices(ctx,detail);if(!choices.length)blockers.push('A human release decision or applicable previously issued release grant is required.');
  if(['failed','rejected','adopted'].includes(detail.candidate.state))blockers.push('This candidate is not available for adoption.');
  return{candidateId:detail.candidate.id,expected:{ref:{appId:detail.candidate.appId!,entityId:candidateEntityId,recordId:detail.candidate.id},version:detail.candidate.version},sourceHash:detail.source.sha256,parentReleaseId:detail.candidate.parentReleaseId,fieldLabels,choices,allowed:blockers.length===0,blockers};
 }
}
