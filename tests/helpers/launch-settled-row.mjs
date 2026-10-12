/** Wait for visible fields to share unchanged geometry over consecutive frames. */
export async function settledRow(page, first, second, { timeout = 5000 } = {}) {
  await first.waitFor({ state: 'visible', timeout })
  await second.waitFor({ state: 'visible', timeout })
  const left = await first.elementHandle(), right = await second.elementHandle()
  if (!left || !right) throw new Error('Date row fields are unavailable')
  try {
    await page.waitForFunction(([left, right]) => {
      // This predicate's state is scoped to this pair and this bounded wait.
      const state = left.__cradleSettledRow ??= { previous: '', frames: 0 }
      if (!left.isConnected || !right.isConnected) { state.frames = 0; return false }
      const a = left.getBoundingClientRect(), b = right.getBoundingClientRect()
      const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible'
      if (!visible(left) || !visible(right) || !a.width || !a.height || !b.width || !b.height || a.y !== b.y) { state.frames = 0; return false }
      const geometry = JSON.stringify([a.x,a.y,a.width,a.height,b.x,b.y,b.width,b.height])
      state.frames = geometry === state.previous ? state.frames + 1 : 1
      state.previous = geometry
      return state.frames >= 3
    }, [left, right], { polling: 'raf', timeout })
  } finally {
    await left.evaluate(element => { delete element.__cradleSettledRow }).catch(() => {})
    await left.dispose(); await right.dispose()
  }
}
