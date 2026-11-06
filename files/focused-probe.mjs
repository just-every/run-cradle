import { launchAuthorityRuntime } from '/workspace/run-cradle/tests/helpers/launch-authority-runtime.mjs'
import { verifyPublicCampaignActivityOrder } from '/workspace/run-cradle/tests/helpers/launch-activity-order-journey.mjs'
import { verifyCampaignActivityOrderScreens } from '/workspace/run-cradle/tests/helpers/launch-activity-order-screens.mjs'
import { chromium } from '/workspace/run-cradle/node_modules/@playwright/test/index.mjs'
import { homedir } from 'node:os'
const h = await launchAuthorityRuntime({}, { installationOwner: true, installedLaunchDefinitions: true })
let browser
try {
 if (['browser','screens'].includes(process.argv[2])) {
  browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
  for (const width of process.argv[2] === 'screens' ? [1440,390] : [1440]) {
   const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })
   await context.addCookies([{ name: h.ownerSession.cookie.split('=')[0], value: h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=') + 1), url: h.origin }])
   const page = await context.newPage()
   const capture = async () => { if (process.argv[2] === 'screens') await page.screenshot({ path: `${homedir()}/rer-consolidation/work/sd-cradle-c-f178/packet/activity-final-${width}.png`, fullPage: true }) }
   const proof = await verifyCampaignActivityOrderScreens({ h, page, action: target => target.click(), capture, width })
   console.log('ACTIVITY_ORDER_PROOF '+JSON.stringify(proof))
   await context.close()
  }
 } else { const proof = await verifyPublicCampaignActivityOrder(h); console.log('ACTIVITY_ORDER_PROOF '+JSON.stringify(proof)) }
} finally { if (browser) await browser.close(); await h.close() }
