import test from 'node:test'
import assert from 'node:assert/strict'
import { launchAuthorityRuntime, launchEntities, launchFieldIds, createUlid } from './helpers/launch-authority-runtime.mjs'
import { expected, writeContext, mutationSnapshot, createLegacyImportAdapter } from './helpers/launch-write-context.mjs'

const narrowed = (h, kind, field) => h.addPerson({ change: rules => rules.map(rule => rule.entityId === launchEntities[kind] ? { ...rule, writableFields: rule.writableFields.filter(id => id !== field) } : rule) })

test('[RECORDS-001 BASE-ACCESS-004] native and legacy HTTP reject forbidden writes and return permitted ones only through readable fields', async () => {
 const h = await launchAuthorityRuntime()
 try {
  const owner = await writeContext(h)
  const campaign = (await (await h.request(h.ownerSession, '/api/campaigns')).json()).items[0]
  const originalObjective = (await h.db.prepare('SELECT objective FROM campaigns WHERE id=?').bind(campaign.id).first()).objective
  const custom = await owner.commit('custom-field.save', { field: { name: 'Release region', type: 'text' } })
  for (const [field, changes] of [[launchFieldIds.campaign.health, { health: 62 }], [launchFieldIds.campaign.objective, { objective: 'Forbidden objective' }], [launchFieldIds.campaign.tags, { tags: ['Forbidden tag'] }], [launchFieldIds.campaign.objective, { customFields: { [custom.id]: 'Forbidden custom value' } }]]) {
   const person = await narrowed(h, 'campaign', field)
   assert.equal((await h.request(person.session, '/api/campaigns')).status, 200, 'Read permission is preserved')
   const before = await mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
   // Legacy PATCH accepts standard campaign fields; sidecars use the native command.
   for (const canonical of field === launchFieldIds.campaign.health ? [false, true] : [true]) {
    const route = canonical ? '/api/v1/commands/launch.campaign.patch' : `/api/campaigns/${campaign.id}`
    const body = canonical ? { commandId: createUlid(), expected: expected('campaign', campaign), input: { id: campaign.id, changes: { name: 'Must roll back', ...changes } } } : { version: campaign.version, name: 'Must roll back', ...changes }
    const response = await h.request(person.session, route, { method: canonical ? 'POST' : 'PATCH', body: JSON.stringify(body) })
    assert.equal(response.status, 403, await response.text())
   }
   assert.deepEqual(await mutationSnapshot(h.db, { omitSessionReadTimestamp: true }), before, 'Neither route commits rows, activity, audit, events or admissions')
  }
  const person = await narrowed(h, 'campaign', launchFieldIds.campaign.objective)
  const permitted = await h.request(person.session, `/api/campaigns/${campaign.id}`, { method: 'PATCH', body: JSON.stringify({ version: campaign.version, name: 'Permitted title edit' }) })
  assert.equal(permitted.status, 200, await permitted.text())
  const row = await h.db.prepare('SELECT name,objective,version FROM campaigns WHERE id=?').bind(campaign.id).first()
  assert.equal(row.name, 'Permitted title edit'); assert.equal(row.objective, originalObjective); assert.equal(row.version, campaign.version + 1)
  // A collaborator who may read and write only the name gets, on commit, replay and
  // status, the record's identity and name and no other campaign value.
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(person.rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, readableFields: [launchFieldIds.campaign.name], writableFields: [launchFieldIds.campaign.name] } : rule)), person.policyId).run()
  const commandId = createUlid(), command = JSON.stringify({ commandId, expected: expected('campaign', { id: campaign.id, version: row.version }), input: { id: campaign.id, changes: { name: 'Readable title edit' } } })
  const patch = () => h.request(person.session, '/api/v1/commands/launch.campaign.patch', { method: 'POST', body: command })
  for (const send of [patch, patch, () => h.request(person.session, `/api/v1/commands/${commandId}`)]) {
   const response = await send(), text = await response.text()
   assert.equal(response.status, 200, text)
   const { data } = JSON.parse(text), value = data.value ?? data.result
   assert.equal(value.name, 'Readable title edit')
   assert.deepEqual(Object.keys(value).filter(key => !['id', 'version', 'createdAt', 'updatedAt', 'name'].includes(key)), [], text)
   assert.ok(!text.includes(originalObjective), text)
  }
 } finally { await h.close() }
})

test('[RECORDS-001 CAMP-013 IMPORT-003] prepared composite writes retain field-policy guards through admission', async () => {
 const h = await launchAuthorityRuntime()
 try {
  const owner = await writeContext(h), person = await h.addPerson(), scoped = await writeContext(h, person.session)
  const campaign = (await (await h.request(h.ownerSession, '/api/campaigns')).json()).items[0]
  const prepared = await scoped.prepare('campaign.patch', { id: campaign.id, changes: { objective: 'Prepared objective', tags: ['Prepared tag'] } }, expected('campaign', campaign))
  await h.db.prepare('UPDATE authority_policies SET version=version+1,rules_json=? WHERE id=?').bind(JSON.stringify(person.rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, writableFields: rule.writableFields.filter(id => id !== launchFieldIds.campaign.objective) } : rule)), person.policyId).run()
  const before = await mutationSnapshot(h.db)
  await assert.rejects(scoped.admission.commit(scoped.ctx, prepared))
  assert.deepEqual(await mutationSnapshot(h.db), before)
  const restricted = await narrowed(h, 'campaign', launchFieldIds.campaign.tags), blocked = await writeContext(h, restricted.session)
  await assert.rejects(blocked.prepare('bulk.apply', { recordType: 'Campaign', ids: [campaign.id], change: { kind: 'tag-add', value: 'Denied bulk' } }, expected('campaign', campaign)), error => error.code === 'forbidden')
  const adapter = createLegacyImportAdapter({ db: h.db, policy: blocked.policy, integration: {} }, 'campaign')
  await assert.rejects(adapter.prepare(blocked.ctx, { code: campaign.code, tags: 'Denied import' }, createUlid()), error => error.code === 'forbidden')
  const bulk = await owner.commit('bulk.apply', { recordType: 'Campaign', ids: [campaign.id], change: { kind: 'field', field: 'status', value: 'Watch' } }, expected('campaign', campaign))
  const noStatus = await narrowed(h, 'campaign', launchFieldIds.campaign.status), undo = await writeContext(h, noStatus.session)
  await assert.rejects(undo.prepare('bulk.undo', { bulkId: bulk.bulkId }), error => error.code === 'forbidden')
  const recovery = await owner.commit('bulk.undo', { bulkId: bulk.bulkId })
  assert.equal(recovery.restored, 1)
 } finally { await h.close() }
})

