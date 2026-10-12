export async function waitForResourcePanels(page) {
  // Include collapsed panels: a CSS comparison also records their DOM text.
  // A failed authoritative read settles as its real error state, not a fallback.
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
