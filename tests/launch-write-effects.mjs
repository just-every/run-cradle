import test from 'node:test'
import assert from 'node:assert/strict'
import { launchAuthorityRuntime, launchEntities, launchFieldIds, createUlid } from './helpers/launch-authority-runtime.mjs'
import { expected, writeContext, mutationSnapshot } from './helpers/launch-write-context.mjs'

const campaignFields = ownerId => ({ code: 'WRITE-EFFECTS', name: 'Release', ownerId, startDate: '2026-10-01', launchDate: '2026-12-01', objective: 'Launch', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} })
const milestoneFields = (campaignId, ownerId) => ({ campaignId, title: 'Release review', ownerId, type: 'Review', status: 'Not started', startDate: '2026-12-01', endDate: null, conflictReason: null })
const denyField = async (h, kind, field) => writeContext(h, (await h.addPerson({ change: rules => rules.map(rule => rule.entityId === launchEntities[kind] ? { ...rule, writableFields: rule.writableFields.filter(id => id !== launchFieldIds[kind][field]) } : rule) })).session)
const unchangedDenial = async (h, scope, action, input, revisions) => {
 const before = await mutationSnapshot(h.db)
 await assert.rejects(scope.prepare(action, input, revisions), error => error.code === 'forbidden', action)
 assert.deepEqual(await mutationSnapshot(h.db), before, action)
}

test('[RECORDS-001] prior full policy covers conservative effects, limited policies cannot change sidecars or cascades', async () => {
 const h = await launchAuthorityRuntime()
 try {
  const owner = await writeContext(h), originalPolicy = await h.db.prepare('SELECT * FROM authority_policies WHERE id=?').bind(h.policy.id).first()
  // This is the unchanged retained owner policy: only existing descriptor fields.
  for (const [kind, entity] of Object.entries(launchEntities)) assert.deepEqual(JSON.parse(originalPolicy.rules_json).find(rule => rule.entityId === entity).writableFields, Object.values(launchFieldIds[kind]))
  let campaign = await owner.commit('campaign.create', { fields: campaignFields(h.owner) })
  let first = await owner.commit('milestone.create', { fields: milestoneFields(campaign.id, h.owner) })
  const second = await owner.commit('milestone.create', { fields: { ...milestoneFields(campaign.id, h.owner), title: 'Second review' } })
  first = await owner.commit('milestone.set-predecessors', { id: first.id, predecessorIds: [second.id] }, expected('milestone', first))
  const custom = await owner.commit('custom-field.save', { field: { name: 'Region', type: 'select', options: ['Local'] } })
  campaign = await owner.commit('campaign.patch', { id: campaign.id, changes: { customFields: { [custom.id]: 'Local' }, tags: ['Release'] } }, expected('campaign', campaign))
  await unchangedDenial(h, await denyField(h, 'campaign', 'objective'), 'custom-field.delete', { id: custom.id, confirmedAffectedCount: 1 }, expected('customField', custom))
  // Deleting a predecessor changes the dependency owner even across campaigns.
  const other = await owner.commit('campaign.create', { fields: { ...campaignFields(h.owner), code: 'OTHER-EFFECTS' } })
  const predecessor = await owner.commit('milestone.create', { fields: milestoneFields(other.id, h.owner) })
  first = await owner.commit('milestone.set-predecessors', { id: first.id, predecessorIds: [predecessor.id] }, expected('milestone', first))
  const rowLimited = await h.addPerson({ change: rules => rules.map(rule => rule.entityId === launchEntities.milestone ? { ...rule, rows: { kind: 'condition', fieldId: launchFieldIds.milestone.campaignId, op: 'eq', value: other.id } } : rule) })
  await unchangedDenial(h, await writeContext(h, rowLimited.session), 'milestone.delete', { id: predecessor.id }, expected('milestone', predecessor))
  const readinessId = createUlid()
  await h.db.prepare("INSERT INTO launch_readiness(id,created_at,updated_at,version,milestone_id,owner_id,state) VALUES(?,1,1,1,?,?,'Outstanding')").bind(readinessId, first.id, h.owner).run()
  const noReadiness = await denyField(h, 'readiness', 'state')
  await unchangedDenial(h, noReadiness, 'milestone.patch', { id: first.id, changes: { status: 'Complete' } }, expected('milestone', first))
  await unchangedDenial(h, noReadiness, 'campaign.archive', { id: campaign.id }, expected('campaign', campaign))
  await unchangedDenial(h, await denyField(h, 'milestone', 'title'), 'campaign.delete', { id: campaign.id, confirmationCode: campaign.code }, expected('campaign', campaign))
  const pending = await owner.prepare('campaign.delete', { id: other.id, confirmationCode: other.code }, expected('campaign', other))
  await owner.commit('deliverable.create', { fields: { campaignId: other.id, title: 'Concurrent child', ownerId: h.owner, dueDate: null } })
  const before = await mutationSnapshot(h.db)
  await assert.rejects(owner.admission.commit(owner.ctx, pending))
  assert.deepEqual(await mutationSnapshot(h.db), before, 'New cascaded child invalidates the prepared authorization')
  first = await owner.commit('milestone.patch', { id: first.id, changes: { status: 'Complete' } }, expected('milestone', first))
  assert.equal((await h.db.prepare('SELECT state FROM launch_readiness WHERE id=?').bind(readinessId).first()).state, 'Cancelled')
  const duplicate = await owner.commit('campaign.duplicate', { id: campaign.id, newCode: 'WRITE-COPY' }, expected('campaign', campaign))
  assert.ok(duplicate.id)
  const deletedCustom = await owner.commit('custom-field.delete', { id: custom.id, confirmedAffectedCount: 2 }, expected('customField', custom))
  assert.equal(deletedCustom.affected, 2)
  campaign = await owner.commit('campaign.archive', { id: campaign.id }, expected('campaign', campaign))
  campaign = await owner.commit('campaign.restore', { id: campaign.id }, expected('campaign', campaign))
  await owner.commit('campaign.delete', { id: campaign.id, confirmationCode: campaign.code }, expected('campaign', campaign))
  assert.equal(await h.db.prepare('SELECT id FROM campaigns WHERE id=?').bind(campaign.id).first(), null)
  assert.deepEqual(await h.db.prepare('SELECT * FROM authority_policies WHERE id=?').bind(h.policy.id).first(), originalPolicy, 'Positive prior-owner paths never rewrite stored policy bytes')
 } finally { await h.close() }
})

