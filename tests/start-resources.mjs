import {browserCookies,sessionCookieWithToken} from './helpers/session-cookies.mjs'
import {baseHttpSession} from './helpers/base-http-session.mjs'
import { expiredToken, revokedToken, authoritySessionControlsSql } from './helpers/session-controls.mjs'
import { installLegacyFixture } from './helpers/install-legacy-fixture.mjs'
import { navigateFromSignInToApp } from './helpers/public-app-navigation.mjs'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { contract } from './contract.mjs'

const port = Number(process.env.CRADLE_TEST_PORT ?? 0)
let origin = `http://127.0.0.1:${port}`
// Synchronous D1 controls can outlive a pooled connection's keepalive timeout.
const request = (url, init = {}) => fetch(url, { ...init, headers: { ...init.headers, connection: 'close' } })
const documentPath = (family, id) => `/app/${family}/${id}${family === 'lenses' ? '/edit' : ''}`
const missingIds = ['Missing123', 'not-a-record', 'not%2Da%2Drecord', 'not%2Fa%2Frecord', '%2e%2e%2fsettings', 'not%252Fa%252Frecord']
const maliciousResources = [
  '/auth/local-sign-in', '/api/session', '/api/search?q=private',
  'https://hostile.invalid/api/campaigns', '//hostile.invalid/api/campaigns',
  '/api/../auth/local-sign-in', '/api/campaigns/../settings',
  '/api/campaigns/%2e%2e', '/api/campaigns/%2fsettings', '/api/campaigns/%252fsettings',
  '/api/campaigns/..\\settings', '/api/campaigns#fragment', '/api/campaigns/extra/path',
]

