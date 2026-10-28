import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { recordsBrowserRuntime } from './records-browser-runtime.mjs'
import { browserCall, liveCommand } from './records-live-fixture.mjs'
import { tableAction } from './records-table-tools.mjs'
import { createUlid } from '../../src/core/shared/ids.ts'
import { newField } from '../../src/ui/records/schema/templates.ts'

/** The same range operation reaches its public menu and keyboard doors. */
export async function gridRangeBrowserJourney() {
  let runtime, browser
  try {
    runtime = await recordsBrowserRuntime()
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
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
    await context.close()
  } finally { await browser?.close(); await runtime?.close() }
}
