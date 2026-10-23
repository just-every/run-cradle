import type { AuthorityPermit,PolicyPort,RequestContext } from '../authority/ports';
import { trustedPredicate } from '../admission/sql.server';
import { ApiError } from '../../core/registry/errors';
import type { EffectRequest } from '../execution/contracts';
import { canonical,sha256 } from '../../adapters/crypto.server';
export type CredentialOperation={attemptId?:string;jobId?:string};
/** This port releases a secret only to a fixed adapter working an existing durable operation. */
export function createCredentialAccess(db:D1Database,policy:PolicyPort){return async(ctx:RequestContext,connectionId:string,purpose:'dispatch'|'readback',operation:CredentialOperation):Promise<AuthorityPermit>=>{
 const connection=await db.prepare('SELECT app_id,version,control_epoch,state,revoked_at FROM provider_connections WHERE id=?').bind(connectionId).first<{app_id:string;version:number;control_epoch:number;state:string;revoked_at:string|null}>();
 if(!connection||connection.revoked_at||connection.state==='revoked')throw new ApiError('forbidden','Provider credential is revoked or unavailable.');
 const guards=[trustedPredicate('EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND app_id=? AND version=? AND control_epoch=? AND revoked_at IS NULL)',[connectionId,connection.app_id,connection.version,connection.control_epoch])];
 let permit:AuthorityPermit;
 if(operation.attemptId){
  const row=await db.prepare('SELECT a.connection_id,a.authority_hash,a.authorization_json,r.actor_json,r.request_json FROM execution_attempts a JOIN execution_runs r ON r.id=a.run_id WHERE a.id=?').bind(operation.attemptId).first<{connection_id:string;authority_hash:string;authorization_json:string;actor_json:string;request_json:string}>();
  if(!row||row.connection_id!==connectionId)throw new ApiError('forbidden','Credential access is not bound to this attempt.');const request=JSON.parse(row.request_json) as EffectRequest,original=JSON.parse(row.authorization_json);
  if(request.appId!==connection.app_id||JSON.parse(row.actor_json).id!==ctx.principal.id||original.inputHash!==row.authority_hash||purpose==='dispatch'&&request.connectionVersion!==connection.version)throw new ApiError('forbidden','Credential operation binding changed.');
  // Same actor plus current read policy/credential scope; revoked write grants do not prevent original-effect readback.
  permit=await policy.authorize(ctx,{appId:request.appId,action:purpose==='readback'?'execution.reconcile':'execution.read',expected:request.expected,cost:[],connectionId,purpose:request.purpose??request.context?.purpose??request.action,fieldIds:request.fieldIds??request.context?.fieldIds??[],inputHash:row.authority_hash});
  guards.push(trustedPredicate('EXISTS(SELECT 1 FROM execution_attempts a JOIN execution_runs r ON r.id=a.run_id WHERE a.id=? AND a.connection_id=? AND a.authority_hash=? AND r.actor_json=?)',[operation.attemptId,connectionId,row.authority_hash,row.actor_json]));
 }else if(operation.jobId){
  const row=await db.prepare('SELECT action,actor_json,state FROM connection_jobs WHERE id=? AND connection_id=?').bind(operation.jobId,connectionId).first<{action:string;actor_json:string;state:string}>();const thumbnail=row?.state==='completed'&&await db.prepare("SELECT 1 FROM file_store_requests WHERE job_id=? AND connection_id=? AND actor_id=? AND json_extract(request_json,'$.op')='thumbnail' AND created_at>?").bind(operation.jobId,connectionId,ctx.principal.id,new Date(Date.now()-60000).toISOString()).first();if(!row||row.state!=='running'&&!thumbnail||JSON.parse(row.actor_json).id!==ctx.principal.id||!['connection.check','connection.sync'].includes(row.action)||purpose!=='readback')throw new ApiError('forbidden','Credential access requires a current scoped connection operation.');
  permit=await policy.authorize(ctx,{appId:connection.app_id,action:row.action,expected:[],cost:[],connectionId,inputHash:await sha256(canonical({jobId:operation.jobId,connectionId}))});guards.push(trustedPredicate("EXISTS(SELECT 1 FROM connection_jobs WHERE id=? AND connection_id=? AND actor_json=? AND state=?)",[operation.jobId,connectionId,row.actor_json,row.state]));
 }else throw new ApiError('forbidden','Credential access requires a durable operation identity.');
 for(const guard of guards)if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new ApiError('forbidden','Credential operation changed.');
 return {...permit,guards:[...permit.guards,...guards],reservationMutations:[],reservationIds:[]};
};}
