import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from '@playwright/test'
import { launchAuthorityRuntime } from './helpers/launch-authority-runtime.mjs'
import { decodeCampaignDetail, writeContext } from './helpers/launch-write-context.mjs'
import { accessibilityCaptureOnly, accessibilityContextOptions, accessibilityEvidence, accessibilityWidths, auditAccessibility } from './helpers/accessibility-evidence.mjs'
import { installKeyboardInteractions } from './helpers/accessibility-keyboard.mjs'

test('[CAMP-001 VIEW-001 VIEW-004] valid optional blanks survive native create, detail and reload at 1440/390; wrong types fail decoding', async () => {
const output = process.env.CRADLE_OPTIONAL_EVIDENCE ?? path.join(tmpdir(), 'launch-optional-browser')
const receipt = { commit: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), dirty: !!spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim(), startedAt: new Date().toISOString(), captures: [], created: [], errors: [], environment: 'local emitted Worker, actual native D1 and browser; synthetic fixtures only' }
const h = await launchAuthorityRuntime()
let browser
try {
 await mkdir(output, { recursive: true })
 browser = await chromium.launch({headless:true,args:["--use-mock-keychain","--password-store=basic"]})
 for (const width of accessibilityWidths) {
  const context = await browser.newContext(accessibilityContextOptions({ viewport: { width, height: 960 } })), page = await context.newPage()
  installKeyboardInteractions(page)
  page.on('pageerror', error => receipt.errors.push(error.message))
  await context.addCookies([{ name: h.ownerSession.cookie.split('=')[0], value: h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1), url: h.origin }])
  for (const [label, objective, summary] of [['empty-objective', '', 'Ready for review'], ['empty-summary', 'Launch the collection', ''], ['both-empty', '', '']]) {
   const name = `Optional prose ${label} ${width}`, code = `OPTIONAL-${label}-${width}`
   await page.goto(`${h.origin}/app/campaigns`)
   await page.getByRole('button', { name: 'New campaign', exact: true }).click()
   await page.getByLabel('Campaign name', { exact: true }).fill(name)
   await page.getByLabel('Campaign code', { exact: true }).fill(code)
   await page.getByLabel('Owner', { exact: true }).selectOption(h.owner)
   for (const [field, value] of [['Start date', '2026-10-01'], ['Launch date', '2026-12-01'], ['Phase', 'Planning'], ['Status', 'On track'], ['Manually reported health (%)', '65'], ['Budget (USD)', '0'], ['Spend so far (USD)', '0'], ['Objective', objective], ['Status summary', summary]]) await (['Phase','Status'].includes(field) ? page.getByLabel(field,{exact:true}).selectOption(value) : page.getByLabel(field,{exact:true}).fill(value))
   const submitted = page.waitForResponse(response => response.url().endsWith('/api/v1/commands/launch.campaign.create') && response.request().method() === 'POST')
   await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
   const response = await submitted
   assert.equal(response.status(), 200, await response.text())
   const row = await h.db.prepare('SELECT id,objective,status_summary,version FROM campaigns WHERE code=?').bind(code).first()
   assert.equal(row.objective, objective); assert.equal(row.status_summary, summary); assert.equal(row.version, 1)
   if (label === 'both-empty') {
    const owner = await writeContext(h)
    await owner.commit('risk.create', { fields: { campaignId: row.id, title: 'Optional risk prose', ownerId: h.owner, severity: 'Low', dueDate: null, signal: '', mitigation: '' } })
   }
   const api = await h.request(h.ownerSession, `/api/campaigns/${row.id}`)
   assert.equal(api.status, 200)
   const payload = await api.json(), decoded = decodeCampaignDetail(payload)
   assert.equal(decoded.campaign.objective, objective); assert.equal(decoded.campaign.summary, summary)
   for (const field of ['objective', 'summary']) for (const invalid of [undefined, null, 1, false, {}, []]) assert.throws(() => decodeCampaignDetail({ ...payload, campaign: { ...payload.campaign, [field]: invalid } }), /must be a string/)
   if (payload.risks.length) for (const field of ['signal', 'mitigation']) {
    assert.equal(decoded.risks[0][field], '')
    for (const invalid of [undefined, null, 1, false, {}, []]) assert.throws(() => decodeCampaignDetail({ ...payload, risks: payload.risks.map(risk => ({ ...risk, [field]: invalid })) }), /must be a string/)
   }
   await page.goto(`${h.origin}/app/campaigns/${row.id}`)
   for (const state of ['created', 'reloaded']) {
    if (state === 'reloaded') await page.reload()
    await page.getByRole('heading', { name, exact: true }).waitFor()
    await page.waitForLoadState('networkidle')
    assert.equal(await page.getByText('Could not load this page', { exact: true }).count(), 0)
    if (!accessibilityCaptureOnly) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await page.locator('.operator-shell').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(243, 243, 238)')
    await page.evaluate(() => window.scrollTo(0, 0))
    let file = `${label}-${state}-${width}.jpg`
    if (accessibilityEvidence) {
     const audit = await auditAccessibility(page, { screen: `launch-optional-${label}-${state}`, width, output })
     assert.equal(audit.layout.pageOverflow, false)
     file = `a11y-launch-optional-${label}-${state}-${width}.png`
    } else await page.screenshot({ path: path.join(output, file), type: 'jpeg', quality: 80, fullPage: true })
    receipt.captures.push({ file, width, url: new URL(page.url()).pathname, overflow: false })
   }
   receipt.created.push({ ...row, width, label, detailStatus: api.status })
  }
  await context.close()
 }
 assert.deepEqual(receipt.errors, [])
 receipt.completedAt = new Date().toISOString()
 await writeFile(path.join(output, 'manifest.json'), JSON.stringify(receipt, null, 2) + '\n')
 console.log(JSON.stringify(receipt))
} finally { await browser?.close(); await h.close() }

})
