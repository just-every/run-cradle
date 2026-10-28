import './helpers/typescript-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { launchAuthorityRuntime, LAUNCH_APP_ID, launchEntities, launchFieldIds, createUlid } from './helpers/launch-authority-runtime.mjs'
import { launchColumns, launchDescriptors, launchTables } from '../src/apps/launch/descriptors.server.ts'

const entityPath = kind => `/api/v1/apps/${LAUNCH_APP_ID}/entities/${launchEntities[kind]}`

/** A reusable installed-Worker harness: later template updates can add journeys
 * without changing either typed-field upgrade case. Historical metadata is a
 * fixture of the documented main-era layout, never loaded from Git history. */
export async function templateUpdateHarness() {
 const h = await launchAuthorityRuntime({}, { installationOwner: true })
 const request = async (route, input, status = 200) => {
  const response = await h.request(h.ownerSession, route, input === undefined ? {} : { method: 'POST', body: JSON.stringify(input) })
  assert.equal(response.status, status, await response.clone().text())
  return response.json()
 }
 const read = async (route, input) => (await request(route, input)).data
 const command = async (name, input, expected = []) => (await request(`/api/v1/commands/${name}`, { commandId: createUlid(), expected, input })).data.value
 const schemas = async () => Object.fromEntries(await Promise.all(Object.keys(launchEntities).map(async kind => [kind, await read(entityPath(kind))])))
 const storedSchemas = async () => (await h.db.prepare('SELECT * FROM record_schemas WHERE app_id=? ORDER BY id').bind(LAUNCH_APP_ID).all()).results
 const rows = async () => Object.fromEntries(await Promise.all(Object.entries(launchTables).map(async ([kind, table]) => [kind, (await h.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results])))
 const authority = async () => Object.fromEntries(await Promise.all(['authority_principals', 'authority_memberships', 'authority_policies'].map(async table => [table, (await h.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results])))
 const replaceSchema = async schema => h.db.prepare('UPDATE record_schemas SET schema_json=? WHERE app_id=? AND id=?').bind(JSON.stringify(schema), LAUNCH_APP_ID, schema.id).run()
 const installMainEraSchemas = async () => {
  const oldLabels = { health: 'Reported health (%)', budgetMinor: 'Budget (minor units)', spendMinor: 'Spend (minor units)' }
  for (const [kind, columns] of Object.entries(launchColumns)) {
   const schema = structuredClone(launchDescriptors.find(item => item.schema.id === launchEntities[kind]).schema)
   for (const name of Object.keys(columns)) {
    const field = schema.fields.find(item => item.id === launchFieldIds[kind][name])
    field.type = name.endsWith('Date') ? 'date' : name === 'enabled' ? 'boolean' : ['health', 'budgetMinor', 'spendMinor'].includes(name) ? 'number' : 'text'
    field.required = false
    if (oldLabels[name]) field.label = oldLabels[name]
    for (const key of ['options', 'relation', 'numberFormat']) delete field[key]
   }
   await replaceSchema(schema)
  }
 }
 const update = async () => {
  const sql = await readFile(new URL('../migrations/updates/9079_launch_typed_fields.sql', import.meta.url), 'utf8')
  await h.db.exec(sql.replace(/^--.*$/gm, '').replaceAll('\n', ' '))
 }
 return { ...h, get db() { return h.db }, rawRequest: h.request, read, request, command, schemas, storedSchemas, rows, authority, replaceSchema, installMainEraSchemas, update, restart: h.restart, close: h.close }
}

/** Exercise the Records API boundary with values admitted by Launch commands.
 * Retained tables remain read-only through Records; query predicates round-trip
 * the exact values returned by a single-record GET, rather than a local codec. */
async function assertTypedApiRoundTrips(h) {
 const campaign = await h.command('launch.campaign.create', { fields: {
  code: 'TYPED-API', name: 'Typed API round trips', ownerId: h.owner,
  startDate: '2026-10-01', launchDate: '2026-12-01', objective: 'Retained API semantics',
  statusSummary: 'Ready', phase: 'Planning', status: 'On track', health: 49,
  budgetMinor: 4823456, spendMinor: 12345, tags: [], customFields: {},
 } })
 const storedMilliseconds = Date.parse('2026-11-04T14:15:00.123Z')
 const decision = await h.command('launch.decision.create', { fields: {
  campaignId: campaign.id, riskId: null, supersedesId: null,
  title: 'Typed API decision', requesterId: h.owner, assigneeId: h.owner,
  priority: 'High', dueAt: new Date(storedMilliseconds).toISOString(),
  recommendation: 'Read and filter the same instant', impact: 'API compatibility',
 } })
 const storedCampaign = await h.db.prepare('SELECT health,status,owner_id,budget_minor FROM campaigns WHERE id=?').bind(campaign.id).first()
 assert.deepEqual(storedCampaign, { health: 49, status: 'On track', owner_id: h.owner, budget_minor: 4823456 }, 'The product command supplies the known retained values')
 const storedDecision = await h.db.prepare('SELECT campaign_id,due_at FROM decisions WHERE id=?').bind(decision.id).first()
 assert.equal(storedDecision.campaign_id, campaign.id)
 assert.equal(storedDecision.due_at, storedMilliseconds, 'Launch stores the supplied instant as integer milliseconds')
 assert.ok(Number.isInteger(storedDecision.due_at))
 const campaignRecord = (await h.read(entityPath('campaign') + '/records/' + campaign.id)).record
 const decisionRecord = (await h.read(entityPath('decision') + '/records/' + decision.id)).record
 const schema = await h.read(entityPath('campaign'))
 const status = schema.fields.find(field => field.id === launchFieldIds.campaign.status).options.find(option => option.label === storedCampaign.status)
 assert.ok(status, 'The schema supplies the label for the select identity')
 const cases = [
  ['percent', 'campaign', campaignRecord, launchFieldIds.campaign.health, '0.49'],
  ['single select', 'campaign', campaignRecord, launchFieldIds.campaign.status, status.id],
  ['relation', 'decision', decisionRecord, launchFieldIds.decision.campaignId, { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: campaign.id }],
  ['person', 'campaign', campaignRecord, launchFieldIds.campaign.ownerId, h.owner],
  ['money', 'campaign', campaignRecord, launchFieldIds.campaign.budgetMinor, { minor: '4823456', currency: 'USD', scale: 2 }],
  ['Due at', 'decision', decisionRecord, launchFieldIds.decision.dueAt, new Date(storedDecision.due_at).toISOString()],
 ]
 for (const [type, kind, record, fieldId, expected] of cases) {
  assert.deepEqual(record.fields[fieldId], { state: 'value', value: expected }, `${type}: the single-record GET returns the typed API value`)
  const value = record.fields[fieldId].value
  const result = await h.read(entityPath(kind) + '/query', { filter: { kind: 'condition', fieldId, op: 'eq', value } })
  assert.ok(result.items.some(row => row.id === record.id), `${type}: filtering with the GET value returns the same row id`)
  assert.equal(record.allowedActions.find(action => action.action === 'record.patch')?.enabled, false, 'The typed API boundary does not open retained writes')
 }
}

async function assertBoard(h, schema, records) {
 const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, headless: true, args: ['--no-sandbox'] })
 try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addCookies([{ name: h.ownerSession.cookie.split('=')[0], value: h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=') + 1), url: h.origin }])
  const page = await context.newPage()
  await page.goto(`${h.origin}/app/records/${LAUNCH_APP_ID}/${launchEntities.campaign}`)
  await page.getByRole('navigation', { name: 'Record views', exact: true }).getByRole('link', { name: 'Board', exact: true }).click()
  const status = schema.fields.find(field => field.id === launchFieldIds.campaign.status)
  assert.equal(await page.getByLabel('Board columns', { exact: true }).inputValue(), status.id, 'The default Board groups campaigns by Status')
  await page.locator('.cr-board').waitFor()
  assert.equal(await page.locator('[data-board-column]').count(), status.options.length + 1, 'Every Status option has a column, alongside the empty destination')
  for (const option of status.options) {
   const column = page.locator(`[data-board-column="${option.id}"]`)
   assert.equal(await column.count(), 1)
   const expected = records.filter(record => record.fields[status.id].value === option.id).map(record => record.id).sort()
   assert.deepEqual((await column.locator('article[data-record-id]').evaluateAll(nodes => nodes.map(node => node.dataset.recordId))).sort(), expected, 'Cards stay in the column matching their normalized choice')
  }
  await context.close()
 } finally { await browser.close() }
}

test('[RECORDS-001 FIELD-001 VIEW-004] a populated Launch upgrade preserves records and authority while typing fields, retaining stray choices and guarding owner edits', async () => {
 const h = await templateUpdateHarness()
 try {
  await h.command('launch.samples.install', {})
  const [campaign, emptyChoiceCampaign] = (await h.request('/api/campaigns')).items
  assert.ok(emptyChoiceCampaign, 'The upgrade fixture holds a second campaign for an empty historical choice')
  // The launch command intentionally refuses choices outside its domain. This
  // historical stored-value fixture models a value retained from an older owner.
  await h.request('/api/v1/commands/launch.campaign.patch', { commandId: createUlid(), expected: [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: campaign.id }, version: campaign.version }], input: { id: campaign.id, changes: { status: 'External review' } } }, 400)
  await h.db.prepare('UPDATE campaigns SET status=? WHERE id=?').bind('External review', campaign.id).run()
  await h.db.prepare('UPDATE campaigns SET status=? WHERE id=?').bind('', emptyChoiceCampaign.id).run()
  await h.installMainEraSchemas()
  const beforeRows = await h.rows(), beforeAuthority = await h.authority(), beforeSchemas = await h.storedSchemas()
  await h.update()
  const afterSchemas = await h.storedSchemas()
  assert.deepEqual(await h.rows(), beforeRows, 'Every retained column and record version remains unchanged')
  assert.deepEqual(await h.authority(), beforeAuthority, 'Typing fields grants no authority and changes no memberships')
  for (const before of beforeSchemas) {
   const after = afterSchemas.find(row => row.id === before.id)
   assert.deepEqual({ ...after, schema_json: undefined }, { ...before, schema_json: undefined }, 'Schema identity, revision and metadata remain stable')
   assert.equal(JSON.parse(after.schema_json).primaryFieldId, JSON.parse(before.schema_json).primaryFieldId)
  }
  await h.update()
  assert.deepEqual(await h.storedSchemas(), afterSchemas, 'Reapplying the update leaves stored schemas byte-identical')
  await h.restart()
  const schema = await h.read(entityPath('campaign')), fields = Object.fromEntries(schema.fields.map(field => [field.id, field]))
  assert.equal(fields[launchFieldIds.campaign.ownerId].type, 'person')
  assert.equal(fields[launchFieldIds.campaign.budgetMinor].type, 'money')
  assert.equal(fields[launchFieldIds.campaign.spendMinor].type, 'money')
  assert.equal(fields[launchFieldIds.campaign.health].numberFormat, 'percent')
  for (const name of ['name', 'ownerId', 'launchDate']) assert.equal(fields[launchFieldIds.campaign[name]].required, true)
  const query = await h.read(entityPath('campaign') + '/query', {})
  const records = query.items
  for (const stored of beforeRows.campaign) {
   const record = records.find(row => row.id === stored.id)
   assert.ok(record, 'Every retained campaign remains readable')
   assert.equal(record.version, stored.version)
   assert.equal(record.fields[launchFieldIds.campaign.ownerId].value, stored.owner_id)
   assert.deepEqual(record.fields[launchFieldIds.campaign.budgetMinor].value, { minor: String(stored.budget_minor), currency: 'USD', scale: 2 })
   assert.deepEqual(record.fields[launchFieldIds.campaign.spendMinor].value, { minor: String(stored.spend_minor), currency: 'USD', scale: 2 })
   assert.equal(Number(record.fields[launchFieldIds.campaign.health].value), stored.health / 100)
   const choice = fields[launchFieldIds.campaign.status].options.find(option => option.id === record.fields[launchFieldIds.campaign.status].value)
   assert.equal(choice?.retainedValue ?? choice?.label, stored.status)
   assert.equal(record.allowedActions.find(action => action.action === 'record.patch')?.enabled, false, 'Retained writes stay protected for the record round')
  }
  const emptyOption = fields[launchFieldIds.campaign.status].options.find(option => option.retainedValue === '')
  assert.ok(emptyOption && emptyOption.label.trim().length > 0, 'An empty historical choice has a visible option label and keeps its exact stored value')
  assert.equal(records.find(record => record.id === emptyChoiceCampaign.id).fields[launchFieldIds.campaign.status].value, emptyOption.id, 'An empty stored value decodes to its option identity instead of a blank cell')
  const status = fields[launchFieldIds.campaign.status], onTrack = status.options.find(option => option.label === 'On track')
  const ids = rows => rows.map(row => row.id).sort()
  const filtered = async filter => ids((await h.read(entityPath('campaign') + '/query', { filter })).items)
  const condition = (fieldId, op, value) => ({ kind: 'condition', fieldId, op, value })
  const expectedStatus = beforeRows.campaign.filter(row => row.status === 'On track').map(row => row.id).sort()
  assert.deepEqual(await filtered(condition(status.id, 'in', [onTrack.id])), expectedStatus, 'Choice IDs filter the retained stored text')
  assert.deepEqual(await filtered(condition(status.id, 'in', ['On track'])), expectedStatus, 'Historical saved choice text keeps matching the same records')
  for (const option of status.options) assert.deepEqual(await filtered(condition(status.id, 'eq', option.id)), beforeRows.campaign.filter(row => row.status === (option.retainedValue ?? option.label)).map(row => row.id).sort(), 'Retained choices, including empty and stray values, bind without changing storage')
  assert.deepEqual(await filtered(condition(launchFieldIds.campaign.health, 'before', '0.70')), beforeRows.campaign.filter(row => row.health < 70).map(row => row.id).sort(), 'Fractional health filters bind stored hundredths')
  const budget = beforeRows.campaign[0].budget_minor
  assert.deepEqual(await filtered(condition(launchFieldIds.campaign.budgetMinor, 'eq', { minor: String(budget), currency: 'USD', scale: 2 })), beforeRows.campaign.filter(row => row.budget_minor === budget).map(row => row.id).sort(), 'Fixed-currency money filters bind minor units')
  const invalid = await h.request(entityPath('campaign') + '/query', { filter: condition(status.id, 'eq', createUlid()) }, 400)
  assert.equal(invalid.error.code, 'validation', 'An option without a stored mapping is refused rather than returning no matches')
  for (const kind of ['deliverable', 'milestone']) {
   const rows = beforeRows[kind], parent = rows[0]?.campaign_id
   if (!parent) continue
   const lifecycle = kind === 'deliverable' ? 'state' : 'status', field = (await h.read(entityPath(kind))).fields.find(field => field.id === launchFieldIds[kind][lifecycle]), label = rows[0][lifecycle]
   const result = await h.read(entityPath(kind) + '/query', { filter: { kind: 'all', conditions: [condition(launchFieldIds[kind].campaignId, 'eq', { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: parent }), condition(field.id, 'eq', label)] } })
   assert.deepEqual(ids(result.items), rows.filter(row => row.campaign_id === parent && row[lifecycle] === label).map(row => row.id).sort(), 'A relation filter and historical choice text also work in evaluated queries')
  }
  const csv = await h.read('/api/v1/records/export-csv', { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, query: { fields: [launchFieldIds.campaign.code, launchFieldIds.campaign.name, status.id] } })
  const { parseCsv } = await import('../src/domains/portability/csv.ts')
  const exported = parseCsv(new TextEncoder().encode(csv.csv))
  for (const row of beforeRows.campaign) assert.equal(exported.rows.find(value => value[0] === row.code)?.[2], status.options.find(option => (option.retainedValue ?? option.label) === row.status).label, 'Campaign CSV exports the same choice label shown by the renderer')
  const decisions = (await h.read(entityPath('decision') + '/query', {})).items
  const due = beforeRows.decision.find(row => row.due_at !== null)?.due_at
  if (due !== undefined) {
   const boundary = due - 1, result = await h.read(entityPath('decision') + '/query', { filter: condition(launchFieldIds.decision.dueAt, 'after', new Date(boundary).toISOString()) })
   assert.deepEqual(ids(result.items), beforeRows.decision.filter(row => row.due_at !== null && row.due_at > boundary).map(row => row.id).sort(), 'Canonical instant filters bind the retained millisecond timestamp')
  }
  for (const stored of beforeRows.decision) {
   const record = decisions.find(row => row.id === stored.id)
   assert.ok(record, 'Every retained decision remains readable')
   assert.equal(record.fields[launchFieldIds.decision.dueAt].value, stored.due_at === null ? null : new Date(stored.due_at).toISOString(), 'The records API exposes a canonical instant while preserving the stored epoch')
   assert.deepEqual(record.fields[launchFieldIds.decision.campaignId].value, { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: stored.campaign_id }, 'A retained bare link decodes to its canonical record reference')
  }
  await assertBoard(h, schema, records)
  const reviews = await h.request(`/api/v1/records/bases/${LAUNCH_APP_ID}/reviews`, undefined, 403)
  assert.equal(Object.hasOwn(reviews, 'data'), false, 'A retained template does not acquire manual-base management authority')
  assert.equal((await h.db.prepare("SELECT COUNT(*) n FROM manual_record_previews WHERE app_id=? AND state='prepared'").bind(LAUNCH_APP_ID).first()).n, 0, 'The metadata-only update creates no review to dismiss')

  // Recreate old metadata with one field already changed by the owner. Only the
  // old-type fields are eligible; a guarded update cannot overwrite that edit.
  await h.installMainEraSchemas()
  const edited = JSON.parse((await h.storedSchemas()).find(row => row.id === launchEntities.campaign).schema_json)
  const owner = edited.fields.find(field => field.id === launchFieldIds.campaign.ownerId)
  owner.type = 'url'
  await h.replaceSchema(edited)
  await h.update()
  const guarded = JSON.parse((await h.storedSchemas()).find(row => row.id === edited.id).schema_json)
  assert.deepEqual(guarded.fields.find(field => field.id === owner.id), owner, 'The owner-edited field is left exactly as it was')
 } finally { await h.close() }
})

