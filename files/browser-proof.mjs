import {createHash} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {chromium} from './run-cradle/node_modules/@playwright/test/index.mjs'
import {staticSiteJourney} from './run-cradle/tests/helpers/static-site.mjs'
const packet = new URL('./packet/', import.meta.url)
await mkdir(new URL('screens/', packet), {recursive: true})
const head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim()
const screens = []
const result = await staticSiteJourney({inspect: async (origin, entries) => {
  const browser = await chromium.launch({headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic']})
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: width === 390 ? 844 : 1000})
      for (const entry of entries) {
        const route = entry.slug ? `/docs/${entry.slug}` : '/docs'
        const response = await page.goto(origin + route, {waitUntil: 'networkidle'})
        const name = `screens/${entry.slug || 'overview'}-${width}.png`
        await page.screenshot({path: new URL(name, packet).pathname, fullPage: true})
        const bytes = await readFile(new URL(name, packet))
        screens.push({route, width, status: response.status(), title: await page.title(), heading: await page.locator('h1').textContent(), file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')})
      }
    }
    await context.close()
  } finally {await browser.close()}
}})
await writeFile(new URL('browser-proof.json', packet), JSON.stringify({head, result, screens}, null, 2) + '\n')
console.log(JSON.stringify({head, pages: result.pages.length, builds: result.builds, screenshots: screens.length}))
