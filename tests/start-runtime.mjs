import {browserCookies,sessionCookieWithToken} from './helpers/session-cookies.mjs'
import {baseHttpSession} from './helpers/base-http-session.mjs'
import { expiredToken, revokedToken, authoritySessionControlsSql } from './helpers/session-controls.mjs'
import { installLegacyFixture } from './helpers/install-legacy-fixture.mjs'
import { navigateFromSignInToApp } from './helpers/public-app-navigation.mjs'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { contract } from './contract.mjs'

// D1 CLI controls can outlast pooled keepalive; use independently closed HTTP connections.
const request = (url, init = {}) => fetch(url, { ...init, headers: { ...init.headers, connection: 'close' } })
const port = Number(process.env.CRADLE_TEST_PORT ?? 0)
let origin = `http://127.0.0.1:${port}`
const command = (args) => {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}
// Finish status-only responses before reusing fetch's pooled connection.
const responseStatus = async (pending) => {
  const response = await pending
  await response.arrayBuffer()
  return response.status
}
const bodyContent = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
const routesFor = ({ campaign, risk, milestone, decision, lens }) => [
  '/app', '/app/overview', '/app/campaigns', `/app/campaigns/${campaign}`,
  '/app/lenses/risks', `/app/risks/${risk}`, '/app/lenses/timeline', `/app/milestones/${milestone}`,
  '/app/lenses/new', `/app/lenses/${lens}/edit`, '/app/decisions', `/app/decisions/${decision}`,
  '/app/automations', '/app/notifications', '/app/settings', '/app/settings/workspace',
]

