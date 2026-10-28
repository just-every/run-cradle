import './typescript-loader.mjs'
const { createSampleDataRepository } = await import('../../src/core/features/sample-data/repository.ts')
const { prepareLaunchSetup } = await import('../../src/apps/launch/setup.server.ts')
const { LAUNCH_APP_ID } = await import('../../src/apps/launch/contracts.ts')
const { initializeLegacyAuthority } = await import('../../src/domains/authority/setup.server.ts')
// Explicit test-only invocation of the existing sample repository. The fixture
// bytes and production repository are unchanged; no public setup endpoint exists.
import assert from 'node:assert/strict'
import {adoptFixtureOperators} from './base-fixture-auth.mjs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

export async function installLegacyFixture(directory, { installedLaunchDefinitions = false, installationOwner = false } = {}) {
  const fixture = JSON.parse(await readFile(new URL('../../sample-data/cradle.json', import.meta.url), 'utf8'))
  // The walkthrough exercises shipped definitions through public commands. Let
  // the real installer create their canonical IDs instead of adopting sample IDs.
  if (installedLaunchDefinitions) {
    fixture.lenses = []
    fixture.automations = []
    fixture.automationRuns = []
  }
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response(null, {status:404}) } }', d1Databases: { DB: '00000000-0000-0000-0000-000000000000' }, resourcePersistencePath: path.join(directory, 'v3') }))
  try {
    const db = await runtime.getD1Database('DB')
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM campaigns').first()).count, 0, 'Fresh install must contain no campaigns before explicit fixture installation')
    await createSampleDataRepository({ $client: db }).install(fixture)
    await db.prepare("INSERT OR IGNORE INTO authority_principals(id,kind,human_id,state,created_at,updated_at) SELECT id,'human',id,'active',created_at,updated_at FROM operators").run()
    const ownerId = fixture.operators.slice().sort((a,b) => a.id.localeCompare(b.id))[0].id
    await db.batch(await prepareLaunchSetup(db, ownerId))
    if (installationOwner) {
      // Review the existing exact launch mappings through the production legacy
      // initializer before Base adopts identities and issues any credentials.
      const policies = (await db.prepare('SELECT * FROM authority_policies WHERE app_id=? ORDER BY id').bind(LAUNCH_APP_ID).all()).results.map(row => ({
        id: row.id, appId: row.app_id, name: row.name, rules: JSON.parse(row.rules_json), version: row.version,
        createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
      }))
      const memberships = (await db.prepare('SELECT principal_id,policy_id FROM authority_memberships WHERE app_id=? ORDER BY principal_id').bind(LAUNCH_APP_ID).all()).results.map(row => ({ memberId: row.principal_id, policyId: row.policy_id }))
      assert.ok(policies.length && memberships.length, 'Installation owner requires existing launch mappings')
      await initializeLegacyAuthority(db, { initialOwnerId: ownerId, launchAppId: LAUNCH_APP_ID, policies, memberships })
    }
    if(await db.prepare("SELECT 1 FROM sqlite_master WHERE name='oa_operators'").first()) await adoptFixtureOperators(db)
    // This is an already configured portfolio, including its ordinary members.
    // Fresh owner fixtures still complete the real native /setup form.
    if(await db.prepare("SELECT 1 FROM sqlite_master WHERE name='cradle_first_run'").first())
      await db.prepare('UPDATE cradle_first_run SET completed_at=unixepoch()*1000 WHERE singleton=1').run()
    return ownerId
  } finally { await runtime.dispose() }
}
