import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

export async function readinessScreens(h) {
 const output = path.resolve(process.env.CRADLE_READINESS_EVIDENCE ?? '../evidence/readiness-rescheduling')
 await mkdir(output, { recursive: true })
 const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 return {
  close: () => browser.close(),
  async capture(stage, notices) {
   for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })
    try {
     await context.addCookies(h.cookie.split('; ').map(cookie => {
      const separator = cookie.indexOf('=')
      return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: h.origin }
     }))
     const page = await context.newPage()
     await page.goto(h.origin + '/app/notifications')
     await page.locator('#notifications-title').waitFor()
     for (const notice of notices) {
      const item = page.locator('#notification-' + notice.id)
      await item.waitFor()
      const link = item.getByRole('link', { name: 'Related record', exact: true })
      if (notice.subject.available) {
       await link.waitFor()
       assert.equal(await link.getAttribute('href'), notice.subject.href)
      } else {
       await item.getByText('Related record is unavailable', { exact: false }).waitFor()
       assert.equal(await link.count(), 0, 'A withdrawn readiness notice offers no record link')
      }
     }
     assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Readiness inbox fits the viewport')
     await page.screenshot({ path: path.join(output, `${stage}-${width}.png`), fullPage: true })
    } finally { await context.close() }
   }
  },
 }
}
