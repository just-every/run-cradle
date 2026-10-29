import {recordsBrowserWidths} from './helpers/records-browser-widths.mjs'
import {baseAction} from './helpers/records-base-menu.mjs'
import {preHydrationImport,preHydrationSheets} from './helpers/base-import-hydration.mjs'
import {companyWorkbookBrowser} from './helpers/company-workbook-browser.mjs'
import {fileStoresBrowser,unresolvedStoresBrowser,resolvedStoresBrowser} from './helpers/file-stores-browser.mjs'
import {browserCookies} from './helpers/session-cookies.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { contract } from './contract.mjs'
import {companyWorkbookRuntime as recordsImportBrowserRuntime} from './helpers/company-workbook-runtime.mjs'
import { recordsJourney } from './helpers/records-browser-journey.mjs'
import { accessibilityTabAway } from './helpers/accessibility-input.mjs'
import { accessibilityContextOptions, accessibilityWidths } from './helpers/accessibility-evidence.mjs'
import { uploadSet, overrideType, chooseTarget, chooseMissingTarget, chooseLookup, submitImport, downloadStatus, verifyPreviewLists } from './helpers/base-import-browser.mjs'
const output = path.resolve(process.env.CRADLE_IMPORT_OUTPUT ?? process.env.TMPDIR ?? '.private/base-import-browser')
contract('PERM-007 INTEG-003 FILE-002 FILE-004 RECORDS-005', 'CSV-set import preview, guarded adoption, stored resume and undo on desktop and phone', async () => {
  await mkdir(output, { recursive: true })
  let runtime, browser
  const receipts = []
  try {
    runtime = await recordsImportBrowserRuntime(0)
    browser = await chromium.launch({ headless: true,args:['--use-mock-keychain','--password-store=basic'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
    for (const width of recordsBrowserWidths(accessibilityWidths)) {
      const context = await browser.newContext(accessibilityContextOptions({ viewport: { width, height: width === 390 ? 844 : 900 } }))
      let page
      try {
        await context.addCookies(browserCookies(runtime.cookie,runtime.origin))
        page = await context.newPage();const journey = recordsJourney(page, runtime.origin, output, width,{allAxe:true})
        await preHydrationImport(page,runtime,width,name=>journey.capture(name))
        await preHydrationSheets(page,runtime,name=>journey.capture(name))
        await companyWorkbookBrowser(page,{...journey,companyOutput:name=>path.join(output,`${name}-${width}.png`)},runtime,width)
        await fileStoresBrowser(page,runtime,width,output)
        await unresolvedStoresBrowser(page,runtime,width,output)
        await resolvedStoresBrowser(page,runtime,width,output)
        const consoleErrors = [], externalRequests = [], batchCheckpoints = []
        page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
        page.on('request', request => { if (new URL(request.url()).origin !== runtime.origin) externalRequests.push(request.url()) })
        page.on('response', async response => { if (/\/base-import\/jobs\/[^/]+\/resume$/.test(response.url()) && response.status() === 200) { const data = (await response.json()).data; batchCheckpoints.push(data.checkpoint) } })
        await page.goto(runtime.origin + '/app/records/')
        await baseAction(page,'Import a base',journey.action)
        await journey.capture('import-upload')
        const initial = await uploadSet(page, 'crm-example', `Imported CRM ${width}`, { action: journey.action })
        await verifyPreviewLists(page, initial)
        await journey.capture('import-preview')
        const ack = page.getByLabel('I reviewed the listed problems, skipped rows and values, links that cannot be matched, and changes to field types or names.', { exact: true })
        await journey.setChecked(ack,true)
        const originalTable=initial.source.tables[0],tableName=page.getByLabel(`Table name for ${originalTable.label}`,{exact:true})
        const renamedResponse=page.waitForResponse(r=>r.url().endsWith('/base-import/preview')&&r.request().method()==='POST')
        await tableName.fill('Owner named companies');await accessibilityTabAway(page,tableName)
        const renamed=(await(await renamedResponse).json()).data
        assert.equal(renamed.report.tables[0].label,'Owner named companies');assert.deepEqual(renamed.identities,initial.identities);assert.notEqual(renamed.fingerprint,initial.fingerprint);assert.equal(await ack.isChecked(),false)
        const restoredResponse=page.waitForResponse(r=>r.url().endsWith('/base-import/preview')&&r.request().method()==='POST')
        await tableName.fill(originalTable.label);await accessibilityTabAway(page,tableName);await restoredResponse
        await journey.setChecked(ack,true)
        const employeeColumn=page.locator('fieldset.cr-import-column').filter({has:page.getByLabel('Type for Employees',{exact:true})})
        await journey.action(employeeColumn.getByText('Describe source behavior (optional)',{exact:true}))
        const sourceKindResponse=page.waitForResponse(r=>r.url().endsWith('/base-import/preview')&&r.request().method()==='POST')
        await page.getByLabel('Source kind for Employees',{exact:true}).selectOption('number')
        const declared=(await(await sourceKindResponse).json()).data,declaredEmployees=declared.report.tables.flatMap(table=>table.columns).find(column=>column.label==='Employees')
        assert.equal(declaredEmployees.sourceKind,'number');assert.equal(declaredEmployees.sourceKindOrigin,'owner')
        assert.deepEqual(declared.schemaDraft,initial.schemaDraft,'Source description does not silently change destination schema')
        assert.notEqual(declared.fingerprint,initial.fingerprint);assert.equal(await ack.isChecked(),false,'Source-kind declaration invalidates acknowledgment')
        await journey.setChecked(ack,true)
        const changed = await overrideType(page, 'Employees', 'text')
        assert.deepEqual(changed.identities, initial.identities, 'Overrides preserve all initial identities')
        assert.notEqual(changed.fingerprint, initial.fingerprint)
        assert.equal(await ack.isChecked(), false, 'Override clears acknowledgment')
        assert.equal(await page.getByRole('button', { name: 'Continue to review tables and fields', exact: true }).isDisabled(), true)
        await overrideType(page, 'Employees', 'number')
        await overrideType(page, 'Industry', 'select')
        const optionResponse = page.waitForResponse(r => r.url().endsWith('/base-import/preview') && r.request().method() === 'POST')
        await page.getByLabel('Options for Industry (one per line)', { exact: true }).fill('Software\nHealthcare\nRetail\nPublic sector')
        await accessibilityTabAway(page,page.getByLabel('Options for Industry (one per line)', { exact: true }))
        const optionsPreview = (await (await optionResponse).json()).data
        const companyFieldId = optionsPreview.identities.tables['Companies-Grid view.csv'].fields['column-2']
        assert.deepEqual(optionsPreview.schemaDraft.tables.find(t => t.id === optionsPreview.identities.tables['Companies-Grid view.csv'].entityId).fields.find(f => f.id === companyFieldId).options.map(o => o.label), ['Software', 'Healthcare', 'Retail', 'Public sector'])
        const lookupPreview = await overrideType(page, 'Company name (lookup)', 'text')
        const dealTable = lookupPreview.source.tables.find(table => table.columns[0].label === 'Deal')
        const lookupColumn = dealTable.columns.find(column => column.label === 'Company name (lookup)')
        const lookupAccounting = lookupPreview.report.tables.find(table => table.tableKey === dealTable.key).columns.find(column => column.columnKey === lookupColumn.key)
        const provenLookup = lookupAccounting.lookupCandidates.find(candidate => candidate.matchesAllRows)
        assert.ok(provenLookup, 'Genuine exported lookup has an all-row proof')
        await journey.setChecked(ack,true)
        const explicitlyMapped = await chooseLookup(page, lookupColumn.label, { relationColumnKey: provenLookup.relationColumnKey, valueColumnKey: provenLookup.valueColumnKey })
        assert.equal(await ack.isChecked(), false, 'Explicit lookup mapping invalidates acknowledgment')
        assert.equal(explicitlyMapped.report.lookups.find(item => item.tableKey === dealTable.key && item.columnKey === lookupColumn.key).recognized, true)
        const mismatchingLookup = lookupAccounting.lookupCandidates.find(candidate => !candidate.matchesAllRows)
        assert.ok(mismatchingLookup, 'All candidate fields include a genuine mismatch')
        const mismatched = await chooseLookup(page, lookupColumn.label, { relationColumnKey: mismatchingLookup.relationColumnKey, valueColumnKey: mismatchingLookup.valueColumnKey })
        assert.equal(mismatched.report.lookups.find(item => item.tableKey === dealTable.key && item.columnKey === lookupColumn.key).recognized, false, 'A mapping choice cannot force an invalid lookup')
        const mismatchedField = mismatched.schemaDraft.tables.find(table => table.id === mismatched.identities.tables[dealTable.key].entityId).fields.find(field => field.id === mismatched.identities.tables[dealTable.key].fields[lookupColumn.key])
        assert.equal(mismatchedField.type, 'text')
        await chooseLookup(page, lookupColumn.label, { relationColumnKey: provenLookup.relationColumnKey, valueColumnKey: provenLookup.valueColumnKey })
        await journey.capture('import-recomputed')
        const job = await submitImport(page, { action: journey.action, setChecked: journey.setChecked, onReview: async () => journey.capture('import-schema-impact') })
        await journey.capture('import-completed')
        assert.ok(batchCheckpoints.length > 0)
        for (let i = 0; i < batchCheckpoints.length; i++) assert.ok(batchCheckpoints[i] - (batchCheckpoints[i - 1] ?? 0) <= 20, 'One bounded batch per resume')
        const completed = await downloadStatus(page, output, `crm-completed-${width}`, journey.action)
        assert.equal(completed.job.id, job.id)
        assert.equal(completed.job.state, 'completed')
        assert.equal(completed.reconciliation.ok, true)
        assert.equal(completed.schemaRetainedAfterUndo, true)
        const storedUrl = page.url()
        await page.reload()
        await page.getByRole('heading', { name: 'Import completed', exact: true }).waitFor()
        await journey.capture('import-stored-resume')
        // Visit native record detail: canonical relation and recognized lookup use genuine imported rows.
        const companies = initial.source.tables.find(table => table.columns[0].label === 'Company')
        const companyId = initial.identities.tables[companies.key].records[companies.rows[0].key]
        await page.goto(`${runtime.origin}/app/records/${initial.identities.appId}/${initial.identities.tables[companies.key].entityId}/${companyId}`)
        await page.getByRole('heading', { name: 'Acme Example Works', exact: true }).waitFor()
        await page.getByRole('link', { name: 'Avery Example', exact: true }).waitFor()
        assert.equal(await page.getByRole('heading', { name: 'Contacts', exact: true }).count(), 1)
        await journey.capture('import-incoming-chips')
        const deals = initial.source.tables.find(table => table.columns[0].label === 'Deal')
        const dealId = initial.identities.tables[deals.key].records[deals.rows[0].key]
        await page.goto(`${runtime.origin}/app/records/${initial.identities.appId}/${initial.identities.tables[deals.key].entityId}/${dealId}`)
        await page.getByRole('heading', { name: 'Acme Pilot', exact: true }).waitFor()
        await page.getByRole('link', { name: 'Acme Example Works', exact: true }).waitFor()
        await journey.capture('import-linked-record')
        await page.goto(storedUrl)
        await journey.action(page.getByRole('button', { name: 'Undo import', exact: true }))
        await journey.action(page.getByRole('button', { name: 'Confirm undo', exact: true }))
        await page.getByRole('heading', { name: 'Import undone', exact: true }).waitFor()
        await journey.capture('import-undone')
        const undone = await downloadStatus(page, output, `crm-undone-${width}`, journey.action)
        assert.equal(undone.job.state, 'undone'); assert.equal(undone.schemaRetainedAfterUndo, true)
        await page.getByText('Undo removes created records and links, preserves edited conflicting records, and keeps the base schema and original uploads. The report remains marked undone after reversal.', { exact: true }).waitFor()
        await page.goto(runtime.origin + '/app/records/?import=base')
        let edges = await uploadSet(page, 'edges', `Import edges ${width}`, { action: journey.action })
        edges = await overrideType(page, 'Targets', 'relation')
        edges = await chooseTarget(page, 'Targets', 'Targets-Grid view.csv')
        await journey.setChecked(ack,true)
        edges = await chooseMissingTarget(page, 'External archive item')
        assert.equal(await ack.isChecked(), false, 'Missing-target skip recomputation invalidates acknowledgment')
        const edgeTable = edges.source.tables.find(table => table.columns[0].label === 'Edge')
        const externalColumn = edgeTable.columns.find(column => column.label === 'External archive item')
        const externalOverride = edges.options.tables[edgeTable.key].columns[externalColumn.key]
        assert.equal(externalOverride.type, 'relation'); assert.equal(externalOverride.skip, true)
        assert.equal(externalOverride.relationTableKey, undefined, 'Missing target has no fabricated source identity')
        const externalAccounting = edges.report.tables.find(table => table.tableKey === edgeTable.key).columns.find(column => column.columnKey === externalColumn.key)
        assert.equal(externalAccounting.chosenType, 'skipped'); assert.equal(externalAccounting.skippedNonempty, 1)
        const edgeLinks = edges.report.tables.flatMap(table => table.links)
        const referenceTotals = edgeLinks.reduce((total, link) => ({ read: total.read + link.referencesRead, resolved: total.resolved + link.resolved, unresolved: total.unresolved + link.unresolved, ambiguous: total.ambiguous + link.ambiguous }), { read: 0, resolved: 0, unresolved: 0, ambiguous: 0 })
        assert.deepEqual(referenceTotals, { read: 11, resolved: 6, unresolved: 4, ambiguous: 1 }, 'Complete genuine edge references include the skipped missing-target column')
        assert.ok(edgeLinks.some(link => link.ambiguous > 0), 'Genuine duplicate primary labels are ambiguous')
        assert.ok(edgeLinks.some(link => link.unresolved > 0), 'Genuine absent labels are unresolved')
        await verifyPreviewLists(page, edges)
        assert.ok(await page.getByText(/<script>alert/).count() > 0, 'HTML source is visible escaped text')
        assert.equal(await page.locator('script').filter({ hasText: "alert('x')" }).count(), 0)
        await journey.capture('import-edge-lists')
        assert.deepEqual(consoleErrors, []); assert.deepEqual(externalRequests, [])
        receipts.push({ width, jobId: job.id, batchCheckpoints, checkpoints: journey.checkpoints, consoleErrors, externalRequests })
      } catch(error) {
        if(page){await page.screenshot({path:path.join(output,`failed-state-${width}.png`),fullPage:true});await writeFile(path.join(output,`failed-dom-${width}.html`),await page.content())}
        throw error
      } finally { await context.close() }
    }
    await writeFile(path.join(output, 'base-import-results.json'), JSON.stringify(receipts, null, 2))
  } finally { await browser?.close(); await runtime?.close() }
})
