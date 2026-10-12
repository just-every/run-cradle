import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { authenticate, redact } from './integrity.mjs';
import { RunnerService } from './service.mjs';
import { DockerRuntime } from './runtime.mjs';
import { DeploymentService } from './deployments.mjs';
export function createRunnerServer(service, { token, deployToken }) {
  if(deployToken&&deployToken===token)throw new Error('deployment_credential_must_be_distinct');
  const deployments = new DeploymentService(service);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://runner'); let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > (url.pathname.startsWith('/artifacts/') ? 16777216 : 1048576)) throw new Error('request_too_large'); chunks.push(chunk); }
      const body = Buffer.concat(chunks), deploymentRoute = url.pathname.startsWith('/deployments')||/^\/artifacts\/[a-f0-9]{64}\/erase$/.test(url.pathname);
      if (deploymentRoute && !deployToken) throw new Error('deployment_unconfigured');
      const auth = authenticate(req.headers, req.method, req.url, body, deploymentRoute ? deployToken : token);
      service.store.nonce(auth.nonce, auth.expiresAt);
      const input = body.length && !url.pathname.startsWith('/artifacts/') ? JSON.parse(body) : null;
      let value;
      if (req.method === 'PUT' && /^\/artifacts\/[a-f0-9]{64}$/.test(url.pathname)) value = await service.storeArtifact(body,url.pathname.split('/')[2]);
      else if(req.method==='POST'&&/^\/artifacts\/[a-f0-9]{64}\/erase$/.test(url.pathname))value=await service.eraseArtifact(url.pathname.split('/')[2]);
      else if (req.method === 'POST' && url.pathname === '/jobs') value = service.submit(input);
      else if (req.method === 'GET' && /^\/jobs\/[\w-]+$/.test(url.pathname)) value = service.status(url.pathname.split('/')[2]);
      else if (req.method === 'POST' && /^\/jobs\/[\w-]+\/cancel$/.test(url.pathname)) value = await service.cancel(url.pathname.split('/')[2]);
      else if (req.method === 'GET' && /^\/artifacts\/[a-f0-9]{64}$/.test(url.pathname)) { const bytes = await service.artifact(url.pathname.split('/')[2]); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes); return; }
      else if (req.method === 'POST' && url.pathname === '/deployments') value = deployments.prepare(input);
      else if (req.method === 'GET' && /^\/deployments\/[\w-]+$/.test(url.pathname)) { const d = service.store.deployment(url.pathname.split('/')[2]); if (!d) throw new Error('not_found'); value = service.signed(d); }
      else if (req.method === 'POST' && /^\/deployments\/[\w-]+\/(invoke|probe)$/.test(url.pathname)) value = await deployments.invoke(url.pathname.split('/')[2], input, { probe: url.pathname.endsWith('/probe') });
      else if (req.method === 'POST' && /^\/deployments\/[\w-]+\/(activate|stop)$/.test(url.pathname)) { const id = url.pathname.split('/')[2]; if (!service.store.deployment(id)) throw new Error('not_found'); if (url.pathname.endsWith('/activate')) service.store.activate(id); else service.store.stopDeployment(id); value = service.signed(service.store.deployment(id)); }
      else if (req.method === 'GET' && /^\/deployments\/[\w-]+\/assets\//.test(url.pathname)) { const parts = url.pathname.split('/'); const bytes = await deployments.asset(parts[2], decodeURIComponent(parts.slice(4).join('/'))); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" }); res.end(bytes); return; }
      else throw new Error('not_found');
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value));
    } catch (error) {
      const message = redact(error.message, [token, deployToken]);
      const status = message.includes('unauthorized') || message.includes('UNIQUE constraint failed: nonces') ? 401 : message === 'not_found' ? 404 : message === 'idempotency_conflict' ? 409 : 400;
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: message }));
    }
  });
  server.requestTimeout=15_000;server.headersTimeout=10_000;server.maxConnections=32;return server;
}
export async function main(env = process.env) {
  for (const key of ['CRADLE_RUNNER_STATE','CRADLE_RUNNER_JOBS','CRADLE_RUNNER_TOKEN','CRADLE_RUNNER_SIGNING_KEY','CRADLE_RUNNER_IMAGE','CRADLE_ARTIFACT_ORIGINS']) if (!env[key]) throw new Error(`missing_${key}`);
  const runtime = new DockerRuntime({ binary: env.CRADLE_DOCKER_BINARY, image: env.CRADLE_RUNNER_IMAGE, runtime: env.CRADLE_CONTAINER_RUNTIME ?? 'runsc', dedicatedVm: env.CRADLE_DEDICATED_VM === 'true' });
  const service = new RunnerService({ stateDirectory: env.CRADLE_RUNNER_STATE, jobDirectory: env.CRADLE_RUNNER_JOBS, runtime, privateKey: await readFile(env.CRADLE_RUNNER_SIGNING_KEY, 'utf8'), artifactOrigins: env.CRADLE_ARTIFACT_ORIGINS.split(','), token: env.CRADLE_RUNNER_TOKEN });
  await service.open(); const server = createRunnerServer(service, { token: env.CRADLE_RUNNER_TOKEN, deployToken: env.CRADLE_DEPLOY_TOKEN });
  server.listen(Number(env.PORT ?? 4216), '127.0.0.1');
  const close = async () => { server.close(); await service.close(); };
  process.once('SIGTERM', close); process.once('SIGINT', close);
  return { server, service };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
