import {spawnSync} from 'node:child_process';
import {verifyCommands} from './verify-groups.mjs';

// CI's runtime worker keeps rer's hosted-output and hydration checks after its
// application commands. With no selection, local rer verify runs every group.
const group = process.argv[2] ?? process.env.CRADLE_VERIFY_GROUP;
if (group !== undefined && !verifyCommands.some(item => item.group === group)) {
  console.error(`Unknown verification group: ${group}`);
  process.exit(1);
}
const commands = verifyCommands.filter(item => group === undefined || item.group === group).map(item => item.command);
const environment = {...process.env};
delete environment.CRADLE_VERIFY_GROUP;
for (const command of commands) {
  console.log(`VERIFY_COMMAND ${command}`);
  // Keep the original package script's shell semantics, including pnpm.cmd.
  const result = spawnSync(command, {shell: true, stdio: 'inherit', env: environment});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