test('[RECORDS-001 FIELD-001 API-USER-002] fresh Launch metadata matches an upgrade, typed API values round-trip through query, and unrelated drift is refused', async () => {
 const h = await templateUpdateHarness()
 try {
  const fresh = await h.schemas()
  await h.command('launch.samples.install', {})
  await h.installMainEraSchemas()
  await h.update()
  await h.restart()
  assert.deepEqual(await h.schemas(), fresh, 'Fresh and upgraded entities expose the same typed schema through every entity API')
  await assertTypedApiRoundTrips(h)

  const rows = await h.storedSchemas(), original = rows.find(row => row.id === launchEntities.campaign), drift = JSON.parse(original.schema_json)
  drift.fields.find(field => field.id === launchFieldIds.campaign.name).required = false
  await h.replaceSchema(drift)
  await h.restart()
  const refused = await h.rawRequest(h.ownerSession, entityPath('campaign'))
  assert.ok(refused.status >= 400, 'An unrelated source/stored difference is refused')
  await h.db.prepare('UPDATE record_schemas SET schema_json=? WHERE app_id=? AND id=?').bind(original.schema_json, LAUNCH_APP_ID, original.id).run()
  await h.restart()
  await h.read(entityPath('campaign'))

  const native = { appId: createUlid(), name: 'Native choices', tables: [{ id: createUlid(), label: 'Choices', fields: [{ id: createUlid(), label: 'Name', type: 'text', required: true, unique: false }, { id: createUlid(), label: 'Status', type: 'select', required: false, unique: false, options: [{ id: createUlid(), label: 'Review' }] }] }] }
  await h.request('/api/v1/records/schema-preview', native)
  native.tables[0].fields[1].options[0].retainedValue = 'stored-review'
  await h.request('/api/v1/records/schema-preview', native, 400)
 } finally { await h.close() }
})