contract('VIEW-004 AUTH-BASE-001 DOCS-001', 'unavailable Start record documents are not found while native auth and the generated resource boundary remain intact', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cradle-start-resources-'))
  let worker, browser, output = ''
  const evidence = { documents: [], wire: [], browser: [] }
  context.after(async () => {
    if (browser) await browser.close()
    if (worker && worker.exitCode === null) {
      const exited = new Promise(resolve => worker.once('exit', resolve))
      process.kill(-worker.pid, 'SIGTERM')
      await exited
    }
    if (process.env.START_RESOURCE_EVIDENCE) await writeFile(process.env.START_RESOURCE_EVIDENCE, JSON.stringify({ ...evidence, workerLog: output }, null, 2))
    await rm(directory, { recursive: true, force: true })
  })
  const command = (args) => {
    const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    assert.equal(result.status, 0, result.stderr || result.stdout)
  }
  assert.equal(await request(`${origin}/health`).catch(() => null), null, 'refuse an occupied port')
  const migration = spawnSync(process.execPath, ['scripts/migrate-local.mjs', '--persist-to', directory], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.equal(migration.status, 0, migration.stderr || migration.stdout)
  const localMemberId = await installLegacyFixture(directory)
  worker = spawn(process.execPath, ['tests/helpers/compiled-worker.mjs', '--port', String(port), '--persist-to', directory, '--var', 'AUTH_LOCAL:true', '--var', 'OWNER_EMAIL:maya@northstar.example', '--var', 'MAIL_PROVIDER:development', '--var', 'MAIL_FROM:auth@localhost.test', '--var', 'SESSION_SECRET:test-only-session-secret-32-characters-long', '--var', `APP_ORIGIN:${origin}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  worker.stdout.on('data', chunk => { output += chunk; const listener=output.match(/Emitted Worker listening at (http:\/\/127\.0\.0\.1:\d+)/); if(listener)origin=listener[1] }); worker.stderr.on('data', chunk => { output += chunk })
  let ready = false
  for (let i = 0; i < 150; i++) {
    if ((await request(`${origin}/health`).catch(() => null))?.ok) { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, output)
  const {cookie,csrfToken}=await baseHttpSession(origin)
const get = (url, session = cookie) => request(`${origin}${url}`, { redirect: 'manual', headers: session ? { cookie: session } : {} })
  const json = async url => (await get(url)).json()
  const session = await json('/api/session')
  const now = Date.now()
  command(['d1', 'execute', 'cradle', '--local', '--persist-to', directory, '--command', `INSERT INTO sessions (id,created_at,updated_at,version,operator_id,token,expires_at,revoked_at) VALUES ('resource-expired',${now},${now},1,'${session.operator.id}','resource-expired',${now-1},NULL),('resource-revoked',${now},${now},1,'${session.operator.id}','resource-revoked',${now+86400000},${now})`])
  command(['d1','execute','cradle','--local','--persist-to',directory,'--command',authoritySessionControlsSql(session.operator.id,now)])
  const controls = [['valid', cookie], ['missing', ''], ['expired', sessionCookieWithToken(cookie,expiredToken)], ['revoked', sessionCookieWithToken(cookie,revokedToken)]]
  const families = {
    campaigns: (await json('/api/portfolio')).attention[0].id,
    risks: (await json('/api/risks/lens')).items[0].id,
    milestones: (await json('/api/milestones/timeline')).items[0].id,
    decisions: (await json('/api/decisions')).items[0].id,
    lenses: (await json('/api/lenses')).lenses[0].id,
  }
  const before = await json('/api/campaigns')
  for (const [family, existingId] of Object.entries(families)) {
    assert.equal((await get(`/api/${family}/not-a-record`)).status, 404)
    for (const id of [existingId, ...missingIds]) for (const [control, sessionCookie] of controls) {
      const url = documentPath(family, id)
      const response = await get(url, sessionCookie), body = await response.text()
      evidence.documents.push({ url, control, status: response.status, location: response.headers.get('location') })
      if (control !== 'valid') {
        assert.equal(response.status, 303, `${control} ${url}`)
        assert.equal(response.headers.get('location'), `${origin}/signin?next=${encodeURIComponent(url)}`)
        assert.equal(body, '')
      } else if (id === existingId) {
        assert.equal(response.status, 200, url)
        assert.ok(body.includes(existingId), url)
      } else {
        assert.equal(response.status, 404, url)
        assert.match(body, /Page not found/, url)
        assert.doesNotMatch(body, /Something went wrong|Could not load this page|Maya Chen/, url)
      }
    }
  }
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  let dataWire
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const browserContext = await browser.newContext({ viewport })
    await browserContext.addCookies(browserCookies(cookie,origin))
    const page = await browserContext.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', req => { if (req.url().includes('/_serverFn/') && new URL(req.url()).searchParams.has('payload')) dataWire = { url: req.url(), headers: req.headers() } })
    await page.goto(`${origin}/docs`)
    const timeOrigin = await page.evaluate(() => performance.timeOrigin)
    await page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true }).click()
    await page.waitForURL('**/app')
    await navigateFromSignInToApp(page)
    await page.waitForURL('**/app')
    await page.getByRole('region', { name: 'Your bases', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin)
    for (const family of Object.keys(families)) {
      const response = await page.goto(`${origin}${documentPath(family, 'not-a-record')}`)
      assert.equal(response.status(), 404)
      await page.getByRole('heading', { name: 'Page not found', exact: true }).waitFor()
      await page.waitForLoadState('networkidle')
      assert.doesNotMatch(await page.locator('body').innerText(), /Maya Chen|Something went wrong|Could not load this page/)
    }
    assert.deepEqual(errors, [])
    evidence.browser.push({ viewport, missingRecordPages: 5, errors, publicToAppTimeOriginStable: true })
    await browserContext.close()
  }
  assert.ok(dataWire, 'capture the installed generated client, not a guessed protocol')
  const headers = { ...dataWire.headers }; delete headers.cookie; delete headers.host
  const rpc = async (resource, control = 'valid', sessionCookie = cookie) => {
    const url = new URL(dataWire.url), payload = url.searchParams.get('payload')
    assert.ok(payload.includes('/api/portfolio'))
    url.searchParams.set('payload', payload.replace(JSON.stringify('/api/portfolio'), JSON.stringify(resource)))
    const response = await request(url, { headers: { ...headers, ...(sessionCookie ? { cookie: sessionCookie } : {}) } })
    const body = await response.text()
    evidence.wire.push({ resource, control, url: String(url), status: response.status, headers: Object.fromEntries(response.headers), body })
    return { response, body }
  }
  // Positive controls prove this exact captured encoder/transport reaches real D1 readers.
  for (const [family, id] of Object.entries(families)) {
    const resource = `/api/${family}/${id}`
    for (const [control, sessionCookie] of controls) {
      const { response, body } = await rpc(resource, control, sessionCookie)
      assert.equal(response.status, 200)
      if (control === 'valid') { assert.ok(body.includes(id)); assert.doesNotMatch(body, /isSerializedRedirect/) }
      else { assert.match(body, /"isSerializedRedirect":true/); assert.match(body, /signin/); assert.ok(!body.includes(id)) }
    }
    const { body } = await rpc(`/api/${family}/not-a-record`)
    assert.match(body, /isNotFound/)
    assert.ok(!body.includes(id))
  }
  for (const resource of maliciousResources) {
    const { response, body } = await rpc(resource)
    assert.ok(response.status < 500, resource)
    assert.match(body, /isNotFound/, resource)
    assert.doesNotMatch(body, /Maya Chen|maya@|attention|session_id/, resource)
  }
  assert.equal((await request(dataWire.url, { headers: { ...headers, cookie, origin: 'https://hostile.invalid', 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.deepEqual(await json('/api/campaigns'), before, 'resource GETs must not mutate records')
})
