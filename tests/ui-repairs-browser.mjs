import {baseHttpSession} from './helpers/base-http-session.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { installLegacyFixture } from './helpers/install-legacy-fixture.mjs'
import { installUiRepairsFixture } from './ui-repairs-fixture.mjs'
import { accessibilityAction, accessibilityCaptureOnly, accessibilityContextOptions, accessibilityEvidence, accessibilitySetChecked, accessibilityWidths, auditAccessibility, verifyNavigationDrawerWithKeyboard } from './helpers/accessibility-evidence.mjs'
import { installKeyboardInteractions } from './helpers/accessibility-keyboard.mjs'
import { stringifySafeEvidence } from './helpers/accessibility-redaction.mjs'
import {freePort} from './helpers/free-port.mjs'
const port = Number(process.env.CRADLE_TEST_PORT ?? await freePort())
const origin = `http://127.0.0.1:${port}`
const output = process.env.CRADLE_UI_EVIDENCE ?? path.join(tmpdir(), 'cradle-ui-repair-evidence')
const directory = await mkdtemp(path.join(tmpdir(), 'cradle-ui-repairs-'))
let worker, browser, activePage
let logs = '', failures = [], errors = []
const accessibilityScreens = []
let navigationDrawer

async function captureResponsive(page, name, output) {
  const original = page.viewportSize()
  if (!accessibilityEvidence) {
    await page.screenshot({ path: path.join(output, `phone-${name}.png`), fullPage: true })
    return
  }
  for (const width of accessibilityWidths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.waitForLoadState('networkidle')
    const evidence = await auditAccessibility(page, { screen: `repairs-${name}`, width, output })
    if (!accessibilityCaptureOnly) assert.equal(evidence.layout.pageOverflow, false, `repairs ${name} ${width}: page overflow`)
    const severe = [...evidence.axe.wcag22aa, ...evidence.axe.targetSize].filter(item => ['serious', 'critical'].includes(item.impact))
    if (!accessibilityCaptureOnly) assert.deepEqual(severe.map(item => item.id), [], `repairs ${name} ${width}: WCAG 2.2 AA and target-size serious/critical findings`)
    accessibilityScreens.push({ name, width, wcagViolations: evidence.axe.wcag22aa.length, targetSizeViolations: evidence.axe.targetSize.length, smallTargets: evidence.layout.targetsBelow24.length, controls: evidence.layout.controls.length, tabOrderComplete: evidence.keyboard?.missing?.length === 0, tabbableCount: evidence.keyboard?.tabbableCount ?? null })
    if (!navigationDrawer && width === 390) navigationDrawer = await verifyNavigationDrawerWithKeyboard(page, { output, screen: 'repairs-navigation-drawer' })
  }
  await page.setViewportSize(original)
}
try {
  assert.equal(await fetch(`${origin}/health`).catch(() => null), null, 'UI port must be free')
  const migration = spawnSync(process.execPath, ['scripts/migrate-local.mjs', '--persist-to', directory], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.equal(migration.status, 0, migration.stderr + migration.stdout)
  const member = await installLegacyFixture(directory)
  await installUiRepairsFixture(directory, member)
  worker = spawn(process.execPath, ['tests/helpers/compiled-worker.mjs', '--port', String(port), '--persist-to', directory, '--var', 'AUTH_LOCAL:true', '--var', 'OWNER_EMAIL:maya@northstar.example', '--var', 'MAIL_PROVIDER:development', '--var', 'MAIL_FROM:auth@localhost.test', '--var', 'SESSION_SECRET:test-only-session-secret-32-characters-long', '--var', `APP_ORIGIN:${origin}`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  worker.stdout.on('data', data => { logs += data }); worker.stderr.on('data', data => { logs += data })
  for (let i = 0; i < 100; i++) { if ((await fetch(`${origin}/health`).catch(() => null))?.status === 200) break; await new Promise(resolve => setTimeout(resolve, 100)) }
  const {cookie}=await baseHttpSession(origin)
  assert.equal((await fetch(`${origin}/api/v1/repairs/intake-context`)).status, 401)
  assert.equal((await fetch(`${origin}/api/v1/intakes`)).status, 401)
  assert.equal((await fetch(`${origin}/api/v1/commands/intake.submit`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{}' })).status, 403, 'Mounted intake must retain native CSRF denial')
  browser = await chromium.launch()
  const context = await browser.newContext(accessibilityContextOptions({ viewport: { width: 390, height: 844 }, locale: 'en-AU', timezoneId: 'Australia/Brisbane' }))
  const page = await context.newPage(), mutations = []; activePage = page
  installKeyboardInteractions(page)
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/commands/')) mutations.push(request.url()) })
  page.on('response', async response => { if (response.status() >= 400 && response.url().includes('/api/')) failures.push({ url: response.url(), status: response.status(), body: await response.text().catch(() => '') }) })
  await context.addCookies([{ name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=')+1), url: origin }])
  await mkdir(output, { recursive: true })
  await page.goto(`${origin}/app/repairs/new`)
  await page.getByLabel('Describe the problem', { exact: true }).waitFor()
  await page.getByText('UI test store', { exact: true }).waitFor()
  await page.getByText('UI test cold room', { exact: true }).waitFor()
  await captureResponsive(page, 'intake-empty', output)
  await context.setOffline(true)
  await page.getByLabel('Describe the problem', { exact: true }).fill('The cold room is warm. Please inspect the cooling unit.')
  await page.getByLabel('Photo (optional)', { exact: true }).setInputFiles({ name: 'cold-room.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlYQAAAAASUVORK5CYII=', 'base64') })
  await page.getByText(/Local draft — not submitted/).waitFor()
  assert.equal(mutations.length, 0, 'Offline draft never submits or silently queues commands')
  assert.equal(await page.getByRole('button', { name: 'Submit problem', exact: true }).isDisabled(), true)
  await captureResponsive(page, 'intake-local-draft', output)
  await context.setOffline(false)
  await page.getByText(/Current details have been checked/).waitFor()
  assert.equal(mutations.length, 0, 'Reconnect only reads current context and original status')
  await accessibilityAction(page, page.getByRole('button', { name: 'Submit problem', exact: true }))
  await page.getByRole('heading', { name: 'Problem reported', exact: true }).waitFor({ timeout: 30000 }).catch(async error => { await writeFile(path.join(output, 'repair-failure.json'), stringifySafeEvidence({ failures, errors, logs, error: error.message })); throw error })
  assert.equal(mutations.filter(url => url.endsWith('/intake.submit')).length, 1)
  const response = await fetch(`${origin}/api/v1/intakes`, { headers: { cookie } })
  assert.equal(response.status, 200)
  const persisted = await response.json()
  assert.equal(persisted.data.items.length, 1)
  assert.equal(persisted.data.items[0].state, 'ready')
  assert.equal(persisted.data.items[0].sourceIds.length, 1)
  assert.deepEqual(errors, [])
  if (!accessibilityCaptureOnly) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await captureResponsive(page, 'intake-submitted', output)
  // The debounce previously recreated the draft after committed-state deletion.
  // Cross its 200ms window, then revisit the form and inspect the persisted device store.
  await page.waitForTimeout(350)
  const drafts = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('cradle-local-drafts', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try { return await new Promise((resolve, reject) => { const request = db.transaction('drafts').objectStore('drafts').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) } finally { db.close() }
  })
  assert.equal(drafts.length, 0, 'Successful submission must not recreate a local draft')
  await page.goto(`${origin}/app/repairs/new`)
  await page.getByLabel('Describe the problem', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Describe the problem', { exact: true }).inputValue(), '')
  assert.equal(await page.getByText(/Local draft — not submitted/).count(), 0)
  assert.equal(mutations.filter(url => url.endsWith('/intake.submit')).length, 1, 'Revisiting must not submit the old report')
  await page.getByLabel('Describe the problem', { exact: true }).fill('A second inspection found the cold room warm again.')
  let originalKey
  await page.route('**/api/v1/commands/intake.submit', async route => {
    originalKey = route.request().postDataJSON().commandId
    const committed = await route.fetch()
    assert.equal(committed.status(), 200, await committed.text())
    await route.abort('failed') // Real server committed; only the response is lost.
  }, { times: 1 })
  await accessibilityAction(page, page.getByRole('button', { name: 'Submit problem', exact: true }))
  await page.getByRole('heading', { name: 'Problem reported', exact: true }).waitFor({ timeout: 30000 })
  const reconciled = await (await fetch(`${origin}/api/v1/commands/${originalKey}`, { headers: { cookie } })).json()
  assert.equal(reconciled.data.state, 'committed')
  assert.equal(mutations.filter(url => url.endsWith('/intake.submit')).length, 2, 'Unknown outcome reconciles the original key without another submit')
  const final = await (await fetch(`${origin}/api/v1/intakes`, { headers: { cookie } })).json()
  assert.equal(final.data.items.length, 2)
  const reportId = persisted.data.items[0].id
  await page.goto(`${origin}/app/repairs/intakes/${reportId}`)
  await page.getByRole('heading', { name: 'Open repair work', exact: true }).waitFor()
  await captureResponsive(page, 'intake-review', output)
  await accessibilitySetChecked(page, page.getByRole('radio', { name: /Review the reported repair with the store/ }),true)
  await accessibilityAction(page, page.getByRole('button', { name: 'Open repair work', exact: true }))
  await page.getByRole('link', { name: 'Open current work', exact: true }).waitFor({ timeout: 30000 })
  const admitted = await (await fetch(`${origin}/api/v1/intakes/${reportId}`, { headers: { cookie } })).json()
  assert.equal(admitted.data.state, 'admitted')
  const currentCase = await (await fetch(`${origin}/api/v1/cases/${admitted.data.caseId}`, { headers: { cookie } })).json()
  assert.equal(currentCase.data.accountableId, member)
  assert.deepEqual(currentCase.data.sourceIds, persisted.data.items[0].sourceIds)
  assert.deepEqual(currentCase.data.runIds, [])
  assert.equal(currentCase.data.nextWakeAt, null)
  await accessibilityAction(page, page.getByRole('link', { name: 'Open current work', exact: true }))
  await page.getByRole('heading', { name: 'Next step', exact: true }).waitFor()
  await captureResponsive(page, 'case-next-step', output)
  await accessibilityAction(page, page.getByRole('button',{name:'Pause',exact:true}))
  await page.getByLabel('Reason',{exact:true}).fill('Synthetic manual pause for review.')
  await accessibilityAction(page, page.getByRole('button',{name:'Pause',exact:true}))
  await page.getByText('paused',{exact:true}).waitFor()
  await accessibilityAction(page, page.getByRole('button',{name:'Resume',exact:true}))
  await page.getByLabel('Reason',{exact:true}).fill('Synthetic manual review complete; resume record work only.')
  await accessibilityAction(page, page.getByRole('button',{name:'Resume',exact:true}))
  await page.getByText('active',{exact:true}).waitFor()
  await accessibilityAction(page, page.getByRole('link',{name:'Review repair →',exact:true}))
  await page.getByRole('heading',{name:'Contractor',exact:true}).waitFor()
  await accessibilitySetChecked(page, page.getByRole('radio',{name:'UI test licensed refrigeration',exact:true}),true)
  await accessibilityAction(page, page.getByRole('button',{name:'Select contractor',exact:true}))
  await page.getByText('quotes',{exact:true}).waitFor()
  const afterSelection=await (await fetch(`${origin}/api/v1/cases/${admitted.data.caseId}`,{headers:{cookie}})).json()
  assert.deepEqual(afterSelection.data.runIds,[])
  assert.equal(afterSelection.data.nextWakeAt,null)
  assert.equal(afterSelection.data.controlEpoch,2)
  await captureResponsive(page, 'contractor-selected', output)
  await page.getByRole('heading',{name:'Record a manual quote',exact:true}).waitFor()
  await captureResponsive(page, 'quote-form', output)
  await page.getByLabel('Work item 1',{exact:true}).fill('Repair cooling fan — original manual quotation')
  await page.getByLabel('Line 1 amount (AUD)',{exact:true}).fill('1800.01')
  await accessibilityAction(page, page.getByRole('button',{name:'Add quote line',exact:true}))
  await page.getByLabel('Work item 2',{exact:true}).fill('Original quoted callout charge')
  await page.getByLabel('Line 2 amount (AUD)',{exact:true}).fill('201.00')
  await page.getByLabel('Total (AUD)',{exact:true}).fill('2000.01')
  await accessibilitySetChecked(page, page.getByLabel('Tax is included in this total',{exact:true}),true)
  await page.getByLabel('Quote expires (UTC)',{exact:true}).fill('2099-01-01T12:00')
  await page.getByLabel('Excluded work (one item per line)',{exact:true}).fill('Compressor replacement')
  await page.getByLabel('Original quote evidence',{exact:true}).fill('Synthetic written quotation: cooling fan repair A$1,800.01 plus A$200.00 callout, total A$2,000.01 including tax; compressor excluded; expires 1 January 2099 12:00 UTC.')
  const beforeMismatch=mutations.length
  await accessibilityAction(page, page.getByRole('button',{name:'Record quote evidence',exact:true}))
  await page.getByText(/The line amounts must exactly equal the quoted total/).waitFor()
  assert.equal(mutations.length,beforeMismatch,'An inconsistent transcription must not capture a source or submit a quote')
  await page.getByLabel('Line 2 amount (AUD)',{exact:true}).fill('200.00')
  let quoteKey,quoteSourceKey
  const priorSourceCaptures=mutations.filter(url=>url.endsWith('/source.capture')).length
  await page.route('**/api/v1/commands/source.capture',async route=>{
    quoteSourceKey=route.request().postDataJSON().commandId
    const committed=await route.fetch();assert.equal(committed.status(),200,await committed.text())
    await route.abort('failed')
  },{times:1})
  await page.route('**/api/v1/commands/repair.record-quote',async route=>{
    quoteKey=route.request().postDataJSON().commandId
    const committed=await route.fetch();assert.equal(committed.status(),200,await committed.text())
    await route.abort('failed')
  },{times:1})
  await accessibilityAction(page, page.getByRole('button',{name:'Record quote evidence',exact:true}))
  await page.getByRole('button',{name:'Continue with captured evidence',exact:true}).waitFor({timeout:30000})
  assert.equal(mutations.filter(url=>url.endsWith('/source.capture')).length,priorSourceCaptures+1,'Source response loss must recover the original capture key')
  assert.equal(mutations.filter(url=>url.endsWith('/repair.record-quote')).length,0,'Recovering source capture must not implicitly submit a quote')
  const sourceStatus=await (await fetch(`${origin}/api/v1/commands/${quoteSourceKey}`,{headers:{cookie}})).json()
  assert.equal(sourceStatus.data.state,'committed');assert.deepEqual(Object.keys(sourceStatus.data.result),['id'])
  await accessibilityAction(page, page.getByRole('button',{name:'Continue with captured evidence',exact:true}))
  await page.getByText('Quote recorded. Work remains in quote review.',{exact:true}).waitFor({timeout:30000})
  await page.getByText(/Above A\$2,000: a designated manager decision/).waitFor()
  const quotes=await (await fetch(`${origin}/api/v1/repairs/${currentCase.data.subject.recordId}/quotes`,{headers:{cookie}})).json()
  assert.equal(quotes.data.items.length,1);assert.equal(quotes.data.items[0].quote.total.minor,'200001')
  assert.deepEqual(quotes.data.items[0].quote.lineItems.map(item=>item.total.minor),['180001','20000'])
  assert.equal(quotes.data.items[0].quote.expiresAt,'2099-01-01T12:00:00.000Z')
  assert.deepEqual(quotes.data.items[0].issues,[]);assert.equal(quotes.data.items[0].approvalRequired,true)
  assert.equal(mutations.filter(url=>url.endsWith('/repair.record-quote')).length,1,'Response loss must reconcile the original quote command')
  const repairAfterQuote=await (await fetch(`${origin}/api/v1/repairs/${currentCase.data.subject.recordId}`,{headers:{cookie}})).json()
  assert.equal(repairAfterQuote.data.stage,'quotes');assert.deepEqual(repairAfterQuote.data.case.runIds,[]);assert.equal(repairAfterQuote.data.case.nextWakeAt,null)
  if (!accessibilityCaptureOnly) assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await captureResponsive(page, 'quote-recorded', output)
  // Preserve the cited source while a newer corrected source arrives in this isolated fixture.
  const citedSource=quotes.data.items[0].quote.evidence[0].sourceId
  assert.match(citedSource,/^[0-9A-HJKMNP-TV-Z]{26}$/)
  const correction='Corrected synthetic quote: compressor work now excluded.',digest=createHash('sha256').update(correction).digest('hex')
  const corrected=spawnSync('pnpm',['exec','wrangler','d1','execute','cradle','--local','--persist-to',directory,'--command',`INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) SELECT '${citedSource}-v2',id,2,'${digest}','${correction}','[]','${new Date().toISOString()}' FROM evidence_sources WHERE id='${citedSource}'; UPDATE evidence_sources SET current_version=2 WHERE id='${citedSource}';`],{encoding:'utf8',maxBuffer:16*1024*1024})
  assert.equal(corrected.status,0,corrected.stdout+corrected.stderr)
  await page.getByText('Supporting source version changed; review the conflicting evidence.',{exact:true}).waitFor()
  await accessibilityAction(page, page.getByText('Supporting evidence and exact version',{exact:true}))
  await accessibilityAction(page, page.getByRole('link',{name:'Source 1, version 1',exact:true}))
  await page.getByText(/Viewing cited source version 1/).waitFor()
  await page.getByRole('heading',{name:'Original quote',exact:true}).waitFor()
  await page.getByText(/Synthetic written quotation: cooling fan repair/).first().waitFor()
  assert.equal(await page.getByText(correction,{exact:true}).count(),0)
  await captureResponsive(page, 'cited-source', output)
  await accessibilityAction(page, page.getByRole('link',{name:'Review latest source',exact:true}))
  await page.getByText(correction,{exact:true}).waitFor()
  assert.equal(await page.getByText(/Synthetic written quotation: cooling fan repair/).count(),0)
  await captureResponsive(page, 'latest-source', output)
  assert.equal(mutations.filter(url => url.endsWith('/repair.open')).length, 1)
  assert.deepEqual(errors, [])
  await writeFile(path.join(output, accessibilityEvidence ? 'a11y-repair-results.json' : 'repair-results.json'), stringifySafeEvidence({ persistedIntakes: 2, admittedCaseId: admitted.data.caseId, accountableId: currentCase.data.accountableId, noProviderRuns: true, manualPauseResume:true, contractorSelected:true, manualQuoteRecorded:true, exactMultiLineQuote:true, mismatchNoMutation:true, historicalSourceReview:true, quoteOriginalKey:quoteKey, quoteSourceOriginalKey:quoteSourceKey, sourceRecoveryRequiresConfirmation:true, quoteReview:quotes.data, retainedOfflineFile: true, committedDraftRemoved: true, lostResponseOriginalKey: originalKey, implicitSubmissions: 0, explicitIntakeSubmissions: 2, navigationDrawer, accessibilityScreens, errors }))
  console.log('PASS: real isolated D1/R2 phone intake, exact stored source, offline draft/no queue, reconnect review and two explicit submissions and original-key response-loss recovery')
} catch (error) {
  await mkdir(output, { recursive: true })
  const failureName = accessibilityEvidence ? 'a11y-repair-failure' : 'repair-failure'
  await writeFile(path.join(output, `${failureName}.json`), stringifySafeEvidence({ failures, errors, logs, error: String(error) }))
  if (activePage) await activePage.screenshot({ path: path.join(output, `${failureName}.png`), fullPage: true }).catch(() => {})
  throw error
} finally {
  if (browser) await browser.close()
  if (worker && worker.exitCode === null) { const exit = new Promise(resolve => worker.once('exit', resolve)); process.kill(-worker.pid, 'SIGTERM'); await exit }
  await rm(directory, { recursive: true, force: true })
}
