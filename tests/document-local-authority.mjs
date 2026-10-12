import './helpers/launch-ui-source.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {migrationInventory} from '../scripts/migration-groups.mjs'
import { registerHooks } from 'node:module'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { contract } from './contract.mjs'
import { migratedD1 } from './helpers/sqlite-d1.mjs'

// Only the hosting boundary is adapted: actual Base, product authentication,
// InstallationCoordinator, policies, API, document loader and Home run on SQLite.
// No issued credential or private request is printed by these tests.
const runtime = { env: {}, request: undefined, status: 200 }
globalThis[Symbol.for('cradle.document-authority-test')] = runtime
const hostModule = source => `data:text/javascript,${encodeURIComponent(source)}`
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') return { url: hostModule(`
      export const env = globalThis[Symbol.for('cradle.document-authority-test')].env
      export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env } }
    `), shortCircuit: true }
    if (specifier === '@tanstack/react-start/server' && context.parentURL?.endsWith('/document.server.ts')) return { url: hostModule(`
      const runtime = globalThis[Symbol.for('cradle.document-authority-test')]
      export const getRequest = () => runtime.request
      export const setResponseStatus = status => { runtime.status = status }
    `), shortCircuit: true }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }
    if (url.startsWith('file:') && url.endsWith('.json')) return { format: 'module', source: `export default ${readFileSync(new URL(url), 'utf8')}`, shortCircuit: true }
    return next(url, context)
  },
})
const [document, { createDocumentResourceRequest }, { createPlatform }, { createApplication }, { seedConfig }, { InstallationCoordinator }, { HomePage }, { DocumentSession }, { DocumentDataContext }, {firstRunResponse}] = await Promise.all([
  import('../src/core/app/document.server.ts'), import('../src/core/app/document-request.server.ts'),
  import('../src/core/platform/index.ts'), import('../src/core/app/application.ts'), import('../src/ext/config.ts'),
  import('../src/core/platform/installation.server.ts'), import('../src/core/features/portfolio/ui/home-page.tsx'),
  import('../src/core/app/document-context.tsx'), import('../src/core/app/document-data.tsx'), import('../src/core/features/setup/server.ts'),
])

async function fixture(local) {
  const database = migratedD1(migrationInventory())
  try {
    const origin = local ? 'http://127.0.0.1:4185' : 'https://document.example.test'
    for (const key of Object.keys(runtime.env)) delete runtime.env[key]
    Object.assign(runtime.env, {
      DB: database.db, APP_ORIGIN: origin, OWNER_EMAIL: 'owner@example.test',
      SESSION_SECRET: 'synthetic-document-test-signing-key', SETUP_TOKEN: 'synthetic-document-test-bootstrap-key',
      ...(local ? { AUTH_LOCAL: 'true', MAIL_PROVIDER: 'development' } : {}),
    })
    const storage = new Map()
    const coordinator = new InstallationCoordinator({ storage: { get: key => storage.get(key), put: (key, value) => storage.set(key, value) }, blockConcurrencyWhile: run => run() }, runtime.env)
    runtime.env.INSTALLATION = { idFromName: name => name, get: () => ({ fetch: (url, init) => coordinator.fetch(new Request(url, init)) }) }
    const platform = createPlatform(runtime.env)
    const base = platform.auth.configuration.base
    const request = (headers = {}, url = origin + '/app', method = 'GET') => new Request(url, { method, headers: { host: new URL(origin).host, origin, 'cf-connecting-ip': '192.0.2.71', ...headers } })
    const issued = await base.bootstrap(request({}, origin + '/auth/bootstrap', 'POST'), { token: runtime.env.SETUP_TOKEN, displayName: 'Fresh owner', returnTo: '/app' })
    const cookie = issued.cookie.split(';')[0]
    runtime.request = request({ cookie })
    runtime.status = 200
    await platform.auth.configuration.initializeBaseOwner(issued.operator.id)
    const app = await createApplication(platform, seedConfig)
    const proof=await app.fetch(request({cookie},origin+'/auth/csrf'),runtime.env)
    assert.equal(proof.status,200,'The current native session obtains its form proof')
    const {csrfToken}=await proof.json()
    const workspace=await database.db.prepare("SELECT name,timezone,currency FROM workspace WHERE id='workspace'").first()
    const headers=new Headers(runtime.request.headers);headers.set('content-type','application/x-www-form-urlencoded')
    const completed=await firstRunResponse(new Request(origin+'/setup',{method:'POST',headers,body:new URLSearchParams({...workspace,csrf:csrfToken})}),platform)
    assert.equal(completed.status,303,'The real first-owner form completes the fixture')
    assert.equal(new URL(completed.headers.get('location'),origin).pathname,'/app')
    const owner = (await database.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(issued.operator.id).first()).principal_id
    return { ...database, origin, cookie, base, owner, issued, request, app,
      api: request => app.fetch(request, runtime.env),
      close() { runtime.request = undefined; database.close() },
    }
  } catch (error) { database.close(); throw error }
}

async function renderHome() {
  const session = await document.loadDocumentSession()
  const data = await document.loadDocumentResources(['/api/portfolio'])
  const routeTree = createRootRoute({ component: () => h(DocumentSession, { value: session }, h(DocumentDataContext, { value: data }, h(HomePage))) })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return { session, data, html: renderToStaticMarkup(h(RouterProvider, { router })) }
}

for (const local of [true, false]) {
  const mode = local ? 'local' : 'production'
  contract('AUTH-BASE-001 VIEW-001 BASE-ACCESS-003 RECORDS-001', `${mode}: genuine Base native owner reaches the actual empty records-first document through independently authorized API data`, async () => {
    const f = await fixture(local)
    try {
      assert.equal((await f.base.getSession(runtime.request)).kind, 'native')
      if (local) {
        const lostHost = new Request(f.origin + '/api/portfolio', { headers: { cookie: f.cookie } })
        const denied = await f.api(lostHost)
        assert.equal(denied.status, 403)
        assert.equal((await denied.json()).error.code, 'loopback_required', 'The former cookie-only reconstruction loses required original Host')
      }
      const result = await renderHome()
      assert.equal(runtime.status, 200)
      assert.equal(result.session.launchAvailability, 'available')
      assert.equal(result.session.launchInUse, false)
      assert.deepEqual(result.data['/api/portfolio'].metrics, { liveCampaigns: 0, needsAttention: 0, openDecisions: 0, portfolioHealth: null, staleHealthCount: 0 })
      assert.match(result.html, /<h2>Your business, organised your way\.<\/h2>/)
      assert.match(result.html, /Start from a template or build your own tables and fields in Records/)
      assert.match(result.html, /Choose Create base to build your own, or browse the editable templates/)
      assert.match(result.html, /href="\/app\/records">Open records<\/a>/)
      assert.doesNotMatch(result.html, /This work is outside your access|loopback_required|Launch|Campaign|campaigns|portfolio-metric-grid/)
      await f.db.prepare('UPDATE oa_sessions SET revoked_at=1 WHERE id=?').bind(f.issued.session.id).run()
      assert.equal((await f.api(createDocumentResourceRequest(runtime.request, '/api/portfolio'))).status, 401)
      await assert.rejects(document.loadDocumentResources(['/api/portfolio']), error => error.options?.to === '/signin')
    } finally { f.close() }
  })

  contract('AUTH-BASE-001 VIEW-001 BASE-ACCESS-003 RECORDS-001', `${mode}: current restricted policy stays forbidden and exposes no protected rows or counts`, async () => {
    const f = await fixture(local)
    try {
      await f.db.prepare("INSERT INTO campaigns(id,created_at,updated_at,code,name,owner_id,start_date,launch_date,objective,status_summary,phase,status,health,health_updated_at,budget_minor,spend_minor) VALUES('protected-campaign',1,1,'PRIVATE','Protected campaign',?,'2026-01-01','2026-12-01','','','Planning','On track',50,1,0,0)").bind(f.owner).run()
      assert.equal((await renderHome()).session.launchInUse, true)
      const policy = await f.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=?').bind(f.owner).first()
      const rules = JSON.parse(policy.rules_json)
      await f.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules.map((rule, index) => index ? rule : { ...rule, readableFields: rule.readableFields.slice(1) })), policy.id).run()
      const response = await f.api(createDocumentResourceRequest(runtime.request, '/api/portfolio'))
      assert.equal(response.status, 403)
      assert.equal((await response.json()).error.code, 'forbidden')
      const result = await renderHome()
      assert.equal(result.session.launchInUse, false)
      assert.deepEqual(Object.keys(result.data['/api/portfolio']), ['error'])
      assert.match(result.html, /This work is outside your access/)
      assert.match(result.html, /href="\/app\/records">Open records<\/a>/)
      assert.doesNotMatch(result.html + JSON.stringify(result.data), /Your business, organised your way|Protected campaign|protected-campaign|PRIVATE|liveCampaigns|portfolio-metric-grid|loopback_required/)
      // Removing all authority remains a denial. Missing schema independently
      // prevents application composition and must fail, never become empty data.
      await f.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=?").bind(f.owner).run()
      assert.match((await renderHome()).html, /This work is outside your access/)
      f.sql.exec('ALTER TABLE campaigns RENAME TO unavailable_campaigns')
      await assert.rejects(document.loadDocumentResources(['/api/portfolio']), /The current page data could not be read\./)
    } finally { f.close() }
  })
}

contract('AUTH-BASE-001 BASE-ACCESS-003', 'request reconstruction preserves original headers and cannot promote spoofed local context or forward credentials off origin', async () => {
  const f = await fixture(true)
  try {
    const original = f.request({ cookie: f.cookie, forwarded: 'host=untrusted.example.test;proto=https', 'x-forwarded-host': 'untrusted.example.test', 'x-forwarded-proto': 'https', 'sec-fetch-site': 'cross-site', 'x-cradle-consistency': 'unchanged-context' })
    const internal = createDocumentResourceRequest(original, '/api/portfolio')
    assert.deepEqual([...internal.headers], [...original.headers], 'Retain even untrusted context for the unchanged receiving guards')
    assert.equal(internal.method, 'GET')
    for (const path of ['https://external.example.test/api/portfolio', '//external.example.test/api/portfolio', '/api/../../auth/bootstrap', '/auth/bootstrap']) assert.throws(() => createDocumentResourceRequest(original, path), /same-origin API path/)
    for (const [host, url] of [[null, f.origin + '/app'], ['attacker.example.test', f.origin + '/app'], ['127.0.0.1:9999', f.origin + '/app'], ['127.0.0.1:4185', 'https://attacker.example.test/app']]) {
      const headers = new Headers({ cookie: f.cookie, origin: f.origin, forwarded: 'host=127.0.0.1:4185;proto=http', 'x-forwarded-host': '127.0.0.1:4185', 'x-forwarded-proto': 'http' })
      if (host !== null) headers.set('host', host)
      const rejected = new Request(url, { headers })
      for (const request of [rejected, createDocumentResourceRequest(rejected, '/api/portfolio')]) await assert.rejects(f.base.getSession(request), error => ['loopback_required', 'invalid_host'].includes(error.code))
      const response = await f.api(createDocumentResourceRequest(rejected, '/api/portfolio'))
      assert.equal(response.status, 403)
      assert.doesNotMatch(await response.text(), /Fresh owner|liveCampaigns|Protected campaign/)
    }
    for (const headers of [{ origin: 'https://foreign.example.test' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
      const request = f.request(headers, f.origin + '/auth/bootstrap', 'POST')
      await assert.rejects(f.base.bootstrap(request, { token: runtime.env.SETUP_TOKEN, displayName: 'Foreign' }), error => error.code === 'invalid_origin')
    }
  } finally { f.close() }
})

contract('AUTH-BASE-001 VIEW-001 VIEW-004', 'missing data yields the genuine unavailable document and 500 API, then a fresh retry recovers', async () => {
  const f = await fixture(true)
  try {
    f.sql.exec('ALTER TABLE campaigns RENAME TO unavailable_campaigns')
    const unavailable = await document.loadDocumentSession()
    assert.equal(runtime.status, 500)
    assert.equal(unavailable.launchAvailability, 'unavailable')
    assert.equal(Object.hasOwn(unavailable, 'launchInUse'), false)
    await assert.rejects(document.loadDocumentResources(['/api/portfolio']), /The current page data could not be read\./)
    const failed = await f.api(createDocumentResourceRequest(runtime.request, '/api/portfolio'))
    assert.equal(failed.status, 500)
    assert.doesNotMatch(await failed.text(), /SELECT |SQLITE|unavailable_campaigns|loopback_required/)
    f.sql.exec('ALTER TABLE unavailable_campaigns RENAME TO campaigns')
    runtime.status = 200
    assert.match((await renderHome()).html, /Your business, organised your way/)
    assert.equal(runtime.status, 200)
  } finally { f.close() }
})
