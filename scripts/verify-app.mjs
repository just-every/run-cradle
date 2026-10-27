import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

export const buildCommands = ['pnpm build:app', 'pnpm check:types', 'pnpm check:deployment-spec'];

export async function verificationPlan() {
  const plan = JSON.parse(await readFile(new URL('../verification.json', import.meta.url), 'utf8'));
  const names = new Set();
  for (const tier of ['push', 'nightly']) {
    if (!Array.isArray(plan[tier])) throw Error(`Missing verification tier: ${tier}`);
    for (const shard of plan[tier]) {
      if (!/^[a-z][a-z0-9-]*$/.test(shard.name) || names.has(shard.name)) throw Error(`Invalid or duplicate shard: ${shard.name}`);
      if (typeof shard.browser !== 'boolean' || typeof shard.hosted !== 'boolean' || !Array.isArray(shard.commands) || !shard.commands.length || shard.commands.some(command => typeof command !== 'string' || !command.trim())) throw Error(`Incomplete shard: ${shard.name}`);
      names.add(shard.name);
    }
  }
  if (plan.push.filter(shard => shard.hosted).length !== 1) throw Error('Push verification must include exactly one hosted production check');
  if (!plan.costMap || !plan.push.some(shard => shard.name === plan.costMap.defaultShard)) throw Error('Missing named default cost-map shard');
  if (plan.push.length > 8) throw Error('Push verification permits at most eight shard jobs');
  const {nodeSuite} = await import('./verify-suite.mjs');
  const units = plan.costMap.units, assigned = new Set();
  if (!units || typeof units !== 'object') throw Error('Missing verification cost map');
  for (const [id, unit] of Object.entries(units)) {
    if (!/^[a-zA-Z0-9_./:-]+$/.test(id) || !Number.isFinite(unit.seconds) || unit.seconds <= 0) throw Error(`Invalid cost-map weight: ${id}`);
    if (unit.suite) {
      if (!plan.costMap.suites.includes(unit.suite) || !(await nodeSuite(unit.suite)).files.includes(unit.file)) throw Error(`Stale cost-map file: ${unit.file}; remove its weight and assignment`);
      await readFile(new URL('../' + unit.file, import.meta.url));
    } else if (typeof unit.command !== 'string' || !unit.command.trim() || unit.command.includes('--test-shard')) throw Error(`Invalid cost-map command: ${id}`);
    if (typeof unit.exclusive !== 'boolean' || typeof unit.browser !== 'boolean') throw Error(`Missing unit execution policy: ${id}`);
  }
  for (const suite of plan.costMap.suites) {
    const {files} = await nodeSuite(suite);
    for (const file of files) {
      const matches = Object.values(units).filter(unit => unit.suite === suite && unit.file === file);
      if (!matches.length) throw Error(`Unweighted suite file: ${file}; default shard ${plan.costMap.defaultShard}; add its weight in verification.json and explicitly assign it before CI can run`);
      if (matches.length !== 1) throw Error(`Duplicate cost-map file: ${file}`);
    }
  }
  for (const shard of plan.push) {
    if (!Array.isArray(shard.lanes) || shard.lanes.length !== 3 || !Array.isArray(shard.isolated) || shard.commands.length !== 1 || shard.commands[0] !== `node scripts/verify-suite.mjs --lanes ${shard.name}`) throw Error(`Invalid lane wiring: ${shard.name}`);
    for (const [exclusive, ids] of [[true, shard.isolated], ...shard.lanes.map(ids => [false, ids])]) {
      if (!Array.isArray(ids)) throw Error(`Missing lane: ${shard.name}`);
      for (const id of ids) {
        const unit = units[id];
        if (!unit || assigned.has(id)) throw Error(`Unknown or multiply assigned cost-map unit: ${id}`);
        if (unit.exclusive !== exclusive || (unit.browser && !shard.browser)) throw Error(`Unsafe lane policy: ${id}`);
        assigned.add(id);
      }
    }
  }
  for (const id of Object.keys(units)) if (!assigned.has(id)) throw Error(`Unassigned cost-map unit: ${id}`);
  return plan;
}

export function run(command, environment = process.env) {
  console.log(`VERIFY_COMMAND ${command}`);
  const result = spawnSync(command, {shell: true, stdio: 'inherit', env: environment});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv[1] === import.meta.filename) {
  const plan = await verificationPlan();
  const selected = process.argv[2] ?? process.env.SEED_VERIFY_SHARD;
  const all = [...plan.push, ...plan.nightly];
  const shard = all.find(item => item.name === selected);
  if (selected !== undefined && selected !== 'build' && !shard) throw Error(`Unknown verification shard: ${selected}`);
  const {enforceTestBudget} = await import('../tests/helpers/test-budget.mjs');
  await enforceTestBudget();
  const commands = selected === 'build' ? buildCommands
    : shard ? shard.commands : [...buildCommands, ...all.flatMap(item => item.commands)];
  const environment = {...process.env};
  // Disposable clone journeys acquire their own operation and full verification.
  delete environment.SEED_VERIFY_SHARD;
  for (const command of commands) run(command, environment);
}
