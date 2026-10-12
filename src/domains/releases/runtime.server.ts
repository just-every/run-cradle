import type { RequestContext,PolicyPort } from '../authority/ports';
import type { RunnerClient } from '../construction/runner-client.server';
import { canonical,digest } from '../construction/source';
export interface ApplicationDataPort {
 snapshot(ctx:RequestContext,input:{appId:string;releaseId:string;sourceHash:string;controlEpoch:number;path:string;method:string}):Promise<unknown>;
 effects(ctx:RequestContext,input:{appId:string;releaseId:string;sourceHash:string;controlEpoch:number;policyVersion:number;actionVersion:number;commandId:string;proposals:unknown[]}):Promise<unknown>;
}
/** Every live invocation resolves current routing and current authority anew. */
export class ApplicationRuntime {
 constructor(readonly db:D1Database,readonly policy:PolicyPort,readonly runner:RunnerClient,readonly data:ApplicationDataPort){}
 async invoke(ctx:RequestContext,input:{appId:string;expectedReleaseId:string;expectedControlEpoch:number;commandId:string;path:string;method:string;body:unknown}){
  const row=await this.db.prepare('SELECT l.* FROM live_app_releases l JOIN app_releases r ON r.id=l.release_id WHERE l.app_id=? AND r.state=?').bind(input.appId,'live').first<{release_id:string;source_hash:string;deployment_id:string;policy_version:number;action_version:number;control_epoch:number}>();
  if(!row||row.release_id!==input.expectedReleaseId||row.control_epoch!==input.expectedControlEpoch)throw new Error('release_conflict');
  await this.policy.authorize(ctx,{appId:input.appId,action:'application.invoke',expected:[],cost:[],inputHash:await digest(canonical(input)),commandId:input.commandId});
  const snapshot=await this.data.snapshot(ctx,{appId:input.appId,releaseId:row.release_id,sourceHash:row.source_hash,controlEpoch:row.control_epoch,path:input.path,method:input.method});
  const result=await this.runner.request<{sourceHash:string;response:{status:number;body:string}}>('POST',`/deployments/${row.deployment_id}/invoke`,{request:{path:input.path,method:input.method,body:input.body},snapshot,releaseId:row.release_id,policyVersion:row.policy_version,actionVersion:row.action_version},true);
  if(result.payload.sourceHash!==row.source_hash)throw new Error('operative_source_mismatch');
  // Model/app output is still untrusted. Host registered actions govern all writes.
  const body=JSON.parse(result.payload.response.body) as {value?:unknown;proposals?:unknown[]};
  let effects:unknown=null;
  if(body.proposals?.length){const current=await this.db.prepare('SELECT release_id,control_epoch FROM live_app_releases WHERE app_id=?').bind(input.appId).first<{release_id:string;control_epoch:number}>();if(current?.release_id!==row.release_id||current.control_epoch!==row.control_epoch)throw new Error('inflight_release_changed');effects=await this.data.effects(ctx,{appId:input.appId,releaseId:row.release_id,sourceHash:row.source_hash,controlEpoch:row.control_epoch,policyVersion:row.policy_version,actionVersion:row.action_version,commandId:input.commandId,proposals:body.proposals});}
  return{releaseId:row.release_id,controlEpoch:row.control_epoch,sourceHash:row.source_hash,status:result.payload.response.status,value:body.value,effects};
 }
}
