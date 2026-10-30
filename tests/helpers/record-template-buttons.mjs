import { recordUpdateButtonsBrowser } from './record-update-buttons-browser.mjs'
import assert from 'node:assert/strict'
import { createUlid } from '../../src/core/shared/ids.ts'
import { RECORD_SCHEMA_ENTITY_ID } from '../../src/domains/records/contracts.ts'
import { recordUpdateButtons } from './record-update-buttons.mjs'

/** Public HTTP journey; durable policy edits supply the actual authority failures. */
export async function recordTemplateButtons(h) {
  const appId = createUlid(), parentId = createUlid(), childId = createUlid()
  const titleId = createUlid(), lineId = createUlid(), linkId = createUlid()
  const field = (id, label) => ({ id, label, type: 'text', required: true, unique: false })
  const preview = (await h.request('/api/v1/records/schema-preview', { method: 'POST', body: { appId, name: 'synthetic-cradle-151', tables: [
    { id: parentId, label: 'Orders', primaryFieldId: titleId, fields: [field(titleId, 'Name')] },
    { id: childId, label: 'Lines', primaryFieldId: lineId, fields: [field(lineId, 'Name'), { id: linkId, label: 'Order', type: 'relation', required: true, unique: false, relation: { ownerAppId: appId, entityId: parentId, cardinality: 'one', onDelete: 'restrict' } }] },
  ] } })).data
  const command = async (action, input, expected = [], status = 200, commandId = createUlid()) => (await h.request(`/api/v1/commands/${action}`, { method: 'POST', status, body: { commandId, expected, input } })).data
  await command('release.adopt', { kind: 'manual_schema', previewId: preview.id })
  const schemas = (await h.request(`/api/v1/apps/${appId}/entities`)).data.items
  const schemaExpected = entityId => ({ ref: { appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: entityId }, version: schemas.find(schema => schema.id === entityId).version })
  const source = (await command('record.create', { appId, entityId: parentId, values: { [titleId]: 'synthetic-cradle-152' } }, [schemaExpected(parentId)])).value
  const child = (await command('record.create', { appId, entityId: childId, values: { [lineId]: 'synthetic-cradle-153', [linkId]: source.ref } }, [schemaExpected(childId)])).value
  const expected = [schemaExpected(parentId), { ref: source.ref, version: source.version }]
  const template = (await command('record.template-save', { ref: source.ref, name: 'synthetic-cradle-154', includeLinks: true, includeAttachments: false, includeChildren: true }, expected)).value
  const config = { appId, entityId: parentId, templateId: template.id, name: 'synthetic-cradle-155', confirmation: true }
  const button = (await command('record.template-button-save', config, [schemaExpected(parentId)])).value
  const list = async () => (await h.request(`/api/v1/apps/${appId}/entities/${parentId}/template-buttons`)).data
  const query = async entityId => (await h.request(`/api/v1/apps/${appId}/entities/${entityId}/query`, { method: 'POST', body: { limit: 100 } })).data.items
  const counts = async () => [(await query(parentId)).length, (await query(childId)).length]
  const input = { appId, entityId: parentId, buttonId: button.id, confirmed: true, ref: source.ref }
  assert.equal((await list()).find(item => item.id === button.id).enabled, true)
  assert.deepEqual(await counts(), [1, 1], 'Reading and configuring a button creates no records')
  await command('record.template-button-run', { ...input, confirmed: false }, expected, 400)
  await command('record.template-button-run', input, [schemaExpected(parentId)], 400)
  await command('record.template-button-run', input, [{ ref: source.ref, version: source.version }], 409)
  assert.deepEqual(await counts(), [1, 1], 'Confirmation and version refusals have no effects')
  const commandId = createUlid(), result = await command('record.template-button-run', input, expected, 200, commandId)
  assert.equal(result.value.fields[titleId].value, 'synthetic-cradle-152')
  const children = await query(childId), createdChild = children.find(row => row.id !== child.id)
  assert.equal(createdChild.fields[lineId].value, 'synthetic-cradle-153')
  assert.deepEqual(createdChild.fields[linkId].value, result.value.ref)
  const replay = await command('record.template-button-run', input, expected, 200, commandId)
  assert.equal(replay.value.id, result.value.id)
  assert.deepEqual(await counts(), [2, 2], 'One button command creates one atomic parent and child')
  const facts = (await h.db.prepare('SELECT subject_json FROM admission_audit WHERE command_id=?').bind(commandId).all()).results.map(row => JSON.parse(row.subject_json))
  assert.deepEqual(new Set(facts.map(ref => ref.recordId)), new Set([result.value.id, createdChild.id]))
  await command('record.template-button-run', { ...input, entityId: childId, ref: child.ref }, [schemaExpected(childId), { ref: child.ref, version: child.version }], 404)
  await command('record.template-button-run', { ...input, ref: child.ref }, expected, 400)
  const updated = (await command('record.template-button-save', { ...config, id: button.id, confirmation: false }, [schemaExpected(parentId)])).value
  assert.equal(updated.id, button.id)
  await command('record.template-button-run', { ...input, confirmed: false }, expected)
  assert.deepEqual(await counts(), [3, 3], 'The configured confirmation choice is persistent')
  const sourceAfter = (await command('record.patch', { ref: source.ref, changes: { [titleId]: 'synthetic-cradle-156' } }, [{ ref: source.ref, version: source.version }])).value
  await command('record.template-button-run', input, expected, 409)
  const currentExpected = [schemaExpected(parentId), { ref: source.ref, version: sourceAfter.version }]
  const policy = await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId, h.operator).first()
  const original = JSON.parse(policy.rules_json)
  try {
    for (const entityId of [parentId, childId]) {
      const rules = original.map(rule => rule.entityId === entityId ? { ...rule, actions: rule.actions.filter(action => action !== 'record.create') } : rule)
      await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules), policy.id).run()
      const items = await list()
      assert.equal(items.find(item => item.id === button.id).enabled, false, 'Parent and child create rights both control the button')
      assert.ok(items.every(item => !('values' in item) && !('children' in item)), 'Button discovery discloses no template values')
      await command('record.template-button-run', input, currentExpected, 403)
      assert.deepEqual(await counts(), [3, 3], 'Forbidden button execution writes neither parent nor child')
    }
    // Keep the table readable while removing the captured source from its row scope.
    const restricted = original.map(rule => rule.entityId === parentId ? { ...rule, rows: { kind: 'condition', fieldId: titleId, op: 'ne', value: 'synthetic-cradle-156' } } : rule)
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(restricted), policy.id).run()
    assert.equal((await list()).find(item => item.id === button.id).enabled, false, 'A lost template source disables its button')
    await command('record.template-button-run', input, currentExpected, 404)
  } finally {
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json, policy.id).run()
  }
  assert.deepEqual(await counts(), [3, 3])
  const scalarUpdate = await recordUpdateButtons(h)
  return { scalarUpdate, appId, entityId: parentId, childId, source, template, button: updated, createdRecordId: result.value.id, recordsCreated: 2 }
}

