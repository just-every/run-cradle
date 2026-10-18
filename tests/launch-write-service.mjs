import test from 'node:test'
import assert from 'node:assert/strict'
import { launchAuthorityRuntime, LAUNCH_APP_ID, launchEntities, launchFieldIds, createUlid, initializeLegacyAuthority } from './helpers/launch-authority-runtime.mjs'
import { expected, writeContext, mutationSnapshot, createLegacyAutomationAuthority, createLegacyAutomationRuntime } from './helpers/launch-write-context.mjs'

test('[AUTO-LEGACY-AUTH RECORDS-001] real policy preserves shipped execution and authorizes run sidecars without new grants', async () => {
 const h = await launchAuthorityRuntime()
 try {
  const owner = await writeContext(h, h.ownerSession, createUlid())
  const campaign = (await (await h.request(h.ownerSession, '/api/campaigns')).json()).items[0]
  // This positive retained-service scenario explicitly reviews the existing
  // campaign owner's membership; sample identities and assertions stay intact.
  const policyId = createUlid(), now = new Date().toISOString()
  const rules = JSON.parse(h.policy.rules_json).map(rule => ({ ...rule, id: createUlid(), principals: [{ kind: 'human', id: campaign.owner.id }], rows: rule.rows.kind === 'condition' && rule.rows.value === h.owner ? { ...rule.rows, value: campaign.owner.id } : rule.rows }))
  await initializeLegacyAuthority(h.db, { initialOwnerId: h.owner, launchAppId: LAUNCH_APP_ID, policies: [{ id: policyId, appId: LAUNCH_APP_ID, name: 'Reviewed retained-service test owner', rules, version: 1, createdAt: now, updatedAt: now }], memberships: [{ memberId: campaign.owner.id, policyId }] })
  const risk = await owner.commit('risk.create', { fields: { campaignId: campaign.id, title: 'Bound critical risk', ownerId: h.owner, severity: 'Critical', dueDate: null, signal: 'Verified', mitigation: 'Review' } })
  const event = await h.db.prepare("SELECT * FROM admission_events WHERE name='risk.created' AND json_extract(subject_json,'$.recordId')=?").bind(risk.id).first()
  const definition = await h.db.prepare("SELECT * FROM automations WHERE shipped_key='critical-risk'").first()
  const service = createLegacyAutomationAuthority(owner.context), admission = owner.createAdmissionService(h.db, { authorizeReplay: service.authorizeReplay })
  const runtime = createLegacyAutomationRuntime(owner.context, admission, { releaseId: owner.context.releaseId, authority: service.authority, context: service.context })
  const runId = await runtime.trigger(service.eventContext(event.id), definition, event.id, [risk.id])
  const dispatch = service.dispatchContext(runId), run = { id: runId, automationId: definition.id, definitionVersion: definition.definition_version, definition, subjectIds: [risk.id], causeRunIds: [], triggerKey: event.id, retryOf: null }
  const scoped = await service.context(dispatch, run)
  const proposed = { id: createUlid(), created_at: Date.parse(dispatch.now), updated_at: Date.parse(dispatch.now), version: 1, campaign_id: campaign.id, risk_id: risk.id, requester_id: h.owner, assignee_id: campaign.owner.id, title: `Resolve Critical risk: ${risk.title}`, priority: 'Critical', due_at: Date.parse(dispatch.now) + 86400000, recommendation: 'Critical severity automation', impact: 'Verified', state: 'Awaiting approval' }
  // Even a live saved run cannot repurpose its newly checked secondary action.
  const request = { appId: LAUNCH_APP_ID, action: 'launch.decision.create', commandId: createUlid(), inputHash: 'synthetic-bound-decision', expected: expected('risk', risk), cost: [], targetEntityId: launchEntities.decision, fieldIds: Object.values(launchFieldIds.decision), proposedRows: [{ entityId: launchEntities.decision, row: proposed }] }
  for (const change of [{ title: 'Substituted decision' }, { campaign_id: createUlid() }, { requester_id: createUlid() }, { recommendation: 'Substituted action' }]) await assert.rejects(scoped.policy.authorize(dispatch, { ...request, proposedRows: [{ entityId: launchEntities.decision, row: { ...proposed, ...change } }] }), error => error.code === 'forbidden')
  await assert.rejects(scoped.policy.authorize(dispatch, { ...request, fieldIds: [] }), error => error.code === 'forbidden')
  await runtime.execute(dispatch, runId)
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(runId).first()).state, 'Succeeded')
  assert.equal((await h.db.prepare('SELECT state FROM risks WHERE id=?').bind(risk.id).first()).state, 'Escalated')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM decisions WHERE risk_id=?').bind(risk.id).first()).n, 1)
  const control = await owner.commit('automation.save', { definition: { name: 'Local run control', enabled: true, trigger: { kind: 'event', event: 'campaign.updated.v1' }, actions: [{ command: 'add-activity', input: { campaignId: campaign.id, message: 'Controlled record' } }] } })
  const controlDefinition = await h.db.prepare('SELECT * FROM automations WHERE id=?').bind(control.id).first()
  const limited = await h.addPerson({ change: rules => rules.map(rule => rule.entityId === launchEntities.automation ? { ...rule, writableFields: [launchFieldIds.automation.enabled] } : rule) })
  const restricted = await writeContext(h, limited.session, owner.context.releaseId)
  const failedId = createUlid()
  // Synthetic durable failed/queued runs use the real retained schema; no worker
  // or provider substitute participates in the command preparation or admission.
  await h.db.prepare("INSERT INTO automation_runs(id,created_at,updated_at,version,automation_id,definition_version,subject_id,state,queued_at,trigger_key,definition_json,cause_run_ids_json) VALUES(?,1,1,1,?,?,?,'Failed',1,?,?,'[]')").bind(failedId, control.id, controlDefinition.definition_version, campaign.id, 'synthetic-failed-run', JSON.stringify({ definition: controlDefinition, subjectIds: [campaign.id] })).run()
  const before = await mutationSnapshot(h.db)
  await assert.rejects(restricted.prepare('automation.retry', { runId: failedId,version:1 }), error => error.code === 'forbidden')
  assert.deepEqual(await mutationSnapshot(h.db), before)
  const retry = await owner.commit('automation.retry', { runId: failedId,version:1 })
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(retry.runId).first()).state, 'Queued')
  for (const [action, input, revisions] of [['automation.disable', { id: control.id }, expected('automation', control)], ['campaign.archive', { id: campaign.id }, expected('campaign', campaign)]]) {
   const unchanged = await mutationSnapshot(h.db)
   await assert.rejects(restricted.prepare(action, input, revisions), error => error.code === 'forbidden')
   assert.deepEqual(await mutationSnapshot(h.db), unchanged)
  }
  await owner.commit('automation.disable', { id: control.id }, expected('automation', control))
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(retry.runId).first()).state, 'Cancelled')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM authority_grants').first()).n, 0)
 } finally { await h.close() }
})
