import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { expect } from '@playwright/test'

// Independent fixture inventory: identity lists, then distinct native creation deltas.
const capacities = [
 ['campaigns', 'Campaigns', 'campaigns', 1],
 ['campaignCustomFields', 'Campaign custom fields', 'launch_custom_fields', 2],
 ['deliverables', 'Deliverables', 'deliverables', 3],
 ['milestones', 'Milestones', 'milestones', 4],
 ['risks', 'Risks', 'risks', 5],
 ['decisions', 'Decisions', 'decisions', 6],
 ['savedLenses', 'Saved lenses', 'lenses', 7],
 ['automations', 'Automations', 'automations', 8],
]

export async function settingsCapacityBrowser({ h, page, b, width, actor, receipt }) {
 await b.visit('/app/settings')
 const panel = page.getByRole('region', { name: 'Stored entity capacity', exact: true })
 if (width === 390) {
  await panel.getByText('Campaigns', { exact: true }).waitFor()
  await b.capture('settings-capacity-persisted')
  return
 }
 const { limits: declared } = JSON.parse(await readFile(new URL('../../seed.json', import.meta.url), 'utf8'))
 const before = Object.fromEntries(await Promise.all(capacities.map(async ([name, , table]) => [name, (await h.db.prepare(`SELECT id FROM ${table} ORDER BY id`).all()).results.length])))
 const check = async (expected, stage) => {
  for (const route of ['/api/settings', '/api/v1/settings']) {
   const response = await h.request(actor.session, route)
   assert.equal(response.status, 200)
   const payload = await response.json(), limits = (payload.settings ?? payload.data).limits
   for (const [name] of capacities) assert.deepEqual(limits.find(item => item.name === name), { name, current: expected[name], maximum: declared[name] }, `${stage}: ${route} ${name}`)
   assert.equal(limits.find(item => item.name === 'attachmentUploadBytes').current, null, 'Unavailable measurements remain unknown, never zero')
  }
  for (const [name, label] of capacities) {
   const row = panel.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) })
   await expect(row.locator('dd')).toHaveText(`${expected[name]} of ${declared[name]}`)
  }
  receipt.capacity ??= []
  receipt.capacity.push({ stage, width, expected, maxima: Object.fromEntries(capacities.map(([name]) => [name, declared[name]])) })
 }
 await check(before, 'initial fixture inventory')
 await b.capture('settings-capacity-initial')

 const campaign = await b.command('launch.campaign.create', { fields: {
  code: 'synthetic-cradle-capacity-1', name: 'Capacity evidence campaign', ownerId: actor.id,
  startDate: '2099-01-01', launchDate: '2099-12-01', objective: 'Count retained entities', statusSummary: '',
  phase: 'Planning', status: 'On track', health: 70, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {},
 } })
 const create = (kind, fields) => b.command(`launch.${kind}.create`, { fields })
 for (let i = 0; i < 2; i++) await b.command('launch.custom-field.save', { field: { name: `Capacity field ${i + 1}`, type: 'text' } })
 for (let i = 0; i < 3; i++) await create('deliverable', { campaignId: campaign.id, title: `Capacity deliverable ${i + 1}`, ownerId: actor.id, dueDate: null })
 for (let i = 0; i < 4; i++) await create('milestone', { campaignId: campaign.id, title: `Capacity milestone ${i + 1}`, ownerId: actor.id, type: 'Review', status: 'Not started', startDate: '2099-06-01', endDate: null, conflictReason: null })
 for (let i = 0; i < 5; i++) await create('risk', { campaignId: campaign.id, title: `Capacity risk ${i + 1}`, ownerId: actor.id, severity: 'Low', dueDate: null, signal: 'Synthetic evidence', mitigation: 'Monitor' })
 for (let i = 0; i < 6; i++) await create('decision', { campaignId: campaign.id, riskId: null, supersedesId: null, title: `Capacity decision ${i + 1}`, requesterId: actor.id, assigneeId: actor.id, priority: 'Low', dueAt: '2099-06-01T12:00:00.000Z', recommendation: '', impact: '' })
 for (let i = 0; i < 7; i++) await b.command('launch.lens.save', { definition: { name: `Capacity lens ${i + 1}`, description: '', recordType: 'Campaign', conditions: [], sort: { field: 'name', direction: 'asc' }, fields: ['name', 'status'], display: 'Grid' } })
 for (let i = 0; i < 8; i++) await b.command('launch.automation.save', { definition: { name: `Capacity automation ${i + 1}`, enabled: false, trigger: { kind: 'event', event: 'campaign.updated.v1' }, actions: [{ command: 'add-activity', input: { campaignId: campaign.id, message: 'Capacity fixture' } }] } })
 const after = Object.fromEntries(capacities.map(([name, , , delta]) => [name, before[name] + delta]))
 await panel.getByRole('button', { name: 'Refresh capacity' }).click()
 await check(after, 'native creation and refresh')
 await b.capture('settings-capacity-refreshed')

 // Archiving retains the stored record and every child's capacity.
 await b.command('launch.campaign.archive', { id: campaign.id }, [b.campaignRef(campaign)])
 assert.ok(await h.db.prepare('SELECT archived_at FROM campaigns WHERE id=?').bind(campaign.id).first('archived_at'))
 await panel.getByRole('button', { name: 'Refresh capacity' }).click()
 await check(after, 'archived campaign still consumes stored capacity')
 await h.restart()
 await page.reload()
 await check(after, 'persisted after Worker restart and page reload')
 await b.capture('settings-capacity-persisted')

 const denied = await h.addPerson({ name: 'Capacity restricted collaborator', change: () => [] })
 for (const route of ['/api/settings', '/api/v1/settings']) {
  const restricted = await h.request(denied.session, route), signedOut = await fetch(h.origin + route)
  assert.equal(restricted.status, 403, 'Settings policy still refuses a principal without the read grant')
  assert.equal(signedOut.status, 401, 'Settings capacity requires a current session')
  assert.equal((await restricted.json()).data, undefined)
  assert.equal((await signedOut.json()).data, undefined)
 }
 receipt.capacity.push({ stage: 'access restrictions', signedOut: 401, policyDenied: 403 })
}
