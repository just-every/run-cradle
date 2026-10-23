import assert from 'node:assert/strict'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { browserObservations } from './browser-observations.mjs'

export async function verifySignInForward({ browser, context, origin, width, output }) {
  const page = await context.newPage()
  const observations = browserObservations(page, origin)
  const check = async label => {
    await page.waitForLoadState('networkidle')
    assert.equal(await page.locator('#signin-email').count(), 0, 'A signed-in owner never sees the sign-in form')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, label+' overflow')
    const axe = await new AxeBuilder({ page }).analyze()
    assert.deepEqual(axe.violations.filter(value => ['serious', 'critical'].includes(value.impact)).map(value => value.id), [], label+' accessibility')
    observations.assertClean(undefined, label)
    await page.screenshot({ path: path.join(output, label+'-'+width+'.jpg'), type: 'jpeg', quality: 75 })
  }
  try {
    await page.goto(origin+'/signin?login_hint=synthetic-cradle-1%40example.test')
    await page.waitForURL(origin+'/app')
    await check('signin-forward-default')
    await page.goto(origin+'/signin?returnTo=%2Fapp%2Fnotifications')
    await page.waitForURL(origin+'/app/notifications')
    await page.locator('#notifications-title').waitFor()
    await check('signin-forward-return')
    await page.goto(origin+'/signin?returnTo=https%3A%2F%2Fattacker.example.test')
    await page.waitForURL(origin+'/app')
    await check('signin-forward-unsafe')
  } finally { await page.close() }
  const signedOut = await browser.newContext({ viewport: { width, height: 960 } })
  try {
    const page = await signedOut.newPage()
    const observations = browserObservations(page, origin)
    const response = await page.goto(origin+'/signin?login_hint=synthetic-cradle-1%40example.test')
    assert.equal(response.status(), 200)
    await page.getByLabel('Email address').waitFor()
    assert.equal(await page.getByLabel('Email address').inputValue(), 'synthetic-cradle-1@example.test')
    await page.waitForLoadState('networkidle')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Signed-out sign-in overflow')
    const axe = await new AxeBuilder({ page }).analyze()
    assert.deepEqual(axe.violations.filter(value => ['serious', 'critical'].includes(value.impact)).map(value => value.id), [], 'Signed-out sign-in accessibility')
    observations.assertClean(undefined, 'signin-hint')
    await page.screenshot({ path: path.join(output, 'signin-hint-'+width+'.jpg'), type: 'jpeg', quality: 75 })
  } finally { await signedOut.close() }
}
