import { parseBundle, safePath } from './bundle.mjs';
import { canonical, hash } from './integrity.mjs';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
// This target executes ordinary application-owned source, not a descriptor interpreter.
// Inputs contain already-authorized records. Outputs are HTTP results or proposed
// effects; the caller admits effects separately. No live datastore credential enters code.
export class DeploymentService {
  constructor(runner) { this.runner = runner; }
  prepare(request) {
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(request.id)) throw new Error('invalid_deployment_id');
    const build = this.runner.store.get(request.buildId);
    if (!build || build.state !== 'succeeded' || build.request.kind !== 'build' || build.result.payload.sourceHash !== request.sourceHash || !build.result.payload.artifacts.some(a => a.sha256 === request.artifactHash)) throw new Error('unverified_build');
    return this.runner.signed(this.runner.store.deploy(request));
  }
  async invoke(id,input,options={}) {
    if(this.invoking)throw new Error('runner_capacity');this.invoking=true;
    try{return await this.executeInvocation(id,input,options);}finally{this.invoking=false;}
  }
  async executeInvocation(id, input, { probe = false } = {}) {
    if (this.runner.running.size) throw new Error('runner_capacity');
    const deployment = this.runner.store.deployment(id);
    if (!deployment || (deployment.state !== 'active' && !(probe && deployment.state === 'prepared'))) throw new Error('deployment_inactive');
    const sourceBytes = await this.runner.artifact(deployment.source_hash);
    const inputBytes = Buffer.from(canonical(input));
    if (inputBytes.length > 1048576) throw new Error('input_too_large');
    const job = { jobId: `invoke-${randomUUID()}`, kind: 'invoke', sourceArtifact: { id: deployment.source_hash, sha256: deployment.source_hash }, inputArtifact: { id: hash(inputBytes), sha256: hash(inputBytes) }, networkAllowlist: [], limits: { cpuSeconds: 10, wallSeconds: 20, memoryBytes: 134217728 }, outputSchemaHash: hash('cradle.http-response.v1') };
    this.runner.store.submit(job); this.runner.store.claim(job.jobId);
    const controller = new AbortController();
    this.runner.running.set(job.jobId, controller);
    try {
      const result = await this.runner.execute(job, sourceBytes, inputBytes, controller.signal);
      const output = parseBundle(await this.runner.artifact(result.payload.artifacts[0].sha256));
      const responseFile = output.files.find(f => f.path === 'response.json');
      if (!responseFile) throw new Error('application_response_missing');
      const response = JSON.parse(Buffer.from(responseFile.content, 'base64'));
      if (!Number.isInteger(response.status) || response.status < 200 || response.status > 599 || typeof response.body !== 'string') throw new Error('invalid_application_response');
      return this.runner.signed({ deploymentId: id, sourceHash: deployment.source_hash, artifactHash: deployment.artifact_hash, response, invocation: result });
    } catch(error) { this.runner.store.finish(job.jobId,'failed',this.runner.signed({jobId:job.jobId,state:'failed',error:'application_execution_failed',artifacts:[]})); throw error; } finally { this.runner.running.delete(job.jobId); await rm(join(this.runner.jobDirectory,job.jobId), { recursive: true, force: true }); }
  }
  async asset(id, path) {
    safePath(path); const d = this.runner.store.deployment(id);
    if (!d || !['prepared','active'].includes(d.state)) throw new Error('deployment_inactive');
    const bundle = parseBundle(await this.runner.artifact(d.artifact_hash));
    const file = bundle.files.find(f => f.path === `public/${path}`);
    if (!file) throw new Error('not_found'); return Buffer.from(file.content,'base64');
  }
}
