import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
export async function uploadSet(page, fixture, name, { action = target => target.click() } = {}) {
  const directory = path.resolve('tests/fixtures/base-transfer', fixture, 'csv')
  const files = (await readdir(directory)).filter(file => file.endsWith('.csv')).sort().map(file => path.join(directory, file))
  await page.getByLabel('Base name', { exact: true }).fill(name)
  await page.getByLabel('CSV files', { exact: true }).setInputFiles(files)
  const response = page.waitForResponse(r => r.url().endsWith('/base-import/preview') && r.request().method() === 'POST')
  // Preserve a selection failure if cleanup cancels this waiter; success still awaits and validates it.
  void response.catch(() => {})
  await action(page.getByRole('button', { name: 'Preview import', exact: true }))
  return previewResponse(await response)
}
async function previewResponse(response) {
  const body = await response.json()
  assert.equal(response.status(), 200, JSON.stringify(body))
  return body.data
}
export async function overrideType(page, label, type) {
  const response = page.waitForResponse(r => r.url().endsWith('/base-import/preview') && r.request().method() === 'POST')
  // Preserve a selection failure if cleanup cancels this waiter; success still awaits and validates it.
  void response.catch(() => {})
  await page.getByLabel(`Type for ${label}`, { exact: true }).selectOption(type)
  return previewResponse(await response)
}
export async function chooseTarget(page, label, key) {
  const response = page.waitForResponse(r => r.url().endsWith('/base-import/preview') && r.request().method() === 'POST')
  // Preserve a selection failure if cleanup cancels this waiter; success still awaits and validates it.
  void response.catch(() => {})
  await page.getByLabel(`Linked table for ${label}`, { exact: true }).selectOption(JSON.stringify({ included: true, tableKey: key }))
  return previewResponse(await response)
}
export async function chooseMissingTarget(page, label) {
  const response = page.waitForResponse(r => r.url().endsWith('/base-import/preview') && r.request().method() === 'POST')
  // Preserve a selection failure if cleanup cancels this waiter; success still awaits and validates it.
  void response.catch(() => {})
  await page.getByLabel(`Linked table for ${label}`, { exact: true }).selectOption({ label: 'Target table not included in this set' })
  return previewResponse(await response)
}
export async function chooseLookup(page, label, coordinates) {
  const response = page.waitForResponse(r => r.url().endsWith('/base-import/preview') && r.request().method() === 'POST')
  // Preserve a selection failure if cleanup cancels this waiter; success still awaits and validates it.
  void response.catch(() => {})
  await page.getByLabel(`Lookup mapping for ${label}`, { exact: true }).selectOption(JSON.stringify(coordinates))
  return previewResponse(await response)
}
export async function submitImport(page, { onAdopt, onReview, action = target => target.click(), setChecked = (target, checked = true) => checked ? target.check() : target.uncheck() } = {}) {
  const acknowledge = page.getByLabel('I acknowledge all listed rejected rows, unresolved and ambiguous links, skipped values, named and lossy conversions.', { exact: true })
  await setChecked(acknowledge, true)
  const reviewed = page.waitForResponse(r => r.url().endsWith('/base-import/review') && r.request().method() === 'POST')
  await action(page.getByRole('button', { name: 'Save review and inspect schema impact', exact: true }))
  const review = await previewResponse(await reviewed)
  await page.getByRole('heading', { name: 'Review schema changes', exact: true }).waitFor()
  assert.match(review.physicalFingerprint,/^[a-f0-9]{64}$/)
  assert.equal(await page.getByText(review.physicalFingerprint,{exact:true}).isVisible(),true,'Owner sees the physical Kit fingerprint before adoption')
  if (onReview) await onReview(review)
  await setChecked(page.getByLabel('I reviewed the schema changes, destructive impact, recovery, owner access and exact import plan.', { exact: true }), true)
  const adopted = page.waitForResponse(r => r.url().endsWith('/base-import/adopt') && r.request().method() === 'POST')
  await action(page.getByRole('button', { name: 'Adopt schema and start import', exact: true }))
  const adoptionResponse=await adopted
  assert.equal(adoptionResponse.request().postDataJSON().physicalFingerprint,review.physicalFingerprint,'Adoption acknowledges the owner-visible physical plan')
  const job = await previewResponse(adoptionResponse)
  if (onAdopt) await onAdopt(job, review)
  await page.getByRole('heading', { name: 'Import completed', exact: true }).waitFor()
  return job
}
export async function downloadStatus(page, output, name, action = target => target.click()) {
  const pending = page.waitForEvent('download')
  await action(page.getByRole('link', { name: 'Download complete import report', exact: true }))
  const download = await pending
  assert.equal(download.suggestedFilename(), 'base-import-report.json')
  const destination = path.join(output, `${name}.json`)
  await download.saveAs(destination)
  return JSON.parse(await readFile(destination, 'utf8'))
}
export async function verifyPreviewLists(page, preview) {
  for (const table of preview.report.tables) {
    assert.ok((await page.getByRole('heading', { name: table.label, exact: true }).count()) > 0)
    for (const column of table.columns) {
      await page.getByLabel(`Type for ${column.label}`, { exact: true }).first().waitFor()
      assert.equal(await page.getByLabel(`Type for ${column.label}`, { exact: true }).count() > 0, true)
    }
    for (const link of table.links) for (const item of link.listings) {
      assert.ok((await page.getByText(item.message, { exact: true }).count()) > 0, `Complete link list: ${item.message}`)
      for (const candidate of item.candidates ?? []) assert.ok((await page.getByText(`${candidate.tableKey}: ${JSON.stringify(candidate.raw)}${candidate.recordId ? ` (${candidate.recordId})` : ''}`, { exact: true }).count()) > 0)
    }
  }
  for (const item of preview.report.diagnostics) assert.ok((await page.getByText(item.message, { exact: true }).count()) > 0, `All diagnostics: ${item.message}`)
}
