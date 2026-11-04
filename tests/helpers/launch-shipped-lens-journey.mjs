import assert from 'node:assert/strict'

// Authored from RISK-005 and MILE-002, independently of installed or restored data.
const shippedDefinitions = {
 risks: { name: 'Risks Lens', description: '', recordType: 'Risk', conditions: [{ field: 'severity', operator: 'one of', value: ['High', 'Critical'] }, { field: 'state', operator: 'not equals', value: 'Resolved' }, { field: 'campaignLaunchDate', operator: 'within the next N days', value: '30' }], sort: { field: 'severity', direction: 'desc' }, fields: ['severity', 'state', 'owner', 'dueDate', 'signal', 'mitigation', 'campaign'], display: 'Cards' },
 timeline: { name: 'Timeline Lens', description: '', recordType: 'Milestone', conditions: [], sort: { field: 'startDate', direction: 'asc' }, fields: ['title', 'startDate', 'endDate', 'campaign'], display: 'Timeline' },
}
const canonical = lens => Object.fromEntries(Object.keys(shippedDefinitions.risks).map(key => [key, lens[key]]))
const businessTables = ['campaigns', 'campaign_tags', 'launch_custom_fields', 'launch_custom_values', 'deliverables', 'milestones', 'milestone_dependencies', 'risks', 'decisions', 'evidence_comments', 'launch_readiness', 'notifications', 'channel_notifications', 'channel_deliveries', 'channel_events', 'automations', 'automation_runs', 'launch_automation_actions', 'launch_automation_retries', 'launch_automation_authorities', 'launch_action_effects', 'launch_analyses', 'launch_analysis_requests', 'launch_model_calls', 'activity_entries', 'admission_outbox', 'launch_event_dispatches']
async function snapshot(h, tables) {
 const rows = await h.db.batch(tables.map(table => h.db.prepare(`SELECT * FROM ${table} ORDER BY 1`)))
 return Object.fromEntries(tables.map((table, index) => [table, rows[index].results]))
}
async function businessSnapshot(h) {
 const events = await h.db.prepare("SELECT * FROM admission_events WHERE name NOT IN ('lens.saved','lens.deleted') ORDER BY id").all()
 return { ...await snapshot(h, businessTables), businessEvents: events.results }
}
async function publicRead(h, session, route) {
 const response = await h.request(session, route)
 assert.equal(response.status, 200, route)
 return response.json()
}
async function command(h, session, action, input, expected = []) {
 const response = await h.request(session, `/api/v1/commands/launch.${action}`, { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), input, expected }) })
 const body = await response.json()
 assert.equal(response.status, 200, JSON.stringify(body))
 return body.data.value
}

