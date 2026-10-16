import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { createUlid, LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'

/** One operator's browser on the emitted Worker, with evidence capture and the app's own doors. */
export function doorsBrowser({ h, page, width, output, session, receipt }) {
 const visit = async route => { await page.goto(h.origin + route); await page.waitForLoadState('networkidle') }
 async function capture(name) {
  await page.waitForLoadState('networkidle')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} at ${width} must not scroll sideways`)
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations.filter(v => ['serious', 'critical'].includes(v.impact))
  assert.deepEqual(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), [], `${name} at ${width} accessibility`)
  const file = `${name}-${width}.png`
  await page.screenshot({ path: path.join(output, file), fullPage: true })
  receipt.screens.push({ name, width, file })
 }
 async function download(trigger) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger()])
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) }
 }
 const command = async (action, input, expected = []) => {
  const response = await h.request(session(), `/api/v1/commands/${action}`, { method: 'POST', body: JSON.stringify({ commandId: createUlid(), expected, input }) })
  assert.equal(response.status, 200, await response.clone().text())
  return (await response.json()).data.value
 }
 const campaignRef = row => ({ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: row.id }, version: row.version })
 const visibleNames = async () => { const names = page.locator(width === 390 ? '.portfolio-campaign-cards li a strong' : '.portfolio-campaign-table tbody th a strong'); await names.first().waitFor(); return names.allInnerTexts() }
 const items = () => page.locator(width === 390 ? '.portfolio-campaign-cards li' : '.portfolio-campaign-table tbody tr')
 const visibleIds = async () => { await items().first().waitFor(); return (await items().locator('a[href^="/app/campaigns/"]').evaluateAll(links => links.map(link => link.getAttribute('href')))).map(href => href.split('/').pop()) }
 const select = id => items().filter({ has: page.locator(`a[href="/app/campaigns/${id}"]`) }).locator('input[type=checkbox]')
 const openPanel = async title => { await page.locator('summary', { hasText: title }).click(); await page.waitForLoadState('networkidle') }
 // A wrapped select's accessible name includes its chosen option, so find it by the label's leading text.
 const choose = (label, value) => page.locator('label').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).locator('select').first().selectOption(value)
 return { visit, capture, download, command, campaignRef, visibleNames, visibleIds, select, openPanel, choose }
}

/** RFC 4180 rows of a downloaded CSV. */
export function csvRows(bytes) {
 const text = bytes.toString('utf8').replace(/^\uFEFF/, ''), rows = []
 let row = [], cell = '', quoted = false
 for (let i = 0; i < text.length; i++) {
  const c = text[i]
  if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false; else cell += c; continue }
  if (c === '"') quoted = true
  else if (c === ',') { row.push(cell); cell = '' }
  else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
  else cell += c
 }
 return rows
}