test('[RECORDS-001] field policy covers native creation, transitions, linked effects, definitions and sidecars', async () => {
 const h = await launchAuthorityRuntime()
 try {
  const owner = await writeContext(h), campaign = (await (await h.request(h.ownerSession, '/api/campaigns')).json()).items[0]
  const deliverable = await owner.commit('deliverable.create', { fields: { campaignId: campaign.id, title: 'Release guide', ownerId: h.owner, dueDate: null } })
  const milestoneFields = { campaignId: campaign.id, title: 'Release review', ownerId: h.owner, type: 'Review', status: 'Not started', startDate: '2026-12-01', endDate: null, conflictReason: null }
  const milestone = await owner.commit('milestone.create', { fields: milestoneFields })
  const predecessor = await owner.commit('milestone.create', { fields: { ...milestoneFields, title: 'Editorial review' } })
  const riskFields = { campaignId: campaign.id, title: 'Release risk', ownerId: h.owner, severity: 'Critical', dueDate: null, signal: 'Pending review', mitigation: 'Complete review' }
  const risk = await owner.commit('risk.create', { fields: riskFields })
  const lens = { name: 'Review queue', description: '', recordType: 'Risk', display: 'Cards', conditions: [], sort: { field: 'title', direction: 'asc' }, fields: ['title'] }
  const cases = [
   ['deliverable', launchFieldIds.deliverable.title, 'deliverable.create', { fields: { campaignId: campaign.id, title: 'Forbidden', ownerId: h.owner, dueDate: null } }, []],
   ['deliverable', launchFieldIds.deliverable.state, 'deliverable.complete', { id: deliverable.id }, expected('deliverable', deliverable)],
   ['deliverable', launchFieldIds.deliverable.title, 'deliverable.delete', { id: deliverable.id }, expected('deliverable', deliverable)],
   ['milestone', launchFieldIds.milestone.title, 'milestone.set-predecessors', { id: milestone.id, predecessorIds: [predecessor.id] }, expected('milestone', milestone)],
   ['risk', launchFieldIds.risk.state, 'risk.escalate', { id: risk.id, reason: 'Needs a decision' }, expected('risk', risk)],
   ['decision', launchFieldIds.decision.title, 'risk.escalate', { id: risk.id, reason: 'Needs a decision' }, expected('risk', risk)],
   ['campaign', launchFieldIds.campaign.objective, 'campaign.archive', { id: campaign.id }, expected('campaign', campaign)],
   ['deliverable', launchFieldIds.deliverable.title, 'campaign.duplicate', { id: campaign.id, newCode: 'COPY-DENIED' }, expected('campaign', campaign)],
   ['risk', launchFieldIds.risk.severity, 'samples.install', {}, []],
   ['lens', launchFieldIds.lens.description, 'lens.save', { definition: lens }, []],
   ['customField', launchFieldIds.customField.type, 'custom-field.save', { field: { name: 'Channel', type: 'select', options: ['Web'] } }, []],
   ['automation', launchFieldIds.automation.name, 'automation.save', { definition: { name: 'Release update', enabled: false, trigger: { kind: 'event', event: 'campaign.updated.v1' }, actions: [{ command: 'add-activity', input: { campaignId: campaign.id, message: 'Release updated' } }] } }, []],
  ]
  const person = await h.addPerson()
  for (const [kind, field, action, input, revisions] of cases) {
   // Revise one real collaborator's policy rather than repeatedly signing in
   // fresh humans inside the native authentication rate-limit window.
   const rules = person.rules.map(rule => rule.entityId === launchEntities[kind] ? { ...rule, writableFields: rule.writableFields.filter(id => id !== field) } : rule)
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules), person.policyId).run()
   const scoped = await writeContext(h, person.session), before = await mutationSnapshot(h.db)
   await assert.rejects(scoped.prepare(action, input, revisions), error => error.code === 'forbidden', action)
   assert.deepEqual(await mutationSnapshot(h.db), before, action)
  }
  const escalated = await owner.commit('risk.escalate', { id: risk.id, reason: 'Owner review requested' }, expected('risk', risk))
  assert.ok(escalated.decision)
  const resolved = await owner.commit('decision.outcome', { id: escalated.decision.id, outcome: 'Approved', rationale: '' }, expected('decision', escalated.decision))
  assert.equal(resolved.state, 'Approved')
  assert.equal((await h.db.prepare('SELECT state FROM risks WHERE id=?').bind(risk.id).first()).state, 'In progress')
  assert.equal((await owner.commit('milestone.set-predecessors', { id: milestone.id, predecessorIds: [predecessor.id] }, expected('milestone', milestone))).predecessorIds[0], predecessor.id)
 } finally { await h.close() }
})
