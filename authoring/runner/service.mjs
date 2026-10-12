import { mkdir, writeFile, readFile, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from './store.mjs';
import { download } from './download.mjs';
import { parseBundle, MAX_ARTIFACT } from './bundle.mjs';
import { attest, hash, redact } from './integrity.mjs';
import { validateJob } from './runtime.mjs';
export class RunnerService {
  constructor({ stateDirectory, jobDirectory, runtime, privateKey, artifactOrigins, token }) {
    this.stateDirectory = stateDirectory; this.jobDirectory = jobDirectory; this.runtime = runtime;
    this.privateKey = privateKey; this.artifactOrigins = artifactOrigins; this.token = token;
    this.running = new Map(); this.closing = false;
  }
  async open() {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    await mkdir(this.jobDirectory, { recursive: true, mode: 0o755 });
    await mkdir(join(this.stateDirectory,'artifacts'), { recursive: true });
    this.store = new Store(join(this.stateDirectory,'runner.sqlite'));
    // A crashed runner never guesses that previously running code completed.
    for (const id of this.store.interrupted()) {
      await this.runtime.cleanup(id);
      this.store.finish(id, 'failed', this.signed({ jobId: id, state: 'failed', error: 'runner_interrupted', artifacts: [] }));
    }
    await this.runtime.probe();
    this.timer = setInterval(() => void this.pump(), 250); this.timer.unref();
  }
  signed(payload) { return attest({ ...payload, issuedAt: new Date().toISOString() }, this.privateKey); }
  submit(job) { validateJob(job); if (this.store.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n >= 1000 && !this.store.get(job.jobId)) throw new Error('job_store_capacity'); return this.status(this.store.submit(job).id); }
  status(id) { const row = this.store.get(id); if (!row) throw new Error('not_found'); return row.result ?? this.signed({ jobId: id, state: row.state, artifacts: [] }); }
  async cancel(id) { if (!this.store.get(id)) throw new Error('not_found'); this.store.cancel(id); this.running.get(id)?.abort(); await this.runtime.cleanup(id); return this.status(id); }
  async pump() {
    if (this.closing || this.running.size) return;
    const row = this.store.queued()[0]; if (!row || !this.store.claim(row.id)) return;
    const controller = new AbortController(); this.running.set(row.id, controller);
    try {
      const [sourceBytes, inputBytes] = await Promise.all([this.loadArtifact(row.request.sourceArtifact, controller.signal), this.loadArtifact(row.request.inputArtifact, controller.signal)]);
      await this.execute(row.request, sourceBytes, inputBytes, controller.signal);
    } catch (error) {
      controller.abort();
      this.store.finish(row.id, 'failed', this.signed({ jobId: row.id, state: 'failed', artifacts: [], error: redact(error.message, [this.token]), sourceHash: row.request.sourceArtifact.sha256 }));
    } finally { this.running.delete(row.id); await rm(join(this.jobDirectory,row.id), { recursive: true, force: true }); }
  }
  async execute(job, sourceBytes, inputBytes, signal) {
    if (sourceBytes.length > MAX_ARTIFACT || inputBytes.length > MAX_ARTIFACT || hash(sourceBytes) !== job.sourceArtifact.sha256 || hash(inputBytes) !== job.inputArtifact.sha256) throw new Error('artifact_hash_mismatch');
    const result = await this.runtime.execute(job, parseBundle(sourceBytes), inputBytes, join(this.jobDirectory,job.jobId), signal);
    await this.storeArtifact(result.artifact.bytes, result.artifact.sha256);
    // Save exact source as an artifact for a future deployment; never rebuild different bytes behind a release identity.
    await this.storeArtifact(sourceBytes, job.sourceArtifact.sha256);
    const envelope = this.signed({ jobId: job.jobId, state: 'succeeded', sourceHash: job.sourceArtifact.sha256, inputHash: job.inputArtifact.sha256, outputSchemaHash: job.outputSchemaHash, artifacts: [{ id: result.artifact.sha256, sha256: result.artifact.sha256, bytes: result.artifact.bytes.length }], exitCode: result.exitCode, logs: redact(result.logs, [this.token]), resourceUse: result.resourceUse, isolation: { runtime: this.runtime.runtime, image: this.runtime.image, network: 'none' } });
    this.store.finish(job.jobId, 'succeeded', envelope); return envelope;
  }
  async loadArtifact(ref,signal) { if (ref.downloadUrl === `runner:${ref.sha256}`) return this.artifact(ref.sha256); return download(ref,this.artifactOrigins,signal); }
  async storeArtifact(bytes,digest) {
    if(this.store.db.prepare('SELECT 1 FROM erased_artifacts WHERE sha256=?').get(digest))throw new Error('artifact_erased');
    if(bytes.length>MAX_ARTIFACT||hash(bytes)!==digest)throw new Error('artifact_hash_mismatch');
    const directory=join(this.stateDirectory,'artifacts'),names=await readdir(directory);let total=0;
    if(names.length>=10000||this.store.db.prepare('SELECT COUNT(*) n FROM erased_artifacts').get().n>=10000)throw new Error('artifact_store_capacity');
    for(const name of names)total+=(await stat(join(directory,name))).size;
    if(total+bytes.length>268435456)throw new Error('artifact_store_capacity');
    try{await writeFile(join(directory,digest),bytes,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;await this.artifact(digest);}
    return this.signed({id:digest,sha256:digest,bytes:bytes.length,downloadUrl:`runner:${digest}`});
  }
  async eraseArtifact(digest) {
    if(!/^[a-f0-9]{64}$/.test(digest))throw new Error('invalid_artifact');
    const jobs=this.store.db.prepare('SELECT id FROM jobs').all().map(row=>this.store.get(row.id));let affected=0;
    const referenced=jobs.some(job=>job.request.sourceArtifact?.sha256===digest||job.request.inputArtifact?.sha256===digest||job.result?.payload.artifacts?.some(a=>a.sha256===digest));
    if(!referenced&&!this.store.db.prepare('SELECT 1 FROM erased_artifacts WHERE sha256=?').get(digest)){try{await stat(join(this.stateDirectory,'artifacts',digest));}catch(error){if(error.code==='ENOENT')return this.signed({sha256:digest,erased:true,affectedJobs:0});throw error;}}
    this.store.db.prepare('INSERT INTO erased_artifacts VALUES(?,?) ON CONFLICT(sha256) DO NOTHING').run(digest,Date.now());
    for(const job of jobs){if(job.request.sourceArtifact?.sha256!==digest&&job.request.inputArtifact?.sha256!==digest&&!job.result?.payload.artifacts?.some(a=>a.sha256===digest))continue;
      await this.cancel(job.id);while(this.running.has(job.id))await new Promise(resolve=>setTimeout(resolve,10));this.store.db.prepare('UPDATE jobs SET state=?,request=?,result=?,updated_at=? WHERE id=?').run('erased',JSON.stringify({jobId:job.id,erased:true}),JSON.stringify(this.signed({jobId:job.id,state:'erased',artifacts:[]})),Date.now(),job.id);affected++;
    }
    this.store.db.prepare("UPDATE deployments SET state='stopped' WHERE source_hash=? OR artifact_hash=?").run(digest,digest);
    await rm(join(this.stateDirectory,'artifacts',digest),{force:true});return this.signed({sha256:digest,erased:true,affectedJobs:affected});
  }
  async artifact(digest) { if (!/^[a-f0-9]{64}$/.test(digest)||this.store.db.prepare('SELECT 1 FROM erased_artifacts WHERE sha256=?').get(digest)) throw new Error('not_found'); const bytes = await readFile(join(this.stateDirectory,'artifacts',digest)); if (hash(bytes) !== digest) throw new Error('stored_artifact_corrupt'); return bytes; }
  async close() { this.closing = true; clearInterval(this.timer); for (const [id, controller] of this.running) { controller.abort(); await this.runtime.cleanup(id); } while (this.running.size) await new Promise(resolve => setTimeout(resolve, 10)); this.store?.close(); }
}
