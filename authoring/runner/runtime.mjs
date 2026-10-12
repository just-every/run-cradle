import { spawn } from 'node:child_process';
import { mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { command, parseBundle, materialize } from './bundle.mjs';
import { redact, hash, canonical } from './integrity.mjs';
export function validateJob(job) {
  if (!job || !/^[a-zA-Z0-9_-]{8,80}$/.test(job.jobId) || !['build','evaluate','optimize','invoke'].includes(job.kind) || !/^[a-f0-9]{64}$/.test(job.outputSchemaHash)) throw new Error('invalid_job');
  if (!Array.isArray(job.networkAllowlist) || job.networkAllowlist.length) throw new Error('network_egress_unsupported');
  const l = job.limits;
  if (!l || !Number.isInteger(l.cpuSeconds) || l.cpuSeconds < 1 || l.cpuSeconds > 120 || !Number.isInteger(l.wallSeconds) || l.wallSeconds < 1 || l.wallSeconds > 300 || !Number.isInteger(l.memoryBytes) || l.memoryBytes < 16_777_216 || l.memoryBytes > 1_073_741_824) throw new Error('invalid_resource_limits');
  return job;
}
export function dockerArgs({ job, root, image, runtime = 'runsc' }, argv) {
  if (!/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('runner_image_requires_digest');
  if (!['runsc','io.containerd.kata.v2','runc'].includes(runtime)) throw new Error('unsupported_container_runtime');
  return ['run','--name',`cradle-${job.jobId}`,'--runtime',runtime,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory',String(job.limits.memoryBytes),'--memory-swap',String(job.limits.memoryBytes),'--cpus','1','--ulimit',`cpu=${job.limits.cpuSeconds}:${job.limits.cpuSeconds}`,'--ulimit','nofile=128:128','--ulimit','fsize=16777216:16777216','--user','65534:65534','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=67108864','--mount',`type=bind,src=${join(root,'source')},dst=/workspace,readonly`,'--mount',`type=bind,src=${join(root,'input')},dst=/input,readonly`,'--tmpfs','/output:rw,noexec,nosuid,nodev,size=16777216,mode=1777','--mount',`type=bind,src=${join(root,'supervisor')},dst=/runner,readonly`,'--workdir','/workspace','--env','HOME=/tmp','--env','CRADLE_INPUT=/input/input.json','--env','CRADLE_OUTPUT=/output',image,'node','/runner/guest.mjs',JSON.stringify(argv)];
}
export async function boundedProcess(binary, args, { timeout = 10_000, signal, maxOutput = 65536 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore','pipe','pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, ...(process.env.DOCKER_HOST ? {DOCKER_HOST: process.env.DOCKER_HOST} : {}), ...(process.env.DOCKER_CONTEXT ? {DOCKER_CONTEXT: process.env.DOCKER_CONTEXT} : {}) } });
    let output = '', stdout = '', stderr = '', bytes = 0, exceeded = false;
    const stop = () => child.kill('SIGKILL');
    const timer = setTimeout(stop, timeout); signal?.addEventListener('abort', stop, { once: true });
    const append = chunk => { bytes += chunk.length; if (bytes > maxOutput) { exceeded = true; stop(); } else output += chunk.toString(); };
    child.stdout.on('data', chunk => { stdout += chunk.toString(); append(chunk); }); child.stderr.on('data', chunk => { stderr += chunk.toString(); append(chunk); });
    child.on('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', stop); reject(error); });
    child.on('close', (code, killed) => { clearTimeout(timer); signal?.removeEventListener('abort', stop); resolve({ code, killed, output, stdout, stderr, exceeded }); });
  });
}
export class DockerRuntime {
  constructor({ binary = 'docker', image, runtime = 'runsc', dedicatedVm = false }) {
    if (runtime === 'runc' && !dedicatedVm) throw new Error('runc_requires_dedicated_vm');
    this.binary = binary; this.image = image; this.runtime = runtime;
  }
  async probe() { const r = await boundedProcess(this.binary, ['info','--format','{{json .SecurityOptions}}']); if (r.code !== 0) throw new Error('isolated_runtime_unavailable'); return r.output; }
  async cleanup(jobId) { return boundedProcess(this.binary, ['rm','-f',`cradle-${jobId}`], { timeout: 10_000 }); }
  async execute(job, source, inputBytes, directory, signal) {
    await materialize(source, join(directory,'source'));
    await mkdir(join(directory,'input'), { recursive: true });
    await mkdir(join(directory,'supervisor'), { recursive: true });
    await writeFile(join(directory,'supervisor','guest.mjs'), await readFile(fileURLToPath(new URL('./guest.mjs',import.meta.url))), { mode: 0o444 });
    await writeFile(join(directory,'input','input.json'), inputBytes, { mode: 0o444 });
    await chmod(join(directory,'source'), 0o755); await chmod(directory, 0o755);
    const started = Date.now();
    let result;
    try { result = await boundedProcess(this.binary, dockerArgs({ job, root: directory, image: this.image, runtime: this.runtime }, command(source, job.kind)), { timeout: Math.min(job.limits.wallSeconds, job.limits.cpuSeconds) * 1000, signal, maxOutput: 24 * 1024 * 1024 }); }
    finally { await this.cleanup(job.jobId); }
    if (signal.aborted) throw new Error('cancelled');
    if (result.code !== 0 || result.exceeded) throw new Error(result.exceeded ? 'output_limit' : `sandbox_exit_${result.code ?? 'timeout'}`);
    const bundle = parseBundle(Buffer.from(result.stdout)); const bytes = Buffer.from(canonical(bundle));
    return { artifact: { bytes, sha256: hash(bytes) }, logs: redact(result.stderr), exitCode: result.code, resourceUse: { wallMs: Date.now() - started, cpuSeconds: null, peakMemoryBytes: null } };
  }
}
