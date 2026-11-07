import assert from 'node:assert/strict'
import { createUlid, LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'

/** Search real adopted tables and retained Launch records through the emitted Worker. */
export async function searchValuesJourney(h) {
  const send = async (route, body) => {
    const response = await h.request(h.ownerSession, route, { method: 'POST', body: JSON.stringify(body) })
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
    return result.data
  }
  const command = async (action, input, expected = []) => (await send(`/api/v1/commands/${action}`, { commandId: createUlid(), input, expected })).value
  const search = async (q, archived) => {
    const response = await h.request(h.ownerSession, '/api/search?' + new URLSearchParams({ q, ...(archived === undefined ? {} : { archived }) }))
    assert.equal(response.status, 200)
    return (await response.json()).items
  }
  const ids = rows => rows.map(row => row.id).sort()
  const table = label => {
    const entityId = createUlid(), titleId = createUlid(), urlId = createUlid(), selectId = createUlid(), optionId = createUlid()
    return { entityId, titleId, urlId, selectId, optionId, schema: { id: entityId, label, primaryFieldId: titleId, fields: [
      { id: titleId, label: 'Name', type: 'text', required: true, unique: false },
      { id: urlId, label: 'Reference URL', type: 'url', required: false, unique: false },
      { id: selectId, label: 'Stage', type: 'select', required: false, unique: false, options: [{ id: optionId, label: 'OrChId Meadow' }] },
    ] } }
  }
  const appId = createUlid(), notes = table('Dispatch notes'), shipments = table('Shipments')
  const preview = await send('/api/v1/records/schema-preview', { appId, name: 'Search dispatch', tables: [notes.schema, shipments.schema] })
  await command('release.adopt', { kind: 'manual_schema', previewId: preview.id })
  const create = (table, values) => command('record.create', { appId, entityId: table.entityId, values }, [{ ref: { appId, entityId: '00000000000000000000000001', recordId: table.entityId }, version: 1 }])

  // Expected matches are authored independently of the production tokenizer and option lookup.
  const text = await create(notes, { [notes.titleId]: 'Launch synthetic-cradle-101 CedarThicket dispatch' })
  const url = await create(notes, { [notes.titleId]: 'Launch synthetic-cradle-102 Reference', [notes.urlId]: 'https://catalog.invalid/BiRcHcAnOpY' })
  const select = await create(notes, { [notes.titleId]: 'Launch synthetic-cradle-103 Selection', [notes.selectId]: notes.optionId })
  const mixed = await create(notes, { [notes.titleId]: 'Launch synthetic-cradle-104 CedarThicket dispatch', [notes.urlId]: 'https://catalog.invalid/BiRcHcAnOpY', [notes.selectId]: notes.optionId })
  for (const [query, expected] of [
    ['cEdArTh', [text, mixed]],
    ['bIrChCa', [url, mixed]],
    ['oRcHiD meAd', [select, mixed]],
    ['CeDaRtHiCkEt', [text, mixed]],
    ['cedar birch orchid', [mixed]],
    ['edarth', []],
    [notes.optionId, []],
  ]) assert.deepEqual(ids(await search(query)), ids(expected), `Readable value token prefixes: ${query}`)
  console.log('PROBE VIEW-005 1 prefixes: adopted text, URL and select label queries -> exact independent record IDs; mixed case and multi-token matches pass, interior substring and stored option ID do not match')

  const crowded = [], otherTable = []
  for (let i = 0; i < 24; i++) crowded.push(await create(notes, { [notes.titleId]: `Launch synthetic-cradle-${200 + i} LiMiTpRoOf dispatch` }))
  for (let i = 0; i < 3; i++) otherTable.push(await create(shipments, { [shipments.titleId]: `Launch synthetic-cradle-${300 + i} LiMiTpRoOf shipment` }))
  const limited = await search('lImItPr')
  const noteHits = limited.filter(hit => hit.entityId === notes.entityId), shipmentHits = limited.filter(hit => hit.entityId === shipments.entityId)
  assert.equal(limited.length, 23, 'The per-table ceiling does not cap the entire base at twenty')
  assert.equal(noteHits.length, 20, 'Twenty of twenty-four matching rows are returned from one table')
  assert.equal(new Set(ids(noteHits)).size, 20, 'Every returned row is distinct')
  assert.ok(noteHits.every(hit => crowded.some(row => row.id === hit.id)), 'Only matching records are returned')
  assert.deepEqual(ids(shipmentHits), ids(otherTable), 'Another table retains all its matching records')
  for (const hit of [...await search('cedar birch orchid'), ...limited]) {
    assert.equal(hit.href, `/app/records/${appId}/${hit.entityId}/${hit.id}`)
    const detail = await h.request(h.ownerSession, `/api/v1/apps/${appId}/entities/${hit.entityId}/records/${hit.id}`)
    assert.equal(detail.status, 200)
    const record = (await detail.json()).data.record
    assert.equal(record.id, hit.id)
    const titleId = hit.entityId === notes.entityId ? notes.titleId : shipments.titleId
    assert.equal(record.fields[titleId].value, hit.name)
    const document = await h.request(h.ownerSession, hit.href)
    assert.equal(document.status, 200, 'The returned native detail link opens a real document')
    assert.ok((await document.text()).includes(hit.name), 'The detail document contains the matching record title')
  }
  console.log('PROBE VIEW-005 1 ceiling and links: 24 matching notes and 3 matching shipments -> 20 plus 3 distinct hits, with every returned native detail URL and record readback working')

  const commentBody = 'synthetic-cradle-400 MarIgOlDWhIsPeR comment only'
  await command('comment.add', { subject: text.ref, body: commentBody, mentions: [] }, [{ ref: text.ref, version: text.version }])
  const thread = await h.request(h.ownerSession, '/api/v1/comments?' + new URLSearchParams(text.ref))
  assert.equal(thread.status, 200)
  assert.ok(JSON.stringify((await thread.json()).data).includes(commentBody), 'The excluded text exists in a readable comment')
  assert.deepEqual(await search('mArIgOlDw'), [])
  assert.deepEqual(await search('mArIgOlDw', 'true'), [], 'Including archived records still excludes comments')
  assert.deepEqual(ids(await search('cedarth')), ids([text, mixed]), 'The commented record remains searchable by its own text')
  console.log('PROBE VIEW-005 4 comments: public comment creation and thread readback -> comment-only token yields no search hits in either archive mode; record text still matches')

  const launchRef = (kind, row) => [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities[kind], recordId: row.id }, version: row.version }]
  let campaign = await command('launch.campaign.create', { fields: { code: 'synthetic-cradle-401', name: 'Launch AmberHarbor dispatch', ownerId: h.owner, startDate: '2026-01-01', launchDate: '2026-12-01', objective: 'Confirm dispatch readiness', statusSummary: 'Prepare dispatch', phase: 'Planning', status: 'On track', health: 70, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} } })
  const deliverable = await command('launch.deliverable.create', { fields: { campaignId: campaign.id, title: 'AmberHarbor dispatch kit', ownerId: h.owner, dueDate: null } })
  assert.deepEqual(ids(await search('aMbErHaRb')), ids([campaign, deliverable]), 'Active Launch work matches before archiving')
  campaign = await command('launch.campaign.archive', { id: campaign.id }, launchRef('campaign', campaign))
  assert.ok(campaign.archivedAt)
  for (const flag of [undefined, 'false', '1']) assert.deepEqual(await search('aMbErHaRb', flag), [], 'Archived Launch work requires an explicit true opt-in')
  const archivedHits = await search('aMbErHaRb', 'true')
  assert.deepEqual(ids(archivedHits), ids([campaign, deliverable]))
  for (const hit of archivedHits) {
    assert.equal(hit.href, `/app/records/${LAUNCH_APP_ID}/${hit.entityId}/${hit.id}`)
    assert.equal((await h.request(h.ownerSession, hit.href)).status, 200)
  }
  console.log('PROBE VIEW-005 5 archive: public campaign archive -> campaign and child excluded by default, false and 1; exactly both return with archived=true and open their native detail links')
  return { appId, notes, shipments, text, url, select, mixed, crowded, otherTable, campaign, deliverable, archivedHits }
}
