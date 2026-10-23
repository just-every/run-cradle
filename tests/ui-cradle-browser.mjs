import {baseHttpSession} from './helpers/base-http-session.mjs'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { installLegacyFixture } from './helpers/install-legacy-fixture.mjs'
import { accessibilityAction, accessibilityCaptureOnly, accessibilityContextOptions, accessibilityEvidence, accessibilityWidths, auditAccessibility, verifyNavigationDrawerWithKeyboard } from './helpers/accessibility-evidence.mjs'
import { installKeyboardInteractions } from './helpers/accessibility-keyboard.mjs'
import { stringifySafeEvidence } from './helpers/accessibility-redaction.mjs'
const port = Number(process.env.CRADLE_TEST_PORT ?? 0)
let origin = `http://127.0.0.1:${port}`
const output = process.env.CRADLE_UI_EVIDENCE ?? path.join(tmpdir(), 'cradle-ui-browser-evidence')
const directory = await mkdtemp(path.join(tmpdir(), 'cradle-ui-persist-'))
let worker, browser
const results = []
try {
  assert.equal(await fetch(`${origin}/health`).catch(() => null), null, 'UI port must be free')
  const migration = spawnSync(process.execPath, ['scripts/migrate-local.mjs', '--persist-to', directory], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.equal(migration.status, 0, migration.stderr + migration.stdout)
  const member = await installLegacyFixture(directory)
  worker = spawn(process.execPath, ['tests/helpers/compiled-worker.mjs', '--port', String(port), '--persist-to', directory, '--var', 'AUTH_LOCAL:true', '--var', 'OWNER_EMAIL:maya@northstar.example', '--var', 'MAIL_PROVIDER:development', '--var', 'MAIL_FROM:auth@localhost.test', '--var', 'SESSION_SECRET:test-only-session-secret-32-characters-long', '--var', `APP_ORIGIN:${origin}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''; worker.stdout.on('data', data => { logs += data; const listener=logs.match(/Emitted Worker listening at (http:\/\/127\.0\.0\.1:\d+)/); if(listener)origin=listener[1] }); worker.stderr.on('data', data => { logs += data })
  for (let i = 0; i < 100; i++) { if ((await fetch(`${origin}/health`).catch(() => null))?.status === 200) break; await new Promise(resolve => setTimeout(resolve, 100)) }
  const {cookie}=await baseHttpSession(origin)
  const campaigns = await (await fetch(`${origin}/api/campaigns`, { headers: { cookie } })).json()
  assert.ok(campaigns.items.length)
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  await mkdir(output, { recursive: true })
  const widths = accessibilityEvidence ? accessibilityWidths : [1440, 1024, 390]
  for (const width of widths) {
    const context = await browser.newContext(accessibilityContextOptions({ viewport: { width, height: 960 } }))
    const page = await context.newPage()
    installKeyboardInteractions(page)
    const errors = [], external = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()) })
    await page.goto(origin); await page.waitForLoadState('networkidle')
    assert.equal(await page.getByRole('link', { name: 'Sign in', exact: true }).count(), 1)
    assert.equal(await page.getByRole('navigation').count(), 0, 'The Lobby has no operator navigation')
    if (accessibilityEvidence) await auditAccessibility(page, { screen: 'public-home', width, output })
    else await page.screenshot({ path: path.join(output, `public-${width}.png`), fullPage: true })
    assert.deepEqual(external, [], 'Public view must be self-hosted')
    await context.addCookies([{ name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=')+1), url: origin }])
    await page.goto(`${origin}/app/campaigns/${campaigns.items[0].id}`)
    await page.getByRole('button', { name: 'Edit campaign', exact: true }).waitFor()
    if (accessibilityEvidence) await auditAccessibility(page, { screen: 'launch-campaign-detail', width, output })
    if (width === 390) {
      if (accessibilityEvidence) await verifyNavigationDrawerWithKeyboard(page, { output, screen: 'launch-campaign-navigation' })
      else {
        await page.getByRole('button', { name: 'Open navigation' }).click()
        assert.equal(await page.getByRole('dialog', { name: 'Navigation', exact: true }).isVisible(), true)
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('button', { name: 'Open navigation' }).evaluate(element => element === document.activeElement), true)
      }
    }
    await accessibilityAction(page, page.getByRole('button', { name: 'Edit campaign', exact: true }))
    await page.getByLabel('Campaign name', { exact: true }).fill(`UI checked campaign ${width}`)
    const saveResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes('/api/campaigns/'))
    await accessibilityAction(page, page.getByRole('button', { name: 'Save changes', exact: true }))
    const saved = await saveResponse
    assert.equal(saved.status(), 200, await saved.text())
    await page.getByRole('heading', { name: `UI checked campaign ${width}`, exact: true }).waitFor()
    const persisted = await (await fetch(`${origin}/api/campaigns/${campaigns.items[0].id}`, { headers: { cookie } })).json()
    assert.equal(persisted.campaign.name, `UI checked campaign ${width}`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Viewport has no page overflow')
    if (accessibilityEvidence) await auditAccessibility(page, { screen: 'launch-campaign-edited', width, output })
    else await page.screenshot({ path: path.join(output, `launch-${width}.png`), fullPage: true })
    const navigateOperator = async (name, pathname) => {
      let link = page.getByRole('link', { name, exact: true }).filter({ visible: true })
      if (!await link.count()) {
        await accessibilityAction(page, page.getByRole('button', { name: 'Open navigation', exact: true }))
        link = page.getByRole('dialog', { name: 'Navigation', exact: true }).getByRole('link', { name, exact: true })
      }
      await accessibilityAction(page, link)
      await page.waitForURL(`${origin}${pathname}`)
      await page.waitForLoadState('networkidle')
    }
    await navigateOperator('App studio', '/app/operations/studio')
    await page.getByRole('heading', { name: 'What should Cradle handle?', exact: true }).waitFor()
    await page.locator('.cr-state[aria-busy="true"]').waitFor({ state: 'hidden' })
    assert.equal(await page.getByRole('button', { name: 'Prepare operation', exact: true }).isDisabled(), true, 'An empty brief must not prepare or call a provider')
    if (accessibilityEvidence) await auditAccessibility(page, { screen: 'app-studio-unconfigured', width, output })
    await navigateOperator('Search', '/app/search')
    await page.getByRole('heading', { name: 'Start with what you remember', exact: true }).waitFor()
    if (accessibilityEvidence) await auditAccessibility(page, { screen: 'search-empty', width, output })
    const search = async query => {
      await page.getByLabel('Search all bases', { exact: true }).fill(query)
      const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/search' && new URL(response.url()).searchParams.get('q') === query)
      response.catch(() => {})
      await accessibilityAction(page, page.getByRole('button', { name: 'Search', exact: true }))
      assert.equal((await response).status(), 200, 'Search must read real authoritative records')
      await page.waitForLoadState('networkidle')
    }
    await search(`No matching fixture ${width}`)
    await page.getByRole('heading', { name: 'No matching records', exact: true }).waitFor()
    if (accessibilityEvidence) await auditAccessibility(page, { screen: 'search-no-matches', width, output })
    await search(`UI checked campaign ${width}`)
    const resultLink = page.getByRole('link', { name: `UI checked campaign ${width}`, exact: true })
    await resultLink.waitFor()
    assert.equal(await resultLink.getAttribute('href'), `/app/records/00000000000000000000000700/00000000000000000000000701/${campaigns.items[0].id}`, 'Search must return the campaign edited through its public form')
    if (accessibilityEvidence) await auditAccessibility(page, { screen: 'search-record-result', width, output })
    await accessibilityAction(page, resultLink)
    await page.getByRole('heading', { name: `UI checked campaign ${width}`, exact: true }).waitFor()
    assert.deepEqual(errors, [])
    results.push({ width, realPersistedEdit: true, appStudioVisitedWithoutProviderCall: true, searchEmptyAndRealRecord: true, searchResultOpenedByKeyboard: accessibilityEvidence && !accessibilityCaptureOnly, pageErrors: errors, thirdPartyRequests: external })
    await context.close()
  }
  await writeFile(path.join(output, 'results.json'), stringifySafeEvidence(results))
  console.log(JSON.stringify({ passed: results, evidence: output }))
} finally {
  if (browser) await browser.close()
  if (worker && worker.exitCode === null) { const exit = new Promise(resolve => worker.once('exit', resolve)); process.kill(-worker.pid, 'SIGTERM'); await exit }
  await rm(directory, { recursive: true, force: true })
}
