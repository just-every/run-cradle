import { contract } from './contract.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareHostOnlyFile, deniedHostFileRead } from './helpers/authoring-host-file.mjs';
import { boundedProcess } from '../authoring/runner/runtime.mjs';

const image = `node@sha256:${'a'.repeat(64)}`;

// Test-only Docker transport: execute the real fixture scripts on real local files.
// This checks the controls, not Docker isolation or remote-daemon connectivity.
async function localTransport(t, beforeRead = async () => {}) {
  const directory = await mkdtemp(join(tmpdir(), 'cradle-host-file-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const operations = [];
  let volume;
  let root;
  async function run(binary, args, options) {
    assert.equal(binary, 'docker');
    operations.push(args.slice(0, 2).join(' '));
    const success = stdout => ({ code: 0, exceeded: false, stdout });
    if (args[0] === 'volume' && args[1] === 'create') {
      assert.deepEqual(args.slice(2, 4), ['--driver', 'local']);
      volume = args[4];
      assert.match(volume, /^cradle-host-file-[a-f0-9]{24}$/);
      root = join(directory, volume);
      await mkdir(root);
      return success(volume);
    }
    if (args[0] === 'volume' && args[1] === 'inspect') {
      assert.equal(args[2], volume);
      return success(JSON.stringify([{ Name: volume, Driver: 'local', Mountpoint: root }]));
    }
    if (args[0] === 'volume' && args[1] === 'rm') {
      assert.equal(args[2], volume);
      await rm(root, { recursive: true });
      return success(volume);
    }
    if (args[0] === 'rm') {
      assert.deepEqual(args, ['rm', '--force', `${volume}-create`, `${volume}-read`]);
      return success('');
    }
    assert.equal(args[0], 'run');
    assert.equal(args[args.indexOf('--network') + 1], 'none');
    assert.ok(args.includes('--read-only'));
    assert.equal(args[args.indexOf('--entrypoint') + 1], 'node');
    const reading = args.includes('--user');
    assert.equal(args[args.indexOf('--name') + 1], `${volume}-${reading ? 'read' : 'create'}`);
    assert.equal(args[args.indexOf('--mount') + 1], `type=volume,src=${volume},dst=${root}${reading ? ',readonly' : ''}`);
    if (reading) {
      assert.equal(args[args.indexOf('--user') + 1], '65534:65534');
      await beforeRead(join(root, 'sentinel.txt'));
    }
    return boundedProcess(process.execPath, args.slice(args.indexOf(image) + 1), options);
  }
  return { run, operations };
}

contract('BASE-SECRET-001', 'host-only fixture is readable before denial and a readable file fails the guest probe', async t => {
  const transport = await localTransport(t);
  const fixture = await prepareHostOnlyFile({ image, run: transport.run });
  try {
    assert.match(await readFile(fixture.path, 'utf8'), /^synthetic fixture [a-f0-9]{64}$/);
    assert.equal(fs.statSync(fixture.path).mode & 0o777, 0o444);
    const probe = new Function('fs', 'assert', deniedHostFileRead(fixture.path));
    assert.throws(() => probe(fs, assert), { code: 'ERR_ASSERTION' }, 'exposing the host file must fail the hostile-source assertion');
    assert.deepEqual(transport.operations, ['volume create', 'volume inspect', 'run --rm', 'run --rm']);
  } finally {
    await fixture.cleanup();
  }
  await assert.rejects(readFile(fixture.path), { code: 'ENOENT' });
  assert.deepEqual(transport.operations.slice(-2), ['rm --force', 'volume rm']);
});

for (const [name, change] of [
  ['missing', path => rm(path)],
  ['different', async path => { await rm(path); await writeFile(path, 'different synthetic bytes', { mode: 0o444 }); }],
]) {
  contract('BASE-SECRET-001', `host-only fixture rejects ${name} contents before starting the guest and cleans up`, async t => {
    const transport = await localTransport(t, change);
    await assert.rejects(prepareHostOnlyFile({ image, run: transport.run }), name === 'missing' ? /read control failed/ : /must contain the created bytes/);
    assert.deepEqual(transport.operations.slice(-2), ['rm --force', 'volume rm']);
  });
}
