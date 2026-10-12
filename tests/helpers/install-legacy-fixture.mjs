import './typescript-loader.mjs'
const { prepareLaunchSetup } = await import('../../src/apps/launch/setup.server.ts')
// Explicit test-only invocation of the existing sample repository. The fixture
// bytes and production repository are unchanged; no public setup endpoint exists.
import assert from 'node:assert/strict'
import {adoptFixtureOperators} from './base-fixture-auth.mjs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
export async function installLegacyFixture(directory) {
  const common = moduleUrl(transpile(await readFile(new URL('../../src/core/features/shared/repository.ts', import.meta.url), 'utf8')))
  const repositorySource = await readFile(new URL('../../src/core/features/sample-data/repository.ts', import.meta.url), 'utf8')
  const repository = await import(moduleUrl(transpile(repositorySource).replace("'../shared/repository'", JSON.stringify(common))))
  const fixture = JSON.parse(await readFile(new URL('../../sample-data/cradle.json', import.meta.url), 'utf8'))
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response(null, {status:404}) } }', d1Databases: { DB: '00000000-0000-0000-0000-000000000000' }, resourcePersistencePath: path.join(directory, 'v3') }))
  try {
    const db = await runtime.getD1Database('DB')
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM campaigns').first()).count, 0, 'Fresh install must contain no campaigns before explicit fixture installation')
    await repository.createSampleDataRepository({ $client: db }).install(fixture)
    await db.prepare("INSERT OR IGNORE INTO authority_principals(id,kind,human_id,state,created_at,updated_at) SELECT id,'human',id,'active',created_at,updated_at FROM operators").run()
    const ownerId = fixture.operators.slice().sort((a,b) => a.id.localeCompare(b.id))[0].id
    await db.batch(await prepareLaunchSetup(db, ownerId))
    if(await db.prepare("SELECT 1 FROM sqlite_master WHERE name='oa_operators'").first()) await adoptFixtureOperators(db)
    // This is an already configured portfolio, including its ordinary members.
    // Fresh owner fixtures still complete the real native /setup form.
    if(await db.prepare("SELECT 1 FROM sqlite_master WHERE name='cradle_first_run'").first())
      await db.prepare('UPDATE cradle_first_run SET completed_at=unixepoch()*1000 WHERE singleton=1').run()
    return ownerId
  } finally { await runtime.dispose() }
}