export async function verifyShippedLensLifecycle(h, fixtures) {
 const operator = await h.addPerson({ name: 'Shipped lens operator' })
 assert.notEqual(operator.id, h.owner)
 const read = route => publicRead(h, operator.session, route)
 const lens = async id => (await read(`/api/lenses/${id}`)).lens
 const execute = (action, input, expected) => command(h, operator.session, action, input, expected)
 // Populate both record types through native commands before preserving their public values.
 const risk = await execute('risk.create', { fields: { campaignId: fixtures.a.id, title: 'Synthetic shipped lens risk', ownerId: operator.id, severity: 'High', dueDate: fixtures.today, signal: 'Review supplier evidence', mitigation: 'Request current evidence' } })
 const milestone = await execute('milestone.create', { fields: { campaignId: fixtures.b.id, title: 'Synthetic shipped lens milestone', ownerId: operator.id, type: 'Review', status: 'Not started', startDate: fixtures.today, endDate: null, conflictReason: null } })
 const routes = [`/api/campaigns/${fixtures.a.id}`, `/api/campaigns/${fixtures.b.id}`, `/api/campaigns/${fixtures.c.id}`, `/api/risks/${risk.id}`, `/api/milestones/${milestone.id}`]
 const records = await Promise.all(routes.map(read))
 const before = await businessSnapshot(h)
 assert.ok(before.campaigns.length && before.risks.length && before.milestones.length && before.decisions.length, 'The business snapshot covers populated records')
 const pending = await h.db.prepare("SELECT e.id FROM admission_events e LEFT JOIN launch_event_dispatches d ON d.event_id=e.id WHERE d.event_id IS NULL AND e.name NOT IN ('lens.saved','lens.deleted')").all()
 assert.ok(pending.results.length, 'Business events are queued before lens changes')
 const unchanged = async message => {
  assert.deepEqual(await Promise.all(routes.map(read)), records, `${message}: public business records retain values, versions and archive state`)
  assert.deepEqual(await businessSnapshot(h), before, `${message}: all business records and queued business effects remain unchanged`)
 }
 const catalog = (await read('/api/lenses')).items
 for (const [key, required] of Object.entries(shippedDefinitions)) {
  const installed = catalog.filter(row => row.shippedKey === key)
  assert.equal(installed.length, 1, `${key} is installed once as a saved lens`)
  let original = await lens(installed[0].id)
  assert.deepEqual(canonical(installed[0]), required, 'Installed catalog contains every canonical definition field')
  assert.deepEqual(canonical(original), required, 'Installed detail agrees with the independently authored shipped definition')
  const originalId = original.id
  await assert.rejects(h.prepare('lens.delete', { id: originalId }, h.expected('lens', original)), error => error.code === 'validation')
  const refusalTables = [...businessTables, 'lenses', 'launch_lens_history', 'command_admissions', 'admission_audit', 'admission_events']
  const refusedBefore = await snapshot(h, refusalTables)
  const refused = await h.request(h.ownerSession, '/api/v1/commands/launch.lens.delete', { method: 'POST', body: JSON.stringify({ commandId: h.r.createUlid(), input: { id: originalId }, expected: h.expected('lens', original) }) })
  const failure = await refused.json()
  assert.equal(refused.status, 400, JSON.stringify(failure))
  assert.equal(failure.error.code, 'validation')
  assert.match(failure.error.message, /shipped lens cannot be deleted/i)
  assert.deepEqual(await lens(originalId), original)
  assert.deepEqual((await read('/api/lenses')).items.find(row => row.id === originalId), installed[0])
  assert.deepEqual(await snapshot(h, refusalTables), refusedBefore, 'Public shipped-lens refusal preserves definitions, business records, admissions and queued effects')
  await unchanged(`${key} deletion refusal`)

  const copyDefinition = { ...canonical(original), name: `${required.name} operator copy` }
  const duplicated = await execute('lens.save', { definition: copyDefinition })
  assert.notEqual(duplicated.id, originalId)
  let copy = await lens(duplicated.id)
  assert.deepEqual(canonical(copy), copyDefinition, 'Native duplicate is publicly readable with all copied fields')
  assert.equal(copy.shippedKey, null)
  assert.equal(copy.createdById, operator.id)
  assert.deepEqual(await lens(originalId), original, 'Duplicating leaves the original definition and version unchanged')
  await unchanged(`${key} duplication`)

  const copyEdit = { ...copyDefinition, description: 'Independent operator copy', conditions: [{ field: 'title', operator: 'contains', value: 'Synthetic shipped lens' }], sort: { field: 'title', direction: 'asc' }, fields: ['title'] }
  await execute('lens.save', { id: copy.id, definition: copyEdit }, h.expected('lens', copy))
  copy = await lens(copy.id)
  assert.deepEqual(canonical(copy), copyEdit)
  assert.deepEqual(await lens(originalId), original, 'Editing a duplicate never changes the shipped original')
  await unchanged(`${key} copy edit`)

  // Change every definition field, including type and display, before restoring.
  const edit = { name: 'Edited shipped lens', description: 'Operator changes', recordType: key === 'risks' ? 'Milestone' : 'Risk', display: key === 'risks' ? 'Agenda' : 'Cards', conditions: [{ field: 'title', operator: 'contains', value: 'held out' }], fields: ['title'], sort: { field: 'title', direction: 'desc' } }
  const saved = await execute('lens.save', { id: originalId, definition: edit }, h.expected('lens', original))
  original = await lens(originalId)
  assert.equal(original.version, saved.version)
  assert.equal(original.version, installed[0].version + 1)
  assert.deepEqual(canonical(original), edit, 'Native edit changes every canonical field on the public definition')
  assert.deepEqual(await lens(copy.id), copy, 'Editing the original preserves its independent duplicate')
  await unchanged(`${key} original edit`)

  const result = await execute('lens.restore', { id: originalId }, h.expected('lens', original))
  const restored = await lens(originalId)
  assert.equal(restored.id, originalId)
  assert.equal(restored.shippedKey, key)
  assert.equal(restored.version, original.version + 1)
  assert.equal(result.version, restored.version)
  assert.deepEqual(canonical(restored), required, 'Public restore reinstates every independently authored canonical field')
  assert.deepEqual((await read('/api/lenses')).items.find(row => row.id === originalId), restored, 'Restored definition is shared in the public catalog')
  assert.deepEqual(await lens(copy.id), copy, 'Restoring the original preserves the edited duplicate and its version')
  await unchanged(`${key} restore`)
  await execute('lens.delete', { id: copy.id }, h.expected('lens', copy))
  assert.equal((await h.request(operator.session, `/api/lenses/${copy.id}`)).status, 404)
  await unchanged(`${key} duplicate deletion`)
 }
}
