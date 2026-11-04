import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { launchAuthorityRuntime, createUlid, LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'
import { clauseAnalysisFixture } from './launch-clause-analysis.mjs'
import { launchWalkthroughCapture } from './launch-walkthrough-capture.mjs'
import { verifyPublicCampaignDuplication } from './launch-public-duplication.mjs'

export async function verifyCampaignDuplicationScreens(output) {
 const receipt = { screens: [], copies: [], errors: [] }
 await mkdir(output, { recursive: true })
 const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 const analysis = clauseAnalysisFixture()
 let h
 try {
  h = await launchAuthorityRuntime(analysis.configuration, { installedLaunchDefinitions: true, installationOwner: true, providerFetch: analysis.providerFetch })
  for (const width of [1440, 390]) {
   const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })
   try {
    for (const key of ['critical-risk', 'campaign-brief']) {
     const row = await h.db.prepare('SELECT id,version,enabled FROM automations WHERE shipped_key=?').bind(key).first()
     if (row.enabled) {
      const response = await h.request(h.ownerSession, '/api/v1/commands/launch.automation.disable', { method: 'POST', body: JSON.stringify({ commandId: createUlid(), expected: [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.automation, recordId: row.id }, version: row.version }], input: { id: row.id } }) })
      assert.equal(response.status, 200, await response.text())
     }
    }
    const identity = await h.db.prepare('SELECT o.name AS operator,w.name AS workspace FROM operators o CROSS JOIN workspace w WHERE o.id=?').bind(h.owner).first()
    const page = await context.newPage()
    page.on('pageerror', error => receipt.errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') receipt.errors.push(message.text()) })
    await context.addCookies([{ name: h.ownerSession.cookie.split('=')[0], value: h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=') + 1), url: h.origin }])
    const captureScreen = launchWalkthroughCapture({ page, receipt, viewport: { width, height: width === 390 ? 844 : 900 }, output, workspaceName: identity.workspace })
    const capture = name => captureScreen(name, { operatorName: identity.operator })
    const result = await verifyPublicCampaignDuplication({
     h, namespace: `BROWSER-${width}`, completeAnalysis: id => analysis.complete({ ...h, r: { createUlid } }, id),
     duplicate: async ({ source, input }) => {
      await page.goto(`${h.origin}/app/campaigns/${source.id}`)
      await page.getByRole('heading', { name: 'Reusable launch plan', exact: true }).waitFor()
      await page.getByText('More campaign actions', { exact: true }).click()
      await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
      await page.getByLabel('New unique campaign code', { exact: true }).fill(input.newCode)
      if (input.newLaunchDate) await page.getByLabel('New launch date (optional)', { exact: true }).fill(input.newLaunchDate)
      else assert.equal(await page.getByLabel('New launch date (optional)', { exact: true }).inputValue(), '')
      await capture(input.newLaunchDate ? 'duplicate-shift-form' : 'duplicate-same-form')
      const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/commands/launch.campaign.duplicate' && response.request().method() === 'POST')
      await page.getByRole('button', { name: 'Create duplicate', exact: true }).click()
      const committed = await response, payload = await committed.json()
      assert.equal(committed.status(), 200, JSON.stringify(payload.error))
      await page.getByRole('link', { name: 'Return to campaigns', exact: true }).waitFor()
      await page.getByRole('link', { name: 'Return to campaigns', exact: true }).click()
      await page.getByRole('button', { name: 'New campaign', exact: true }).waitFor()
      const grid = page.locator('.portfolio-campaign-table, .portfolio-campaign-cards').filter({ visible: true })
      await expect(grid).toContainText(input.newCode)
      await grid.locator(`a[href="/app/campaigns/${payload.data.value.id}"]`).click()
      await page.getByRole('heading', { name: 'Reusable launch plan', exact: true }).waitFor()
      return { commandId: payload.data.commandId, value: payload.data.value }
     },
     onCopy: async ({ copy, milestone, expectedDates, input }) => {
      assert.equal(new URL(page.url()).pathname, `/app/campaigns/${copy.campaign.id}`, 'The grid link opened the new copy')
      await page.getByText(input.newCode, { exact: true }).waitFor()
      const details = page.locator('.portfolio-priority-details')
      if (!await details.evaluate(element => element.open)) await details.locator('summary').click()
      for (const text of ['Ship the reviewed release', 'Supplier review complete', 'Reviewed reusable plan', '23.5', 'Yes', expectedDates.custom]) await expect(details).toContainText(text)
      const formatted = date => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`))
      for (const date of [expectedDates.start, expectedDates.launch]) await expect(details).toContainText(formatted(date))
      await expect(page.locator('.portfolio-deliverable-list')).toContainText(`Due ${formatted(expectedDates.due)}`)
      await expect(page.locator('.portfolio-deliverable-list li').filter({ hasText: 'Completed undated checklist' }).getByRole('checkbox')).toBeChecked()
      const risks = page.locator('.portfolio-priority-risks'), decisions = page.locator('.portfolio-priority-decisions')
      for (const section of [risks, decisions]) if (!await section.evaluate(element => element.open)) await section.locator('summary').click()
      await expect(risks).toContainText('No risks are linked.')
      await expect(decisions).toContainText('No unresolved decisions are linked.')
      await expect(page.locator('body')).not.toContainText('Source-only discussion')
      const history = page.locator('.portfolio-priority-history')
      if (!await history.evaluate(element => element.open)) await history.locator('summary').click()
      await expect(history.locator('.portfolio-activity-list')).not.toContainText('Source creation control fired')
      await capture(input.newLaunchDate ? 'duplicate-shift-open' : 'duplicate-same-open')
      await page.goto(`${h.origin}/app/milestones/${milestone.id}`)
      await page.getByRole('heading', { name: 'Reusable approval', exact: true }).waitFor()
      await expect(page.locator('body')).toContainText(formatted(expectedDates.successor))
      await expect(page.getByRole('link', { name: 'Reusable review', exact: true })).toHaveAttribute('href', `/app/milestones/${milestone.predecessors[0].id}`)
      await capture(input.newLaunchDate ? 'duplicate-shift-dependency' : 'duplicate-same-dependency')
     },
    })
    receipt.copies.push({ width, ...result })
   } finally { await context.close() }
  }
  assert.deepEqual(receipt.errors, [])
 } finally { await browser.close(); await h?.close(); await writeFile(path.join(output, 'duplication.json'), JSON.stringify(receipt, null, 2)) }
 return receipt
}
