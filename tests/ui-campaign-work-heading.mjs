import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { contract } from './contract.mjs'
import { launchAuthorityRuntime } from './helpers/launch-authority-runtime.mjs'

contract('CAMP-004', '[VIEW-001] E12 campaign work heading labels the deliverable and milestone panels', async () => {
  const output = path.resolve(process.env.CRADLE_LAUNCH_EVIDENCE ?? '../evidence/de-launch-heading')
  const h = await launchAuthorityRuntime()
  let browser
  try {
    const campaign = await h.db.prepare('SELECT id FROM campaigns ORDER BY id LIMIT 1').first()
    assert.ok(campaign, 'The native launch fixture contains a campaign')
    await mkdir(output, { recursive: true })
    browser = await chromium.launch()
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 } })
      try {
        await context.addCookies([{ name: h.ownerSession.cookie.split('=')[0], value: h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1), url: h.origin }])
        const page = await context.newPage()
        const pageErrors = [], consoleErrors = [], externalRequests = []
        page.on('pageerror', error => pageErrors.push(error.message))
        page.on('console', message => {
          if (message.type() === 'error') consoleErrors.push({ type: message.type(), path: new URL(page.url()).pathname })
        })
        page.on('request', request => {
          const origin = new URL(request.url()).origin
          if (origin !== h.origin) externalRequests.push(origin)
        })
        const response = await page.goto(`${h.origin}/app/campaigns/${campaign.id}`)
        assert.equal(response.status(), 200)
        const work = page.getByRole('region', { name: 'Manage campaign work', exact: true })
        const heading = work.getByRole('heading', { name: 'Manage campaign work', exact: true })
        await heading.waitFor({ state: 'visible' })
        // The seeded campaign already holds deliverables and milestones, so each panel offers its add
        // action inside a disclosure; the empty-panel buttons are exercised by the Launch walkthrough.
        await work.getByText('Add or edit deliverables', { exact: true }).waitFor()
        await work.getByText('Add or edit milestones', { exact: true }).waitFor()
        assert.equal(await heading.evaluate(el => !!el.closest('.portfolio-page')), true)
        const deliverables = work.locator('.portfolio-priority-work')
        const milestones = work.locator('.portfolio-priority-milestones')
        assert.equal(await deliverables.getByRole('heading', { name: 'Deliverables', exact: true }).count(), 1)
        assert.equal(await milestones.getByRole('heading', { name: 'Milestones', exact: true }).count(), 1)
        const title = await heading.boundingBox(), left = await deliverables.boundingBox(), right = await milestones.boundingBox()
        assert.ok(title.height > 0 && title.y + title.height <= Math.min(left.y, right.y), 'Work heading occupies its own line above both owning panels')
        if (width === 1440) {
          assert.equal(left.y, right.y, 'Deliverables and milestones share the first panel row')
          assert.ok(left.x < right.x, 'Both desktop columns hold work panels')
          assert.ok(title.x <= left.x && title.x + title.width >= right.x + right.width - 1, 'The heading spans both work columns')
        } else {
          const pageTitle = await page.locator('.operator-page-header h1').boundingBox()
          const actions = await page.locator('.operator-page-actions').boundingBox()
          assert.ok(pageTitle.y + pageTitle.height <= actions.y, 'Phone campaign title has its own line')
          assert.ok(left.y + left.height <= right.y, 'Phone work panels stack without an empty column')
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Campaign detail fits ${width}px`)
        const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(v => ['serious', 'critical'].includes(v.impact))
        assert.deepEqual(violations.map(v => v.id), [], `Campaign detail accessibility at ${width}px`)
        assert.deepEqual(pageErrors, [], `Campaign detail page errors at ${width}px`)
        assert.deepEqual(consoleErrors, [], `Campaign detail console errors at ${width}px`)
        assert.deepEqual(externalRequests, [], `Campaign detail external requests at ${width}px`)
        await page.screenshot({ path: path.join(output, `campaign-work-heading-${width}.png`), fullPage: true })
      } finally {
        await context.close()
      }
    }
  } finally {
    if (browser) await browser.close()
    await h.close()
  }
})
