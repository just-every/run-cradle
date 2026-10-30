import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { recordsBrowserRuntime } from './records-browser-runtime.mjs'
import { browserCall, liveCommand } from './records-live-fixture.mjs'
import { tableAction } from './records-table-tools.mjs'
import { recordsBrowserWidths } from './records-browser-widths.mjs'
import { recordsJourney } from './records-browser-journey.mjs'
import { rangeFixture, rangeReceipt } from './records-grid-range-fixture.mjs'
import { historyRetentionBrowser } from './records-history-retention-browser.mjs'
import { rangeAutomationBrowser } from './records-history-automation-browser.mjs'
import { createUlid } from '../../src/core/shared/ids.ts'
import { newField } from '../../src/ui/records/schema/templates.ts'

/** The same range operation reaches its public menu and keyboard doors. */
export async function gridRangeBrowserJourney() {
  let runtime, browser
  const output = path.resolve(process.env.CRADLE_RECORDS_OUTPUT ?? '.private/records-builder/browser', 'grid-range')
  await mkdir(output, { recursive: true })
  try {
    runtime = await recordsBrowserRuntime()
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
    const results = []
    for (const width of recordsBrowserWidths()) {
      const retention = await fillBrowserJourney(runtime, browser, width, output)
      results.push({ ...await rangePasteBrowserJourney(runtime, browser, width, output), retention })
    }
    await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify({ rangeHistory: results }))
  } finally { await browser?.close(); await runtime?.close() }
}

async function fillBrowserJourney(runtime, browser, width, output) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    try {
    await context.addCookies([{ name: runtime.cookie.split('=')[0], value: runtime.cookie.slice(runtime.cookie.indexOf('=') + 1), url: runtime.origin }])
    const page = await context.newPage()
    await page.goto(runtime.origin + '/app/records')
    await page.getByRole('button', { name: /^Base ▾/ }).waitFor()
    const appId = createUlid(), entityId = createUlid(), name = newField('Item'), value = newField('Quantity', 'number')
    const preview = await browserCall(page, '/api/v1/records/schema-preview', { appId, name: 'Stock counts', tables: [{ id: entityId, label: 'Stock', primaryFieldId: name.id, fields: [name, value] }] })
    await browserCall(page, '/api/v1/commands/release.adopt', liveCommand({ kind: 'manual_schema', previewId: preview.id }))
    const base = `/api/v1/apps/${appId}/entities/${entityId}`, schema = await browserCall(page, base)
    for (const [index, title] of ['Packing box', 'Mailing tube'].entries()) await browserCall(page, '/api/v1/commands/record.create', liveCommand({ appId, entityId, values: { [name.id]: title, [value.id]: index ? '7' : '2' } }, [{ ref: { appId, entityId: '00000000000000000000000001', recordId: entityId }, version: schema.version }]))
    await page.goto(`${runtime.origin}/app/records/${appId}/${entityId}`)
    const first = page.locator(`td[data-field-id="${value.id}"][data-grid-row="0"]`)
    const patch = () => page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/commands/record.patch'))
    const quantities = async () => (await browserCall(page, base + '/query', {})).items.map(row => row.fields[value.id].value)
    await first.click(); await page.keyboard.press('Shift+ArrowDown')
    let pending = patch(); await tableAction(page, 'Fill down'); assert.equal((await pending).status(), 200)
    assert.deepEqual(await quantities(), ['2', '2'])
    pending = patch(); await tableAction(page, 'Undo'); assert.equal((await pending).status(), 200)
    assert.deepEqual(await quantities(), ['2', '7'])
    // Do not wait for a background read: the admitted command's rows already
    // carry the current value and version for an immediate next range edit.
    await first.click(); await page.keyboard.press('Shift+ArrowDown')
    pending = patch(); await page.keyboard.press('Control+d'); assert.equal((await pending).status(), 200)
    assert.deepEqual(await quantities(), ['2', '2'])
    pending = patch(); await tableAction(page, 'Undo'); assert.equal((await pending).status(), 200)
    pending = patch(); await tableAction(page, 'Redo'); assert.equal((await pending).status(), 200)
    assert.deepEqual(await quantities(), ['2', '2'])
    return await historyRetentionBrowser(page, runtime, { base, field: value, title: name, width, journey: recordsJourney(page, runtime.origin, output, width) })
    } finally { await context.close() }
}

