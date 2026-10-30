import assert from 'node:assert/strict'
import { createUlid } from '../../src/core/shared/ids.ts'
import { completeFirstRun } from './complete-first-run.mjs'

/** Real invited operator, native session and reviewed base roles; no injected grants. */
export async function recordUpdateButtonAuthorship(h, { appId, entityId, config, button, record, expected }) {
  const name = 'synthetic-cradle-191'
  const email = [name, 'example.test'].join('@')
  await h.request('/auth/invite', { method: 'POST', status: 202, body: { email, displayName: name, role: 'member' } })
  const invite = (await h.mailMessages()).findLast(message => message.to === email || message.personalizations?.some(group => group.to?.some(to => to.email === email)))
  assert.ok(invite)
  const text = invite.text ?? invite.content.find(part => part.type === 'text/plain').value
  const href = text.match(/https?:\/\/[^\s<>"']+/g).find(value => new URL(value).pathname === '/auth/confirm')
  const confirmation = await fetch(h.origin + '/auth/confirm', { method: 'POST', redirect: 'manual', headers: { origin: h.origin, 'content-type': 'application/json' }, body: JSON.stringify({ token: new URL(href).searchParams.get('token') }) })
  assert.equal(confirmation.status, 303)
  const cookie = confirmation.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  await confirmation.arrayBuffer()
  await completeFirstRun(h.origin, cookie)
  const csrf = (await (await fetch(h.origin + '/auth/csrf', { headers: { cookie } })).json()).csrfToken
  async function request(path, body, status = 200) {
    const response = await fetch(h.origin + path, { method: body ? 'POST' : 'GET', headers: { cookie, ...(body ? { origin: h.origin, 'content-type': 'application/json', 'x-csrf-token': csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const value = await response.json()
    assert.equal(response.status, status, `${path}: ${value.error?.code ?? ''}`)
    return value.data
  }
  const collaborators = `/api/v1/records/bases/${appId}/collaborators`
  const person = (await h.request(collaborators)).data.items.find(item => item.email === email)
  assert.ok(person)
  assert.notEqual(person.id, h.operator, 'Authorship is exercised by another operator')
  async function role(next) {
    const current = (await h.request(collaborators)).data.items.find(item => item.id === person.id)
    await h.request(collaborators, { method: 'POST', body: { commandId: createUlid(), principalId: person.id, role: next, version: current.version, destructive: false } })
  }
  const save = { commandId: createUlid(), expected: expected.slice(0, 1), input: { ...config, id: button.id, buttonVersion: button.version, name } }
  const read = async () => (await h.request(`/api/v1/apps/${appId}/entities/${entityId}/records/${record.id}`)).data.record
  const unchanged = await read()
  await role('creator')
  const saved = (await request('/api/v1/commands/record.template-button-save', save)).value
  assert.equal(saved.id, button.id)
  assert.equal(saved.version, button.version + 1)
  assert.equal(saved.fieldId, config.fieldId)
  assert.deepEqual(saved.value, config.value)
  assert.deepEqual((await request('/api/v1/commands/record.template-button-save', save)).value, saved)
  assert.deepEqual((await request('/api/v1/commands/' + save.commandId)).result, saved)
  assert.deepEqual(await read(), unchanged, 'A creator configures the action without updating the record')
  await role('editor')
  await request('/api/v1/commands/record.template-button-save', save, 403)
  await request('/api/v1/commands/' + save.commandId, undefined, 403)
  await request('/api/v1/commands/record.template-button-save', { ...save, commandId: createUlid(), input: { ...save.input, buttonVersion: saved.version } }, 403)
  assert.deepEqual(await read(), unchanged, 'Demoted authors cannot change a retained configuration or its record')
  const run = { commandId: createUlid(), expected, input: { appId, entityId, buttonId: saved.id, buttonVersion: saved.version, ref: record.ref, confirmed: true } }
  const changed = (await request('/api/v1/commands/record.template-button-run', run)).value
  assert.equal(changed.id, record.id)
  assert.equal(changed.version, record.version + 1)
  assert.equal(changed.fields[config.fieldId].value, config.value)
  assert.deepEqual(await read(), changed, 'An editor may run an already configured action under current patch authority')
  const facts = (await h.db.prepare('SELECT actor_id,action FROM admission_audit WHERE command_id=?').bind(run.commandId).all()).results
  assert.deepEqual(facts, [{ actor_id: person.id, action: 'record.patch' }])
  await role('read-only')
  const items = await request(`/api/v1/apps/${appId}/entities/${entityId}/template-buttons?recordId=${record.id}`)
  assert.equal(items.find(item => item.id === saved.id).enabled, false)
  assert.ok(!('value' in items.find(item => item.id === saved.id)), 'A former author does not receive retained literal configuration')
  await request('/api/v1/commands/record.template-button-run', { ...run, commandId: createUlid(), expected: [expected[0], { ref: changed.ref, version: changed.version }] }, 403)
  assert.deepEqual(await read(), changed, 'Captured execution after demotion makes no further write')
  return { button: saved, record: changed }
}
