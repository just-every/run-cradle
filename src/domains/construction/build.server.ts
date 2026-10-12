import type { RequestContext } from '../authority/ports';
import type { CandidateDetail,BuildResult } from './contracts';
import type { ConstructionBuildPort } from './ports';
import { RunnerClient,type ArtifactReference,type RunnerPayload,type Signed } from './runner-client.server';
import { bundle,canonical,digest } from './source';
export interface BuildArtifactPort { put(ctx:RequestContext,input:{appId:string;purpose:string;bytes:Uint8Array;sha256:string;sourceSnapshotId:string}):Promise<ArtifactReference>; preview(ctx:RequestContext,input:{candidateId:string;sourceHash:string;artifactHash:string;bytes:Uint8Array}):Promise<string>; input(ctx:RequestContext,candidate:CandidateDetail):Promise<Uint8Array> }
export class SourceBuilder implements ConstructionBuildPort {
 constructor(readonly runner:RunnerClient,readonly artifacts:BuildArtifactPort){}
 async build(ctx:RequestContext,candidate:CandidateDetail):Promise<BuildResult>{
  const bytes=new TextEncoder().encode(bundle(candidate.source.files)),sourceHash=await digest(bytes);if(sourceHash!==candidate.source.sha256)throw new Error('source_snapshot_corrupt');
  const sourceArtifact=await this.artifacts.put(ctx,{appId:candidate.candidate.appId!,purpose:'candidate_source',bytes,sha256:sourceHash,sourceSnapshotId:candidate.source.id});
  const input=await this.artifacts.input(ctx,candidate),inputArtifact=await this.artifacts.put(ctx,{appId:candidate.candidate.appId!,purpose:'candidate_redacted_preview',bytes:input,sha256:await digest(input),sourceSnapshotId:candidate.source.id});
  const result=await this.runner.execute({jobId:`build-${candidate.candidate.id}-${candidate.candidate.version}`,kind:'build',sourceArtifact,inputArtifact,networkAllowlist:[],limits:{cpuSeconds:60,memoryBytes:268435456,wallSeconds:120},outputSchemaHash:await digest('cradle.source-build.v1')});
  if(result.payload.artifacts.length!==1)throw new Error('build_artifact_missing');const artifact=result.payload.artifacts[0],output=await this.runner.artifact(artifact.sha256);
  const previewUrl=await this.artifacts.preview(ctx,{candidateId:candidate.candidate.id,sourceHash,artifactHash:artifact.sha256,bytes:output});
  return{jobId:result.payload.jobId,sourceHash,artifactHash:artifact.sha256,state:'succeeded',previewUrl,signedResult:canonical(result)};
 }
 async verify(_ctx:RequestContext,result:BuildResult){const envelope=JSON.parse(result.signedResult) as Signed<RunnerPayload>;const p=await this.runner.verify(envelope);if(p.jobId!==result.jobId||p.sourceHash!==result.sourceHash||p.state!==result.state||!p.artifacts.some(a=>a.sha256===result.artifactHash)||p.exitCode!==0)throw new Error('build_attestation_mismatch');await this.runner.artifact(result.artifactHash);}
}
