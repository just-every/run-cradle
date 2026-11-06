import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { customFieldDeletionFixture } from './launch-custom-field-deletion.mjs'

export async function customFieldDeletionBrowser({ h, b, page, actor, width, receipt, fieldName, firstId }) {
 const definitions = (await (await h.request(actor.session, '/api/v1/launch/custom-fields')).json()).data.items
 const target = definitions.find(field => field.name === fieldName)
 assert.ok(target, 'The definition was authored in Settings')
 const f = await customFieldDeletionFixture(h, () => actor.session, actor.id, String(width), { target, firstId })
 // The first campaign already has North from the retained browser flow. Author a
 // different value on another campaign through the same shipped editor.
 await b.visit(`/app/campaigns/${f.ids[1]}`)
 const details = page.locator('details.portfolio-priority-details')
 if (!await details.evaluate(element => element.open)) await details.locator('summary').click()
 await page.getByRole('button', { name: 'Edit custom fields' }).click()
 await b.choose(fieldName, 'South')
 await page.getByRole('button', { name: 'Save custom fields' }).click()
 await page.getByRole('button', { name: 'Save custom fields' }).waitFor({ state: 'detached' })
 if (!await details.evaluate(element => element.open)) await details.locator('summary').click()
 await expect(page.locator('.launch-custom-values')).toContainText('South')
 const before = await f.assertPopulated(), storedBefore = await f.storedRows()
 await b.visit('/app/settings')
 await b.openPanel('Custom fields')
 const row = page.locator('.launch-settings-item').filter({ has: page.locator('strong', { hasText: new RegExp(`^${fieldName}$`) }) })
 await expect(row).toContainText('2 campaigns have a value')
 await row.getByRole('button', { name: 'Delete', exact: true }).click()
 await expect(row).toContainText(`Deleting ${fieldName} also deletes the value stored on 2 campaigns. This cannot be undone.`)
 await expect(row.getByRole('button', { name: 'Delete field and 2 values', exact: true })).toBeVisible()
 await b.capture('custom-field-delete-confirmation')
 await row.getByRole('button', { name: 'Keep field' }).click()
 await expect(row.getByRole('button', { name: 'Delete field and 2 values', exact: true })).toHaveCount(0)
 assert.deepEqual(await f.snapshot(), before, 'Cancelling the shipped confirmation changes no definitions, values or campaign business fields')
 await b.capture('custom-field-delete-cancelled')
 const refused = await f.refuseWrongCount()
 await row.getByRole('button', { name: 'Delete', exact: true }).click()
 const [response] = await Promise.all([
  page.waitForResponse(response => response.url().endsWith('/api/v1/commands/launch.custom-field.delete') && response.request().method() === 'POST'),
  row.getByRole('button', { name: 'Delete field and 2 values', exact: true }).click(),
 ])
 assert.equal(response.status(), 200)
 const result = (await response.json()).data
 assert.equal(result.state, 'committed')
 assert.deepEqual(result.value, { deletedId: target.id, affected: 2 })
 await expect(row).toHaveCount(0)
 await expect(page.locator('.launch-settings-item').filter({ hasText: `Retained note ${width}` })).toBeVisible()
 await f.assertDeleted(before, storedBefore)
 await b.capture('custom-field-deleted')
 receipt.customFieldDeletion ??= []
 receipt.customFieldDeletion.push({ width, populatedCampaigns: 2, unsetCampaigns: 1, cancelledUnchanged: true, refused, deletedValues: 2, publicArchiveVerified: true, unrelatedDataUnchanged: true })
 console.log(`PROBE CAMP-008 2 browser ${width}: Settings confirms exactly two campaigns, cancellation unchanged, fresh-version wrong count refused unchanged, shipped Delete removes definition and both values; unset campaign and unrelated data intact`)
}
