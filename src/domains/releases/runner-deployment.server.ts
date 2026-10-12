import type { RequestContext } from '../authority/ports';
import type { CandidateDetail } from '../construction/contracts';
import { RunnerClient } from '../construction/runner-client.server';
import { digest, canonical,stableId } from '../construction/source';
import type { SourceDeploymentPort } from './ports';
import type { RuntimeReadback } from './contracts';
type Invocation={deploymentId:string;sourceHash:string;artifactHash:string;response:{status:number;body:string};issuedAt:string};
export class RunnerDeployment implements SourceDeploymentPort {
 constructor(readonly client:RunnerClient,readonly probeInput:(ctx:RequestContext,candidate:CandidateDetail)=>Promise<unknown>){ }
 async prepare(ctx:RequestContext,candidate:CandidateDetail):Promise<RuntimeReadback>{
  if(!candidate.build||candidate.build.state!=='succeeded')throw new Error('candidate_not_built');
  const id=`release-${await stableId({requestId:ctx.requestId,candidateId:candidate.candidate.id,sourceHash:candidate.source.sha256})}`;
  await this.client.request('POST','/deployments',{id,buildId:candidate.build.jobId,sourceHash:candidate.source.sha256,artifactHash:candidate.build.artifactHash},true);
  try{return await this.readback(ctx,candidate,id);}catch(error){await this.stop(ctx,id);throw error;}
 }
 async readback(ctx:RequestContext,candidate:CandidateDetail,id:string):Promise<RuntimeReadback>{
  if(!candidate.build)throw new Error('candidate_not_built');
  const envelope=await this.client.request<Invocation>('POST',`/deployments/${id}/probe`,await this.probeInput(ctx,candidate),true);
  const p=envelope.payload;if(p.sourceHash!==candidate.source.sha256||p.artifactHash!==candidate.build.artifactHash||p.response.status>=400)throw new Error('deployment_probe_failed');
  return{deploymentId:id,sourceHash:p.sourceHash,artifactHash:p.artifactHash,responseHash:await digest(canonical(p.response)),checkedAt:p.issuedAt,signedResult:canonical(envelope),executed:true};
 }
 async activate(_ctx:RequestContext,value:RuntimeReadback){await this.client.request('POST',`/deployments/${value.deploymentId}/activate`,{},true);const read=await this.client.request<{id:string;state:string;source_hash:string;artifact_hash:string}>('GET',`/deployments/${value.deploymentId}`,undefined,true);if(read.payload.state!=='active'||read.payload.source_hash!==value.sourceHash||read.payload.artifact_hash!==value.artifactHash)throw new Error('deployment_activation_mismatch');return value;}
 async stop(_ctx:RequestContext,id:string){await this.client.request('POST',`/deployments/${id}/stop`,{},true);}
 async verify(_ctx:RequestContext,value:RuntimeReadback){const envelope=JSON.parse(value.signedResult);const p=await this.client.verify<Invocation>(envelope);if(p.deploymentId!==value.deploymentId||p.sourceHash!==value.sourceHash||p.artifactHash!==value.artifactHash||await digest(canonical(p.response))!==value.responseHash||!value.executed)throw new Error('deployment_attestation_mismatch');}
}
