import assert from 'node:assert/strict'

const localDate = (instant, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant))
const shift = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)

export async function verifyOverdueClauses(h) {
 const { parseCsv } = await import('../../src/domains/portability/csv.ts')
 const call = async (path, init = {}, session = h.ownerSession) => {
  const response = await h.request(session, path, init), body = await response.json()
  assert.equal(response.status, 200, path + ': ' + JSON.stringify(body.error ?? {}))
  return body
 }
 const original = (await call('/api/settings')).settings
 const timezone = ['Pacific/Kiritimati', 'Etc/GMT+12'].find(zone => localDate(h.ctx.now, zone) !== h.ctx.now.slice(0, 10))
 assert.ok(timezone, 'The workspace calendar must differ from UTC for this proof')
 const settings = changes => call('/api/settings', { method: 'PATCH', body: JSON.stringify(changes) })
 await settings({ version: original.version, timezone })
 try {
  const today = localDate(h.ctx.now, timezone), yesterday = shift(today, -1), tomorrow = shift(today, 1)
  let campaign = await h.campaign('OVERDUE-PROOF')
  campaign = await h.commit('campaign.patch', { id: campaign.id, changes: { startDate: shift(today, -10), launchDate: shift(today, 10) } }, h.expected('campaign', campaign))
  const expected = new Map(), deliverables = [], milestones = []
  for (const [suffix, dueDate, complete, overdue] of [['past', yesterday, false, true], ['today', today, false, false], ['future', tomorrow, false, false], ['undated', null, false, false], ['complete', yesterday, true, false]]) {
   let row = await h.commit('deliverable.create', { fields: { campaignId: campaign.id, title: `Overdueproof deliverable ${suffix}`, ownerId: h.actor, dueDate } })
   if (complete) row = await h.commit('deliverable.complete', { id: row.id }, h.expected('deliverable', row))
   deliverables.push(row); expected.set(row.id, overdue)
  }
  for (const [suffix, startDate, endDate, complete, overdue] of [['point', yesterday, null, false, true], ['range', shift(today, -3), yesterday, false, true], ['range-today', shift(today, -365), today, false, false], ['today', today, null, false, false], ['complete', yesterday, null, true, false]]) {
   let row = await h.commit('milestone.create', { fields: { campaignId: campaign.id, title: `Overdueproof milestone ${suffix}`, ownerId: h.actor, type: 'Review', status: 'Not started', startDate, endDate, conflictReason: null } })
   if (complete) row = await h.commit('milestone.patch', { id: row.id, changes: { status: 'Complete' } }, h.expected('milestone', row))
   milestones.push(row); expected.set(row.id, overdue)
  }
  const assertFlags = (actual, fixtures, label) => {
   for (const fixture of fixtures) {
    const row = actual.find(row => row.id === fixture.id)
    assert.ok(row, `${label} contains the fixture`)
    assert.equal(row.overdue, expected.get(fixture.id), `${label}: ${fixture.title}`)
   }
  }
  const search = async (session = h.ownerSession, archived = false) => (await call(`/api/search?q=Overdueproof&archived=${archived}`, {}, session)).items
  assertFlags(await search(), [...deliverables, ...milestones], 'Search result')
  const detail = await call(`/api/campaigns/${campaign.id}`)
  assertFlags(detail.deliverables, deliverables, 'Campaign deliverables')
  assertFlags(detail.milestones, milestones, 'Campaign milestones')
  for (const row of milestones) assert.equal((await call(`/api/milestones/${row.id}`)).milestone.overdue, expected.get(row.id), 'Milestone detail uses range end and workspace date')
  assertFlags((await call('/api/milestones/timeline')).milestones, milestones, 'Shipped timeline')
  const home=(await call('/api/portfolio')).upcomingMilestones
  const spanning=milestones.find(row=>row.title.endsWith('range-today'))
  assert.equal(home.find(row=>row.id===spanning.id)?.overdue,false,'Home uses a range end and the workspace date')

  const csv = async (kind, fields, session = h.ownerSession, filterByCampaign = true) => {
   const ids = h.r.launchFieldIds[kind]
   const input = { appId: h.r.LAUNCH_APP_ID, entityId: h.r.launchEntities[kind], query: { fields: fields.map(field => ids[field]), ...(filterByCampaign ? { filter: { kind: 'condition', fieldId: ids.campaignId, op: 'eq', value: { appId: h.r.LAUNCH_APP_ID, entityId: h.r.launchEntities.campaign, recordId: campaign.id } } } : {}), sort: [{ fieldId: ids.title, direction: 'asc' }] } }
   const body = await call('/api/v1/records/export-csv', { method: 'POST', body: JSON.stringify(input) }, session)
   const parsed = parseCsv(new TextEncoder().encode(body.data.csv))
   const streamed = await h.request(session, '/api/v1/records/export-csv', { method: 'POST', headers: { accept: 'text/csv' }, body: JSON.stringify(input) })
   assert.equal(streamed.status, 200)
   assert.deepEqual(parseCsv(new Uint8Array(await streamed.arrayBuffer())), parsed, 'Streamed CSV preserves labels, column order and overdue markers')
   if (fields.includes('state') || fields.includes('status')) {
    const { readWorkbook } = await import('../../src/domains/records/workbooks/read.ts')
    const workbook = (await call('/api/v1/records/export-xlsx', { method: 'POST', body: JSON.stringify(input) }, session)).data
    const download = await h.request(session, '/api/v1/records/export-xlsx', { method: 'POST', headers: { accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: JSON.stringify(input) })
    assert.equal(download.status, 200)
    for (const bytes of [Buffer.from(workbook.content, 'base64'), new Uint8Array(await download.arrayBuffer())]) {
     const sheet = readWorkbook(bytes, 'overdue.xlsx')[0]
     assert.deepEqual(sheet.headers, parsed.headers, 'Workbook keeps exactly the selected columns')
     assert.deepEqual(sheet.rows.map(row => row.slice(0, 2).map(cell => cell.value)), parsed.rows.map(row => row.slice(0, 2)), 'Both workbook paths keep lifecycle labels and overdue markers')
    }
   }
   const schema = h.r.launchDescriptors.find(item => item.schema.id === h.r.launchEntities[kind]).schema
   assert.deepEqual(parsed.headers, fields.map(field => schema.fields.find(item => item.id === ids[field]).label), 'CSV retains exactly the selected columns in displayed order')
   return parsed
  }
  for (const [kind, fixtures, fields] of [['deliverable', deliverables, ['state', 'title', 'dueDate']], ['milestone', milestones, ['status', 'title', 'startDate', 'endDate']]]) {
   const exported = await csv(kind, fields)
   assert.equal(exported.rows.length, fixtures.length)
   for (const fixture of fixtures) {
    const row = exported.rows.find(row => row[1] === fixture.title)
    assert.ok(row)
    assert.equal(row[0], fixture[fields[0]] + (expected.get(fixture.id) ? ' (Overdue)' : ''))
    for (let i = 2; i < fields.length; i++) assert.equal(row[i], fixture[fields[i]] ?? '', 'Dates remain unmodified when lifecycle text can carry the marker')
   }
  }
  const dueOnly = await csv('deliverable', ['dueDate'])
  assert.ok(dueOnly.rows.some(row => row[0] === `${yesterday} (Overdue)`), 'A date-only export still marks overdue work without adding a column')
  assert.ok(dueOnly.rows.some(row => row[0] === today), 'Due today is exported without an overdue marker')

  const definition = { name: 'Overdueproof milestone lens', description: '', recordType: 'Milestone', display: 'Timeline', conditions: [{ field: 'campaign', operator: 'equals', value: campaign.id }], sort: { field: 'startDate', direction: 'asc' }, fields: ['status', 'title', 'startDate', 'endDate'] }
  const lens = await h.commit('lens.save', { definition })
  const lensCsv = parseCsv(new TextEncoder().encode((await call(`/api/exports/csv?source=lens&lensId=${lens.id}`)).csv))
  assert.equal(lensCsv.headers.length, definition.fields.length)
  assert.equal(lensCsv.rows.length, milestones.length)
  for (const fixture of milestones) {
   const row = lensCsv.rows.find(row => row[1] === fixture.title)
   assert.equal(row?.[0], fixture.status + (expected.get(fixture.id) ? ' (Overdue)' : ''))
   assert.equal(row?.[2], fixture.startDate)
   assert.equal(row?.[3], fixture.endDate ?? '')
  }
  const preview = await call('/api/lenses/preview', { method: 'POST', body: JSON.stringify(definition) })
  assertFlags(preview.items, milestones, 'Saved milestone lens preview')

  // A hidden date or lifecycle value must not be disclosed through its derived flag.
  for (const hidden of [{ deliverable: 'dueDate', milestone: 'endDate' }, { deliverable: 'state', milestone: 'status' }, { deliverable: 'campaignId', milestone: 'campaignId' }]) {
   const person = await h.addPerson({ change: rules => rules.map(rule => {
    const kind = ['deliverable', 'milestone'].find(kind => rule.entityId === h.r.launchEntities[kind])
    return kind ? { ...rule, readableFields: rule.readableFields.filter(id => id !== h.r.launchFieldIds[kind][hidden[kind]]) } : rule
   }) })
   const masked = await search(person.session)
   for (const fixture of [...deliverables, ...milestones]) {
    const hit = masked.find(row => row.id === fixture.id)
    assert.ok(hit)
    assert.equal(Object.hasOwn(hit, 'overdue'), false, 'Masked dependencies produce no derived overdue value')
   }
   for (const kind of ['deliverable', 'milestone']) {
    const fields = ['title', hidden[kind] === 'state' || hidden[kind] === 'status' ? kind === 'deliverable' ? 'dueDate' : 'startDate' : kind === 'deliverable' ? 'state' : 'status']
    const exported = await csv(kind, fields, person.session, hidden[kind] !== 'campaignId')
    assert.ok(exported.rows.every(row => row.every(value => !value.includes('(Overdue)'))), 'Masked dates/states cannot leak through CSV annotations')
   }
  }

  campaign = await h.commit('campaign.archive', { id: campaign.id }, h.expected('campaign', campaign))
  for (const row of [...deliverables, ...milestones]) expected.set(row.id, false)
  assertFlags(await search(h.ownerSession, true), [...deliverables, ...milestones], 'Archived search results')
  for (const kind of ['deliverable', 'milestone']) assert.ok((await csv(kind, ['title'])).rows.every(row => !row[0].includes('(Overdue)')), 'Archived work stops carrying overdue export markers')
 } finally {
  const current = (await call('/api/settings')).settings
  await settings({ version: current.version, timezone: original.timezone })
 }
}
