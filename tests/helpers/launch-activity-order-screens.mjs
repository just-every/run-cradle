import assert from 'node:assert/strict'
import { verifyPublicCampaignActivityOrder } from './launch-activity-order-journey.mjs'

export async function verifyCampaignActivityOrderScreens({ h, page, action, capture, width }) {
 const proof = await verifyPublicCampaignActivityOrder(h)
 await page.goto(`${h.origin}/app/campaigns/${proof.campaignId}`)
 await page.getByRole('heading', { name: proof.authored.at(-1).name, exact: true }).waitFor()
 await action(page.getByText('Activity', { exact: true }))
 const list = page.locator('.portfolio-activity-list')
 await list.waitFor()
 const disclosures = list.locator('details summary')
 for (const disclosure of await disclosures.all()) {
  if (!(await disclosure.evaluate(element => element.parentElement.open))) await action(disclosure)
 }
 // Read the actual DOM order, rather than calling activityActions or sorting
 // either the HTTP response or the rendered groups to obtain an expectation.
 const groups = await list.locator(':scope > li').evaluateAll(elements => elements.map(element => ({
  occurredAt: element.querySelector('time')?.dateTime,
  changes: [...element.querySelectorAll('dl > div')].map(fact => ({
   field: fact.querySelector('dt')?.textContent,
   value: fact.querySelector('dd')?.textContent,
  })),
 })))
 const observed = groups.flatMap(group => {
  const edit = proof.authored.find(candidate => group.changes.some(change => change.field === 'Objective' && change.value.endsWith(` → ${candidate.objective}`)))
  return edit ? [{ ...group, commandId: edit.commandId }] : []
 })
 assert.deepEqual(observed.map(group => group.commandId), proof.expectedActions, 'Rendered activity groups follow reverse authored write order without sorting observed results')
 for (const group of observed) {
  const edit = proof.authored.find(candidate => candidate.commandId === group.commandId)
  assert.equal(group.occurredAt, edit.occurredAt, 'The rendered group identifies the same publicly read command instant')
  assert.equal(group.changes.length, 2, 'Each human edit renders as one complete group')
  assert.ok(group.changes.some(change => change.field === 'Name' && change.value.endsWith(` → ${edit.name}`)))
 }
 await capture('campaign-activity-newest-first')
 console.log(`PROBE ACT-001 1: rendered activity at ${width} -> three grouped edits in reverse authored command order`)
 return { width, ...proof, renderedActions: observed.map(group => group.commandId), groups: observed }
}
