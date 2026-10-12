import type { RequestContext } from '../authority/ports';
import type { OptimizerPort, IntelligenceArtifactPort } from './ports';
import type { Formulation, Snapshot } from './contracts';
import { candidateSchema } from './contracts';
import { RunnerClient } from '../construction/runner-client.server';
import { canonical } from './exact';
import { bundle, digest } from '../construction/source';
export class IsolatedOptimizer implements OptimizerPort {
 constructor(readonly runner:RunnerClient & {artifact(hash:string):Promise<Uint8Array>},readonly artifacts:IntelligenceArtifactPort){}
 async runStored(ctx:RequestContext,sourceHash:string,snapshot:Snapshot){
  const bytes=await this.runner.artifact(sourceHash);if(await digest(bytes)!==sourceHash)throw new Error('procedure_source_hash_mismatch');
  const raw=JSON.parse(new TextDecoder().decode(bytes)) as {version:number;files:{path:string;content:string}[]};if(raw.version!==1)throw new Error('invalid_procedure_bundle');
  const files=raw.files.map(f=>({path:f.path,content:new TextDecoder().decode(Uint8Array.from(atob(f.content),c=>c.charCodeAt(0)))}));
  const manifest=files.find(f=>f.path==='cradle-build.json');if(!manifest)throw new Error('missing_procedure_command');const entrypoint=JSON.parse(manifest.content).commands.optimize;
  const result=await this.run(ctx,{jobId:crypto.randomUUID(),snapshot,wallSeconds:120,formulation:{explanation:'Reevaluate exact owner-private procedure bytes',constraintIds:snapshot.constraints.map(x=>x.id),sourceIds:snapshot.sources.map(x=>x.id),files,entrypoint,instrumentBrief:'Existing procedure',causalClaims:[]}});
  if(result.sourceHash!==sourceHash)throw new Error('procedure_source_changed');return result;
 }
 async run(ctx:RequestContext,input:{jobId:string;formulation:Formulation;snapshot:Snapshot;wallSeconds:number}){
  if(!Number.isInteger(input.wallSeconds)||input.wallSeconds<1||input.wallSeconds>300)throw new Error('optimizer_wall_limit');
  const files=input.formulation.files.filter(f=>f.path!=='cradle-build.json');
  files.push({path:'cradle-build.json',content:canonical({commands:{optimize:input.formulation.entrypoint}})});
  const sourceBytes=new TextEncoder().encode(bundle(files)),inputBytes=new TextEncoder().encode(canonical(input.snapshot));
  const [sourceArtifact,inputArtifact]=await Promise.all([this.artifacts.put(ctx,sourceBytes,'portfolio_optimizer_source'),this.artifacts.put(ctx,inputBytes,'portfolio_optimizer_input')]);
  if(sourceArtifact.sha256!==await digest(sourceBytes)||inputArtifact.sha256!==await digest(inputBytes))throw new Error('artifact_upload_hash_mismatch');
  const result=await this.runner.execute({jobId:input.jobId,kind:'optimize',sourceArtifact,inputArtifact,networkAllowlist:[],limits:{cpuSeconds:Math.min(input.wallSeconds,120),memoryBytes:268435456,wallSeconds:input.wallSeconds},outputSchemaHash:await digest('portfolio-candidate/1')});
  if(result.payload.artifacts.length!==1)throw new Error('optimizer_output_artifact_required');
  const artifact=result.payload.artifacts[0],bytes=await this.runner.artifact(artifact.sha256);
  if(bytes.byteLength!==artifact.bytes||await digest(bytes)!==artifact.sha256)throw new Error('optimizer_output_hash_mismatch');
  const output=JSON.parse(new TextDecoder().decode(bytes)) as {version:number;files:{path:string;content:string}[]};
  const candidates=output.files.filter(f=>f.path==='candidate.json');if(output.version!==1||candidates.length!==1)throw new Error('optimizer_candidate_missing');
  const raw=Uint8Array.from(atob(candidates[0].content),c=>c.charCodeAt(0));
  return{candidate:candidateSchema.parse(JSON.parse(new TextDecoder().decode(raw))),sourceHash:sourceArtifact.sha256,artifactHash:artifact.sha256,jobId:input.jobId};
 }
}