test('[RECORDS-001] zero writable fields and explicit deny rules cannot obtain vacuous no-op authority', async () => {
 const h = await launchAuthorityRuntime()
 try {
  const owner = await writeContext(h), campaign = await owner.commit('campaign.create', { fields: campaignFields(h.owner) })
  const person = await h.addPerson({ change: rules => rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, writableFields: [launchFieldIds.campaign.name] } : rule) })
  const scoped = await writeContext(h, person.session)
  const updated = await scoped.commit('campaign.patch', { id: campaign.id, changes: { name: 'One writable field' } }, expected('campaign', campaign))
  assert.equal(updated.name, 'One writable field')
  await unchangedDenial(h, scoped, 'campaign.patch', { id: updated.id, changes: { objective: updated.objective } }, expected('campaign', updated))
  const zero = await h.addPerson({ change: rules => rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, writableFields: [] } : rule) })
  await unchangedDenial(h, await writeContext(h, zero.session), 'campaign.patch', { id: updated.id, changes: {} }, expected('campaign', updated))
  const denied = await h.addPerson({ change: rules => [...rules, { ...rules.find(rule => rule.entityId === launchEntities.campaign), id: createUlid(), effect: 'deny', writableFields: [launchFieldIds.campaign.objective] }] })
  await unchangedDenial(h, await writeContext(h, denied.session), 'campaign.patch', { id: updated.id, changes: { objective: 'Explicit denial' } }, expected('campaign', updated))
  assert.equal((await owner.commit('campaign.patch', { id: updated.id, changes: {} }, expected('campaign', updated))).version, updated.version + 1)
 } finally { await h.close() }
})

test('[RECORDS-001] unmodelled definition changes require unchanged existing fields without expanding old policies', async () => {
 const h = await launchAuthorityRuntime()
 try {
  const owner = await writeContext(h), policyBefore = await h.db.prepare('SELECT * FROM authority_policies WHERE id=?').bind(h.policy.id).first()
  const campaign = await owner.commit('campaign.create', { fields: campaignFields(h.owner) })
  const lensDefinition = { name: 'Risk review', description: '', recordType: 'Risk', display: 'Cards', conditions: [], sort: { field: 'title', direction: 'asc' }, fields: ['title'] }
  const lens = await owner.commit('lens.save', { definition: lensDefinition })
  const fieldDefinition = { name: 'Publication region', type: 'select', options: ['Local'] }, custom = await owner.commit('custom-field.save', { field: fieldDefinition })
  const automationDefinition = { name: 'Release record', enabled: false, trigger: { kind: 'event', event: 'campaign.updated.v1' }, actions: [{ command: 'add-activity', input: { campaignId: campaign.id, message: 'Before' } }] }
  const automation = await owner.commit('automation.save', { definition: automationDefinition })
  const cases = [
   ['lens', 'description', 'lens.save', { id: lens.id, definition: { ...lensDefinition, conditions: [{ field: 'severity', operator: 'equals', value: 'Critical' }] } }, expected('lens', lens)],
   ['customField', 'type', 'custom-field.save', { id: custom.id, field: { ...fieldDefinition, options: ['Local', 'Regional'] } }, expected('customField', custom)],
   ['automation', 'name', 'automation.save', { id: automation.id, definition: { ...automationDefinition, actions: [{ command: 'add-activity', input: { campaignId: campaign.id, message: 'After' } }] } }, expected('automation', automation)],
  ]
  for (const [kind, field, action, input, revisions] of cases) {
   await unchangedDenial(h, await denyField(h, kind, field), action, input, revisions)
   assert.equal((await owner.commit(action, input, revisions)).version, revisions[0].version + 1)
  }
  assert.deepEqual(await h.db.prepare('SELECT * FROM authority_policies WHERE id=?').bind(h.policy.id).first(), policyBefore)
 } finally { await h.close() }
})
