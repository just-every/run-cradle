import assert from 'node:assert/strict'
import path from 'node:path'

// Independent inventory: deriving this from the page would miss a lost section.
const sections = [
  { id: 'top', content: ['h1', '.lp-hero-copy p', '.lp-actions a', '.lp-project'] },
  { id: 'tables', content: ['h2', '.lp-copy p:not(.lp-eyebrow)', '.lp-screen'] },
  { id: 'views', content: ['h2', '.lp-copy p:not(.lp-eyebrow)', '.lp-screen'] },
  { id: 'changes', content: ['h2', '.lp-copy p:not(.lp-eyebrow)', '.lp-screen'] },
  { id: 'practical', content: ['h2', '.lp-intro p', '.lp-row h3', '.lp-row p', '.lp-row a', '.lp-mini'] },
  { id: 'ownership', content: ['h2', '.lp-copy p:not(.lp-eyebrow)', '.lp-copy a', '.lp-acct'] },
  { id: 'start', content: ['h2', 'p', 'a'] },
]
const installationDoor = /^\/(?:app|api|auth|signin|setup|__dev|_serverFn)(?:\/|$)/

async function visibleContent(locator, label) {
  await locator.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const measured = await locator.evaluate(element => {
    let opacity = 1, hidden = false
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      opacity *= Number(style.opacity)
      hidden ||= style.display === 'none' || style.visibility !== 'visible' || style.contentVisibility === 'hidden'
    }
    const rect = element.getBoundingClientRect()
    const left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right)
    const top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom)
    const hit = right > left && bottom > top ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2) : null
    const range = document.createRange()
    range.selectNodeContents(element)
    return {
      text: element.textContent.trim().length,
      opacity, hidden, width: rect.width, height: rect.height,
      inViewport: right > left && bottom > top,
      unobscured: hit !== null && (element.contains(hit) || hit.contains(element)),
      renderedContent: [...range.getClientRects()].some(box => box.width > 0 && box.height > 0),
    }
  })
  assert.ok(measured.text > 0 && measured.renderedContent, `${label}: content is rendered`)
  assert.ok(!measured.hidden && measured.opacity >= 0.95, `${label}: content is not hidden or faded`)
  assert.ok(measured.width > 0 && measured.height > 0 && measured.inViewport && measured.unobscured, `${label}: content is visibly reached by scrolling`)
  return measured
}

export async function homepageJourney({ browser, site, width, output }) {
  const scenarios = []
  for (const javaScriptEnabled of [true, false]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, javaScriptEnabled, reducedMotion })
      const requests = [], errors = [], failed = [], responses = []
      context.on('request', request => requests.push({ url: request.url(), type: request.resourceType() }))
      context.on('requestfailed', request => failed.push({ url: request.url(), failure: request.failure()?.errorText }))
      context.on('response', response => responses.push({ url: response.url(), status: response.status() }))
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
      try {
        const page = await context.newPage()
        const response = await page.goto(site.origin, { waitUntil: 'networkidle' })
        assert.equal(response.status(), 200, 'The emitted public homepage is served')
        assert.match(response.headers()['content-type'], /^text\/html/)
        await page.evaluate(() => document.fonts.ready)
        assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), reducedMotion === 'reduce')
        assert.deepEqual(await page.locator('main > section').evaluateAll(nodes => nodes.map(node => node.id)), sections.map(section => section.id), 'All seven public sections are present in reading order')
        const measurements = []
        for (const section of sections) {
          const region = page.locator(`main > section#${section.id}`)
          assert.equal(await region.count(), 1)
          // Require both the section's copy and its illustration or action.
          const elements = []
          for (const selector of section.content) {
            const content = region.locator(selector)
            assert.ok(await content.count() > 0, `${section.id}: ${selector} is present`)
            for (const target of await content.all()) elements.push({ selector, ...await visibleContent(target, section.id) })
          }
          measurements.push({ id: section.id, elements })
        }
        await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
        // A second pass detects scroll-triggered hiding as well as initial hiding.
        for (const section of sections) {
          for (const selector of section.content) {
            for (const target of await page.locator(`#${section.id}`).locator(selector).all()) await visibleContent(target, `${section.id} after scrolling`)
          }
        }
        const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), text: node.textContent.trim() })))
        assert.ok(links.length > 0)
        for (const link of links) {
          const url = new URL(link.href, site.origin)
          assert.ok(['http:', 'https:'].includes(url.protocol), `Public link protocol: ${link.href}`)
          assert.ok(!installationDoor.test(url.pathname), `No installation-only link: ${link.href}`)
          if (url.origin === site.origin) assert.match(url.pathname, /^\/(?:run\/?|contract\/?|docs(?:\/.*)?)?$/, `Only public site pages are linked: ${link.href}`)
        }
        assert.deepEqual(errors, [], 'The public page has no script errors')
        assert.deepEqual(failed, [], 'All requested resources load')
        assert.ok(requests.some(request => request.type === 'stylesheet'), 'Use emitted CSS rather than unstyled markup')
        assert.ok(requests.some(request => request.type === 'font'), 'Use the emitted local typefaces')
        for (const request of requests) {
          const url = new URL(request.url)
          assert.equal(url.origin, site.origin, `Same-origin resource: ${request.url}`)
          assert.ok(!installationDoor.test(url.pathname), `No installation data request: ${request.url}`)
          assert.ok(!['fetch', 'xhr', 'websocket', 'eventsource'].includes(request.type), `No installation data transport: ${request.type}`)
        }
        assert.ok(responses.every(response => response.status === 200), 'Every resource is an emitted file')
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Public sections fit the viewport')
        let screenshot
        if (javaScriptEnabled && reducedMotion === 'no-preference') {
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
          screenshot = `homepage-${width}.jpg`
          await page.screenshot({ path: path.join(output, screenshot), type: 'jpeg', fullPage: true, quality: 75 })
        }
        scenarios.push({ width, javaScriptEnabled, reducedMotion, sections: measurements, links, requests, responses, errors, failed, screenshot })
      } finally { await context.close() }
    }
  }
  return scenarios
}
