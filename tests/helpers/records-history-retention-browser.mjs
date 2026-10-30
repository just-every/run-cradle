import assert from 'node:assert/strict'
import { browserCall } from './records-live-fixture.mjs'
import { tableAction, tableTools } from './records-table-tools.mjs'

/** Exercise retained actions through the grid, rather than inspecting storage. */
export async function historyRetentionBrowser(page, runtime, { base, field, title, width, journey }) {
  const cell = page.locator(`td[data-field-id="${field.id}"][data-grid-row="0"]`)
  const id = await cell.getAttribute('data-record-id')
  const read = async () => (await browserCall(page, base + '/query', {})).items
  const before = await read(), original = before.find(row => row.id === id)
  const controls = before.filter(row => row.id !== id)
  const commands = [], modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  let version = original.version
  async function action(run, value) {
    const pending = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/commands/record.patch'))
    await run()
    const response = await pending, result = await response.json()
    assert.equal(response.status(), 200, JSON.stringify(result))
    assert.equal(result.data.state, 'committed')
    assert.equal(result.data.commandId, response.request().postDataJSON().commandId)
    assert.equal(result.data.value.rows.length, 1)
    commands.push(result.data.commandId)
    const rows = await read(), current = rows.find(row => row.id === id)
    assert.equal(current.version, ++version, 'Each retained action commits exactly once')
    assert.deepEqual(current.fields, { ...original.fields, [field.id]: { state: 'value', value } })
    assert.deepEqual(rows.filter(row => row.id !== id), controls, 'Other records never change')
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
  }
  async function edit(value) {
    await cell.dblclick()
    await page.getByLabel(`Edit ${field.label}`, { exact: true }).fill(value)
    await action(() => page.getByRole('button', { name: 'Save cell', exact: true }).click(), value)
    await page.getByRole('button', { name: 'Save cell', exact: true }).waitFor({ state: 'detached' })
  }
  async function key(redo = false) {
    await cell.focus()
    await page.keyboard.press(`${modifier}+${redo ? 'Shift+' : ''}z`)
  }
  async function unavailable(name) {
    const menu = await tableTools(page)
    assert.equal(await menu.getByRole('button', { name, exact: true }).isDisabled(), true)
    await menu.getByRole('button', { name: 'Close', exact: true }).click()
  }
  // One more than the retained window proves the oldest action expires while
  // every one of the fifty newer actions remains individually reversible.
  for (let step = 1; step <= 51; step++) await edit(String(1000 + step))
  await page.reload(); await cell.waitFor()
  await journey.capture('history-fifty-retained')
  for (let step = 50; step >= 1; step--) {
    await action(() => step % 2 ? key() : tableAction(page, 'Undo'), String(1000 + step))
    if (step === 26) {
      await page.getByRole('link', { name: original.fields[title.id].value, exact: true }).click()
      await page.getByRole('button', { name: 'Edit record', exact: true }).waitFor()
      await page.reload()
      await page.getByRole('link', { name: '← Back to records', exact: true }).click()
      await cell.waitFor()
    }
  }
  await unavailable('Undo')
  const oldest = await read()
  await key()
  assert.deepEqual(await read(), oldest, 'An exhausted undo cannot reach the discarded action')
  await journey.capture('history-fifty-undone')
  await page.reload(); await cell.waitFor()
  for (let step = 2; step <= 51; step++) await action(() => step % 2 ? key(true) : tableAction(page, 'Redo'), String(1000 + step))
  await unavailable('Redo')
  await journey.capture('history-fifty-redone')
  await action(() => tableAction(page, 'Undo'), '1050')
  await edit('2001')
  await unavailable('Redo')
  await page.reload(); await cell.waitFor()
  await unavailable('Redo')
  await action(() => tableAction(page, 'Undo'), '1050')
  const admissions = (await runtime.db.prepare("SELECT command_id,state,action FROM command_admissions WHERE command_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(commands)).all()).results
  assert.equal(admissions.length, commands.length)
  assert.ok(admissions.every(row => row.state === 'committed' && row.action === 'record.patch'))
  const audits = (await runtime.db.prepare('SELECT command_id,subject_json,changes_json FROM admission_audit WHERE command_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(commands)).all()).results
  assert.equal(audits.length, commands.length)
  for (const row of audits) {
    assert.equal(JSON.parse(row.subject_json).recordId, id)
    assert.equal(JSON.parse(row.changes_json).length, 1)
  }
  assert.equal(new Set(commands).size, commands.length)
  return { width, retained: 50, edits: 51, undone: 50, redone: 50, commands: commands.length, recordId: id }
}
