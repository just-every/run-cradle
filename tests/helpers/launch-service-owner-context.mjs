import assert from 'node:assert/strict'
import { launchAuthorityRuntime, LAUNCH_APP_ID, launchEntities, createUlid } from './launch-authority-runtime.mjs'
import { writeContext, createLegacyAutomationAuthority, createLegacyAutomationRuntime, mutationSnapshot } from './launch-write-context.mjs'
export { mutationSnapshot }

export async function serviceOwnerFixture() {
 const h = await launchAuthorityRuntime()
 try {
  const owner = await writeContext(h, h.ownerSession, createUlid())
  const requester = await h.addPerson({ name: 'Distinct risk requester' })
  const actor = await writeContext(h, requester.session, owner.context.releaseId)
  const campaign = await owner.commit('campaign.create', { fields: { code: `OWNER-${createUlid()}`, name: 'Owner eligibility', ownerId: h.owner, startDate: '2026-10-01', launchDate: '2026-12-10', objective: '', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} } })
  const risk = await actor.commit('risk.create', { fields: { campaignId: campaign.id, title: 'Distinct requester escalation', ownerId: requester.id, severity: 'Critical', dueDate: null, signal: 'Verified evidence', mitigation: '' } })
  const originalRisk = await h.db.prepare('SELECT * FROM risks WHERE id=?').bind(risk.id).first()
  const event = await h.db.prepare("SELECT * FROM admission_events WHERE name='risk.created' AND json_extract(subject_json,'$.recordId')=?").bind(risk.id).first()
  const definition = await h.db.prepare("SELECT * FROM automations WHERE shipped_key='critical-risk'").first()
  const member = await h.db.prepare('SELECT * FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(h.owner, LAUNCH_APP_ID).first()
  const policy = await h.db.prepare('SELECT * FROM authority_policies WHERE id=?').bind(member.policy_id).first()
  const service = createLegacyAutomationAuthority(owner.context)
  const admission = owner.createAdmissionService(h.db, { authorizeReplay: service.authorizeReplay })
  const runtimeWith = boundary => createLegacyAutomationRuntime(owner.context, boundary, { releaseId: owner.context.releaseId, authority: service.authority, context: service.context })
  const runtime = runtimeWith(admission)
  const runId = await runtime.trigger(service.eventContext(event.id), definition, event.id, [risk.id])
  assert.notEqual(requester.id, h.owner)
  assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(runId).first()).state, 'Queued')
  async function revoke(kind) {
   if (kind === 'membership') await h.db.prepare('DELETE FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(h.owner, LAUNCH_APP_ID).run()
   else if (kind === 'principal') await h.db.prepare("UPDATE authority_principals SET state='removed' WHERE id=?").bind(h.owner).run()
   else if (kind === 'operator') await h.db.prepare('UPDATE operators SET active=0 WHERE id=?').bind(h.owner).run()
   else {
    const original = JSON.parse(policy.rules_json)
    const related = rule => [launchEntities.risk, launchEntities.campaign].includes(rule.entityId)
    const rules = kind === 'scope'
     ? [...original, ...original.filter(related).map(rule => ({ ...rule, id: createUlid(), effect: 'deny' }))]
     : original.map(rule => related(rule) ? { ...rule, purposes: ['export'] } : rule)
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules), policy.id).run()
   }
   assert.equal((await h.db.prepare('SELECT active FROM operators WHERE id=?').bind(requester.id).first()).active, 1)
   assert.equal((await h.db.prepare('SELECT state FROM authority_principals WHERE id=?').bind(requester.id).first()).state, 'active')
  }
  async function restore() {
   await h.db.batch([
    h.db.prepare('UPDATE operators SET active=1 WHERE id=?').bind(h.owner),
    h.db.prepare("UPDATE authority_principals SET state='active' WHERE id=?").bind(h.owner),
    h.db.prepare('INSERT OR REPLACE INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,?,?,?)').bind(member.principal_id, member.app_id, member.policy_id, member.legacy, member.state, member.version),
    h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json, policy.id),
   ])
  }
  async function assertNoBusinessEffects() {
   assert.deepEqual(await h.db.prepare('SELECT * FROM risks WHERE id=?').bind(risk.id).first(), originalRisk)
   assert.equal((await h.db.prepare('SELECT count(*) n FROM decisions WHERE risk_id=?').bind(risk.id).first()).n, 0)
   assert.equal((await h.db.prepare('SELECT count(*) n FROM notifications WHERE operator_id=? AND subject_id IN (?,?)').bind(h.owner, risk.id, runId).first()).n, 0)
   assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_deliveries WHERE operator_id=? AND campaign_id=?').bind(h.owner, campaign.id).first()).n, 0)
   assert.equal((await h.db.prepare('SELECT count(*) n FROM activity_entries WHERE automation_run_id=?').bind(runId).first()).n, 0)
  }
  return { ...h, ownerActor: owner, actor, requester, campaign, risk, originalRisk, service, admission, runtime, runtimeWith, runId, revoke, restore, assertNoBusinessEffects }
 } catch (error) { await h.close(); throw error }
}
