import './helpers/launch-ui-source.mjs'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contract } from './contract.mjs'
import { migratedD1 } from './helpers/sqlite-d1.mjs'
const { createDecisionRepository } = await import('../src/core/features/decisions/repository.ts')
const { createPortfolioRepository } = await import('../src/core/features/portfolio/repository.ts')
const { activityActions } = await import('../src/core/features/portfolio/ui/activity-presentation.ts')
const { DecisionContextFields } = await import('../src/core/features/decisions/ui/decision-context-fields.tsx')
const { RiskDetailPage } = await import('../src/core/features/risks/ui/risk-detail-page.tsx')
const { createRiskRepository } = await import('../src/core/features/risks/repository.ts')
const { DocumentDataContext } = await import('../src/core/app/document-data.tsx')

const insert = (db, table, row) => db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row)).run()
async function fixture(db) {
 await insert(db, 'operators', { id: 'owner', created_at: 1, updated_at: 1, name: 'Mira Example', email: 'history@example.test' })
 await insert(db, 'campaigns', { id: 'campaign', created_at: 1, updated_at: 1, code: 'HISTORY', name: 'October Launch', owner_id: 'owner', start_date: '2026-10-01', launch_date: '2026-10-20', objective: '', status_summary: '', phase: 'Planning', status: 'On track', health: 65, health_updated_at: 1, budget_minor: 0, spend_minor: 0 })
}
const markup = decision => renderToStaticMarkup(createElement(DecisionContextFields, { decision }))

contract('RISK-001', '[ACT-003] Actual risk detail labels the persisted owner once beside its human due date', async () => {
 const h = migratedD1()
 try {
  await fixture(h.db)
  await insert(h.db, 'risks', { id: 'risk', created_at: 1, updated_at: 1, campaign_id: 'campaign', title: 'Supplier delay', owner_id: 'owner', severity: 'Critical', due_date: '2026-10-20', signal: 'Parts are late', mitigation: 'Review supplier', state: 'Watching' })
  const { risk } = await createRiskRepository({ $client: h.db }).find('risk')
  const html = renderToStaticMarkup(createElement(DocumentDataContext.Provider, { value: { '/api/risks/risk': { risk: { ...risk, linkedDecision: null } } } }, createElement(RiskDetailPage, { riskId: 'risk' })))
  assert.equal(html.split('Owned by Mira Example').length - 1, 1)
  assert.equal(html.split('Mira Example').length - 1, 1)
  assert.match(html, /Owned by Mira Example · Due Oct 20, 2026/)
  assert.equal((await h.db.prepare('SELECT owner_id FROM risks WHERE id=?').bind('risk').first()).owner_id, 'owner')
 } finally { h.close() }
})

