import assert from 'node:assert/strict'
import { createUlid, LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'

// Hold only request timing. Every response comes from the emitted Worker and
// its real D1 binding, including the failure and the successful retry.
export async function campaignGridStateJourney({ page, h, campaign, sample, width, capture, receipt }) {
  await page.goto(`${h.origin}/app/campaigns`)
  const result = width < 768
    ? page.locator('.portfolio-campaign-cards > li').filter({ hasText: campaign.code })
    : page.locator('.portfolio-campaign-table tbody tr').filter({ hasText: campaign.code })
  await result.getByText(campaign.name, { exact: true }).waitFor()
  assert.ok((await result.innerText()).includes(campaign.code), 'Independently created campaign is populated before the refresh')
  await result.getByRole('button', { name: /Inspect/ }).click()
  const inspector = page.locator('.portfolio-inspector')
  await inspector.getByRole('heading', { name: campaign.name, exact: true }).waitFor()
  assert.ok((await inspector.innerText()).includes(campaign.code), 'The earlier successful read also populates the inspector')
  const close = inspector.getByRole('button', { name: 'Close campaign inspector', exact: true })
  await page.keyboard.press('Tab')
  await close.focus()
  await page.getByRole('tooltip', { name: 'Close campaign inspector', exact: true }).waitFor()
  await capture(page, 'grid-populated-inspector', width)
  // The phone inspector is modal: dismiss it through its own control before
  // changing a filter. Desktop keeps it selected until the next read starts.
  if (width < 768) await close.click()

  let release, renamed = false
  const pending = new Promise(resolve => { release = resolve })
  const held = []
  const match = url => url.pathname === '/api/campaigns' && url.searchParams.get('sort') === 'name'
  const hold = async route => {
    held.push(new URL(route.request().url()).pathname)
    await pending
    await route.continue()
  }
  await page.route(match, hold)
  try {
    const requested = page.waitForRequest(request => match(new URL(request.url())))
    await page.getByLabel('Sort', { exact: true }).selectOption('name:asc')
    await requested
    await page.getByRole('heading', { name: 'Loading campaign grid', exact: true }).waitFor()
    const noResults = async () => {
      assert.equal(await page.locator('.portfolio-grid-workspace, .portfolio-campaign-table, .portfolio-campaign-cards, .portfolio-inspector').count(), 0, 'No previous rows, cards or inspector remain mounted')
      const text = await page.locator('body').innerText()
      const html = await page.locator('.operator-shell').innerHTML()
      for (const value of [campaign.name, campaign.code, campaign.id, sample.name, sample.code, sample.id]) {
        assert.equal(text.includes(value), false, 'No previous or sample result text is visible')
        assert.equal(html.includes(value), false, 'No previous campaign identifier remains in the operator content')
      }
    }
    await noResults()
    await capture(page, 'grid-refresh-pending', width, { pending: true })
    await h.db.prepare('ALTER TABLE campaigns RENAME TO unavailable_grid_campaigns').run()
    renamed = true
    const failed = page.waitForResponse(response => match(new URL(response.url())) && response.status() >= 500)
    release()
    const response = await failed
    await page.getByRole('heading', { name: 'Unable to load campaign grid', exact: true }).waitFor()
    assert.equal(await page.locator('.cr-state').count(), 1, 'Exactly one failed result state is rendered')
    assert.equal(await page.getByRole('button', { name: 'Retry', exact: true }).isVisible(), true)
    await noResults()
    assert.doesNotMatch(await page.locator('body').innerText(), /D1_ERROR|SQLITE|SELECT |SESSION_SECRET/)
    await capture(page, 'grid-refresh-failed', width)
    await h.db.prepare('ALTER TABLE unavailable_grid_campaigns RENAME TO campaigns').run()
    renamed = false
    await page.unroute(match, hold)
    // Change current native data after the failure. A cached success cannot
    // satisfy the retry's expected name, and the old name must disappear.
    const currentName = `Current launch ${width}`
    const changed = await h.request(h.ownerSession, '/api/v1/commands/launch.campaign.patch', {
      method: 'POST',
      body: JSON.stringify({ commandId: createUlid(), input: { id: campaign.id, changes: { name: currentName } }, expected: [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: campaign.id }, version: campaign.version }] }),
    })
    assert.equal(changed.status, 200, await changed.text())
    const readback = await h.request(h.ownerSession, `/api/campaigns/${campaign.id}`)
    assert.equal(readback.status, 200)
    assert.equal((await readback.json()).campaign.name, currentName)
    const retried = page.waitForResponse(response => match(new URL(response.url())) && response.status() === 200)
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await retried
    await result.getByText(currentName, { exact: true }).waitFor()
    assert.equal((await page.locator('body').innerText()).includes(campaign.name), false, 'Retry replaces the earlier success with current native data')
    assert.equal(await page.locator('.cr-state, .portfolio-inspector').count(), 0)
    await capture(page, 'grid-refresh-recovered', width)
    receipt.gridRefresh ??= []
    receipt.gridRefresh.push({ width, heldRequests: held.length, failedStatus: response.status(), loadingClearedResults: true, failureClearedResults: true, retryName: currentName, campaignId: campaign.id })
  } finally {
    release()
    await page.unroute(match, hold)
    if (renamed) await h.db.prepare('ALTER TABLE unavailable_grid_campaigns RENAME TO campaigns').run()
  }
}
