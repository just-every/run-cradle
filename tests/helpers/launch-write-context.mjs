import { createRequire } from 'node:module'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { build } = require('../../node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild')
// Bundle actual production modules together to retain SQL capability identity
// and the retained JSON sample import, just as the original domain harness does.
const bundle = await build({ entryPoints: ['tests/helpers/launch-write-entry.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const directory = await mkdtemp(path.join(tmpdir(), 'launch-write-source-'))
let source
try {
 await writeFile(path.join(directory, 'runtime.mjs'), bundle.outputFiles[0].text)
 source = await import(path.join(directory, 'runtime.mjs'))
} finally { await rm(directory, { recursive: true, force: true }) }
const { createPolicyPort, createRequestContextFactory, createReplayAccess, createApplicationEntityRegistry, createDescriptorRegistry, launchDescriptors, createAdmissionService, createLaunchHandlers, createChannelsIntegration, createUlid, LAUNCH_APP_ID, launchEntities, launchCommandSchema, createLegacyImportAdapter } = source
export const launchSource = source
export { createLegacyImportAdapter }
export const { createLegacyAutomationAuthority, createLegacyAutomationRuntime, decodeCampaignDetail } = source
export const expected = (kind, row) => [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities[kind], recordId: row.id }, version: row.version }]
export async function writeContext(h, session = h.ownerSession, releaseId) {
 const entities = createApplicationEntityRegistry(createDescriptorRegistry(launchDescriptors))
 const policy = createPolicyPort(h.db, entities)
 const replay = createReplayAccess(h.db, policy, entities)
 const admission = createAdmissionService(h.db, { authorizeReplay: replay.authorizeReplay })
 const resolve = createRequestContextFactory(h.db, h.configuration)
 const ctx = await resolve(new Request(`${h.origin}/api/v1/session`, { headers: { host:new URL(h.origin).host, cookie: session.cookie } }), 'http')
 const context = { releaseId, db: h.db, policy, integration: { ...createChannelsIntegration(h.db), deleteCampaign: (ctx,id)=>source.campaignErasure(h.db,ctx,id) } }
 const handlers = createLaunchHandlers(context)
 const prepare = (action, input, revisions = []) => handlers[action](ctx, launchCommandSchema(action).parse({ commandId: createUlid(), input, expected: revisions }))
 const commit = async (action, input, revisions = []) => (await admission.commit(ctx, await prepare(action, input, revisions))).result.value
 return { policy, admission, ctx, prepare, commit, context, createAdmissionService }
}
export async function mutationSnapshot(db, { omitSessionReadTimestamp = false } = {}) {
 const names = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results.map(row => row.name)
 const results = await db.batch(names.map(name => db.prepare(`SELECT * FROM "${name}" ORDER BY 1`)))
 return Object.fromEntries(names.map((name, index) => [name, results[index].results.map(row => {
  if (!omitSessionReadTimestamp || name !== 'authority_sessions') return row
  // Native authentication records a successful session read even on a denied
  // mutation. Keep every other persisted session and authority value exact.
  const { last_seen_at, ...identity } = row
  return identity
 })]))
}