async function rangePasteBrowserJourney(runtime, browser, width, output) {
  const ownerContext = await browser.newContext({ viewport: { width, height: 900 } })
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage(), owner = await ownerContext.newPage(), journey = recordsJourney(page, runtime.origin, output, width)
  page.setDefaultTimeout(15000)
  const cookie = (context, value) => context.addCookies([{ name: value.split('=')[0], value: value.slice(value.indexOf('=') + 1), url: runtime.origin }])
  const patch = () => page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/commands/record.patch'))
  try {
    await cookie(ownerContext, runtime.cookie)
    await owner.goto(runtime.origin + '/app/records')
    await owner.getByRole('button', { name: /^Base ▾/ }).waitFor()
    const fixture = await rangeFixture(owner, runtime, width)
    const automation = await rangeAutomationBrowser(owner, runtime, fixture)
    await cookie(context, fixture.cookie)
    await page.goto(fixture.path)
    await page.locator('td[data-grid-row="49"][data-grid-column="4"]').waitFor({ state: 'attached' })
    await fixture.values(fixture.before, 1)
    const commands = [], observed = []
    const observe = request => { if (request.method() === 'POST' && request.url().endsWith('/commands/record.patch')) observed.push(request.postDataJSON().commandId) }
    page.on('request', observe)
    const first = page.locator('td[data-grid-row="0"][data-grid-column="0"]')
    await first.focus()
    await page.evaluate(text => navigator.clipboard.writeText(text), fixture.text)
    let pending = patch()
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+v`)
    commands.push(await rangeReceipt(runtime, await pending, fixture, fixture.operator))
    await fixture.values(fixture.after, 2)
    await automation.observe(commands.at(-1).commandId)
    await journey.capture('range-pasted')
    pending = patch(); await tableAction(page, 'Undo')
    commands.push(await rangeReceipt(runtime, await pending, fixture, fixture.operator))
    await fixture.values(fixture.before, 3)
    await automation.observe(commands.at(-1).commandId)
    await journey.capture('range-undone')
    // A reload must keep the one-step redo, its typed values and its revisions.
    await page.reload(); await first.waitFor(); await first.focus()
    pending = patch(); await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Shift+z`)
    const redoResponse = await pending, retainedRedo = redoResponse.request().postDataJSON()
    commands.push(await rangeReceipt(runtime, redoResponse, fixture, fixture.operator))
    await fixture.values(fixture.after, 4)
    await automation.observe(commands.at(-1).commandId)
    await journey.capture('range-redone')
    assert.deepEqual(observed, commands.map(command => command.commandId), 'Paste, undo and redo each submit exactly one admitted range')
    const target = fixture.ids[24], quantity = fixture.fields[1]
    await owner.goto(fixture.path)
    const targetCell = owner.locator(`td[data-record-id="${target}"][data-field-id="${quantity.id}"]`)
    await targetCell.dblclick(); await owner.getByLabel('Edit Quantity', { exact: true }).fill('9876.5')
    const peerResponse = owner.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/commands/record.patch'))
    await owner.getByRole('button', { name: 'Save cell', exact: true }).click()
    assert.equal((await peerResponse).status(), 200)
    const beforeRefusal = await fixture.read()
    assert.equal(beforeRefusal[24].fields[quantity.id].value, '9876.5')
    pending = patch(); await tableAction(page, 'Undo')
    const conflictResponse = await pending, conflict = (await conflictResponse.json()).error
    assert.equal(conflictResponse.status(), 409)
    assert.equal(conflict.issues.length, 1)
    assert.equal(conflict.issues[0].fieldId, quantity.id)
    assert.equal(conflict.issues[0].path, `rows.24.changes.${quantity.id}`)
    assert.match(conflict.issues[0].message, /Row 25, Quantity:.*current value is.*9876\.5/)
    await page.getByRole('alert').filter({ hasText: /Row 25, Quantity:.*9876\.5/ }).waitFor()
    assert.deepEqual(await fixture.read(), beforeRefusal, 'Conflicting undo changes no value, version or record')
    await journey.capture('range-conflict')
    await fixture.role('read-only')
    pending = patch(); await tableAction(page, 'Undo')
    const denied = await pending
    assert.equal(denied.status(), 403)
    assert.equal((await denied.json()).error.code, 'forbidden')
    assert.deepEqual(await fixture.read(), beforeRefusal, 'Demoted undo changes no value, version or record')
    for (const id of observed.slice(3)) {
      assert.equal(await runtime.db.prepare('SELECT command_id FROM command_admissions WHERE command_id=?').bind(id).first(), null)
      assert.equal((await runtime.db.prepare('SELECT COUNT(*) AS n FROM admission_audit WHERE command_id=?').bind(id).first()).n, 0)
      assert.equal((await runtime.db.prepare('SELECT COUNT(*) AS n FROM record_automation_events WHERE command_id=?').bind(id).first()).n, 0)
    }
    assert.equal(observed.length, 5, 'Neither refusal silently retries the range')
    // Receipt replay acknowledges an existing write; it never performs it again.
    const replay = await browserCall(page, '/api/v1/commands/record.patch', retainedRedo)
    assert.equal(replay.commandId, retainedRedo.commandId)
    assert.deepEqual(await fixture.read(), beforeRefusal, 'Replaying an admitted redo makes no write')
    await journey.capture('range-demoted')
    const revoked = await owner.evaluate(async sessionId => {
      const csrf = (await (await fetch('/auth/csrf')).json()).csrfToken
      return (await fetch('/auth/session/revoke', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ sessionId }) })).status
    }, fixture.sessionId)
    assert.equal(revoked, 204)
    await browserCall(page, '/api/v1/commands/record.patch', retainedRedo, 401)
    assert.deepEqual(await fixture.read(), beforeRefusal, 'A revoked native session cannot replay a retained write')
    return { width, records: 50, cells: 250, commands, automation: await automation.finish(), conflict: { row: 25, field: quantity.label, currentValue: '9876.5', status: 409 }, demoted: 403, revoked: 401, checkpoints: journey.checkpoints }
  } catch (error) {
    await page.screenshot({ path: path.join(output, `failure-${width}.png`), fullPage: true })
    throw error
  } finally { await context.close(); await ownerContext.close() }
}
