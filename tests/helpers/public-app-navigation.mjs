import assert from 'node:assert/strict'

// These callers already hold a real session. Sign-in's navigation link is
// Back to home; use that current UI before exercising Start's installed router.
// This runs inside the callers' tagged browser contracts, including test:start.
export async function navigateFromSignInToApp(page) {
  await page.waitForURL('**/signin')
  const home = page.getByRole('link', { name: 'Back to home', exact: true })
  await home.waitFor()
  assert.equal(await home.getAttribute('href'), '/')
  assert.equal(await page.getByRole('link', { name: 'Open workspace', exact: true }).count(), 0)
  assert.equal(await page.getByRole('link', { name: 'Return to Cradle', exact: true }).count(), 0)
  await page.waitForFunction(() => window.__TSR_ROUTER__?.state.location.pathname === '/signin')
  const router = await page.evaluateHandle(() => window.__TSR_ROUTER__)
  const assertRoute = async (pathname, routeIds) => {
    const state = await router.evaluate(current => ({
      installed: current === window.__TSR_ROUTER__,
      pathname: current.state.location.pathname,
      routeIds: current.state.matches.map(match => match.routeId),
    }))
    assert.deepEqual(state, { installed: true, pathname, routeIds })
    assert.equal(new URL(page.url()).pathname, pathname)
  }
  try {
    await assertRoute('/signin', ['__root__', '/signin'])
    const timeOrigin = await page.evaluate(() => performance.timeOrigin)
    await home.click()
    await page.waitForURL(url => url.pathname === '/')
    await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor()
    await assertRoute('/', ['__root__', '/'])
    // Start installs this very instance during hydration. navigate invokes the
    // real route loaders and generated transport without creating another router.
    await router.evaluate(current => current.navigate({ to: '/app' }))
    await page.waitForURL('**/app')
    await assertRoute('/app', ['__root__', '/app', '/app/'])
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin)
  } finally {
    await router.dispose()
  }
}
