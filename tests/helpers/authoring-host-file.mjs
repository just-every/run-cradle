import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import { boundedProcess } from '../../authoring/runner/runtime.mjs';

const createFile = `
import fs from 'node:fs';
fs.chmodSync(process.argv[1], 0o755);
fs.writeFileSync(process.argv[1] + '/sentinel.txt', process.argv[2], { flag: 'wx', mode: 0o444 });
fs.chmodSync(process.argv[1] + '/sentinel.txt', 0o444);
`;
const readFile = `
import fs from 'node:fs';
process.stdout.write(fs.readFileSync(process.argv[1] + '/sentinel.txt', 'utf8'));
`;

export function deniedHostFileRead(path) {
  return `assert.throws(() => fs.readFileSync(${JSON.stringify(path)}), { code: /^(ENOENT|EACCES|EPERM)$/ });`;
}

// A local Docker volume lives on the daemon host, even with a remote DOCKER_HOST.
// Trusted controls mount it at its actual host path; the hostile runner never does.
export async function prepareHostOnlyFile({ image, binary = 'docker', run = boundedProcess }) {
  assert.match(image ?? '', /^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/);
  const volume = `cradle-host-file-${randomBytes(12).toString('hex')}`;
  const marker = `synthetic fixture ${randomBytes(32).toString('hex')}`;
  const containers = ['create', 'read'].map(action => `${volume}-${action}`);
  async function checked(args, operation) {
    const result = await run(binary, args, { timeout: 10_000 });
    assert.equal(result.code, 0, `host file fixture ${operation} failed`);
    assert.equal(result.exceeded, false, `host file fixture ${operation} exceeded output limit`);
    return result.stdout;
  }
  async function cleanup() {
    // Also remove helper containers if a bounded Docker client was interrupted.
    await run(binary, ['rm', '--force', ...containers], { timeout: 10_000 });
    await checked(['volume', 'rm', volume], 'cleanup');
  }
  try {
    await checked(['volume', 'create', '--driver', 'local', volume], 'volume creation');
    const [info] = JSON.parse(await checked(['volume', 'inspect', volume], 'volume inspection'));
    assert.equal(info.Name, volume);
    assert.equal(info.Driver, 'local');
    assert.equal(posix.isAbsolute(info.Mountpoint), true);
    assert.ok(info.Mountpoint.length > 1 && !info.Mountpoint.includes(','));
    const root = info.Mountpoint;
    const common = ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--entrypoint', 'node'];
    await checked([...common, '--name', containers[0], '--mount', `type=volume,src=${volume},dst=${root}`, image, '--input-type=module', '-e', createFile, root, marker], 'file creation');
    const contents = await checked([...common, '--name', containers[1], '--user', '65534:65534', '--mount', `type=volume,src=${volume},dst=${root},readonly`, image, '--input-type=module', '-e', readFile, root], 'read control');
    assert.equal(contents, marker, 'host file must contain the created bytes before the hostile runner starts');
    return { path: posix.join(root, 'sentinel.txt'), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
