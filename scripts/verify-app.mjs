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
