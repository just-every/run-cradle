import test from 'node:test'
import assert from 'node:assert/strict'
import { launchAuthorityRuntime, LAUNCH_APP_ID, createUlid, initializeLegacyAuthority, prepareLaunchSetup } from './helpers/launch-authority-runtime.mjs'
import { adoptFixtureOperators } from './helpers/base-fixture-auth.mjs'

test('[APP-SCOPE-001 OPS-001] a paused legacy initializer cannot recreate a concurrently deleted membership', async () => {
 const h = await launchAuthorityRuntime()
 let release, pending
 try {
  const id = createUlid(), policyId = createUlid(), now = new Date().toISOString()
  await h.db.prepare('INSERT INTO operators(id,created_at,updated_at,version,name,email,active) VALUES(?,1,1,1,?,?,1)').bind(id, 'Reviewed launch operator', `${id}@example.test`).run()
  const rules = JSON.parse(h.policy.rules_json).map(rule => ({ ...rule, id: createUlid(), principals: [{ kind: 'human', id }], rows: rule.rows.kind === 'condition' && rule.rows.value === h.owner ? { ...rule.rows, value: id } : rule.rows }))
  const input = { initialOwnerId: h.owner, launchAppId: LAUNCH_APP_ID, policies: [{ id: policyId, appId: LAUNCH_APP_ID, name: 'Exact historical mapping', rules, version: 1, createdAt: now, updatedAt: now }], memberships: [{ memberId: id, policyId }] }
  let prepared
  const atBatch = new Promise(resolve => { prepared = resolve })
  const resume = new Promise(resolve => { release = resolve })
  // Only interleave the actual batch call. Every statement and policy decision is
  // production code against the same real native D1 binding.
  const delayed = { prepare: sql => h.db.prepare(sql), batch: async statements => { prepared(); await resume; return h.db.batch(statements) } }
  pending = initializeLegacyAuthority(delayed, input)
  await atBatch
  await initializeLegacyAuthority(h.db, input)
  const first = await h.db.prepare('SELECT * FROM authority_memberships WHERE principal_id=?').bind(id).first()
  assert.equal(first.state, 'active'); assert.equal(first.policy_id, policyId); assert.equal(first.legacy, 1)
  await adoptFixtureOperators(h.db)
  assert.equal((await h.request(await h.signIn(id), '/api/campaigns')).status, 200)
  await h.db.prepare('DELETE FROM authority_memberships WHERE principal_id=?').bind(id).run()
  const policy = await h.db.prepare('SELECT * FROM authority_policies WHERE id=?').bind(policyId).first()
  release(); await pending
  assert.equal(await h.db.prepare('SELECT * FROM authority_memberships WHERE principal_id=?').bind(id).first(), null, 'The losing prepared initialization owns no new policy insertion')
  await initializeLegacyAuthority(h.db, input)
  assert.equal(await h.db.prepare('SELECT * FROM authority_memberships WHERE principal_id=?').bind(id).first(), null, 'Ordinary replay also preserves deletion')
  assert.deepEqual(await h.db.prepare('SELECT * FROM authority_policies WHERE id=?').bind(policyId).first(), policy)
  assert.equal((await h.request(await h.signIn(id), '/api/campaigns')).status, 403)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM authority_grants').first()).n, 0)
 } finally { release?.(); await pending; await h.close() }
})


test('[APP-SCOPE-001] replaying an already prepared first-owner batch cannot restore a deleted membership', async () => {
 const h = await launchAuthorityRuntime()
 try {
  await h.db.batch([
   h.db.prepare('DELETE FROM authority_memberships WHERE app_id=?').bind(LAUNCH_APP_ID),
   h.db.prepare('DELETE FROM authority_policies WHERE app_id=?').bind(LAUNCH_APP_ID),
   h.db.prepare('DELETE FROM record_schemas WHERE app_id=?').bind(LAUNCH_APP_ID),
  ])
  const statements = await prepareLaunchSetup(h.db, h.owner)
  await h.db.batch(statements)
  assert.equal((await h.db.prepare('SELECT state FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(h.owner, LAUNCH_APP_ID).first()).state, 'active')
  await h.db.prepare('DELETE FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(h.owner, LAUNCH_APP_ID).run()
  await h.db.batch(statements)
  assert.equal(await h.db.prepare('SELECT * FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(h.owner, LAUNCH_APP_ID).first(), null)
 } finally { await h.close() }
})
