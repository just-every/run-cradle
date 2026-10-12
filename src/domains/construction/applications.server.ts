import type { RequestContext,PolicyPort } from '../authority/ports';
import type { AdmissionPort,SqlMutation,SqlPredicate } from '../admission/ports';
import { registerTable } from '../admission/sql.server';
import { createUlid } from '../../core/shared/ids';
import { digest,canonical,stableId } from './source';
import { constructionJobTable } from './jobs.server';
import type { CandidatePrepare } from './contracts';
export interface PendingApplicationAuthority { prepare(ctx:RequestContext,input:{appId:string;newCandidateId:string;installationAppId:string}):Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}> }
export const applicationTable=registerTable('construction_applications',['id','owner_id','brief','state','version','created_at','updated_at','construction_release_id','schema_version','control_epoch']);
export class PendingApplications {
 constructor(readonly policy:PolicyPort,readonly admission:AdmissionPort,readonly authority:PendingApplicationAuthority,readonly installation:{appId:string;releaseId:string}){if(!installation.appId||!installation.releaseId)throw new Error('installation_construction_scope_unconfigured');}
 async enqueue(ctx:RequestContext,commandId:string,input:CandidatePrepare){
  if(input.appId!==null||input.parentReleaseId!==null||!input.brief.trim()||ctx.principal.kind!=='human')throw new Error('new_application_requires_human_outcome');
  const action='application.prepare',inputHash=await digest(canonical(input));
  const replay=await this.admission.replay<{appId:string;jobId:string}>(ctx,commandId,action,this.installation.appId,inputHash);if(replay?.result.state==='committed')return replay.result.value;
  const appId=await stableId({installation:this.installation.appId,commandId,kind:'app'}),jobId=await stableId({commandId,kind:'job'}),stepId=await stableId({commandId,kind:'prepare'}),candidateId=await stableId({commandId:stepId,kind:'candidate'});
  const authorization=await this.authority.prepare(ctx,{appId,newCandidateId:candidateId,installationAppId:this.installation.appId});
  const permit=await this.policy.authorize(ctx,{appId:this.installation.appId,action,expected:[],cost:[],inputHash,commandId});
  const prepared={...input,appId};
  await this.admission.commit(ctx,{commandId,action,appId:this.installation.appId,canonicalInputHash:inputHash,permit,guards:authorization.guards,mutations:[...authorization.mutations,{kind:'insert',table:applicationTable,row:{id:appId,owner_id:ctx.principal.id,brief:input.brief,state:'pending',version:1,construction_release_id:this.installation.releaseId,schema_version:0,control_epoch:1,created_at:ctx.now,updated_at:ctx.now}},{kind:'insert',table:constructionJobTable,row:{id:jobId,app_id:appId,command_id:commandId,action:'candidate.prepare',input_hash:await digest(canonical(prepared)),input_json:canonical(prepared),state:'queued',step_command_id:stepId,lease_epoch:0,lease_until:null,result_json:null,error:null,created_at:ctx.now,updated_at:ctx.now}}],audit:[{action,subject:null,changes:[],sourceIds:input.sourceIds,personalContentRefs:[appId]}],events:[],outbox:[{action:'construction.process',version:1,input:{jobId},notBefore:ctx.now,grantId:null,subject:null,sourceReleaseId:this.installation.releaseId,causeRunIds:[]}],committedResult:{appId,jobId}});
  return{appId,jobId};
 }
}
