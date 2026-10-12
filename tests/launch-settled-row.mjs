import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { contract } from './contract.mjs'
import { settledRow } from './helpers/launch-settled-row.mjs'

contract('VIEW-004', 'Date row waits for real geometry and permanently stacked fields time out', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.setContent('<style>.row input{display:block;width:120px}.row.ready{display:flex}</style><div class="row"><label>Start date<input type="date"></label><label>Launch date<input type="date"></label></div>')
    const start = page.getByLabel('Start date'), launch = page.getByLabel('Launch date')
    assert.notEqual((await start.boundingBox()).y, (await launch.boundingBox()).y)
    await page.evaluate(() => requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('.row').classList.add('ready'))))
    await settledRow(page, start, launch, { timeout: 1500 })
    assert.equal((await start.boundingBox()).y, (await launch.boundingBox()).y, 'Phone dates share a compact row')
    await page.evaluate(() => document.querySelector('.row').classList.remove('ready'))
    const began = performance.now()
    await assert.rejects(settledRow(page, start, launch, { timeout: 250 }), /Timeout/)
    assert.ok(performance.now() - began < 2000, 'Permanent stacking fails within a bounded interval')
    assert.notEqual((await start.boundingBox()).y, (await launch.boundingBox()).y)
    const dates = await start.boundingBox(), end = await launch.boundingBox()
    assert.throws(() => assert.equal(dates.y, end.y, 'Phone dates share a compact row'), /Phone dates share a compact row/)
    await launch.evaluate(element => element.remove())
    await assert.rejects(settledRow(page, start, launch, { timeout: 250 }), /Timeout/)
  } finally { await browser.close() }
})
