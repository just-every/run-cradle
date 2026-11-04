import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { createUlid, LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'

const shifted = (instant, days) => new Date(instant + days * 86400000).toISOString().slice(0, 10)
const revision = (kind, row) => [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities[kind], recordId: row.id }, version: row.version }]

// The same fixture exercises the emitted HTTP door and the built page. Only
// identities come from command receipts; membership, order and business values
// below are authored independently of the lens implementation and its results.
export async function verifyPublicShippedRiskLens({ h, clear = false, page, capture, receipt }) {
 const read = async route => {
  const response = await h.request(h.ownerSession, route)
  assert.equal(response.status, 200, await response.clone().text())
  return response.json()
 }
 const command = async (action, input, expected = []) => {
  const response = await h.request(h.ownerSession, `/api/v1/commands/${action}`, { method: 'POST', body: JSON.stringify({ commandId: createUlid(), input, expected }) })
  assert.equal(response.status, 200, await response.clone().text())
  const { data } = await response.json()
  assert.equal(data.state, 'committed')
  return data.value
 }
 // Fixture isolation and disposal are outside the behaviour under test. Every
 // campaign and risk below is still created through the actual public commands.
 if (clear) await h.db.prepare('DELETE FROM campaigns').run()
 assert.deepEqual((await read('/api/risks/lens')).risks, [], 'The public fixture starts with no matching risks')
 const shipped = (await read('/api/lenses?limit=200')).lenses.find(lens => lens.shippedKey === 'risks')
 assert.ok(shipped)
 assert.equal(shipped.version, 1, 'Prove the installed definition before any operator edit')
 const criticalAutomation = (await read('/api/automations')).automations.find(row => row.name === 'Critical risk escalation')
 if (criticalAutomation.enabled) await command('launch.automation.disable', { id: criticalAutomation.id }, revision('automation', criticalAutomation))
 const settings = (await read('/api/v1/settings')).data
 const owners = [await h.addPerson({ name: 'Amber Risk Reviewer' }), await h.addPerson({ name: 'Rowan Risk Reviewer' })]
 const names = ['Amber Risk Reviewer', 'Rowan Risk Reviewer']
 // Pin the entire request clock at 00:30 Brisbane, on the next UTC date.
 // This stays within the fixture session lifetime and distinguishes workspace
 // today from UTC today without racing the host's midnight.
 const host = new Date(), now = Date.UTC(host.getUTCFullYear(), host.getUTCMonth(), host.getUTCDate(), 14, 30)
 const today = shifted(now, 1), campaigns = [], rows = new Map()
 h.setNow(now)
 if (page) await page.context().setExtraHTTPHeaders({ 'x-cradle-test-now': String(now) })
 try {
  await command('settings.update', { version: settings.version, changes: { timezone: 'Australia/Brisbane' } })
  for (const [code, offset] of [['RISK-A', 30], ['RISK-B', -1], ['RISK-FUTURE', 31], ['RISK-ARCHIVED', 0]]) {
   const name = `Shipped lens ${code}`
   const created = await command('launch.campaign.create', { fields: { code, name, ownerId: h.owner, startDate: shifted(now, -100), launchDate: shifted(Date.parse(`${today}T12:00:00Z`), offset), objective: 'Review launch risks', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} } })
   campaigns.push({ id: created.id, code, name, launchDate: shifted(Date.parse(`${today}T12:00:00Z`), offset) })
  }
  const [a, b, future, archived] = campaigns
  const due = days => shifted(Date.parse(`${today}T12:00:00Z`), days)
  // Deliberately interleave severities, due dates, nulls and reverse code ties.
  const fixtures = [
   ['highA', a, 'High', -2, 0], ['criticalNullB', b, 'Critical', null, 1],
   ['criticalLater', a, 'Critical', 2, 1], ['highNullB', b, 'High', null, 0],
   ['criticalB', b, 'Critical', 0, 0], ['highB', b, 'High', -2, 1],
   ['criticalA', a, 'Critical', 0, 1], ['criticalNullA', a, 'Critical', null, 0],
   ['highNullA', a, 'High', null, 1], ['criticalEarly', b, 'Critical', -1, 0],
   ['low', a, 'Low', 0, 0], ['medium', a, 'Medium', 0, 1],
   ['futureCritical', future, 'Critical', -5, 0], ['futureHigh', future, 'High', -5, 1],
   ['archivedCritical', archived, 'Critical', -5, 0], ['archivedHigh', archived, 'High', -5, 1],
   ['resolvedCritical', a, 'Critical', -5, 0], ['resolvedHigh', b, 'High', -5, 1],
  ]
  for (const [key, campaign, severity, days, ownerIndex] of fixtures) {
   const fields = { campaignId: campaign.id, title: `Lens ${key}`, ownerId: owners[ownerIndex].id, severity, dueDate: days === null ? null : due(days), signal: `Signal for ${key}`, mitigation: `Mitigation for ${key}` }
   const created = await command('launch.risk.create', { fields })
   rows.set(key, { id: created.id, title: fields.title, severity, state: 'Watching', owner: { id: fields.ownerId, name: names[ownerIndex] }, dueDate: fields.dueDate, signal: fields.signal, mitigation: fields.mitigation, campaign })
   if (key.startsWith('resolved')) await command('launch.risk.resolve', { id: created.id, resolutionNote: 'Addressed before launch' }, revision('risk', created))
   if (key === 'highB') {
    await command('launch.risk.escalate', { id: created.id, reason: 'Review overdue campaign' }, revision('risk', created))
    rows.get(key).state = 'Escalated'
   }
  }
  const current = (await read(`/api/campaigns/${archived.id}`)).campaign
  await command('launch.campaign.archive', { id: archived.id }, revision('campaign', current))
  const expected = ['criticalEarly', 'criticalA', 'criticalB', 'criticalLater', 'criticalNullA', 'criticalNullB', 'highA', 'highB', 'highNullA', 'highNullB'].map(key => rows.get(key))
  const result = await read('/api/risks/lens')
  assert.deepEqual(result.risks.map(row => row.id), expected.map(row => row.id), 'Public shipped lens has exactly the authored membership and order; observed results are never sorted')
  assert.equal(result.total, expected.length)
  assert.equal(result.nextCursor, null)
  for (const [index, row] of result.risks.entries()) {
   const { owner, campaign, ...business } = row
   const wanted = expected[index]
   for (const field of ['id', 'title', 'severity', 'state', 'dueDate', 'signal', 'mitigation']) assert.equal(business[field], wanted[field], `Public ${field} for ${wanted.title}`)
   assert.deepEqual({ id: owner.id, name: owner.name }, wanted.owner)
   assert.deepEqual(campaign, wanted.campaign)
  }
  assert.deepEqual((await read(`/api/lenses/${shipped.id}`)).lens, shipped, 'The complete public proof leaves the shipped definition untouched')
  if (page) {
   await page.goto(`${h.origin}/app/lenses/risks`)
   await page.getByText(`${expected.length} matching risks`, { exact: true }).waitFor()
   const cards = page.locator('main[aria-labelledby="risks-lens-title"] article')
   const observed = await cards.evaluateAll(elements => elements.map(card => ({
    href: card.querySelector('h2 a').getAttribute('href'), title: card.querySelector('h2').innerText,
    severity: card.querySelector('header span').innerText, state: card.querySelectorAll('header span')[1].innerText,
    due: card.querySelector('header > span').innerText, campaignAndOwner: card.querySelector('h2 + p').innerText,
    campaignHref: card.querySelector('h2 + p a').getAttribute('href'),
    signal: card.querySelectorAll('dd')[0].innerText, mitigation: card.querySelectorAll('dd')[1].innerText,
   })))
   // The business assertions run at the desktop width; both widths retain
   // actual rendered order and values in the browser receipt and screenshot.
   if (page.viewportSize().width === 1440) {
    assert.deepEqual(observed.map(card => card.href), expected.map(row => `/app/risks/${row.id}`), 'Rendered cards retain the public lens order')
    for (const [index, wanted] of expected.entries()) {
     const card = cards.nth(index)
     for (const value of [wanted.severity, wanted.state]) await expect(card.getByText(value, { exact: true })).toBeVisible()
     const dueText = wanted.dueDate ? `Due ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${wanted.dueDate}T12:00:00Z`))}` : 'No due date'
     await expect(card.getByText(dueText, { exact: true })).toBeVisible()
     await expect(card.locator('h2 a')).toHaveText(wanted.title)
     await expect(card.locator('h2 + p')).toHaveText(`${wanted.campaign.name} · ${wanted.owner.name}`)
     await expect(card.getByRole('link', { name: wanted.campaign.name, exact: true })).toHaveAttribute('href', `/app/campaigns/${wanted.campaign.id}`)
     for (const [label, value] of [['Signal', wanted.signal], ['Mitigation', wanted.mitigation]]) await expect(card.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')).toHaveText(value)
     for (const field of [card.locator('h2 a'), card.locator('h2 + p'), card.locator('dl dd').nth(0), card.locator('dl dd').nth(1)]) await expect(field).toBeVisible()
    }
   }
   receipt.shippedRiskLens ??= []
   receipt.shippedRiskLens.push({ width: page.viewportSize().width, now, today, expected, observed })
   await capture('shipped-risk-lens-complete')
  }
 } finally {
  for (const campaign of campaigns) await h.db.prepare('DELETE FROM campaigns WHERE id=?').bind(campaign.id).run()
  const currentSettings = (await read('/api/v1/settings')).data
  await command('settings.update', { version: currentSettings.version, changes: { timezone: settings.timezone } })
  h.setNow(undefined)
  if (page) await page.context().setExtraHTTPHeaders({})
 }
}