/** Reuses the existing template browser fixture, at each caller-selected width. */
export async function recordTemplateButtonsBrowser(page, j, h, width, { appId, parentId, source, template, status }) {
  const call = async (path, input) => {
    const csrf = input === undefined ? null : await (await page.request.get(h.origin + '/auth/csrf')).json()
    const response = await page.request.fetch(h.origin + path, { method: input === undefined ? 'GET' : 'POST', headers: { origin: h.origin, ...(csrf ? { 'x-csrf-token': csrf.csrfToken } : {}) }, ...(input === undefined ? {} : { data: input }) })
    const body = await response.json()
    assert.equal(response.status(), 200, JSON.stringify(body))
    return body.data
  }
  const base = `/api/v1/apps/${appId}/entities/${parentId}`
  const sourcePath = `/app/records/${appId}/${parentId}/${source.id}`
  const buttonName = `synthetic-cradle-${width + 21}`
  const parents = async () => (await call(`${base}/query`, { limit: 100 })).items
  const before = (await parents()).length
  const saved = async change => {
    const pending = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/record.template-button-save'))
    await change()
    const response = await pending, body = await response.json()
    assert.equal(response.status(), 200, JSON.stringify(body))
    assert.equal(body.data.state, 'committed', JSON.stringify(body))
    return body.data.value
  }
  async function openSettings() {
    await page.goto(h.origin + '/app/settings')
    await j.action(page.locator('summary').filter({ hasText: /^Record template buttons$/ }))
    const panel = page.getByRole('region', { name: 'Record template buttons', exact: true })
    await panel.getByLabel('Base', { exact: true }).selectOption(appId)
    await panel.getByLabel('Table', { exact: true }).selectOption(parentId)
    return panel
  }
  const panel = await openSettings()
  await j.action(panel.getByRole('button', { name: 'Add template button', exact: true }))
  const editor = panel.getByRole('group', { name: 'New template button', exact: true })
  await editor.getByLabel('Button name', { exact: true }).fill(buttonName)
  const button = await saved(() => editor.getByLabel('Record template', { exact: true }).selectOption(template.id))
  assert.equal(button.confirmation, true)
  await panel.getByRole('group', { name: 'Template button', exact: true }).filter({ has: page.locator(`input[value="${buttonName}"]`) }).waitFor()
  await j.capture('record-template-button-settings-saved')
  assert.equal((await parents()).length, before, 'Configuring the interface button creates no record')
  async function openRecord() {
    await page.goto(h.origin + sourcePath)
    await page.getByRole('button', { name: 'Edit record', exact: true }).waitFor()
    await j.action(page.locator('summary').filter({ hasText: /^Record actions$/ }))
    await page.getByRole('button', { name: buttonName, exact: true }).waitFor()
  }
  await openRecord()
  await j.action(page.getByRole('button', { name: buttonName, exact: true }))
  const dialog = page.getByRole('dialog', { name: `Confirm ${buttonName}`, exact: true })
  await dialog.waitFor()
  await j.capture('record-template-button-confirmation')
  assert.equal((await parents()).length, before, 'Opening confirmation has no creation effect')
  await j.action(dialog.getByRole('button', { name: 'Cancel', exact: true }))
  assert.equal((await parents()).length, before, 'Cancelling confirmation creates no record')
  await j.action(page.getByRole('button', { name: buttonName, exact: true }))
  const created = await j.command(dialog.getByRole('button', { name: buttonName, exact: true }), 'record.template-button-run')
  assert.equal((await parents()).length, before + 1)
  for (const child of template.children) {
    const rows = (await call(`/api/v1/apps/${appId}/entities/${child.entityId}/query`, { filter: { kind: 'condition', fieldId: child.parentFieldId, op: 'eq', value: created.ref } })).items
    assert.ok(rows.some(row => Object.entries(child.values).every(([id, value]) => JSON.stringify(row.fields[id]?.value) === JSON.stringify(value))), 'The interface button creates the configured linked child')
  }
  const createdLink = page.getByRole('link', { name: 'Open created record', exact: true })
  await j.action(createdLink)
  await page.getByRole('button', { name: 'Edit record', exact: true }).waitFor()
  assert.ok(page.url().endsWith('/' + created.id), 'The created record link opens its detail page')
  await j.capture('record-template-button-created')
  const reopened = await openSettings()
  const existing = reopened.getByRole('group', { name: 'Template button', exact: true }).filter({ has: page.locator(`input[value="${buttonName}"]`) })
  await saved(() => j.setChecked(existing.getByLabel('Ask for confirmation before creating records', { exact: true }), false))
  await openRecord()
  const direct = await j.command(page.getByRole('button', { name: buttonName, exact: true }), 'record.template-button-run')
  assert.equal((await parents()).length, before + 2)
  assert.equal(await page.getByRole('dialog').count(), 0, 'A button configured without confirmation executes directly')
  await j.capture('record-template-button-without-confirmation')
  const operator = (await call('/api/v1/session')).member.id
  const policy = await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(appId, operator).first()
  try {
    const childEntityId = template.children[0]?.entityId ?? parentId
    const rules = JSON.parse(policy.rules_json).map(rule => rule.entityId === childEntityId ? { ...rule, actions: rule.actions.filter(action => action !== 'record.create') } : rule)
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules), policy.id).run()
    await openRecord()
    assert.equal(await page.getByRole('button', { name: buttonName, exact: true }).isDisabled(), true, 'A lost create permission disables the configured button')
    await j.capture('record-template-button-disabled')
  } finally {
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json, policy.id).run()
  }
  const update = await recordUpdateButtonsBrowser(page, j, h, width, { appId, parentId, source, status })
  return { update, buttonId: button.id, createdRecordIds: [created.id, direct.id], childRecordsCreated: template.children.length * 2 }
}
