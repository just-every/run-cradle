import test from 'node:test'
import assert from 'node:assert/strict'
import { launchAuthorityRuntime, launchEntities, launchFieldIds } from './helpers/launch-authority-runtime.mjs'

test('[VIEW-005 APP-SCOPE-001] repeated search rechecks current membership, row scope and field policy', async () => {
  const h = await launchAuthorityRuntime()
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
    assert.equal((await h.request(person.session, path)).status, 403)
    const scoped = await h.addPerson()
    assert.deepEqual(await read(scoped.session), expected)
    const restricted = scoped.rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, rows: { kind: 'condition', fieldId: launchFieldIds.campaign.code, op: 'eq', value: '__not_visible__' } } : rule)
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(restricted), scoped.policyId).run()
    assert.equal((await h.request(scoped.session, path)).status, 403)
    const hidden = await h.addPerson()
    assert.deepEqual(await read(hidden.session), expected)
    const masked = hidden.rules.map(rule => rule.entityId === launchEntities.risk ? { ...rule, readableFields: rule.readableFields.filter(id => id !== launchFieldIds.risk.title) } : rule)
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(masked), hidden.policyId).run()
    assert.equal((await h.request(hidden.session, path)).status, 403)
    const repair = await h.addPerson({ appId: '00000000000000000000000600' })
    assert.equal((await h.request(repair.session, path)).status, 403)
    assert.deepEqual(await read(h.ownerSession), expected)
  } finally { await h.close() }
})