contract('DEC-001', '[RISK-003] [ACT-001] SQLite escalation reason survives independent recommendation edits with explicit provenance', async () => {
 const h = migratedD1()
 try {
  await fixture(h.db)
  await insert(h.db, 'decisions', { id: 'decision', created_at: 1, updated_at: 1, campaign_id: 'campaign', title: 'Resolve supplier delay', requester_id: 'owner', priority: 'Critical', due_at: 86400000, recommendation: 'Owner review needed', impact: 'Supplier delay', state: 'Awaiting approval' })
  await insert(h.db, 'command_admissions', { command_id: 'command', batch_nonce: 'batch', actor_id: 'owner', actor_kind: 'human', app_id: 'launch', action: 'launch.risk.escalate', input_hash: 'hash', state: 'committed', access_json: '{}', created_at: '2026-10-08', updated_at: '2026-10-08' })
  await insert(h.db, 'admission_audit', { id: 'audit', command_id: 'command', actor_id: 'owner', actor_kind: 'human', app_id: 'launch', action: 'decision.created', subject_json: JSON.stringify({ recordId: 'decision' }), changes_json: '[]', source_ids_json: '[]', personal_refs_json: '[]', created_at: '2026-10-08' })
  await insert(h.db, 'activity_entries', { id: 'reason', created_at: 1, updated_at: 1, campaign_id: 'campaign', subject_id: 'decision', actor_id: 'owner', type: 'decision.created', field_name: 'recommendation', next_value: 'Owner review needed', message: 'decision.created: recommendation' })
  const repository = createDecisionRepository({ $client: h.db }), before = await repository.find('decision')
  assert.equal(before.escalationReason, 'Owner review needed')
  assert.equal(before.recommendationSource, 'escalation-reason')
  assert.match(markup(before), /Escalation reason/)
  assert.match(markup(before), /No separate recommendation is recorded/)
  assert.equal(markup(before).split('Owner review needed').length - 1, 1)
  assert.doesNotMatch(markup(before), />Recommendation<|AI-generated/)

  // Reproduce an independent persisted recommendation change, even without a
  // newer activity entry; the immutable creation fact must remain visible.
  await h.db.prepare('UPDATE decisions SET recommendation=?,version=version+1 WHERE id=?').bind('Approve alternate supplier', 'decision').run()
  const after = await repository.find('decision'), displayed = markup(after)
  assert.equal(after.escalationReason, 'Owner review needed')
  assert.equal(after.recommendation, 'Approve alternate supplier')
  assert.equal(after.recommendationSource, 'decision-field')
  assert.match(displayed, />Escalation reason<.*Owner review needed/)
  assert.match(displayed, />Recommendation<.*Approve alternate supplier/)
  assert.equal((await repository.list())[0].escalationReason, 'Owner review needed')
  assert.equal((await h.db.prepare('SELECT next_value FROM activity_entries WHERE id=?').bind('reason').first()).next_value, 'Owner review needed')

  // Later human edits that happen to reuse the same words are still a recorded
  // recommendation, rather than claiming the initial copy was never edited.
  await insert(h.db, 'activity_entries', { id: 'edit', created_at: 2, updated_at: 2, campaign_id: 'campaign', subject_id: 'decision', actor_id: 'owner', type: 'decision.updated', field_name: 'recommendation', previous_value: 'Approve alternate supplier', next_value: 'Owner review needed', message: 'decision.updated: recommendation' })
  await h.db.prepare('UPDATE decisions SET recommendation=? WHERE id=?').bind('Owner review needed', 'decision').run()
  assert.equal((await repository.find('decision')).recommendationSource, 'decision-field')
  await h.db.prepare('DELETE FROM admission_audit').run()
  const manual = await repository.find('decision')
  assert.equal(manual.escalationReason, null, 'Matching prose alone does not establish escalation origin')
  assert.match(markup(manual), />Recommendation</)
 } finally { h.close() }
})

contract('ACT-001', 'SQLite deleted subjects use retained titles or explicit unavailability and keep every raw fact', async () => {
 const h = migratedD1()
 try {
  await fixture(h.db)
  for (const [id, time, field, value] of [['created', 2, 'title', 'Supplier delay'], ['renamed', 3, 'title', 'Supplier delivery delay'], ['deleted', 4, null, null]]) await insert(h.db, 'activity_entries', { id, created_at: time, updated_at: time, campaign_id: 'campaign', subject_id: 'removed-risk', actor_id: 'owner', type: id === 'deleted' ? 'risk.deleted' : id === 'created' ? 'risk.created' : 'risk.updated', field_name: field, next_value: value, message: id === 'deleted' ? 'risk.deleted' : `risk.updated: ${field}` })
  await insert(h.db, 'activity_entries', { id: 'unavailable', created_at: 5, updated_at: 5, campaign_id: 'campaign', subject_id: 'unknown-risk', actor_id: 'owner', type: 'risk.deleted', message: 'risk.deleted' })
  await insert(h.db, 'activity_entries', { id: 'campaign-event', created_at: 6, updated_at: 6, campaign_id: 'campaign', subject_id: 'campaign', actor_id: 'owner', type: 'campaign.updated', field_name: 'status', previous_value: 'Watch', next_value: 'On track', message: 'campaign.updated: status' })
  const rows = await createPortfolioRepository({ $client: h.db }).recentActivity()
  const entries = rows.map(row => ({ ...row, occurredAt: row.createdAt, actor: { id: row.actorId, name: row.actorName }, description: row.message }))
  const actions = activityActions(entries), deletion = actions.find(entry => entry.id === 'deleted'), unavailable = actions.find(entry => entry.id === 'unavailable')
  assert.equal(deletion.description, 'deleted risk “Supplier delivery delay”')
  assert.equal(unavailable.description, 'deleted risk (subject unavailable)')
  assert.equal(actions.find(entry => entry.id === 'campaign-event').description, 'updated campaign “October Launch”')
  assert.deepEqual(deletion.facts, [entries.find(entry => entry.id === 'deleted')])
  assert.equal(deletion.message, 'risk.deleted')
  assert.equal(deletion.subjectId, 'removed-risk')
  assert.deepEqual(actions.flatMap(action => action.facts), entries)
  assert.equal((await h.db.prepare('SELECT next_value FROM activity_entries WHERE id=?').bind('created').first()).next_value, 'Supplier delay')
  assert.doesNotMatch(deletion.description + unavailable.description, /October Launch|unknown-risk/)
 } finally { h.close() }
})
