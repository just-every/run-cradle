import './helpers/launch-ui-source.mjs'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contract } from './contract.mjs'
import { migratedD1 } from './helpers/sqlite-d1.mjs'
const { campaignLifecycle } = await import('../src/apps/launch/lifecycle.ts')
const { validateDomain, emptyChange } = await import('../src/apps/launch/domain.server.ts')
const { CreateCampaign } = await import('../src/ui/launch/create-campaign.tsx')
const { TimelineLensPage } = await import('../src/core/features/milestones/ui/timeline-lens-page.tsx')
const { MilestoneDetailPage } = await import('../src/core/features/milestones/ui/milestone-detail-page.tsx')
const { DocumentDataContext } = await import('../src/core/app/document-data.tsx')
const { createMilestoneRepository } = await import('../src/core/features/milestones/repository.ts')
const owner = '00000000000000000000000001'
const insert = (db, table, row) => db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row)).run()
const render = (component, data, props = {}) => renderToStaticMarkup(createElement(DocumentDataContext.Provider, { value: data }, createElement(component, props)))
const text = html => html.replace(/<[^>]+>/g, '')

contract('CAMP-002', 'Replacing the current lifecycle changes the actual campaign selectors and command validation together', async () => {
 const h = migratedD1(), prior = { ...campaignLifecycle }
 try {
  await insert(h.db, 'operators', { id: owner, created_at: 1, updated_at: 1, name: 'Mira Example', email: 'policy@example.test' })
  // This is an owner-edited lifecycle definition, not a parallel test policy:
  // both the actual React form and canonical validator import this object.
  Object.assign(campaignLifecycle, { phases: ['Discovery', 'Shipping'], statuses: ['Ready', 'Needs review'], launchPreparationPhase: 'Shipping' })
  const html = render(CreateCampaign, {}, { currency: 'USD', onSaved() {}, onClose() {} })
  const phases = html.match(/<select[^>]+id="launch-create-phase"[^>]*>(.*?)<\/select>/s)[1]
  const statuses = html.match(/<select[^>]+id="launch-create-status"[^>]*>(.*?)<\/select>/s)[1]
  assert.equal(text(phases), 'Choose phaseDiscoveryShipping')
  assert.equal(text(statuses), 'Choose statusReadyNeeds review')
  assert.doesNotMatch(phases + statuses, /Planning|Build|On track|Watch/)
  const fields = { code: 'POLICY', name: 'Owner lifecycle', ownerId: owner, startDate: '2026-10-01', launchDate: '2026-11-04', objective: '', statusSummary: '', phase: 'Shipping', status: 'Ready', health: 65, budgetMinor: 0, spendMinor: 0 }
  const change = emptyChange()
  await validateDomain(h.db, change, 'campaign', fields, true)
  assert.equal(change.guards.length, 1, 'Current operator is still checked')
  await assert.rejects(validateDomain(h.db, emptyChange(), 'campaign', { ...fields, phase: 'Planning' }, true), /Unknown phase/)
  await assert.rejects(validateDomain(h.db, emptyChange(), 'campaign', { ...fields, status: 'On track' }, true), /Unknown status/)
  await assert.rejects(validateDomain(h.db, emptyChange(), 'campaign', { ...fields, ownerId: '00000000000000000000000009' }, true), /not current/)
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM campaigns').first()).n, 0, 'Presentation and validation write no campaign')
 } finally { Object.assign(campaignLifecycle, prior); h.close() }
})

contract('MILE-002', '[MILE-003] [ACT-003] SQLite cross-month range renders both exact dates and conflict markers in desktop, mobile agenda and detail', async () => {
 const h = migratedD1()
 try {
  await insert(h.db, 'operators', { id: owner, created_at: 1, updated_at: 1, name: 'Mira Example', email: 'range@example.test' })
  await insert(h.db, 'workspace_settings', { id: 'workspace', created_at: 1, updated_at: 1, timezone: 'Australia/Brisbane', currency: 'USD', workspace_name: 'Range workspace', quiet_hours_start: '18:00', quiet_hours_end: '08:00' })
  await insert(h.db, 'campaigns', { id: 'campaign', created_at: 1, updated_at: 1, code: 'RANGE', name: 'October Launch', owner_id: owner, start_date: '2026-10-01', launch_date: '2026-11-04', objective: '', status_summary: '', phase: 'Planning', status: 'On track', health: 65, health_updated_at: 1, budget_minor: 0, spend_minor: 0 })
  for (const [id, title, start, end] of [['range', 'Cross-month review', '2026-10-29', '2026-11-04'], ['point', 'Release package', '2026-11-03', null]]) await insert(h.db, 'milestones', { id, created_at: 1, updated_at: 1, campaign_id: 'campaign', owner_id: owner, title, type: 'Review', status: 'Not started', start_date: start, end_date: end })
  await insert(h.db, 'milestone_dependencies', { id: 'dependency', created_at: 1, updated_at: 1, milestone_id: 'range', predecessor_id: 'point' })
  const repository = createMilestoneRepository({ $client: h.db }), milestones = await repository.timeline()
  assert.deepEqual(milestones.map(m => [m.startDate, m.endDate]), [['2026-10-29', '2026-11-04'], ['2026-11-03', null]])
  assert.equal(milestones[0].dependencyConflict, true)
  const html = render(TimelineLensPage, { '/api/milestones/timeline': { milestones, scale: 'month', timezone: 'Australia/Brisbane' } })
  for (const month of ['Oct 2026', 'Nov 2026']) assert.match(html, new RegExp(`aria-label="Dates in ${month}"><span>1</span><span>8</span><span>15</span><span>22</span><span>29</span>`))
  const desktop = html.match(/aria-label="Cross-month review, Oct 29, 2026 through Nov 4, 2026"(.*?)<\/div>/s)[1]
  assert.match(desktop, /Oct 29, 2026.*Nov 4, 2026/)
  assert.match(desktop, /aria-label="Dependency conflict"/)
  const agenda = html.slice(html.indexOf('aria-label="Milestone agenda"'))
  assert.match(agenda, /dateTime="2026-10-29"[^>]*>Oct 29, 2026/)
  assert.match(agenda, /ends Nov 4, 2026/)
  assert.match(agenda, /Dependency conflict/)
  const detail = await repository.find('range')
  const detailHtml = render(MilestoneDetailPage, { '/api/milestones/range': detail }, { milestoneId: 'range' })
  assert.match(detailHtml, /dateTime="2026-10-29">Oct 29, 2026/)
  assert.match(detailHtml, /dateTime="2026-11-04">Nov 4, 2026/)
  assert.match(detailHtml, /Dependency conflict:/)
  assert.equal((await h.db.prepare('SELECT end_date FROM milestones WHERE id=?').bind('range').first()).end_date, '2026-11-04')
 } finally { h.close() }
})
