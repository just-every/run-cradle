import type { RequestContext,PolicyPort } from '../authority/ports';
import type { BuildArtifactPort } from './build.server';
import type { RunnerClient } from './runner-client.server';
import type { ConstructionSourcesPort } from './ports';
import type { CandidateDetail } from './contracts';
import { sourceEntityId } from './contracts';
import { digest } from './source';
export interface PreviewDataPort { read(ctx:RequestContext,candidate:CandidateDetail):Promise<Uint8Array> }
export class RunnerBuildArtifacts implements BuildArtifactPort {
 constructor(readonly runner:RunnerClient,readonly policy:PolicyPort,readonly sources:ConstructionSourcesPort,readonly data:PreviewDataPort){}
 async put(ctx:RequestContext,input:{appId:string;purpose:string;bytes:Uint8Array;sha256:string;sourceSnapshotId:string}){
  const source=await this.sources.snapshot(ctx,input.sourceSnapshotId);if(source.appId!==input.appId||await digest(input.bytes)!==input.sha256)throw new Error('source_artifact_scope_mismatch');
  if(input.purpose==='candidate_source'&&source.sha256!==input.sha256)throw new Error('source_artifact_bytes_mismatch');
  await this.policy.authorize(ctx,{appId:input.appId,action:'source.execute',expected:[{ref:{appId:input.appId,entityId:sourceEntityId,recordId:source.id},version:1}],cost:[],inputHash:input.sha256,purpose:input.purpose});
  return this.runner.upload(input.bytes);
 }
 async preview(_ctx:RequestContext,input:{candidateId:string;sourceHash:string;artifactHash:string;bytes:Uint8Array}){if(await digest(input.bytes)!==input.artifactHash)throw new Error('preview_artifact_mismatch');const bundle=JSON.parse(new TextDecoder().decode(input.bytes)) as {files:{path:string}[]};if(!bundle.files.some(f=>f.path==='public/index.html'))throw new Error('candidate_screen_missing');return `/api/v1/candidates/${input.candidateId}/preview`;}
 input(ctx:RequestContext,candidate:CandidateDetail){return this.data.read(ctx,candidate);}
}
