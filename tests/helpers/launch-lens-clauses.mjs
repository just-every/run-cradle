import assert from 'node:assert/strict'

const businessTables = ['campaigns', 'campaign_tags', 'launch_custom_values', 'deliverables', 'milestones', 'milestone_dependencies', 'risks', 'decisions', 'comments', 'launch_readiness', 'notifications', 'channel_notifications', 'channel_deliveries', 'channel_events', 'automations', 'automation_runs', 'launch_analyses', 'launch_analysis_requests', 'launch_model_calls', 'activity_entries']
const observedTables = [...businessTables, 'lenses', 'launch_lens_history', 'command_admissions', 'admission_audit', 'admission_events', 'admission_outbox']
async function snapshot(db, tables = observedTables) {
 const rows = await db.batch(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`)))
 return Object.fromEntries(tables.map((table, index) => [table, rows[index].results]))
}
const shift = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)
const definition = changes => ({ name: 'Launch condition review', description: 'An operator-authored view', recordType: 'Campaign', conditions: [], sort: { field: 'code', direction: 'asc' }, fields: ['code', 'name', 'launchDate'], display: 'Grid', ...changes })
const canonical = lens => Object.fromEntries(['name', 'description', 'recordType', 'conditions', 'sort', 'fields', 'display'].map(key => [key, lens[key]]))
async function read(h, route, session = h.ownerSession) {
 const response = await h.request(session, route)
 assert.equal(response.status, 200, route)
 return response.json()
}
async function preview(h, input, expectedIds) {
 const started = performance.now()
 const response = await h.request(h.ownerSession, '/api/lenses/preview', { method: 'POST', body: JSON.stringify(input) })
 const page = await response.json(), elapsed = performance.now() - started
 assert.equal(response.status, 200, JSON.stringify(page))
 assert.ok(elapsed < 2000, `Lens preview took ${elapsed.toFixed(0)}ms; contract requires under two seconds`)
 assert.equal(page.total, expectedIds.length)
 assert.equal(page.totalLabel, String(expectedIds.length))
 assert.equal(page.cursor, null)
 assert.deepEqual(new Set(page.items.map(row => row.id)), new Set(expectedIds))
 assert.deepEqual(page.records, page.items)
 const internal = await h.r.previewLens(h.db, input, h.ctx.now)
 assert.deepEqual(internal.total, { kind: 'exact', value: expectedIds.length })
 assert.deepEqual(new Set(internal.items.map(row => row.id)), new Set(expectedIds))
 return page
}
async function invalid(h, input) {
 const before = await snapshot(h.db)
 await assert.rejects(async () => h.prepare('lens.save', { definition: input }), error => error.code === 'validation' || error.name === 'ZodError')
 for (const route of ['/api/lenses/preview', '/api/lenses']) {
  const response = await h.request(h.ownerSession, route, { method: 'POST', body: JSON.stringify(input) })
  assert.equal(response.status, 400, `${route}: ${JSON.stringify(input)}`)
  assert.ok(['validation', 'validation_error'].includes((await response.json()).error.code))
 }
 assert.deepEqual(await snapshot(h.db), before, 'Invalid preview/save preserves all records and lens definitions')
}

async function conditions(h, fixtures) {
 const { a, b, c, prefix, today, custom } = fixtures
 const scope = { field: 'code', operator: 'contains', value: prefix }
 const lens = clauses => definition({ conditions: [scope, ...clauses] })
 const before = await snapshot(h.db)
 for (const [condition, expected] of [
  [{ field: 'phase', operator: 'equals', value: 'Planning' }, [a, c]],
  [{ field: 'phase', operator: 'not equals', value: 'Planning' }, [b]],
  [{ field: 'code', operator: 'one of', value: [a.code, b.code] }, [a, b]],
  [{ field: 'name', operator: 'contains', value: 'ALPHA' }, [a]],
  [{ field: 'statusSummary', operator: 'is empty' }, [a, c]],
  [{ field: 'statusSummary', operator: 'is not empty' }, [b]],
  [{ field: 'launchDate', operator: 'before', value: shift(today, 5) }, [a, c]],
  [{ field: 'launchDate', operator: 'after', value: shift(today, 2) }, [b]],
  [{ field: 'launchDate', operator: 'within the next N days', value: 3 }, [a]],
  [{ field: custom.id, operator: 'contains', value: 'north' }, [a]],
 ]) await preview(h, lens([condition]), expected.map(row => row.id))
 await preview(h, lens([{ field: 'phase', operator: 'equals', value: 'Planning' }, { field: 'name', operator: 'contains', value: 'alpha' }]), [a.id])
 await preview(h, lens([{ field: 'phase', operator: 'equals', value: 'Build' }, { field: 'name', operator: 'contains', value: 'alpha' }]), [])
 await preview(h, lens([{ field: 'code', operator: 'one of', value: [] }]), [])
 const twenty = lens(Array.from({ length: 19 }, () => ({ field: 'phase', operator: 'equals', value: 'Planning' })))
 await preview(h, twenty, [a.id, c.id])
 assert.deepEqual(await snapshot(h.db), before, 'Unsaved previews, including zero results, change no record or saved lens')
 const saved = await h.commit('lens.save', { definition: twenty })
 await h.commit('lens.delete', { id: saved.id }, h.expected('lens', saved))
 for (const input of [
  lens(Array.from({ length: 20 }, () => ({ field: 'phase', operator: 'equals', value: 'Planning' }))),
  lens([{ field: 'unknownField', operator: 'equals', value: 'x' }]),
  lens([{ field: 'phase', operator: 'contains', value: 'Plan' }]),
  lens([{ field: 'health', operator: 'contains', value: '5' }]),
  lens([{ field: 'name', operator: 'before', value: today }]),
  lens([{ field: 'health', operator: 'after', value: today }]),
  lens([{ field: 'name', operator: 'within the next N days', value: 2 }]),
  lens([{ field: 'launchDate', operator: 'within the next N days', value: -1 }]),
  lens([{ field: 'launchDate', operator: 'within the next N days', value: 1.5 }]),
  lens([{ field: 'phase', operator: 'one of', value: 'Planning' }]),
  lens([{ field: 'phase', operator: 'matches', value: 'Planning' }]),
  definition({ sort: { field: 'unknownField', direction: 'asc' } }),
  definition({ fields: ['unknownField'] }),
  definition({ name: ' \t ' }),
  definition({ description: undefined }),
  definition({ recordType: 'Project' }),
  definition({ display: 'Kanban' }),
  definition({ recordType: 'Risk', display: 'Cards', sort: { field: 'title', direction: 'asc' }, fields: ['title'], conditions: [{ field: custom.id, operator: 'equals', value: 'north' }] }),
  definition({ recordType: ['Campaign', 'Risk'] }),
 ]) await invalid(h, input)
}

async function lifecycle(h, fixtures) {
 const reader = h.r.createLaunchReader(h.db, h.context.policy)
 for (const [recordType, display, sort] of [['Campaign', 'Grid', 'code'], ['Risk', 'Cards', 'title'], ['Milestone', 'Timeline', 'startDate'], ['Milestone', 'Agenda', 'startDate'], ['Decision', 'Cards', 'dueAt']]) {
  const input = definition({ recordType, display, sort: { field: sort, direction: 'desc' }, fields: [sort] })
  const before = await snapshot(h.db, businessTables), saved = await h.commit('lens.save', { definition: input })
  assert.deepEqual(canonical(saved), input)
  const stored = await reader.get(h.ctx, 'lens', saved.id)
  assert.equal(stored.createdById, h.actor)
  assert.equal(stored.createdAt, h.ctx.now)
  assert.deepEqual(await snapshot(h.db, businessTables), before)
  await h.commit('lens.delete', { id: saved.id }, h.expected('lens', saved))
  assert.deepEqual(await snapshot(h.db, businessTables), before, 'Saving/deleting a lens never changes displayed or hidden records')
  await assert.rejects(reader.get(h.ctx, 'lens', saved.id), error => error.code === 'not_found')
 }
 for (const [recordType, display, field] of [['Campaign', 'Cards', 'code'], ['Risk', 'Timeline', 'title'], ['Milestone', 'Grid', 'title'], ['Decision', 'Agenda', 'title']]) await invalid(h, definition({ recordType, display, sort: { field, direction: 'asc' }, fields: [field] }))
 const input = definition({ conditions: [{ field: 'code', operator: 'contains', value: fixtures.prefix }, { field: 'phase', operator: 'equals', value: 'Planning' }] })
 let saved = await h.commit('lens.save', { definition: input })
 const person = await h.addPerson({ name: 'Shared lens colleague' })
 assert.deepEqual(canonical((await read(h, `/api/lenses/${saved.id}`, person.session)).lens), input)
 assert.ok((await read(h, '/api/lenses', person.session)).items.some(row => row.id === saved.id))
 const document = await h.request(person.session, saved.shareUrl)
 assert.equal(document.status, 200, 'A saved lens share opens for another signed-in operator')
 const signedOut = await fetch(h.origin + saved.shareUrl, { redirect: 'manual' })
 assert.ok([302, 303, 307, 308, 401].includes(signedOut.status), 'A lens share URL requires a session')
 if (signedOut.status !== 401) assert.equal(new URL(signedOut.headers.get('location'), h.origin).pathname, '/signin')
 assert.equal((await fetch(h.origin + `/api/lenses/${saved.id}`, { redirect: 'manual' })).status, 401)
 // Each open fetches the saved conditions before evaluating the current records.
 let opened = (await read(h, `/api/lenses/${saved.id}`)).lens
 assert.deepEqual(opened.conditions, input.conditions)
 await preview(h, canonical(opened), [fixtures.a.id, fixtures.c.id])
 fixtures.a = await h.commit('campaign.patch', { id: fixtures.a.id, changes: { phase: 'Build' } }, h.expected('campaign', fixtures.a))
 opened = (await read(h, `/api/lenses/${saved.id}`)).lens
 assert.deepEqual(canonical(opened), input)
 await preview(h, canonical(opened), [fixtures.c.id])
 fixtures.c = await h.commit('campaign.archive', { id: fixtures.c.id }, h.expected('campaign', fixtures.c))
 await preview(h, canonical((await read(h, `/api/lenses/${saved.id}`)).lens), [])
 const beforeEdit = await snapshot(h.db, businessTables), edited = { ...input, description: 'Changed by a colleague', conditions: [{ field: 'code', operator: 'contains', value: fixtures.prefix }], sort: { field: 'launchDate', direction: 'desc' } }
 const response = await h.request(person.session, `/api/lenses/${saved.id}`, { method: 'PUT', body: JSON.stringify({ ...edited, version: saved.version }) })
 assert.equal(response.status, 200, JSON.stringify(await response.clone().json()))
 saved = (await response.json()).lens
 assert.deepEqual(canonical(saved), edited)
 assert.deepEqual(await snapshot(h.db, businessTables), beforeEdit)
 await h.commit('lens.delete', { id: saved.id }, h.expected('lens', saved))
 assert.deepEqual(await snapshot(h.db, businessTables), beforeEdit)
 assert.equal((await h.request(person.session, `/api/lenses/${saved.id}`)).status, 404)
}

async function shipped(h) {
 const expected = {
  risks: { recordType: 'Risk', conditions: [{ field: 'severity', operator: 'one of', value: ['High', 'Critical'] }, { field: 'state', operator: 'not equals', value: 'Resolved' }, { field: 'campaignLaunchDate', operator: 'within the next N days', value: '30' }], sort: { field: 'severity', direction: 'desc' }, fields: ['severity', 'state', 'owner', 'dueDate', 'signal', 'mitigation', 'campaign'], display: 'Cards' },
  timeline: { recordType: 'Milestone', conditions: [], sort: { field: 'startDate', direction: 'asc' }, fields: ['title', 'startDate', 'endDate', 'campaign'], display: 'Timeline' },
 }
 for (const [key, required] of Object.entries(expected)) {
  let original = (await read(h, '/api/lenses')).items.find(lens => lens.shippedKey === key)
  assert.ok(original, `${key} is installed as a saved lens`)
  const shippedDefinition = { ...canonical(original), ...required }
  const before = await snapshot(h.db, businessTables)
  await assert.rejects(h.prepare('lens.delete', { id: original.id }, h.expected('lens', original)), error => error.code === 'validation')
  const duplicate = await h.commit('lens.save', { definition: { ...canonical(original), name: original.name + ' operator copy' } })
  assert.equal((await read(h, `/api/lenses/${duplicate.id}`)).lens.shippedKey, null)
  assert.equal((await read(h, `/api/lenses/${original.id}`)).lens.version, original.version)
  original = await h.commit('lens.save', { id: original.id, definition: { ...canonical(original), name: 'Edited shipped lens', description: 'Operator changes', conditions: [{ field: 'title', operator: 'contains', value: 'held out' }], fields: ['title'], sort: { field: 'title', direction: 'desc' } } }, h.expected('lens', original))
  const restored = await h.commit('lens.restore', { id: original.id }, h.expected('lens', original))
  assert.deepEqual(canonical(restored), shippedDefinition, 'Restore reinstates the complete shipped definition')
  assert.deepEqual((await read(h, `/api/lenses/${original.id}`)).lens.conditions, required.conditions)
  await h.commit('lens.delete', { id: duplicate.id }, h.expected('lens', duplicate))
  assert.deepEqual(await snapshot(h.db, businessTables), before, 'Duplicating, editing and restoring shipped lenses changes no business record')
 }
}

export async function verifyLensClauses(h) {
 const timezone = (await h.db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first()).timezone
 const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(h.ctx.now))
 const prefix = 'LENS-CLAUSE-'
 const make = async (suffix, changes) => {
  const row = await h.campaign(prefix + suffix)
  return h.commit('campaign.patch', { id: row.id, changes: { startDate: shift(today, -20), ...changes } }, h.expected('campaign', row))
 }
 const a = await make('A', { name: 'Alpha launch', phase: 'Planning', statusSummary: '', launchDate: shift(today, 2) })
 const b = await make('B', { name: 'Beta launch', phase: 'Build', statusSummary: 'Ready', launchDate: shift(today, 5) })
 const c = await make('C', { name: 'Gamma launch', phase: 'Planning', statusSummary: '', launchDate: shift(today, -1) })
 const archived = await make('ARCHIVED', { name: 'Alpha archived', phase: 'Planning', statusSummary: '', launchDate: shift(today, 2) })
 await h.commit('campaign.archive', { id: archived.id }, h.expected('campaign', archived))
 const custom = await h.commit('custom-field.save', { field: { name: 'Lens region', type: 'text' } })
 const tagged = await h.commit('campaign.patch', { id: a.id, changes: { customFields: { [custom.id]: 'north' } } }, h.expected('campaign', a))
 const fixtures = { a: tagged, b, c, prefix, today, custom }
 await conditions(h, fixtures)
 await lifecycle(h, fixtures)
 await shipped(h)
}
