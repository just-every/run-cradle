export async function saveScreenshotScroll(page) {
  return page.evaluateHandle(() => ({
    window: { x: scrollX, y: scrollY },
    focusedNode: document.activeElement,
    containers: [...document.querySelectorAll('*')].filter(element => element.scrollTop || element.scrollLeft).map(element => ({ element, top: element.scrollTop, left: element.scrollLeft })),
  }))
}

export async function normalizeScreenshotScroll(page, saved) {
  await page.evaluate(saved => {
    for (const { element } of saved.containers) element.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, saved)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

export async function screenshotComparisonState(page, saved) {
  return page.evaluate(saved => ({
    sameFocusedNode: document.activeElement === saved.focusedNode,
    containerScroll: saved.containers.map(({ element }) => ({ connected: element.isConnected, top: element.scrollTop, left: element.scrollLeft })),
    scrollX,
    scrollY,
    focusedControl: document.activeElement instanceof HTMLElement ? {
      tag: document.activeElement.tagName.toLowerCase(),
      id: document.activeElement.id,
      name: document.activeElement.getAttribute('aria-label') || document.activeElement.getAttribute('name') || '',
      focusVisible: document.activeElement.matches(':focus-visible'),
    } : null,
    content: document.body.textContent,
  }), saved)
}

export async function restoreScreenshotScroll(page, saved) {
  try {
    await page.evaluate(saved => {
      for (const { element, top, left } of saved.containers) if (element.isConnected) element.scrollTo({ top, left, behavior: 'instant' })
      scrollTo({ top: saved.window.y, left: saved.window.x, behavior: 'instant' })
    }, saved)
  } finally { await saved.dispose() }
}
