import assert from 'node:assert/strict'

/** Extends the retained template-button journey through Settings and the record. */
export async function recordUpdateButtonsBrowser(page, j, h, width, { appId, parentId, source, status }) {
  const base = `/api/v1/apps/${appId}/entities/${parentId}`
  const path = `/app/records/${appId}/${parentId}/${source.id}`
  const name = `synthetic-cradle-${width + 31}`
  const read = async () => {
    const response = await page.request.get(h.origin + `${base}/records/${source.id}`)
    assert.equal(response.status(), 200)
    return (await response.json()).data.record
  }
  async function openRecord() {
    await page.goto(h.origin + path)
    await page.getByRole('button', { name: 'Edit record', exact: true }).waitFor()
    await j.action(page.locator('summary').filter({ hasText: /^Record actions$/ }))
    await page.getByRole('button', { name, exact: true }).waitFor()
  }
  async function settings() {
    await page.goto(h.origin + '/app/settings')
    await j.action(page.locator('summary').filter({ hasText: /^Record template buttons$/ }))
    const panel = page.getByRole('region', { name: 'Record template buttons', exact: true })
    await panel.getByLabel('Base', { exact: true }).selectOption(appId)
    await panel.getByLabel('Table', { exact: true }).selectOption(parentId)
    return panel
  }
  const before = await read(), panel = await settings()
  await j.action(panel.getByRole('button', { name: 'Add update button', exact: true }))
  const editor = panel.getByRole('group', { name: 'New update button', exact: true })
  await editor.getByLabel('Button name', { exact: true }).fill(name)
  await editor.getByLabel('Field to update', { exact: true }).selectOption(status.id)
  await editor.getByLabel(/^New value/).selectOption({ label: 'Reviewed' })
  const button = await j.command(editor.getByRole('button', { name: 'Save update button', exact: true }), 'record.template-button-save')
  assert.equal(button.kind, 'update-field')
  assert.equal(button.confirmation, true)
  assert.equal(button.fieldId, status.id)
  assert.equal(button.value, status.options[1].id)
  await panel.getByRole('group', { name: 'Update button', exact: true }).waitFor()
  await j.capture('record-update-button-settings')
  assert.deepEqual(await read(), before, 'Authoring an update button changes no record')
  await openRecord()
  const action = page.getByRole('button', { name, exact: true })
  await j.action(action)
  const dialog = page.getByRole('dialog', { name: `Confirm ${name}`, exact: true })
  await dialog.waitFor()
  await j.capture('record-update-button-confirmation')
  assert.deepEqual(await read(), before, 'Opening an update confirmation writes nothing')
  await j.action(dialog.getByRole('button', { name: 'Cancel', exact: true }))
  assert.deepEqual(await read(), before, 'Cancelling an update confirmation writes nothing')
  await j.action(action)
  const committed = await j.command(dialog.getByRole('button', { name, exact: true }), 'record.template-button-run')
  assert.equal(committed.id, source.id)
  assert.equal(committed.version, before.version + 1)
  assert.equal(committed.fields[status.id].value, status.options[1].id)
  await page.locator('.cr-record-fields .cr-field').filter({ has: page.locator('dt').filter({ hasText: /^Status$/ }) }).getByText('Reviewed', { exact: true }).waitFor()
  assert.deepEqual(await read(), committed)
  await j.capture('record-update-button-updated')
  const reopened = await settings(), existing = reopened.getByRole('group', { name: 'Update button', exact: true })
  assert.equal(await existing.getByLabel('Button name', { exact: true }).inputValue(), name)
  await existing.getByLabel(/^New value/).selectOption({ label: 'Queued' })
  await j.setChecked(existing.getByLabel('Ask for confirmation before updating the record', { exact: true }), false)
  const directButton = await j.command(existing.getByRole('button', { name: 'Save update button', exact: true }), 'record.template-button-save')
  assert.equal(directButton.version, button.version + 1)
  await openRecord()
  const direct = await j.command(page.getByRole('button', { name, exact: true }), 'record.template-button-run')
  assert.equal(direct.fields[status.id].value, status.options[0].id)
  assert.equal(direct.version, committed.version + 1)
  assert.equal(await page.getByRole('dialog').count(), 0)
  const owner = (await h.db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first()).owner_id
  const policy = await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId, owner).first()
  try {
    const rules = JSON.parse(policy.rules_json).map(rule => rule.entityId === parentId ? { ...rule, writableFields: rule.writableFields.filter(id => id !== status.id) } : rule)
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules), policy.id).run()
    await openRecord()
    assert.equal(await page.getByRole('button', { name, exact: true }).isDisabled(), true, 'Forbidden users see the configured update button disabled')
    assert.deepEqual(await read(), direct)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The configured record action fits the viewport')
    await j.capture('record-update-button-disabled')
  } finally {
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json, policy.id).run()
  }
  return { buttonId: button.id, recordId: source.id, version: direct.version }
}
