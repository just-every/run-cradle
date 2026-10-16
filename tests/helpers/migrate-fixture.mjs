import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Use the installation runner's ordered migrations and real Wrangler ledger.
export function migrateFixture(directory) {
  const migration = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/migrate-local.mjs', import.meta.url)), '--persist-to', directory], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.ifError(migration.error)
  assert.equal(migration.status, 0, migration.stderr + migration.stdout)
}
