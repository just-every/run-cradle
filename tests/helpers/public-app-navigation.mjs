import assert from 'node:assert/strict'

// These callers hold real sessions: /signin must forward into the app. Keep
// proving that Start's hydrated router survives real private link navigation.
// All assertions stay inside the callers' existing tagged registrations.
export async function navigateFromSignInToApp(page, { mailConfigured = true } = {}) {
  await page.waitForURL('**/app')
  await page.getByText('Live campaigns', { exact: true }).waitFor()
  await page.waitForLoadState('networkidle')
  assert.equal(await page.locator('#signin-email').count(), 0)
  await page.waitForFunction(() => window.__TSR_ROUTER__?.state.location.pathname === '/app')
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
    await assertRoute('/app', ['__root__', '/app', '/app/'])
    const timeOrigin = await page.evaluate(() => {
      window.__signInNavigationSentinel = { router: window.__TSR_ROUTER__ }
      return performance.timeOrigin
    })
    await page.locator('a[href="/app/notifications"]').filter({ visible: true }).first().click()
    await page.waitForURL('**/app/notifications')
    await page.locator('#notifications-title').waitFor()
    await page.waitForLoadState('networkidle')
    await assertRoute('/app/notifications', ['__root__', '/app', '/app/notifications'])
    assert.equal(await page.evaluate(() => window.__signInNavigationSentinel?.router === window.__TSR_ROUTER__), true)
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin)
    await router.evaluate(current => current.navigate({ to: '/app' }))
    await page.waitForURL('**/app')
    await page.getByText('Live campaigns', { exact: true }).waitFor()
    await page.waitForLoadState('networkidle')
    await assertRoute('/app', ['__root__', '/app', '/app/'])
    assert.equal(await page.evaluate(() => window.__signInNavigationSentinel?.router === window.__TSR_ROUTER__), true)
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin)
  } finally {
    await page.evaluate(() => { delete window.__signInNavigationSentinel })
    await router.dispose()
  }

  // An isolated context has no session: the public form and home link still
  // render there alongside the signed-in forward assertion.
  const signedOut = await page.context().browser().newContext({ viewport: page.viewportSize() })
  try {
    const publicPage = await signedOut.newPage()
    const response = await publicPage.goto(new URL('/signin', page.url()).href)
    assert.equal(response.status(), 200)
    assert.equal(new URL(publicPage.url()).pathname, '/signin')
    if (mailConfigured) {
      await publicPage.getByLabel('Email address', { exact: true }).waitFor()
      await publicPage.getByRole('button', { name: 'Send sign-in link', exact: true }).waitFor()
      assert.equal(await publicPage.locator('form[action="/auth/magic-link"]').count(), 1)
    } else {
      // The CLI migration fixture has development mail without a hosted sender.
      await publicPage.getByRole('heading', { name: 'Sign-in email is not configured', exact: true }).waitFor()
      assert.equal(await publicPage.getByLabel('Email address', { exact: true }).count(), 0)
      assert.equal(await publicPage.locator('form[action="/auth/magic-link"]').count(), 0)
    }
    const home = publicPage.getByRole('link', { name: 'Back to home', exact: true })
    await home.waitFor()
    assert.equal(await home.getAttribute('href'), '/')
    assert.equal(await publicPage.getByRole('link', { name: 'Open workspace', exact: true }).count(), 0)
    assert.equal(await publicPage.getByRole('link', { name: 'Return to Cradle', exact: true }).count(), 0)
    await publicPage.waitForFunction(() => window.__TSR_ROUTER__?.state.location.pathname === '/signin' && window.__TSR_ROUTER__.state.matches.some(match => match.routeId === '/signin'))
    assert.deepEqual(await publicPage.evaluate(() => window.__TSR_ROUTER__.state.matches.map(match => match.routeId)), ['__root__', '/signin'])
  } finally {
    await signedOut.close()
  }
}
