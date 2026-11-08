import assert from 'node:assert/strict'
import { setup, campaign, value } from './launch-installed.mjs'

// Read the native doors separately from the documents and their embedded data.
export async function readInitialLaunch(h, cookie) {
  const read = async route => {
    const response = await h.request(route, { headers: { cookie } })
    assert.equal(response.status, 200, route)
    return response.json()
  }
  const campaigns = await read('/api/campaigns')
  const decisions = await read('/api/decisions')
  const timeline = await read('/api/milestones/timeline')
  assert.deepEqual(campaigns.items, [], 'First run creates no campaigns')
  assert.deepEqual(decisions.decisions, [], 'The native decision queue is independently empty')
  assert.equal(Number(decisions.total), 0)
  assert.deepEqual(timeline.milestones, [], 'The native timeline is independently empty')
  return { campaigns: campaigns.items.length, decisions: decisions.decisions.length, milestones: timeline.milestones.length }
}

const surfaces = [
  { path: '/app/decisions', title: 'No unresolved decisions', message: 'New decisions appear here when they need a response.' },
  { path: '/app/lenses/timeline', title: 'No milestones in Timeline Lens', message: 'Create a milestone on an active campaign to begin planning the launch path.' },
]

// Populate a different installation through commands; never seed or clear the
// installation whose initial state is being proved.
export async function firstRunPopulatedControl() {
  const h = await setup()
  try {
    const c = await campaign(h, 'FIRST-RUN-CONTROL')
    const { operator } = await (await h.request('/api/session', { headers: { cookie: h.owner.cookie } })).json()
    const milestone = value(await h.command('launch.milestone.create', { fields: {
      campaignId: c.id, title: 'synthetic-cradle-control-milestone', ownerId: operator.id,
      type: 'Review', status: 'Not started', startDate: '2026-01-01', endDate: null, conflictReason: null,
    } }))
    const decision = value(await h.command('launch.decision.create', { fields: {
      campaignId: c.id, title: 'synthetic-cradle-control-decision', requesterId: operator.id,
      riskId: null, supersedesId: null, assigneeId: null, priority: 'High', dueAt: '2027-01-01T00:00:00.000Z',
      recommendation: 'Review the launch', impact: 'Launch readiness',
    } }))
    const read = async route => {
      const response = await h.request(route, { headers: { cookie: h.owner.cookie } })
      assert.equal(response.status, 200)
      return response.json()
    }
    assert.deepEqual((await read('/api/decisions')).decisions.map(row => row.id), [decision.id])
    assert.deepEqual((await read('/api/milestones/timeline')).milestones.map(row => row.id), [milestone.id])
    return { h, campaign: c, milestone, decision, operator }
  } catch (error) { await h.close(); throw error }
}

export async function firstRunEmptyBrowser({ page, context, h, control, width, capture, receipt }) {
  const sessionCookie = async () => {
    const session = (await context.cookies(h.origin)).find(item => item.name === '__Host-operator_session')
    assert.ok(session, 'The owner has a native session')
    return `${session.name}=${session.value}`
  }
  let cookie = await sessionCookie()
  const initialCookie = cookie
  const reads = [{ phase: 'first run', ...await readInitialLaunch(h, cookie) }]
  const content = page.locator('.operator-content')
  const empty = async surface => {
    await content.getByRole('heading', { name: surface.title, exact: true }).waitFor()
    assert.equal(await content.getByText(surface.message, { exact: true }).isVisible(), true)
    assert.equal(await content.locator('article, [aria-label="Unresolved decisions"] li, [aria-label="Milestone agenda"], a[href^="/app/campaigns/"], a[href^="/app/decisions/"], a[href^="/app/milestones/"], time').count(), 0, 'Empty surfaces contain no business cards or record links')
    const text = await content.innerText()
    for (const identity of [control.campaign.name, control.decision.title, control.milestone.title, control.operator.name]) {
      assert.equal(text.includes(identity), false, 'No populated business identity appears in the empty content')
    }
  }
  for (const surface of surfaces) {
    const response = await page.goto(h.origin + surface.path)
    assert.equal(response.status(), 200)
    await empty(surface)
    await capture(page, surface.path === '/app/decisions' ? 'first-run-empty-decisions' : 'first-run-empty-timeline', width)
    assert.equal((await page.reload()).status(), 200)
    await empty(surface)
  }
  reads.push({ phase: 'reload', ...await readInitialLaunch(h, cookie) })

  // Revoke this session and actually authenticate again; copying a retained
  // session back into the browser would not prove the first-run outcome lasts.
  const signedOut = await page.evaluate(async () => {
    const csrf = await fetch('/auth/csrf')
    if (!csrf.ok) throw new Error('Could not read sign-out authority')
    return (await fetch('/auth/sign-out', { method: 'POST', headers: { 'x-csrf-token': (await csrf.json()).csrfToken } })).status
  })
  assert.equal(signedOut, 200)
  assert.equal((await h.request('/api/decisions', { headers: { cookie } })).status, 401)
  await context.clearCookies()
  await page.goto(h.origin + '/signin?returnTo=%2Fapp')
  await page.getByLabel('Email address', { exact: true }).fill(h.bindings.OWNER_EMAIL)
  const requested = page.waitForResponse(response => response.url().endsWith('/auth/request') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  assert.equal((await requested).status(), 200)
  await page.getByRole('heading', { name: 'Check your email', exact: true }).waitFor()
  const plain = h.deliveries.at(-1).content.find(part => part.type === 'text/plain').value
  const link = new URL(plain.match(/https:\/\/[^\s]+/)[0])
  assert.equal(link.origin, h.origin)
  await page.goto(link.href)
  await page.locator('form button').click()
  await page.waitForURL(h.origin + '/app')
  cookie = await sessionCookie()
  assert.notEqual(cookie, initialCookie, 'Reauthentication issues a new session')
  const setup = await h.request('/setup', { headers: { cookie } })
  assert.equal(setup.status, 303, 'A new sign-in retains first-run completion')
  assert.equal(new URL(setup.headers.get('location'), h.origin).pathname, '/app')
  reads.push({ phase: 'new sign-in', ...await readInitialLaunch(h, cookie) })
  for (const surface of surfaces) {
    assert.equal((await page.goto(h.origin + surface.path)).status(), 200)
    await empty(surface)
  }

  const positiveContext = await context.browser().newContext({ viewport: { width, height: 960 }, ignoreHTTPSErrors: true })
  try {
    await positiveContext.addCookies([{ name: '__Host-operator_session', value: control.h.owner.cookie.split('=')[1], url: control.h.origin, secure: true, httpOnly: true, sameSite: 'Lax' }])
    const positive = await positiveContext.newPage()
    for (const [surface, record] of [[surfaces[0], control.decision], [surfaces[1], control.milestone]]) {
      assert.equal((await positive.goto(control.h.origin + surface.path)).status(), 200)
      const populated = positive.locator('.operator-content')
      await populated.getByRole('link', { name: record.title, exact: surface !== surfaces[0] }).first().waitFor()
      assert.equal(await populated.getByRole('heading', { name: surface.title, exact: true }).count(), 0)
      assert.ok((await populated.innerText()).includes(control.campaign.name))
      await capture(positive, surface === surfaces[0] ? 'first-run-populated-decisions' : 'first-run-populated-timeline', width)
    }
  } finally { await positiveContext.close() }
  reads.push({ phase: 'populated installation isolated', ...await readInitialLaunch(h, cookie) })
  receipt.firstRun ??= []
  receipt.firstRun.push({ width, reads, reload: true, reauthenticated: true, populatedControl: true })
  return cookie
}
