import test from 'node:test'
import assert from 'node:assert/strict'
import { launchAuthorityRuntime, launchEntities, launchFieldIds, createUlid } from './helpers/launch-authority-runtime.mjs'

test('[VIEW-005 APP-SCOPE-001] global search covers authorized bases and rechecks current row and field policy', async () => {
  const h = await launchAuthorityRuntime({}, { installationOwner: true })
  try {
    const person = await h.addPerson(), path = '/api/search?q=launch&archived=true'
    const read = async session => {
      const response = await h.request(session, path)
      assert.equal(response.status, 200)
      return (await response.json()).items
    }
    const expected = await read(h.ownerSession)
    assert.ok(expected.length > 0)
    assert.deepEqual(await read(person.session), expected)
    await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=?").bind(person.id).run()
    assert.deepEqual(await read(person.session), [])
    const scoped = await h.addPerson()
    assert.deepEqual(await read(scoped.session), expected)
    const restricted = scoped.rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, rows: { kind: 'condition', fieldId: launchFieldIds.campaign.code, op: 'eq', value: '__not_visible__' } } : rule)
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(restricted), scoped.policyId).run()
    const scopedHits = await read(scoped.session)
    assert.deepEqual(scopedHits, expected.filter(hit => hit.entityId !== launchEntities.campaign))
    const hidden = await h.addPerson()
    assert.deepEqual(await read(hidden.session), expected)
    const masked = hidden.rules.map(rule => rule.entityId === launchEntities.risk ? { ...rule, readableFields: rule.readableFields.filter(id => id !== launchFieldIds.risk.title) } : rule)
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(masked), hidden.policyId).run()
    assert.deepEqual(await read(hidden.session), expected.filter(hit => hit.entityId !== launchEntities.risk))
    const repair = await h.addPerson({ appId: '00000000000000000000000600' })
    assert.deepEqual(await read(repair.session), [])
    assert.deepEqual(await read(h.ownerSession), expected)

    const send = async (route, body) => {
      const response = await h.request(h.ownerSession, route, { method: 'POST', body: JSON.stringify(body) })
      const result = await response.json()
      assert.equal(response.status, 200, JSON.stringify(result))
      return result.data
    }
    async function createBase(name) {
      const appId = createUlid(), entityId = createUlid(), titleId = createUlid(), privateId = createUlid()
      const draft = { appId, name, tables: [{ id: entityId, label: 'Notes', primaryFieldId: titleId, fields: [
        { id: titleId, label: 'Name', type: 'text', required: true, unique: false },
        { id: privateId, label: 'Internal note', type: 'text', required: false, unique: false },
      ] }] }
      const preview = await send('/api/v1/records/schema-preview', draft)
      await send('/api/v1/commands/release.adopt', { commandId: createUlid(), expected: [], input: { kind: 'manual_schema', previewId: preview.id } })
      const record = (await send('/api/v1/commands/record.create', { commandId: createUlid(), expected: [{ ref: { appId, entityId: '00000000000000000000000001', recordId: entityId }, version: 1 }], input: { appId, entityId, values: { [titleId]: `Launch ${name}`, [privateId]: 'vault-only-search-token' } } })).value
      return { appId, entityId, titleId, record }
    }
    const first = await createBase('Customer notes'), second = await createBase('Project notes')
    const all = await read(h.ownerSession)
    for (const base of [first, second]) {
      const hit = all.find(hit => hit.appId === base.appId)
      assert.equal(hit?.id, base.record.id)
      assert.equal(hit.href, `/app/records/${base.appId}/${base.entityId}/${base.record.id}`)
      const detail = await h.request(h.ownerSession, `/api/v1/apps/${base.appId}/entities/${base.entityId}/records/${base.record.id}`)
      assert.equal(detail.status, 200)
      assert.equal((await detail.json()).data.record.id, hit.id)
    }
    const collaborator = await h.addPerson({ appId: first.appId })
    const ownerPolicy = await h.db.prepare('SELECT p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=?').bind(h.owner, first.appId).first()
    const sharedRules = JSON.parse(ownerPolicy.rules_json).filter(rule => rule.entityId === first.entityId).map(rule => ({ ...rule, principals: [{ id: collaborator.id, kind: 'human' }], readableFields: [first.titleId], writableFields: [] }))
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(sharedRules), collaborator.policyId).run()
    assert.deepEqual((await read(collaborator.session)).map(hit => hit.id), [first.record.id])
    const hiddenField = await h.request(collaborator.session, '/api/search?q=vault&archived=true')
    assert.equal(hiddenField.status, 200)
    assert.deepEqual((await hiddenField.json()).items, [])
    await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=?").bind(collaborator.id).run()
    assert.deepEqual(await read(collaborator.session), [])
  } finally { await h.close() }
})
