import {baseHttpSession} from './helpers/base-http-session.mjs'
import {withDevKey} from './helpers/dev-gate.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {verifySignInForward} from './helpers/sign-in-forward-journey.mjs'
import { installLegacyFixture } from './helpers/install-legacy-fixture.mjs'
import { launchBaseAuthorityRuntime } from './helpers/launch-base-authority-runtime.mjs'

const port = Number(process.env.CRADLE_FOUNDATION_PORT ?? 0)
let origin = `http://127.0.0.1:${port}`
const output = process.env.CRADLE_FOUNDATION_EVIDENCE ?? path.join(tmpdir(), 'cradle-foundation-evidence')

test('[VIEW-001 HOME-002 BASE-ACCESS-003 RECORDS-001 APP-SCOPE-001] one themed responsive shell, records-first navigation, 404 and Base sign-in without a mail viewer', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cradle-foundation-'))
  let worker, browser, production
  const receipt = { commit: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), routes: [], errors: [], remoteIdentityHidden: false }
  try {
    assert.equal(await fetch(`${origin}/health`).catch(() => null), null, 'Test listener must be unoccupied')
    const migration = spawnSync(process.execPath, ['scripts/migrate-local.mjs', '--persist-to', directory], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    assert.equal(migration.status, 0, migration.stderr + migration.stdout)
    const member = await installLegacyFixture(directory)
    worker = spawn(process.execPath, ['tests/helpers/compiled-worker.mjs', '--port', String(port), '--persist-to', directory, '--var', 'AUTH_LOCAL:true', '--var', 'OWNER_EMAIL:maya@northstar.example', '--var', 'MAIL_PROVIDER:development', '--var', 'MAIL_FROM:auth@localhost.test', '--var', 'SESSION_SECRET:test-only-foundation-session-secret-32-characters', '--var', `APP_ORIGIN:${origin}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let logs = ''; worker.stdout.on('data', data => { logs += data; const listener=logs.match(/Emitted Worker listening at (http:\/\/127\.0\.0\.1:\d+)/); if(listener)origin=listener[1] }); worker.stderr.on('data', data => { logs += data })
    for (let i = 0; i < 100; i++) { if ((await fetch(`${origin}/health`).catch(() => null))?.status === 200) break; await new Promise(resolve => setTimeout(resolve, 100)) }
    const {cookie}=await baseHttpSession(origin)
    const json = async route => (await fetch(`${origin}${route}`, { headers: { cookie } })).json()
    assert.equal((await fetch(`${origin}/api/v1/apps`)).status, 401, 'App discovery requires a session')
    const applications = await json('/api/v1/apps')
    assert.ok(applications.data.items.length > 0, 'Current launch authority exposes its real schema')
    const campaigns = await json('/api/campaigns'), risks = await json('/api/risks/lens'), milestones = await json('/api/milestones/timeline'), decisions = await json('/api/decisions')
    const routes = ['/app', '/app/records', '/app/operations/studio', '/app/overview', '/app/campaigns', `/app/campaigns/${campaigns.items[0].id}`, '/app/lenses/risks', `/app/risks/${risks.items[0].id}`, '/app/lenses/timeline', `/app/milestones/${milestones.items[0].id}`, '/app/lenses/new', '/app/decisions', `/app/decisions/${decisions.items[0].id}`, '/app/automations', '/app/notifications', '/app/search', '/app/settings', '/app/operations', '/app/repairs']
    browser = await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
    await mkdir(output, { recursive: true })
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } })
      await context.addCookies([{ name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=')+1), url: origin }])
      const page = await context.newPage()
      page.on('pageerror', error => receipt.errors.push(error.message))
      for (const [index, route] of routes.entries()) {
        const response = await page.goto(`${origin}${route}`)
        assert.equal(response.status(), 200, route)
        await page.locator('.operator-shell').waitFor()
        await page.waitForLoadState('networkidle')
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} overflows at ${width}`)
        assert.equal(await page.locator('.operator-shell').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(243, 243, 238)', `${route} October surface`)
        const heading = page.locator('.operator-main h1').first()
        if (await heading.count()) assert.match(await heading.evaluate(el => getComputedStyle(el).fontFamily), /Lexend/, `${route} October type`)
        if (route === '/app') {
          assert.equal(await page.getByRole('link', { name: 'Open records', exact: true }).count(), 1)
          if (width === 390) await page.getByRole('button', { name: 'Open navigation' }).click()
          const nav = page.getByRole('navigation', { name: 'Operator navigation', exact: true }).filter({ visible: true })
          assert.equal(await nav.getByRole('link', { name: 'Home', exact: true }).count(), 1)
          assert.equal(await nav.getByRole('link', { name: 'Records', exact: true }).count(), 1)
          assert.equal(await nav.getByRole('link', { name: 'Repairs', exact: true }).count(), 0)
          assert.equal(await nav.getByRole('link', { name: 'Today', exact: true }).count(), 0)
          if (width === 390) { await page.keyboard.press('Escape'); assert.equal(await page.getByRole('button', { name: 'Open navigation' }).evaluate(el => el === document.activeElement), true) }
        }
        if (route === '/app/records') { await page.getByRole('button', { name: /^Base ▾/ }).waitFor();assert.equal(await page.getByRole('heading', { name: 'Choose an application', exact: true }).count(), 0) }
        if (width === 1440 && route !== '/app') assert.notEqual(await page.locator('.operator-rail').getByRole('link', { name: 'Home', exact: true }).getAttribute('aria-current'), 'page', 'Home is active only on the home route')
        if (route.includes('/app/campaigns/')) assert.equal(await page.getByRole('heading', { name: 'Manage campaign work' }).evaluate(el => !!el.closest('.portfolio-page')), true)
        const file = `route-${String(index).padStart(2, '0')}-${width}.jpg`
        await page.screenshot({ path: path.join(output, file), type: 'jpeg', fullPage: true, quality: 75 })
        receipt.routes.push({ route, width, file, status: response.status(), overflow: false })
      }
      await verifySignInForward({browser,context,origin,width,output})
      for (const route of ['/unknown-foundation-route', '/app/unknown-foundation-route', '/app/portfolio', '/app/portfolio/01AAAAAAAAAAAAAAAAAAAAAAAA']) {
        assert.equal((await page.goto(`${origin}${route}`)).status(), 404)
        await page.getByRole('heading', { name: 'Page not found', exact: true }).waitFor()
        assert.equal(await page.getByText(/No API route/).count(),0)
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
        const audit=await new AxeBuilder({page}).analyze();assert.deepEqual(audit.violations.filter(v=>['serious','critical'].includes(v.impact)),[])
        await page.screenshot({ path: path.join(output, `404-${route.startsWith('/app') ? 'private' : 'public'}-${width}.jpg`), type: 'jpeg', quality: 75 })
      }
      await context.close()
    }
    const revoke = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'cradle', '--local', '--persist-to', directory, '--command', `UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id='${member}'`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    assert.equal(revoke.status, 0, revoke.stderr)
    assert.deepEqual((await json('/api/v1/apps')).data.items, [], 'Revoked membership exposes no app identity or schema labels')
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${origin}/signin`)
    await page.getByLabel('Email address').fill('maya@northstar.example')
    await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
    await page.getByRole('status').waitFor()
    const keyless=await fetch(`${origin}/__dev/outbox`)
    assert.equal(keyless.status,404,'The outbox needs the local dev key');await keyless.body.cancel()
    const localOutbox=await fetch(`${origin}/__dev/outbox`,withDevKey())
    assert.equal(localOutbox.status,404);await localOutbox.body.cancel()
    assert.equal(await page.getByRole('link',{name:'Open development outbox',exact:true}).count(),0)
    production=await launchBaseAuthorityRuntime()
    // The network edge maps a synthetic browser domain to the actual emitted
    // HTTPS Worker. Its canonical hosted configuration selects real Base mail.
    await context.route('https://cradle.example.test/**', async route => {
      const url = new URL(route.request().url())
      const response = await production.request(`${url.pathname}${url.search}`)
      await route.fulfill({ status: response.status, headers: Object.fromEntries([...response.headers].filter(([key]) => !['content-encoding', 'content-length'].includes(key))), body: Buffer.from(await response.arrayBuffer()) })
    })
    await page.goto('https://cradle.example.test/signin')
    await page.waitForLoadState('networkidle')
    await page.getByRole('heading',{name:'Owner setup is incomplete',exact:true}).waitFor()
    assert.equal(await page.getByRole('link',{name:'Open development outbox',exact:true}).count(),0)
    const remoteOutbox=await production.request('/__dev/outbox')
    assert.equal(remoteOutbox.status,404);await remoteOutbox.body.cancel()
    receipt.remoteIdentityHidden = true
    await page.screenshot({ path: path.join(output, 'remote-signin.jpg'), type: 'jpeg', quality: 75 })
    assert.deepEqual(receipt.errors, [])
    await context.close()
    await writeFile(path.join(output, 'manifest.json'), JSON.stringify(receipt, null, 2))
    console.log(JSON.stringify({ routes: receipt.routes.length, remoteIdentityHidden: true, errors: receipt.errors, evidence: output }))
  } finally {
    if (browser) await browser.close()
    await production?.close()
    if (worker && worker.exitCode === null) { const exit = new Promise(resolve => worker.once('exit', resolve)); process.kill(-worker.pid, 'SIGTERM'); await exit }
    await rm(directory, { recursive: true, force: true })
  }
})
