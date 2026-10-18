import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'
import { contract } from './contract.mjs'
import { launchAuthorityRuntime, LAUNCH_APP_ID, launchEntities } from './helpers/launch-authority-runtime.mjs'
import { createFixtureAuth } from './helpers/base-fixture-auth.mjs'
import { doorsBrowser, csvRows } from './helpers/launch-doors-browser.mjs'

// One real-door journey per operator door, through the emitted Worker at desktop and phone:
// import, export, custom fields, bulk edit, sample data and the ownership handover.
contract('IMPORT-001', '[IMPORT-003] [IMPORT-005] [DATA-002] [CAMP-008] [CAMP-013] [SET-001] [SET-003] [OPS-002] Launch operator doors at desktop and phone', async () => {
 const output = path.resolve(process.env.CRADLE_DOORS_EVIDENCE ?? '../evidence/de-doors')
 await mkdir(output, { recursive: true })
 const h = await launchAuthorityRuntime({}, { installedLaunchDefinitions: true, installationOwner: true })
 const receipt = { environment: 'Actual emitted Worker and native D1, synthetic fixtures only', screens: [], downloads: [], errors: [] }
 const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 try {
  let actor = { id: h.owner, session: h.ownerSession }
  for (const width of [1440, 390]) {
   const successorName = width === 1440 ? 'Alex Successor' : 'Sam Successor', successor = await h.addPerson({ name: successorName })
   const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, acceptDownloads: true }), page = await context.newPage()
   page.on('pageerror', error => receipt.errors.push(`${width}: ${error.message}`))
   await context.addCookies([{ name: actor.session.cookie.split('=')[0], value: actor.session.cookie.slice(actor.session.cookie.indexOf('=') + 1), url: h.origin }])
   const b = doorsBrowser({ h, page, width, output, session: () => actor.session, receipt })
   try {
   const actorEmail = await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(actor.id).first('email')

   // Import: upload, map, review creates/updates, confirm atomically, download the stored file.
   const vertex = await h.db.prepare("SELECT name FROM campaigns WHERE code='CMP-261'").first('name')
   const csv = `Code,Name,Owner,Start,Launch,Health\r\nCMP-261,${vertex} (${width}),,,,\r\nIMP-${width},Imported launch ${width},${actorEmail},2026-11-01,2026-12-01,75\r\n`
   await b.visit('/app/campaigns')
   await page.getByRole('button', { name: 'Import CSV' }).click()
   await page.locator('input[type=file]').setInputFiles({ name: `launches-${width}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
   await page.getByRole('button', { name: 'Upload file' }).click()
   await page.getByText('Match columns to fields').waitFor()
   assert.equal(await page.locator('.launch-import-mapping label').filter({ hasText: /^Health/ }).locator('select').inputValue(), 'health', 'Headers that name a field are matched to it')
   const mapColumn = (column, field) => b.choose(column, field)
   await page.getByRole('button', { name: 'Preview changes' }).click()
   await page.getByText('Fix every row before importing; nothing has changed.').waitFor()
   assert.match(await page.getByRole('alert').filter({ hasText: 'Row 3' }).innerText(), /startDate is required for a new record/)
   await b.capture('import-row-error')
   await page.getByRole('button', { name: 'Change mapping' }).click()
   await mapColumn('Start', 'startDate'); await mapColumn('Launch', 'launchDate')
   await page.getByRole('button', { name: 'Preview changes' }).click()
   await page.locator('.launch-import-summary').filter({ hasText: '1 new' }).waitFor()
   assert.match(await page.locator('.launch-import-summary').innerText(), /^1 new · 1 updated · 0 unchanged$/)
   await page.getByRole('region', { name: 'Import changes' }).getByText(`${vertex} (${width})`).waitFor()
   await b.capture('import-preview')
   await page.getByLabel(/Import every reviewed row/).check()
   await page.getByRole('button', { name: 'Import 2 rows' }).click()
   await page.getByText(/Imported 2 rows from/).waitFor()
   assert.equal(await h.db.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE code=?').bind(`IMP-${width}`).first('n'), 1)
   await b.capture('import-committed')
   const stored = await b.download(() => page.getByRole('link', { name: 'Download stored file' }).click())
   assert.deepEqual(stored.bytes, Buffer.from(csv), 'The stored import file downloads unchanged')
   receipt.downloads.push({ width, door: 'import', name: stored.name, bytes: stored.bytes.length })
   await page.getByRole('button', { name: 'Close import' }).click()

   // Export the grid, a lens and the decision queue in visible order with workspace time and money.
   await page.getByLabel('Sort').selectOption('name:asc')
   await page.waitForLoadState('networkidle')
   const names = await b.visibleNames()
   const grid = await b.download(() => page.getByRole('button', { name: 'Export CSV' }).click())
   const gridRows = csvRows(grid.bytes)
   assert.deepEqual(gridRows[0], ['Campaign', 'Phase', 'Owner', 'Launch', 'Budget (USD)', 'Status', 'Risk'])
   assert.deepEqual(gridRows.slice(1).map(row => row[0]), names, 'Grid CSV rows are the visible campaigns in visible order')
   assert.match(grid.name, /^Campaign grid · All active — USD — .*GMT\+10-00\.csv$/)
   receipt.downloads.push({ width, door: 'grid export', name: grid.name, rows: gridRows.length - 1 })
   await b.visit('/app/lenses/risks')
   const lens = await b.download(() => page.getByRole('button', { name: 'Export CSV' }).click())
   const lensRows = csvRows(lens.bytes), lensTotal = (await (await h.request(actor.session, '/api/risks/lens')).json()).total
   assert.deepEqual(lensRows[0], ['Severity', 'State', 'Owner', 'Due date', 'Signal', 'Mitigation', 'Campaign'])
   assert.equal(lensRows.length - 1, lensTotal, 'Lens CSV holds exactly the records its conditions select')
   receipt.downloads.push({ width, door: 'lens export', name: lens.name, rows: lensRows.length - 1 })
   await b.visit('/app/decisions')
   const titles = await page.locator('ol[aria-label="Unresolved decisions"] li strong').allInnerTexts()
   const queue = await b.download(() => page.getByRole('button', { name: 'Export CSV' }).click())
   const queueRows = csvRows(queue.bytes)
   assert.deepEqual(queueRows.slice(1).map(row => row[2]), titles, 'Queue CSV follows the queue order')
   assert.ok(queueRows.slice(1).every(row => /GMT\+10:00$/.test(row[1])), 'Due times use the workspace timezone')
   receipt.downloads.push({ width, door: 'queue export', name: queue.name, rows: queueRows.length - 1 })
   await b.capture('decision-queue-export')

   // Custom fields: define one in Settings, fill it on a campaign.
   const fieldName = `Market ${width}`
   await b.visit('/app/settings')
   await b.openPanel('Custom fields')
   await page.getByLabel('Field name', { exact: true }).fill(fieldName)
   await b.choose('Type', 'select')
   await page.getByLabel(/Choices/).fill('North\nSouth')
   await page.getByRole('button', { name: 'Add field' }).click()
   await page.locator('.launch-settings-item', { hasText: fieldName }).waitFor()
   await b.capture('settings-custom-fields')
   const imported = await h.db.prepare('SELECT id FROM campaigns WHERE code=?').bind(`IMP-${width}`).first('id')
   await b.visit(`/app/campaigns/${imported}`)
   const details = page.locator('details.portfolio-priority-details')
   if (!await details.evaluate(element => element.open)) await details.locator('summary').click()
   await page.getByRole('button', { name: 'Edit custom fields' }).click()
   await b.choose(fieldName, 'North')
   await page.getByRole('button', { name: 'Save custom fields' }).click()
   await page.getByRole('button', { name: 'Save custom fields' }).waitFor({ state: 'detached' })
   if (!await details.evaluate(element => element.open)) await details.locator('summary').click()
   await page.locator('.launch-custom-values', { hasText: 'North' }).waitFor()
   assert.equal(await h.db.prepare('SELECT v.value_json FROM launch_custom_values v JOIN launch_custom_fields f ON f.id=v.field_id WHERE f.name=? AND v.campaign_id=?').bind(fieldName, imported).first('value_json'), '"North"')
   await b.capture('campaign-custom-fields')

   // Bulk edit a selection and undo it.
   await b.visit('/app/campaigns')
   const [first, second] = await b.visibleIds()
   const statuses = async () => (await h.db.prepare('SELECT id,status FROM campaigns WHERE id IN (?,?) ORDER BY id').bind(first, second).all()).results
   const before = await statuses()
   await b.select(first).check(); await b.select(second).check()
   await b.choose('Change', 'status')
   await b.choose('New status', 'Blocked')
   await b.capture('bulk-edit-selection')
   await page.getByRole('button', { name: 'Apply to 2' }).click()
   await page.getByText('Changed 2 campaigns').waitFor()
   assert.deepEqual((await statuses()).map(row => row.status), ['Blocked', 'Blocked'])
   await b.capture('bulk-edit-applied')
   await page.getByRole('button', { name: 'Undo bulk change' }).click()
   await page.getByText('Restored 2 campaigns').waitFor()
   assert.deepEqual(await statuses(), before)

   // Sample data: install, refuse removal once edited, remove an unedited installation.
   await b.visit('/app/settings')
   await b.openPanel('Sample data')
   await page.getByRole('button', { name: 'Install sample data' }).click()
   await page.getByText(/Installed \d+ sample records/).waitFor()
   const edited = await h.db.prepare('SELECT c.id,c.name,c.version FROM campaigns c JOIN launch_sample_records s ON s.record_id=c.id JOIN sample_installations i ON i.id=s.installation_id ORDER BY i.created_at DESC,c.id LIMIT 1').first()
   await b.command('launch.campaign.patch', { id: edited.id, changes: { statusSummary: 'Edited by an operator' } }, [b.campaignRef(edited)])
   await page.locator('.launch-settings-item', { hasText: 'Sample data ·' }).first().getByRole('button', { name: 'Remove sample data' }).click()
   await page.getByText(`campaign “${edited.name}”`).waitFor()
   await b.capture('sample-data-refused')
   const samples = page.locator('.launch-settings-item', { hasText: 'Sample data ·' }), previousSamples = await samples.count()
   const [installed] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/v1/commands/launch.samples.install') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Install sample data' }).click(),
   ])
   assert.equal((await installed.json()).data.state, 'committed', 'The new sample installation commits')
   await expect(samples).toHaveCount(previousSamples + 1)
   const installations = await h.db.prepare('SELECT COUNT(*) AS n FROM sample_installations').first('n')
   const [removed] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/v1/commands/launch.samples.remove') && response.request().method() === 'POST'),
    samples.first().getByRole('button', { name: 'Remove sample data' }).click(),
   ])
   assert.equal((await removed.json()).data.state, 'committed', 'The unedited sample removal commits')
   await expect(samples).toHaveCount(previousSamples)
   assert.equal(await h.db.prepare('SELECT COUNT(*) AS n FROM sample_installations').first('n'), installations - 1)
   await b.capture('sample-data-removed')

   // Ownership: hand over after a fresh email-link confirmation, move work, then leave.
   if (width === 1440) await h.db.prepare('UPDATE oa_sessions SET created_at=created_at-700000 WHERE id=?').bind(actor.session.baseId).run()
   const openPeople = async () => { await b.visit('/app/settings'); await b.openPanel('People and authority'); await page.getByLabel('Application').selectOption(LAUNCH_APP_ID); await page.getByRole('region', { name: 'Workspace members' }).waitFor() }
   const row = name => page.getByRole('region', { name: 'Workspace members' }).locator('tr', { hasText: name })
   await openPeople()
   await row(successorName).getByRole('button', { name: 'Make owner' }).click()
   await page.getByRole('button', { name: `Hand over ownership to ${successorName}` }).click()
   if (width === 1440) {
    await page.getByText('Confirm it is you first.').waitFor()
    await b.capture('ownership-confirm-first')
    const previousMail=(await h.mailMessages()).length
    await page.getByRole('button', { name: 'Email me a confirmation link' }).click()
    await page.getByText('Check your email for the confirmation link.').waitFor()
    const links=(await h.mailMessages()).slice(previousMail).flatMap(message=>[...message.content.find(part=>part.type==='text/plain').value.matchAll(/https?:\/\/\S+/g)].map(match=>new URL(match[0]))).filter(url=>url.pathname==='/auth/confirm')
    assert.equal(links.length,1,'The fresh owner step-up delivers exactly one confirmation link')
    await page.goto(links[0].href)
    await page.locator('form[action="/auth/confirm"] button').click()
    await page.waitForURL(/\/app\/settings/)
    await openPeople()
    await row(successorName).getByRole('button', { name: 'Make owner' }).click()
    await page.getByRole('button', { name: `Hand over ownership to ${successorName}` }).click()
   }
   // Handing over makes the former owner a Base admin, which ends their sessions; they sign in again to finish leaving.
   await page.getByText('Please sign in again').waitFor()
   assert.equal(await h.db.prepare('SELECT initial_owner FROM authority_principals WHERE id=?').bind(successor.id).first('initial_owner'), 1)
   actor = { id: actor.id, session: await h.signIn(actor.id) }
   await context.addCookies([{ name: actor.session.cookie.split('=')[0], value: actor.session.cookie.slice(actor.session.cookie.indexOf('=') + 1), url: h.origin }])
   await openPeople()
   await row(successorName).getByText('Owner', { exact: true }).waitFor()
   await b.capture('ownership-handed-over')
   for (const decision of (await h.db.prepare("SELECT id,version FROM decisions WHERE assignee_id=? AND state IN ('Awaiting approval','In review')").bind(actor.id).all()).results)
    await b.command('launch.decision.assign', { id: decision.id, assigneeId: successor.id }, [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.decision, recordId: decision.id }, version: decision.version }])
   await b.visit('/app/campaigns?view=mine')
   const mine = await b.visibleIds()
   await b.select(mine[0]).check()
   if (mine.length > 1) await page.getByRole('button', { name: `Select all ${mine.length} matching campaigns` }).click()
   await b.choose('Change', 'ownerId')
   await page.locator('#bulk-owner').selectOption(successor.id)
   await page.getByRole('button', { name: `Apply to ${mine.length}` }).click()
   await page.getByText(`Changed ${mine.length} campaigns`).waitFor()
   assert.equal(await h.db.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE owner_id=? AND archived_at IS NULL').bind(actor.id).first('n'), 0)
   const self = await h.db.prepare('SELECT name FROM operators WHERE id=?').bind(actor.id).first('name')
   await openPeople()
   await row(self).getByRole('button', { name: 'Remove access' }).click()
   await row(self).getByLabel('Reason').fill('Handing the workspace over')
   await b.capture('ownership-remove-self')
   await row(self).getByRole('button', { name: 'Remove access', exact: true }).click()
   for (let tries = 0; await h.db.prepare('SELECT state FROM authority_principals WHERE id=?').bind(actor.id).first('state') !== 'removed'; tries++) { assert.ok(tries < 50, 'Self-removal commits'); await page.waitForTimeout(200) }
   assert.equal((await h.request(actor.session, '/api/v1/session')).status, 401, 'The former owner is signed out')
   } catch (error) { await page.screenshot({ path: path.join(output, `failed-${width}.png`), fullPage: true }); throw error }
   await context.close()
   actor = { id: successor.id, session: await (await createFixtureAuth(h.db, h.configuration, successor.id)).signIn(successor.id) }
  }
  assert.deepEqual(receipt.errors, [])
 } finally {
  await writeFile(path.join(output, 'doors-receipt.json'), JSON.stringify(receipt, null, 1))
  await browser.close(); await h.close()
 }
})