contract('BASE-ACCESS-002 AUTH-BASE-001 HOME-003', 'Start documents, real generated functions and APIs independently validate native sessions; domain data is fresh in SSR', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cradle-start-'))
  let worker
  let browser
  context.after(async () => { if (browser) await browser.close(); if (worker && worker.exitCode === null) { const exited = new Promise((resolve) => worker.once('exit', resolve)); process.kill(-worker.pid, 'SIGTERM'); await exited }; await rm(directory, { recursive: true, force: true }) })
  // Refuse to use somebody else's listener as our test Worker.
  const probe = await request(`${origin}/health`).catch(() => null)
  assert.equal(probe, null, `Port ${port} is already occupied`)
  const migration = spawnSync(process.execPath, ['scripts/migrate-local.mjs', '--persist-to', directory], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.equal(migration.status, 0, migration.stderr || migration.stdout)
  const localMemberId = await installLegacyFixture(directory)
  worker = spawn(process.execPath, ['tests/helpers/compiled-worker.mjs', '--port', String(port), '--persist-to', directory, '--var', 'AUTH_LOCAL:true', '--var', 'OWNER_EMAIL:maya@northstar.example', '--var', 'MAIL_PROVIDER:development', '--var', 'MAIL_FROM:auth@localhost.test', '--var', 'SESSION_SECRET:test-only-session-secret-32-characters-long', '--var', `APP_ORIGIN:${origin}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; worker.stdout.on('data', chunk => { output += chunk; const listener=output.match(/Emitted Worker listening at (http:\/\/127\.0\.0\.1:\d+)/); if(listener)origin=listener[1] }); worker.stderr.on('data', chunk => { output += chunk })
  let ready = false
  for (let i = 0; i < 100; i++) { if (await responseStatus(request(`${origin}/health`)).catch(() => null) === 200) { ready = true; break }; await new Promise(resolve => setTimeout(resolve, 100)) }
  assert.ok(ready, output)
  const sql = (query) => command(['d1', 'execute', 'cradle', '--local', '--persist-to', directory, '--command', query])
  const {cookie,csrfToken}=await baseHttpSession(origin)

  const get = (url, control = cookie, headers = {}) => request(`${origin}${url}`, { redirect: 'manual', headers: { ...(control ? { cookie: control } : {}), ...headers } })
  const json = async (url) => (await get(url)).json()
  const campaigns = await json('/api/campaigns'), risks = await json('/api/risks/lens'), milestones = await json('/api/milestones/timeline'), decisions = await json('/api/decisions'), lenses = await json('/api/lenses')
  const portfolio = await json('/api/portfolio')
  const ids = { campaign: portfolio.attention[0].id, risk: risks.items[0].id, milestone: milestones.items[0].id, decision: decisions.items[0].id, lens: lenses.lenses[0].id }
  const documents = routesFor(ids)
  const operator = (await json('/api/session')).operator.id
  const now = Date.now()
  sql(`INSERT INTO sessions (id,created_at,updated_at,version,operator_id,token,expires_at,revoked_at) VALUES ('migration-expired',${now},${now},1,'${operator}','migration-expired',${now-1000},NULL), ('migration-revoked',${now},${now},1,'${operator}','migration-revoked',${now+86400000},${now})`)
  sql(authoritySessionControlsSql(operator, now))
  for (const control of ['', sessionCookieWithToken(cookie,expiredToken), sessionCookieWithToken(cookie,revokedToken)]) {
    for (const document of documents) {
      const response = await get(`${document}?probe=1`, control)
      assert.equal(response.status, 303, document)
      assert.equal(response.headers.get('location'), `${origin}/signin?next=${encodeURIComponent(document+'?probe=1')}`)
      assert.equal(await response.text(), '')
    }
    for (const api of ['/api', '/api/session', '/api/missing', '/api/campaigns', '/api/risks/lens', '/api/milestones/timeline', '/api/lenses', '/api/decisions', '/api/automations', '/api/notifications', '/api/settings', '/api/search?q=se', '/api/workspace', '/api/status', '/api/portfolio']) assert.equal(await responseStatus(get(api, control)), 401, api)
  }
  const namespaces = ['session', 'status', 'workspace', 'portfolio', 'campaigns', 'deliverables', 'risks', 'milestones', 'lenses', 'decisions', 'automations', 'notifications', 'settings', 'search']
  for (const namespace of namespaces) for (const control of ['', sessionCookieWithToken(cookie,expiredToken), sessionCookieWithToken(cookie,revokedToken), cookie]) assert.equal(await responseStatus(get(`/api/${namespace}/migration/unknown`, control)), control === cookie ? 404 : 401, namespace)
  for (const api of ['/api/session','/api/status','/api/workspace','/api/portfolio','/api/campaigns','/api/risks/lens','/api/milestones/timeline','/api/lenses','/api/decisions','/api/automations','/api/notifications','/api/settings','/api/search?q=se']) assert.equal(await responseStatus(get(api)), 200, api)
  const deliverable = (await json(`/api/campaigns/${ids.campaign}`)).deliverables[0]
  for (const control of ['', sessionCookieWithToken(cookie,expiredToken), sessionCookieWithToken(cookie,revokedToken), cookie]) { const response = await request(`${origin}/api/deliverables/${deliverable.id}/toggle-completion`, { method: 'POST', headers: { ...(control ? { cookie: control } : {}), 'content-type': 'application/json', origin, 'x-csrf-token': csrfToken }, body: JSON.stringify({ version: deliverable.version }) }); const body = await response.text(); assert.equal(response.status, control === cookie ? 200 : 401, body) }
  for (const document of documents) { const response = await get(document); assert.equal(response.status, 200, document); const html = bodyContent(await response.text()); assert.match(html, /Maya Chen/); assert.doesNotMatch(html, /Loading (workspace|campaign|risk|milestone|decision|automation|your notifications)/i, document) }
  // Change authoritative rows, then demand the new values in body HTML, not just serialized loader data.
  sql(`UPDATE campaigns SET name='Migration campaign current' WHERE id='${ids.campaign}'; UPDATE risks SET title='Migration risk current' WHERE id='${ids.risk}'; UPDATE milestones SET title='Migration milestone current' WHERE id='${ids.milestone}'; UPDATE decisions SET title='Migration decision current' WHERE id='${ids.decision}'; UPDATE lenses SET name='Migration lens current' WHERE id='${ids.lens}'; UPDATE automations SET name='Migration automation current'; UPDATE notifications SET title='Migration notification current'; UPDATE workspace SET name='Migration workspace current'`)
  const addedLens = await request(`${origin}/api/lenses`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', origin, 'x-csrf-token': csrfToken }, body: JSON.stringify({ name: 'Migration catalog addition', description: 'SSR count freshness control', recordType: 'Risk', conditions: [], sort: { field: 'severity', direction: 'desc' }, fields: ['title', 'severity'], display: 'Cards' }) })
  assert.equal(addedLens.status, 201)
  await addedLens.arrayBuffer()
  const fresh = [['/app','Migration campaign current'],['/app/overview','Migration campaign current'],['/app/campaigns','Migration campaign current'],[`/app/campaigns/${ids.campaign}`,'Migration campaign current'],['/app/lenses/risks','Migration risk current'],[`/app/risks/${ids.risk}`,'Migration risk current'],['/app/lenses/timeline','Migration milestone current'],[`/app/milestones/${ids.milestone}`,'Migration milestone current'],[`/app/lenses/${ids.lens}/edit`,'Migration lens current'],['/app/decisions','Migration decision current'],[`/app/decisions/${ids.decision}`,'Migration decision current'],['/app/automations','Migration automation current'],['/app/notifications','Migration notification current'],['/app/settings','Migration workspace current'],['/app/settings/workspace','Migration workspace current'],['/app/lenses/new',`${lenses.lenses.length + 1} saved lenses available`]]
  for (const [document, marker] of fresh) assert.ok(bodyContent(await (await get(document)).text()).includes(marker), `${document} must SSR ${marker}`)
  for (const document of ['/','/signin']) {
    const publicHtml = await (await get(document, '')).text()
    assert.match(publicHtml, /Migration workspace current/, 'The Lobby and sign-in publish the current workspace identity name')
    assert.doesNotMatch(publicHtml, /Migration (campaign|risk|milestone|decision|lens|automation|notification) current|Maya Chen|maya@northstar\.example/, 'Public identity exposes no private records or operator identity')
  }
  for (const document of ['/missing','/assets/missing.js','/@vite/client','/@id/virtual:tanstack-start-dev-client-entry','/@tanstack-start/styles.css','/src/core/app/styles.css','/app/missing','/api/missing']) for (const headers of [{}, { 'sec-fetch-mode': 'navigate' }]) assert.equal(await responseStatus(get(document, cookie, headers)),404,document)
  assert.equal(await new Promise((resolve, reject) => { http.get(`${origin}/health`, { headers: { host: 'unsupported.invalid' } }, response => { response.resume(); resolve(response.statusCode) }).on('error', reject) }), 404)
  const signinDocument = await (await get('/signin')).text(); const stylesheet = signinDocument.match(/href="(\/assets\/[^\"]+\.css)"/)[1]
  const style = await get(stylesheet); assert.match(style.headers.get('content-type'), /text\/css/); assert.ok((await style.text()).length > 100)
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  const captures = new Map()
  const publicTransports = new Set()
  const wireEvidence = []
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const browserContext = await browser.newContext({ viewport, timezoneId: 'Pacific/Honolulu' })
    await browserContext.addCookies(browserCookies(cookie,origin))
    const page = await browserContext.newPage(); const errors=[]; const failed=[]; let navigations=0; let publicNavigation=true
    page.on('response', response => { if (response.status() >= 400) console.error('START_HTTP_FAILURE', response.status(), response.url()) }); page.on('pageerror', error=>errors.push(error.message)); page.on('console', event=>{if(event.type()==='error')errors.push(event.text())}); page.on('requestfailed', request=>failed.push(request.url())); page.on('request', request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())navigations++; if(request.url().includes('/_serverFn/')){captures.set(request.url(),request.headers());if(publicNavigation)publicTransports.add(request.url())}})
    // The docs are a public router document with the shared header's Sign in pill; the Lobby at / is plain HTML.
    await page.goto(`${origin}/docs`); const time = await page.evaluate(()=>performance.timeOrigin)
    await page.getByRole('banner').getByRole('link',{name:'Sign in',exact:true}).click(); await page.waitForURL('**/signin');await page.waitForLoadState('networkidle');publicNavigation=false
    await navigateFromSignInToApp(page); await page.waitForURL('**/app')
    assert.equal(await page.evaluate(()=>performance.timeOrigin),time);assert.equal(navigations,1)
    await page.getByText('Live campaigns',{exact:true}).waitFor(); await page.waitForLoadState('networkidle')
    const appTime=await page.evaluate(()=>performance.timeOrigin);const appDocuments=navigations
    if(viewport.width<600) await page.getByRole('button',{name:'Open navigation'}).click()
    await page.getByText('Launch views', { exact: true }).filter({ visible: true }).first().click()
    await page.getByRole('link',{name:'Overview',exact:true}).filter({visible:true}).first().click();await page.waitForURL('**/app/overview');await page.getByText('Portfolio Overview',{exact:true}).first().waitFor()
    assert.equal(await page.evaluate(()=>performance.timeOrigin),appTime);assert.equal(navigations,appDocuments)
    assert.ok(time>0)
    for (const document of documents) { await page.goto(`${origin}${document}`); await page.waitForLoadState('networkidle'); assert.ok(!(await page.locator('body').innerText()).includes('Could not load this page'), document) }
    await page.waitForTimeout(150);assert.deepEqual(errors,[]);assert.deepEqual(failed,[])
    await browserContext.close()
  }
  assert.equal(publicTransports.size, 1, 'Public identity navigation uses its one generated loader')
  assert.ok([...captures.keys()].filter(url=>!publicTransports.has(url)).length >= 2, 'Both real private generated data transports must still run')
  // Replay the exact URL and headers produced by the installed generated client; positive control first.
  for(const [url, original] of captures) {
    const headers={...original};delete headers.cookie;delete headers.host
    const before=await json('/api/campaigns')
    const positive=await request(url,{headers:{...headers,cookie}});const positiveBody=await positive.text();assert.equal(positive.status,200);assert.match(positiveBody,/Migration|Maya/); wireEvidence.push({ url, control: 'valid', status: positive.status, headers: Object.fromEntries(positive.headers), body: positiveBody })
    for(const control of ['', sessionCookieWithToken(cookie,expiredToken),sessionCookieWithToken(cookie,revokedToken)]) {
      const denied=await request(url,{headers:{...headers,...(control?{cookie:control}:{})}});const body=await denied.text()
      if(publicTransports.has(url)) { assert.equal(denied.status,200);assert.match(body,/Migration workspace current/) }
      else { assert.ok([200,401,403].includes(denied.status));assert.match(body,/signin|signed_out|redirect/i) }
      assert.doesNotMatch(body,/Migration (campaign|risk|milestone|decision|lens|automation|notification) current|Maya Chen|maya@northstar\.example/)
      wireEvidence.push({ url, control: control ? control.includes('expired') ? 'expired' : 'revoked' : 'missing', status: denied.status, headers: Object.fromEntries(denied.headers), body })
    }
    assert.equal(await responseStatus(request(url,{headers:{...headers,cookie,origin:'https://hostile.invalid','sec-fetch-site':'cross-site'}})),403)
    assert.deepEqual(await json('/api/campaigns'), before)
  }
  if(process.env.START_WIRE_EVIDENCE) await writeFile(process.env.START_WIRE_EVIDENCE, JSON.stringify(wireEvidence, null, 2))
  const files=await readdir('dist/client/assets');for(const file of files.filter(file=>file.endsWith('.js'))) { const source=await readFile(`dist/client/assets/${file}`,'utf8');assert.doesNotMatch(source,/cloudflare:workers|INSERT INTO sessions|createSessionRepository|Migration campaign current/) }
})
