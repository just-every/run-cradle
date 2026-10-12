import test from 'node:test'
import assert from 'node:assert/strict'
import { serviceOwnerFixture, mutationSnapshot } from './helpers/launch-service-owner-context.mjs'

for (const eligibility of ['membership', 'principal', 'operator', 'policy', 'scope']) {
 test(`[AUTO-008 APP-SCOPE-001] shipped service rejects revoked campaign-owner ${eligibility} before dispatch`, async () => {
  const h = await serviceOwnerFixture()
  try {
   await h.revoke(eligibility)
   const before = await mutationSnapshot(h.db)
   await assert.rejects(h.runtime.execute(h.service.dispatchContext(h.runId), h.runId), error => ['forbidden', 'validation'].includes(error.code))
   await h.assertNoBusinessEffects()
   const run = await h.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(h.runId).first()
   const action = await h.db.prepare('SELECT * FROM launch_automation_actions WHERE run_id=?').bind(h.runId).first()
   assert.equal(run.state, 'Failed'); assert.equal(action.state, 'Failed')
   assert.ok(run.finished_at); assert.ok(run.error_message); assert.equal(action.error_code, run.error_code)
   const after = await mutationSnapshot(h.db)
   // Only durable failure bookkeeping may be added to this stopped run.
   for (const name of Object.keys(before).filter(name => !['automation_runs', 'launch_automation_actions', 'command_admissions', 'admission_subjects', 'admission_provenance'].includes(name))) assert.deepEqual(after[name], before[name], name)
   assert.equal(after.command_admissions.length, before.command_admissions.length + 1)
   assert.equal(after.automation_runs.length, before.automation_runs.length)
   await h.runtime.execute(h.service.dispatchContext(h.runId), h.runId)
   assert.deepEqual(await mutationSnapshot(h.db), after, 'Delivery replay leaves the Failed run unchanged')
   // An authorized manual retry is a new run and retains its original action key.
   await h.restore()
   const retry = await h.actor.commit('automation.retry', { runId: h.runId })
   const retryAction = await h.db.prepare('SELECT * FROM launch_automation_actions WHERE run_id=?').bind(retry.runId).first()
   assert.equal(retryAction.idempotency_key, action.idempotency_key)
   await h.runtime.execute(h.service.dispatchContext(retry.runId), retry.runId)
   assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(retry.runId).first()).state, 'Succeeded')
   assert.deepEqual(await h.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(h.runId).first(), run)
   assert.equal((await h.db.prepare('SELECT count(*) n FROM decisions WHERE risk_id=?').bind(h.risk.id).first()).n, 1)
  } finally { await h.close() }
 })
}

for (const eligibility of ['membership', 'principal', 'operator', 'policy', 'scope']) {
 test(`[AUTO-002 RECORDS-001] atomic shipped admission rejects campaign-owner ${eligibility} revoked after preparation`, async () => {
  const h = await serviceOwnerFixture()
  try {
   let prepared, snapshot
   const boundary = { ...h.admission, async commit(ctx, plan) {
    assert.equal(prepared, undefined, 'Only the prepared service mutation reaches this boundary')
    prepared = plan
    assert.ok(plan.mutations.some(m => m.kind === 'insert' && m.table.tableId === 'decisions'))
    await h.revoke(eligibility)
    snapshot = await mutationSnapshot(h.db)
    return h.admission.commit(ctx, plan)
   } }
   await assert.rejects(h.runtimeWith(boundary).execute(h.service.dispatchContext(h.runId), h.runId), error => error.code === 'version_conflict')
   assert.ok(prepared)
   assert.deepEqual(await mutationSnapshot(h.db), snapshot, 'Admission rollback includes run/action, decision, risk, notifications, activity, audit, outbox and command')
   await h.assertNoBusinessEffects()
   assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(h.runId).first()).state, 'Queued')
   assert.equal((await h.db.prepare('SELECT state FROM launch_automation_actions WHERE run_id=?').bind(h.runId).first()).state, 'Pending')
   // Re-preparation observes the revocation, records failure and executes nothing.
   await assert.rejects(h.runtime.execute(h.service.dispatchContext(h.runId), h.runId), error => ['forbidden', 'validation'].includes(error.code))
   await h.assertNoBusinessEffects()
   assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(h.runId).first()).state, 'Failed')
  } finally { await h.close() }
 })
}

test('[AUTO-003 AUTO-011 RISK-003] current campaign owner permits one exact decision and private notification', async () => {
 const h = await serviceOwnerFixture()
 try {
  const beforePolicy = (await h.db.prepare('SELECT * FROM authority_policies ORDER BY id').all()).results
  const dispatch = h.service.dispatchContext(h.runId)
  await h.runtime.execute(dispatch, h.runId)
  const risk = await h.db.prepare('SELECT * FROM risks WHERE id=?').bind(h.risk.id).first()
  const decisions = (await h.db.prepare('SELECT * FROM decisions WHERE risk_id=?').bind(h.risk.id).all()).results
  assert.equal(risk.state, 'Escalated'); assert.equal(risk.escalation_reason, 'Critical severity automation')
  assert.equal(decisions.length, 1)
  const decision = decisions[0], now = Date.parse(dispatch.now)
  for (const [field, value] of Object.entries({ campaign_id: h.campaign.id, risk_id: h.risk.id, requester_id: h.requester.id, assignee_id: h.owner, title: `Resolve Critical risk: ${h.risk.title}`, priority: 'Critical', due_at: now + 86400000, recommendation: 'Critical severity automation', impact: 'Verified evidence', state: 'Awaiting approval', version: 1 })) assert.equal(decision[field], value, field)
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(h.runId).first()).state, 'Succeeded')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM notifications WHERE operator_id=? AND kind=? AND subject_id=?').bind(h.owner, 'critical-risk-escalated', h.risk.id).first()).n, 1)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_deliveries WHERE operator_id=? AND campaign_id=?').bind(h.owner, h.campaign.id).first()).n, 1)
  assert.deepEqual((await h.db.prepare('SELECT * FROM authority_policies ORDER BY id').all()).results, beforePolicy)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM authority_grants').first()).n, 0)
  const committed = await mutationSnapshot(h.db)
  await h.runtime.execute(h.service.dispatchContext(h.runId), h.runId)
  assert.deepEqual(await mutationSnapshot(h.db), committed)
 } finally { await h.close() }
})
