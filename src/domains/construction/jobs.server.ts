import { createUlid } from '../../core/shared/ids';
import type { RequestContext,PolicyPort } from '../authority/ports';
import type { AdmissionPort } from '../admission/ports';
import { registerTable,trustedPredicate } from '../admission/sql.server';
import { canonical,digest,stableId } from './source';
type Job={created_at:string;id:string;app_id:string;command_id:string;action:string;input_hash:string;input_json:string;state:'queued'|'running'|'complete'|'failed'|'cancelled';step_command_id:string;lease_epoch:number;lease_until:string|null;result_json:string|null;error:string|null};
export type ConstructionJobHandler=(ctx:RequestContext,commandId:string,input:unknown)=>Promise<unknown>;
export const constructionJobTable=registerTable('construction_jobs',['id','app_id','command_id','action','input_hash','input_json','state','step_command_id','lease_epoch','lease_until','result_json','error','created_at','updated_at']);
const table=constructionJobTable;
export class ConstructionJobs {
 constructor(readonly db:D1Database,readonly policy:PolicyPort,readonly admission:AdmissionPort,readonly handlers:ReadonlyMap<string,ConstructionJobHandler>){}
 async enqueue(ctx:RequestContext,commandId:string,appId:string,action:string,input:unknown,sourceReleaseId:string){
  if(!this.handlers.has(action))throw new Error('construction_action_unconfigured');
  const inputHash=await digest(canonical({action,input,appId,sourceReleaseId}));
  const prior=await this.db.prepare('SELECT * FROM construction_jobs WHERE command_id=?').bind(commandId).first<Job>();
  await this.policy.authorize(ctx,{appId,action,expected:[],cost:[],inputHash,commandId});
  if(prior){if(prior.input_hash!==inputHash)throw new Error('idempotency_conflict');return this.status(ctx,prior.id);}
  const id=await stableId({commandId,kind:'construction-job'}),stepId=await stableId({commandId,kind:'construction-step'}),permit=await this.policy.authorize(ctx,{appId,action,expected:[],cost:[],inputHash,commandId});
  await this.admission.commit(ctx,{commandId,action,appId,canonicalInputHash:inputHash,permit,guards:[],mutations:[{kind:'insert',table,row:{id,app_id:appId,command_id:commandId,action,input_hash:inputHash,input_json:canonical(input),state:'queued',step_command_id:stepId,lease_epoch:0,lease_until:null,result_json:null,error:null,created_at:ctx.now,updated_at:ctx.now}}],audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[{action:'construction.process',version:1,input:{jobId:id},notBefore:ctx.now,grantId:permit.grantId,subject:null,sourceReleaseId,causeRunIds:[]}],committedResult:{jobId:id,state:'queued'}});
  return this.status(ctx,id);
 }
 async status(ctx:RequestContext,id:string){const row=await this.db.prepare('SELECT * FROM construction_jobs WHERE id=?').bind(id).first<Job>();if(!row)throw new Error('not_found');await this.policy.authorize(ctx,{appId:row.app_id,action:'candidate.read',expected:[],cost:[],inputHash:await digest(id)});return{jobId:id,commandId:row.command_id,state:row.state,result:row.result_json?JSON.parse(row.result_json):null,error:row.error};}
 async process(ctx:RequestContext,id:string){
  const job=await this.db.prepare('SELECT * FROM construction_jobs WHERE id=?').bind(id).first<Job>();if(!job)throw new Error('not_found');if(['complete','failed','cancelled'].includes(job.state))return this.status(ctx,id);
  const now=new Date().toISOString();if(job.state==='running'&&job.lease_until&&job.lease_until>now)throw new Error('construction_job_leased');
  const permit=await this.policy.authorize(ctx,{appId:job.app_id,action:job.action,expected:[],cost:[],inputHash:job.input_hash,commandId:job.command_id});
  const epoch=job.lease_epoch+1;
  await this.admission.commit(ctx,{commandId:createUlid(),action:job.action,appId:job.app_id,canonicalInputHash:await digest(canonical({id,epoch})),permit,guards:[trustedPredicate("EXISTS(SELECT 1 FROM construction_jobs WHERE id=? AND lease_epoch=? AND (state='queued' OR (state='running' AND lease_until<=?)))",[id,job.lease_epoch,now])],mutations:[{kind:'update',table,set:{state:'running',lease_epoch:epoch,lease_until:new Date(Date.now()+600000).toISOString(),updated_at:now},where:trustedPredicate('id=? AND lease_epoch=?',[id,job.lease_epoch]),expectedRows:1}],audit:[],events:[],outbox:[],committedResult:{id,epoch}});
  const handler=this.handlers.get(job.action);if(!handler)throw new Error('construction_action_unconfigured');
  try{const result=await handler({...ctx,requestId:id,now:job.created_at},job.step_command_id,JSON.parse(job.input_json));await this.db.prepare("UPDATE construction_jobs SET state='complete',result_json=?,lease_until=NULL,updated_at=? WHERE id=? AND state='running' AND lease_epoch=?").bind(canonical(result),new Date().toISOString(),id,epoch).run();}
  catch(error){await this.db.prepare("UPDATE construction_jobs SET state='failed',error='Construction step failed; inspect authorized command evidence',lease_until=NULL,updated_at=? WHERE id=? AND state='running' AND lease_epoch=?").bind(new Date().toISOString(),id,epoch).run();throw error;}
  return this.status(ctx,id);
 }
 async cancel(ctx:RequestContext,commandId:string,id:string){const row=await this.db.prepare('SELECT * FROM construction_jobs WHERE id=?').bind(id).first<Job>();if(!row)throw new Error('not_found');const inputHash=await digest(id),action='candidate.cancel',permit=await this.policy.authorize(ctx,{appId:row.app_id,action,expected:[],cost:[],inputHash,commandId});return this.admission.commit(ctx,{commandId,action,appId:row.app_id,canonicalInputHash:inputHash,permit,guards:[],mutations:[{kind:'update',table,set:{state:'cancelled',lease_epoch:row.lease_epoch+1,updated_at:ctx.now},where:trustedPredicate("id=? AND lease_epoch=? AND state='queued'",[id,row.lease_epoch]),expectedRows:1}],audit:[],events:[],outbox:[],committedResult:{jobId:id,state:'cancelled'}});}
}
