import assert from 'node:assert/strict'
import { LAUNCH_APP_ID, launchEntities } from './launch-authority-runtime.mjs'

// Deliverable and milestone CSV merges through the emitted Worker's public doors: campaign code
// plus title identifies a record, key, owner, select and campaign errors name their CSV row and
// fence the whole file, and empty or whitespace-only cells never overwrite a stored value.
export async function childImportMergeJourney({ owner, people, call, command, envelope, upload, preview }) {
 const [reassigned, creator, planner] = people
 const read = async route => {
  const response = await call(route)
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return response.body
 }
 const create = async (action, fields) => {
  const response = await command(action, { fields })
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return response.body.data.value
 }
 const csv = lines => lines.join('\r\n') + '\r\n'
 const campaigns = [], deliverables = [], milestones = []
 for (const [index, code] of ['MRG-701', 'MRG-702'].entries()) {
  const campaign = await create('launch.campaign.create', { code, name: `Merge campaign ${index + 1}`, ownerId: owner, startDate: '2099-01-04', launchDate: '2099-12-20',
   objective: '', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} })
  campaigns.push(campaign)
  // The same titles exist under both campaigns, so only campaign code plus title can tell them apart.
  deliverables.push(await create('launch.deliverable.create', { campaignId: campaign.id, title: 'Launch brief', ownerId: owner, dueDate: `2099-02-0${index + 1}` }))
  const milestone = await create('launch.milestone.create', { campaignId: campaign.id, title: 'Beta review', ownerId: owner, type: ['Review', 'Event'][index],
   status: 'Not started', startDate: `2099-0${index + 4}-01`, endDate: `2099-0${index + 4}-03`, conflictReason: `Stored note ${index + 1}` })
  // A stored status unlike the create default shows that blank cells keep it rather than resetting it.
  const moved = await command('launch.milestone.patch', { id: milestone.id, changes: { status: ['On track', 'Watch'][index] } },
   [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.milestone, recordId: milestone.id }, version: milestone.version }])
  assert.equal(moved.status, 200, JSON.stringify(moved.body))
  milestones.push(milestone)
 }
 const snapshot = async () => ({
  campaigns: await Promise.all(campaigns.map(campaign => read(`/api/campaigns/${campaign.id}`))),
  milestones: await Promise.all(milestones.map(async milestone => (await read(`/api/milestones/${milestone.id}`)).milestone)),
 })
 const stored = await snapshot()
 const storedDeliverables = stored.campaigns.map(detail => detail.deliverables.find(row => row.title === 'Launch brief'))
 assert.deepEqual(storedDeliverables.map(row => [row.id, row.owner.id, row.dueDate]), deliverables.map((row, index) => [row.id, owner, `2099-02-0${index + 1}`]))
 assert.deepEqual(stored.milestones.map(row => [row.owner.id, row.type, row.status, row.startDate, row.endDate, row.conflictReason]),
  [[owner, 'Review', 'On track', '2099-04-01', '2099-04-03', 'Stored note 1'], [owner, 'Event', 'Watch', '2099-05-01', '2099-05-03', 'Stored note 2']])

 const refused = async (kind, filename, text, mapping, errors, valid) => {
  const before = await snapshot()
  const response = await preview(kind, await upload(filename, text), mapping)
  assert.equal(response.status, 200, JSON.stringify(response.body))
  const result = response.body.data.value
  assert.equal(result.state, 'invalid')
  assert.deepEqual(result.errors.map(error => error.row), errors.map(([row]) => row), 'Every invalid row is named by its physical CSV row')
  for (const [index, [, message]] of errors.entries()) assert.match(result.errors[index].message, message)
  const rows = (await read(`/api/v1/launch/imports/${result.id}/rows`)).data
  assert.deepEqual(rows.errors, result.errors)
  assert.deepEqual(rows.rows.map(row => [row.row, row.operation, row.id]), valid, 'Valid rows still resolve to their own campaign code and title')
  const confirmed = await call(`/api/v1/launch/imports/${result.id}/commit`, { method: 'POST', body: envelope({ token: result.token }) })
  assert.equal(confirmed.status, 400, JSON.stringify(confirmed.body))
  assert.match(confirmed.body.error.message, /Every row must be valid/)
  assert.deepEqual(await snapshot(), before, 'A refused file changes no campaign, deliverable, milestone or activity')
 }
 const deliverableColumns = { Campaign: 'campaignCode', Title: 'title', Owner: 'ownerId', Due: 'dueDate' }
 const milestoneColumns = { Campaign: 'campaignCode', Title: 'title', Owner: 'ownerId', Type: 'type', Status: 'status', Start: 'startDate', End: 'endDate', Reason: 'conflictReason' }

 // A repeated key, an unknown owner and a campaign outside the workspace are row errors; the
 // same title under the other campaign is a different key and stays a valid update.
 await refused('deliverable', 'deliverable-errors.csv', csv([
  'Campaign,Title,Owner,Due', `MRG-701,Launch brief,${reassigned.name},2099-02-11`, ` mrg-701 ,Launch brief,${creator.name},`,
  `MRG-702,Launch brief,${creator.name},`, 'MRG-701,Press kit,Unknown Person,2099-02-20', `NOPE-9,Launch brief,${reassigned.name},`,
 ]), deliverableColumns, [[3, /^Duplicate merge key$/], [5, /^Owner Unknown Person does not identify one current operator$/], [6, /^Referenced campaign must already exist$/]],
 [[2, 'update', deliverables[0].id], [4, 'update', deliverables[1].id]])
 await refused('milestone', 'milestone-errors.csv', csv([
  'Campaign,Title,Owner,Type,Status,Start,End,Reason', `MRG-701,Beta review,${reassigned.name},Approval,,,,`, 'MRG-701, Beta review ,,Launch,,,,',
  'MRG-702,Beta review,,Party,,,,', 'MRG-702,Kickoff,Unknown Person,Launch,,2099-07-01,,', `NOPE-9,Kickoff,${reassigned.name},Launch,,2099-07-01,,`,
 ]), milestoneColumns, [[3, /^Duplicate merge key$/], [4, /^type: .*Launch/], [5, /^Owner Unknown Person does not identify one current operator$/], [6, /^Referenced campaign must already exist$/]],
 [[2, 'update', milestones[0].id]])

 const merge = async (kind, filename, text, mapping, counts, expected) => {
  const response = await preview(kind, await upload(filename, text), mapping)
  assert.equal(response.status, 200, JSON.stringify(response.body))
  const result = response.body.data.value
  assert.deepEqual([result.state, result.creates, result.updates, result.unchanged, result.errors], ['valid', ...counts, 0, []])
  const rows = (await read(`/api/v1/launch/imports/${result.id}/rows`)).data.rows
  assert.deepEqual(rows.map(row => [row.row, row.operation, row.operation === 'update' ? row.id : null, row.changes]), expected, 'The preview proposes only real changes, never a blank overwrite')
  const confirmed = await call(`/api/v1/launch/imports/${result.id}/commit`, { method: 'POST', body: envelope({ token: result.token }) })
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body))
  assert.deepEqual(confirmed.body.data.value, { id: result.id, rows: rows.length })
  return rows
 }
 const ownerName = storedDeliverables[0].owner.name
 const deliverableRows = await merge('deliverable', 'deliverables.csv', csv([
  'Campaign,Title,Owner,Due', ` mrg-701 ,Launch brief,${reassigned.name},`, 'MRG-702,Launch brief, \t ,2099-03-01',
  `MRG-701,Press kit,${creator.name},2099-02-20`, `MRG-702,Press kit,${creator.name}, `,
 ]), deliverableColumns, [2, 2], [
  [2, 'update', deliverables[0].id, [{ field: 'ownerId', before: ownerName, after: reassigned.name }]],
  [3, 'update', deliverables[1].id, [{ field: 'dueDate', before: '2099-02-02', after: '2099-03-01' }]],
  [4, 'create', null, []], [5, 'create', null, []],
 ])
 const shown = row => ({ id: row.id, title: row.title, owner: row.owner.id, dueDate: row.dueDate, state: row.state, version: row.version })
 const listed = async index => (await read(`/api/campaigns/${campaigns[index].id}`)).deliverables.map(shown).sort((a, b) => a.title.localeCompare(b.title))
 assert.deepEqual(await listed(0), [
  { ...shown(storedDeliverables[0]), owner: reassigned.id, version: storedDeliverables[0].version + 1 },
  { id: deliverableRows[2].id, title: 'Press kit', owner: creator.id, dueDate: '2099-02-20', state: 'Open', version: 1 },
 ], 'The keyed update changes its owner and keeps the due date its empty cell left blank; the new row is created once')
 assert.deepEqual(await listed(1), [
  { ...shown(storedDeliverables[1]), dueDate: '2099-03-01', version: storedDeliverables[1].version + 1 },
  { id: deliverableRows[3].id, title: 'Press kit', owner: creator.id, dueDate: null, state: 'Open', version: 1 },
 ], 'The whitespace-only owner cell keeps the stored owner; the same title under this campaign is its own record')

 const milestoneRows = await merge('milestone', 'milestones.csv', csv([
  'Campaign,Title,Owner,Type,Status,Start,End,Reason', 'MRG-701,Beta review,,Approval,,,,',
  'mrg-702 ,Beta review, \t , , \t ,2099-05-02, , \t ', `MRG-701,Launch day,${planner.name},Launch,,2099-06-01,,`,
 ]), milestoneColumns, [1, 2], [
  [2, 'update', milestones[0].id, [{ field: 'type', before: 'Review', after: 'Approval' }]],
  [3, 'update', milestones[1].id, [{ field: 'startDate', before: '2099-05-01', after: '2099-05-02' }]],
  [4, 'create', null, []],
 ])
 const merged = await snapshot()
 assert.deepEqual(merged.milestones[0], { ...stored.milestones[0], type: 'Approval', version: stored.milestones[0].version + 1 }, 'Empty cells keep the owner, status, dates and conflict reason')
 assert.deepEqual(merged.milestones[1], { ...stored.milestones[1], startDate: '2099-05-02', version: stored.milestones[1].version + 1 }, 'Whitespace-only cells keep the owner, type, status, end date and conflict reason')
 const created = (await read(`/api/milestones/${milestoneRows[2].id}`)).milestone
 assert.deepEqual([created.campaign.id, created.title, created.owner.id, created.type, created.status, created.startDate, created.endDate, created.conflictReason, created.version],
  [campaigns[0].id, 'Launch day', planner.id, 'Launch', 'Not started', '2099-06-01', null, null, 1])
 assert.deepEqual(merged.campaigns.map(detail => detail.milestones.map(row => row.title).sort()), [['Beta review', 'Launch day'], ['Beta review']], 'Each keyed row created or updated exactly one milestone')
}
