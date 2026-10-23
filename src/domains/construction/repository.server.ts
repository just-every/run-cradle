import type { RequestContext, PolicyPort } from '../authority/ports';
import type { AdmissionPort, SqlMutation } from '../admission/ports';
import { registerTable, trustedPredicate } from '../admission/sql.server';
import { canonical, digest } from './source';
import { candidateEntityId } from './contracts';
import { ApiError } from '../../core/registry/errors';
import type { CandidateDetail, Evaluation } from './contracts';
export const candidateTable = registerTable('construction_candidates',['id','app_id','version','state','source_hash','parent_release_id','detail_json','created_at','updated_at']);
export const evaluationTable = registerTable('construction_evaluations',['id','candidate_id','app_id','source_hash','state','detail_json','created_at']);
export class ConstructionRepository {
  constructor(readonly db: D1Database, readonly policy: PolicyPort, readonly admission: AdmissionPort) {}
  async get(ctx: RequestContext, id: string): Promise<CandidateDetail> {
    const row = await this.db.prepare('SELECT app_id,version,detail_json FROM construction_candidates WHERE id=?').bind(id).first<{app_id:string;version:number;detail_json:string}>();
    if (!row) throw new ApiError('not_found','Prepared operation not found.');
    await this.policy.authorize(ctx,{appId:row.app_id,action:'candidate.read',expected:[{ref:{appId:row.app_id,entityId:candidateEntityId,recordId:id},version:row.version}],cost:[],inputHash:await digest(id)});
    return JSON.parse(row.detail_json);
  }
  async save(ctx: RequestContext, commandId: string, action: string, value: CandidateDetail, expectedVersion: number | null, requestHash?: string) {
    const c=value.candidate, appId=c.appId; if (!appId) throw new Error('candidate_requires_app_scope');
    const inputHash=requestHash??await digest(canonical(value));
    const permit=await this.policy.authorize(ctx,{appId,action,expected:expectedVersion===null?[]:[{ref:{appId,entityId:candidateEntityId,recordId:c.id},version:expectedVersion}],targetEntityId:expectedVersion===null?candidateEntityId:undefined,cost:[],inputHash,commandId});
    const row={id:c.id,app_id:appId,version:c.version,state:c.state,source_hash:c.sourceHash,parent_release_id:c.parentReleaseId,detail_json:canonical(value),created_at:c.createdAt,updated_at:c.updatedAt};
    const mutation:SqlMutation=expectedVersion===null?{kind:'insert',table:candidateTable,row}:{kind:'update',table:candidateTable,set:row,where:trustedPredicate('id=? AND version=?',[c.id,expectedVersion]),expectedRows:1};
    return this.admission.commit(ctx,{commandId,action,appId,canonicalInputHash:inputHash,permit,guards:expectedVersion===null?[]:[trustedPredicate('EXISTS(SELECT 1 FROM construction_candidates WHERE id=? AND version=?)',[c.id,expectedVersion])],mutations:[mutation],audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[c.sourceSnapshotId]}],events:[],outbox:[],committedResult:c});
  }
  async evaluations(ctx:RequestContext,candidateId:string):Promise<Evaluation[]> { await this.get(ctx,candidateId); const rows=await this.db.prepare('SELECT detail_json FROM construction_evaluations WHERE candidate_id=?').bind(candidateId).all<{detail_json:string}>(); return rows.results.map(r=>JSON.parse(r.detail_json)); }
  async evaluation(ctx:RequestContext,id:string):Promise<Evaluation>{const row=await this.db.prepare('SELECT candidate_id,detail_json FROM construction_evaluations WHERE id=?').bind(id).first<{candidate_id:string;detail_json:string}>();if(!row)throw new ApiError('not_found','Evaluation not found.');await this.get(ctx,row.candidate_id);return JSON.parse(row.detail_json);}
  async addEvaluation(ctx:RequestContext,commandId:string,evaluation:Evaluation,requestHash?:string) {
    const detail=await this.get(ctx,evaluation.candidateId), appId=detail.candidate.appId!;
    if (evaluation.sourceHash!==detail.candidate.sourceHash) throw new Error('stale_evaluation');
    const action='candidate.evaluate', inputHash=requestHash??await digest(canonical(evaluation));
    const permit=await this.policy.authorize(ctx,{appId,action,expected:[{ref:{appId,entityId:candidateEntityId,recordId:detail.candidate.id},version:detail.candidate.version}],cost:[],inputHash,commandId});
    return this.admission.commit(ctx,{commandId,action,appId,canonicalInputHash:inputHash,permit,guards:[trustedPredicate('EXISTS(SELECT 1 FROM construction_candidates WHERE id=? AND source_hash=? AND version=?)',[evaluation.candidateId,evaluation.sourceHash,detail.candidate.version])],mutations:[{kind:'insert',table:evaluationTable,row:{id:evaluation.id,candidate_id:evaluation.candidateId,app_id:appId,source_hash:evaluation.sourceHash,state:evaluation.state,detail_json:canonical(evaluation),created_at:evaluation.createdAt}}],audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:evaluation});
  }
}
