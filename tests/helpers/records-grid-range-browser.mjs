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
      const keyboard = await fillBrowserJourney(runtime, browser, width, output)
      results.push({ ...await rangePasteBrowserJourney(runtime, browser, width, output), keyboard })
    }
    await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify({ rangeHistory: results }))
  } finally { await browser?.close(); await runtime?.close() }
}

async function fillBrowserJourney(runtime, browser, width, output) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })
    try {
    await context.addCookies([{ name: runtime.cookie.split('=')[0], value: runtime.cookie.slice(runtime.cookie.indexOf('=') + 1), url: runtime.origin }])
    const page = await context.newPage()
    const journey = recordsJourney(page, runtime.origin, output, width)
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
    const keyboard = await keyboardEditJourney(page, journey, base, name, value)
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
    return keyboard
    } finally { await context.close() }
}

async function keyboardEditJourney(page, journey, base, name, value) {
  const cell = (row, column) => page.locator(`td[data-grid-row="${row}"][data-grid-column="${column}"]`)
  const focused = target => target.evaluate(element => element === document.activeElement)
  const read = async () => (await browserCall(page, base + '/query', {})).items
  const initial = await read(), commands = []
  const observe = request => { if (request.method() === 'POST' && request.url().endsWith('/commands/record.patch')) commands.push(request.postDataJSON().commandId) }
  page.on('request', observe)
  await cell(0, 0).waitFor()
  // Reach the first cell from the document's normal Tab order, without focus injection.
  for (let tabs = 0; tabs < 80 && !await focused(cell(0, 0)); tabs++) await page.keyboard.press('Tab')
  assert.equal(await focused(cell(0, 0)), true, 'Tab navigation enters the first grid cell')
  for (const [key, row, column] of [['ArrowRight', 0, 1], ['ArrowDown', 1, 1], ['ArrowLeft', 1, 0], ['ArrowUp', 0, 0], ['ArrowRight', 0, 1]]) {
    await page.keyboard.press(key)
    assert.equal(await focused(cell(row, column)), true, `${key} moves to row ${row + 1}, column ${column + 1}`)
  }
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  for (const [key, text, version, capture] of [['Enter', '11.5', 2, 'keyboard-enter'], ['F2', '2', 3, 'keyboard-f2']]) {
    await page.keyboard.press(key)
    const input = page.getByLabel('Edit Quantity', { exact: true })
    await input.waitFor()
    assert.equal(await focused(input), true, `${key} focuses the inline editor`)
    assert.equal(await input.inputValue(), version === 2 ? '2' : '11.5')
    await page.keyboard.press(`${modifier}+a`); await page.keyboard.insertText(text)
    await journey.capture(capture)
    const pending = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/commands/record.patch'))
    await page.keyboard.press('Enter')
    const response = await pending
    assert.equal(response.status(), 200)
    assert.equal((await response.json()).data.state, 'committed')
    await input.waitFor({ state: 'detached' })
    assert.equal(await cell(0, 1).innerText(), text)
    assert.equal(await focused(cell(0, 1)), true, 'Keyboard save returns focus to the edited cell')
    const rows = await read()
    assert.equal(rows[0].fields[value.id].value, text)
    assert.equal(rows[0].version, version)
    assert.deepEqual(rows[0].fields[name.id], initial[0].fields[name.id])
    assert.deepEqual(rows[1], initial[1], 'Inline editing leaves the other record unchanged')
  }
  await page.keyboard.press('ArrowDown')
  assert.equal(await focused(cell(1, 1)), true)
  const beforeCancel = await read()
  await page.keyboard.press('F2')
  const input = page.getByLabel('Edit Quantity', { exact: true })
  await input.waitFor(); assert.equal(await input.inputValue(), '7')
  await page.keyboard.press(`${modifier}+a`); await page.keyboard.insertText('888')
  await page.keyboard.press('Escape')
  await input.waitFor({ state: 'detached' })
  assert.equal(await focused(cell(1, 1)), true, 'Escape returns focus to the cancelled cell')
  assert.equal(await cell(1, 1).innerText(), '7')
  assert.deepEqual(await read(), beforeCancel, 'Escape preserves every value and version')
  assert.equal(commands.length, 2, 'Only the two saved edits submit commands')
  await journey.capture('keyboard-cancelled')
  page.off('request', observe)
  return { entry: 'Tab', moves: ['Right', 'Down', 'Left', 'Up'], saves: ['Enter', 'F2'], commands, cancel: 'unchanged', checkpoints: journey.checkpoints }
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
    await cookie(context, fixture.cookie)
    await page.goto(fixture.path)
    await page.locator('td[data-grid-row="49"][data-grid-column="4"]').waitFor({ state: 'attached' })
    await fixture.values(fixture.before, 1)
    const commands = [], observed = []
    const observe = request => { if (request.method() === 'POST' && request.url().endsWith('/commands/record.patch')) observed.push(request.postDataJSON().commandId) }
    page.on('request', observe)
    const first = page.locator('td[data-grid-row="0"][data-grid-column="0"]')
    await first.focus()
    const beforeInvalid = await fixture.read()
    await page.evaluate(text => navigator.clipboard.writeText(text), fixture.invalidText)
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+v`)
    const invalid = page.getByRole('alert').filter({ hasText: 'Nothing was changed.' })
    await invalid.getByText(/Row 17, Quantity:.*Enter a number/).waitFor()
    await invalid.getByText(/Row 38, Ship date:.*real calendar date/).waitFor()
    const invalidErrors = await invalid.locator('li').allTextContents()
    assert.equal(invalidErrors.length, 2, 'Every invalid cell is named, with no unrelated error')
    await fixture.values(fixture.before, 1)
    assert.deepEqual(await fixture.read(), beforeInvalid, 'Invalid paste preserves all 250 cells and every record version')
    assert.deepEqual(observed, [], 'Invalid paste submits no partial command')
    await journey.capture('range-invalid')
    await page.evaluate(text => navigator.clipboard.writeText(text), fixture.text)
    let pending = patch()
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+v`)
    commands.push(await rangeReceipt(runtime, await pending, fixture, fixture.operator))
    await fixture.values(fixture.after, 2)
    assert.equal(await invalid.count(), 0, 'Corrected paste clears validation errors')
    await journey.capture('range-pasted')
    pending = patch(); await tableAction(page, 'Undo')
    commands.push(await rangeReceipt(runtime, await pending, fixture, fixture.operator))
    await fixture.values(fixture.before, 3)
    await journey.capture('range-undone')
    // A reload must keep the one-step redo, its typed values and its revisions.
    await page.reload(); await first.waitFor(); await first.focus()
    pending = patch(); await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Shift+z`)
    commands.push(await rangeReceipt(runtime, await pending, fixture, fixture.operator))
    await fixture.values(fixture.after, 4)
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
    }
    assert.equal(observed.length, 5, 'Neither refusal silently retries the range')
    await journey.capture('range-demoted')
    return { width, records: 50, cells: 250, invalidErrors, invalidPaste: 'unchanged', commands, conflict: { row: 25, field: quantity.label, currentValue: '9876.5', status: 409 }, demoted: 403, checkpoints: journey.checkpoints }
  } catch (error) {
    await page.screenshot({ path: path.join(output, `failure-${width}.png`), fullPage: true })
    throw error
  } finally { await context.close(); await ownerContext.close() }
}
