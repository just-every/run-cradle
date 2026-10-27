import {cp, mkdir, mkdtemp, readFile, rm, symlink} from 'node:fs/promises';
import {spawn, spawnSync} from 'node:child_process';
import {availableParallelism, tmpdir, totalmem} from 'node:os';
import path from 'node:path';

// Expand the package's authoritative file list without asking Node to shard it.
// Retain its loader and test options when invoking one explicitly assigned file.
export async function nodeSuite(name) {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const command = pkg.scripts?.[name];
  if (typeof command !== 'string' || /[;&|\n]/.test(command)) throw Error(`Expected a single Node test suite: ${name}`);
  const tokens = command.split(/\s+/);
  const files = tokens.filter(token => /^tests\/[a-zA-Z0-9_./-]+\.mjs$/.test(token));
  const args = tokens.slice(1).filter(token => !files.includes(token));
  if (tokens[0] !== 'node' || !args.includes('--test') || !files.length || new Set(files).size !== files.length || args.some(token => token.includes('*') || token.startsWith('--test-shard'))) throw Error(`Expected explicit Node test files: ${name}`);
  return {files, command: file => ['node', ...args, file].join(' ')};
}

async function workspace(root, parent, lane) {
  const container = path.join(parent, String(lane)), directory = path.join(container, 'source');
  await mkdir(directory, {recursive: true});
  const listing = spawnSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
  if (listing.status !== 0) throw Error('Cannot enumerate verification workspace');
  for (const file of listing.stdout.split('\0').filter(Boolean)) {
    const target = path.join(directory, file);
    await mkdir(path.dirname(target), {recursive: true});
    await cp(path.join(root, file), target, {dereference: false});
  }
  // Immutable dependencies/build are shared; fixtures and receipts are private.
  // The Git link preserves freshLocalCopy's real-clone journey at this exact SHA.
  for (const name of ['node_modules', 'dist', '.git']) await symlink(path.join(root, name), path.join(directory, name));
  const temporary = path.join(container, 'tmp');
  await mkdir(temporary);
  return {directory, temporary};
}

async function runLanes(shard, plan, selectedLane) {
  const root = process.cwd(), parent = await mkdtemp(path.join(tmpdir(), 'cradle-verify-'));
  const timings = [];
  let failed = false;
  console.log(`VERIFY_RESOURCES cpus=${availableParallelism()} memoryMiB=${Math.round(totalmem() / 1048576)} lanes=${shard.lanes.length}`);
  const nproc = spawnSync('nproc', [], {encoding: 'utf8'});
  const cpuCount = nproc.status === 0 ? nproc.stdout.trim() : 'unavailable';
  if (nproc.status === 0) console.log(`VERIFY_NPROC ${cpuCount}`);
  try {
    const workspaces = await Promise.all(shard.lanes.map((_, index) => workspace(root, parent, index)));
    const execute = async (id, lane) => {
      const unit = plan.costMap.units[id], current = workspaces[lane];
      const environment = {...process.env, TMPDIR: current.temporary, TMP: current.temporary, TEMP: current.temporary,
        CRADLE_AUTHORITY_PORT: String(23000 + lane * 100), CRADLE_TEST_PORT: '0', CRADLE_RECORDS_PORT: '0',
        CRADLE_BASE_AUTHORITY_PORT: '0', CRADLE_FOUNDATION_PORT: '0', CRADLE_RECUT_PORT: '0'};
      delete environment.SEED_VERIFY_SHARD;
      delete environment.RER_LOCAL_OPERATION;
      const command = unit.suite ? (await nodeSuite(unit.suite)).command(unit.file) : unit.command;
      console.log(`VERIFY_UNIT_START shard=${shard.name} lane=${lane + 1} unit=${id} weight=${unit.seconds}`);
      const start = performance.now();
      const code = await new Promise((resolve, reject) => {
        const child = spawn(command, {shell: true, cwd: current.directory, env: environment, stdio: 'inherit'});
        child.once('error', reject);
        child.once('exit', (status, signal) => resolve(signal ? 1 : status ?? 1));
      });
      const seconds = ((performance.now() - start) / 1000).toFixed(3);
      console.log(`VERIFY_UNIT shard=${shard.name} lane=${lane + 1} unit=${id} seconds=${seconds} exit=${code}`);
      timings.push(`${id}=${seconds}s/${code}`);
      if (code !== 0) failed = true;
    };
    // Deadline/p95 probes run alone on the entire job, never beside another lane.
    if (selectedLane === undefined) for (const id of shard.isolated) await execute(id, 0);
    await Promise.all(shard.lanes.map(async (units, lane) => {
      if (selectedLane !== undefined && selectedLane !== lane) return;
      for (const id of units) await execute(id, lane);
    }));
  } finally {
    // One annotation per job remains readable through the checks API without logs.
    const message = `${shard.name}: cpus=${availableParallelism()} nproc=${cpuCount} memoryMiB=${Math.round(totalmem() / 1048576)} lanes=${shard.lanes.length}; ${timings.join('; ')}`.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log(`::notice title=Verification unit timings::${message}`);
    await rm(parent, {recursive: true, force: true});
  }
  if (failed) process.exitCode = 1;
}

async function main() {
  const [mode, name, option, index, extra] = process.argv.slice(2);
  if (mode !== '--lanes' || extra || (option !== undefined && (option !== '--lane' || !/^[1-3]$/.test(index ?? '')))) throw Error('Usage: verify-suite.mjs --lanes SHARD [--lane 1|2|3]');
  const {verificationPlan} = await import('./verify-app.mjs');
  const plan = await verificationPlan(), shard = plan.push.find(item => item.name === name);
  if (!shard) throw Error(`Unknown concurrent shard: ${name}`);
  await runLanes(shard, plan, option ? Number(index) - 1 : undefined);
}

// Finish module evaluation before verificationPlan imports the suite expander.
if (process.argv[1] === import.meta.filename) main().catch(error => { console.error(error); process.exitCode = 1; });
