import assert from 'node:assert/strict'
import { createUlid } from './launch-authority-runtime.mjs'
import { parseCsv } from '../../src/domains/portability/csv.ts'

// One authenticated emitted-Worker journey shares independently authored data
// across reads, history, search, calculations, scoped CSV and refusal payloads.
export async function currentPolicyPrivacyJourney(h) {
  async function call(session, path, input, status = 200) {
    const response = await h.request(session, path, input === undefined ? {} : { method: 'POST', body: JSON.stringify(input) })
    const body = await response.json()
    assert.equal(response.status, status, `${path}: ${JSON.stringify(body)}`)
    return status === 200 ? body.data ?? body : body.error
  }
  const owner = (path, input, status) => call(h.ownerSession, path, input, status)
  const field = (label, type = 'text', extra = {}) => ({ id: createUlid(), label, type, required: false, unique: false, ...extra })
  const appId = createUlid(), itemId = createUlid(), projectId = createUlid()
  const name = field('Name'), secret = field('Private note'), amount = field('Private amount', 'number'), visible = field('Shared', 'boolean')
  const copy = field('Private caption', 'computed', { readOnly: true, resultType: 'text', expression: { kind: 'field', fieldId: secret.id } })
  const ratio = field('Private ratio', 'computed', { readOnly: true, resultType: 'number', expression: { kind: 'call', fn: 'divide', args: [{ kind: 'literal', value: '40', valueType: 'number' }, { kind: 'field', fieldId: amount.id }] } })
  const publicCaption = field('Public caption', 'computed', { readOnly: true, resultType: 'text', expression: { kind: 'call', fn: 'upper', args: [{ kind: 'field', fieldId: name.id }] } })
  const projectName = field('Project'), items = field('Items', 'relation', { relation: { ownerAppId: appId, entityId: itemId, cardinality: 'many', onDelete: 'restrict' } })
  const lookup = source => field(`Linked ${source.label}`, 'computed', { readOnly: true, resultType: 'array', resultElementType: 'text', expression: { kind: 'rollup', aggregate: 'lookup', relationFieldId: items.id, valueFieldId: source.id } })
  const privateLookup = lookup(secret), publicLookup = lookup(name)
  const draft = { appId, name: 'Current policy privacy', tables: [
    { id: itemId, label: 'Items', primaryFieldId: name.id, fields: [name, secret, amount, visible, copy, ratio, publicCaption] },
    { id: projectId, label: 'Projects', primaryFieldId: projectName.id, fields: [projectName, items, privateLookup, publicLookup] },
  ] }
  const preview = await owner('/api/v1/records/schema-preview', draft)
  await owner('/api/v1/commands/release.adopt', { commandId: createUlid(), expected: [], input: { kind: 'manual_schema', previewId: preview.id } })
  async function add(entityId, values) {
    return (await owner('/api/v1/commands/record.create', { commandId: createUlid(), expected: [{ ref: { appId, entityId: '00000000000000000000000001', recordId: entityId }, version: 1 }], input: { appId, entityId, values } })).value
  }
  const sharedTitle = 'synthetic-cradle-190-shared', hiddenTitle = 'synthetic-cradle-190-hidden'
  const sharedCaption = 'SYNTHETIC-CRADLE-190-SHARED'
  const sharedSecret = 'synthetic-cradle-190-private-a', hiddenSecret = 'synthetic-cradle-190-private-b'
  const shared = await add(itemId, { [name.id]: sharedTitle, [secret.id]: sharedSecret, [amount.id]: '5', [visible.id]: true })
  const hidden = await add(itemId, { [name.id]: hiddenTitle, [secret.id]: hiddenSecret, [amount.id]: '10', [visible.id]: false })
  const project = await add(projectId, { [projectName.id]: 'synthetic-cradle-190-project', [items.id]: [shared.ref, hidden.ref] })
  const person = await h.addPerson({ appId })
  const stored = await h.db.prepare('SELECT p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=?').bind(h.owner, appId).first()
  const rules = JSON.parse(stored.rules_json).map(rule => ({ ...rule, principals: [{ id: person.id, kind: 'human' }], actions: [], writableFields: [] }))
  // Exercise the same current-policy fence as existing authority journeys; the
  // records and adopted schemas above are all written through native HTTP doors.
  async function policy(next) {
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(next), person.policyId).run()
  }
  await policy(rules)
  const read = (path, input, status) => call(person.session, path, input, status)
  const entity = id => `/api/v1/apps/${appId}/entities/${id}`
  const record = row => `${entity(row.ref.entityId)}/records/${row.id}`
  const history = row => `/api/v1/history?appId=${appId}&entityId=${row.ref.entityId}&recordId=${row.id}`
  const search = term => `/api/search?q=${encodeURIComponent(term)}&archived=true`
  const csvInput = (entityId, fields) => ({ appId, entityId, query: { fields } })
  const csvRows = result => parseCsv(new TextEncoder().encode(result.csv)).rows
  const absent = (value, needles) => { for (const needle of needles) assert.ok(!JSON.stringify(value).includes(needle), `Private content escaped: ${needle}`) }
  const cell = (row, f, value) => assert.deepEqual(row.fields[f.id], { state: 'value', value })
  const redacted = (row, f) => assert.deepEqual(row.fields[f.id], { state: 'redacted', reason: 'policy' })

  const initial = await read(`${entity(itemId)}/query`, {})
  assert.deepEqual(new Set(initial.items.map(row => row.id)), new Set([shared.id, hidden.id]))
  const initialShared = initial.items.find(row => row.id === shared.id)
  cell(initialShared, copy, sharedSecret); cell(initialShared, ratio, '8')
  const initialProject = (await read(record(project))).record
  cell(initialProject, items, [shared.ref, hidden.ref])
  cell(initialProject, privateLookup, [sharedSecret, hiddenSecret])
  cell(initialProject, publicLookup, [sharedTitle, hiddenTitle])
  assert.ok(JSON.stringify(await read(history(shared))).includes(sharedSecret), 'Nonempty history exposes the authorized value before narrowing')
  assert.ok(JSON.stringify(await read(history(project))).includes(hidden.id), 'Link history contains the original two-record relation')
  assert.deepEqual((await read(search(hiddenTitle))).items.map(hit => hit.id), [hidden.id])
  assert.deepEqual(csvRows(await read('/api/v1/records/export-csv', csvInput(itemId, [name.id, copy.id, ratio.id]))).sort(), [[sharedTitle, sharedSecret, '8'], [hiddenTitle, hiddenSecret, '4']].sort())

  const rowsOnly = rules.map(rule => rule.entityId === itemId ? { ...rule, rows: { kind: 'condition', fieldId: visible.id, op: 'eq', value: true } } : rule)
  await policy(rowsOnly)
  const rowScoped = await read(`${entity(itemId)}/query`, {})
  assert.deepEqual(rowScoped.items.map(row => row.id), [shared.id])
  cell(rowScoped.items[0], copy, sharedSecret)
  const linked = await read(record(project))
  cell(linked.record, items, [shared.ref]); cell(linked.record, privateLookup, [sharedSecret]); cell(linked.record, publicLookup, [sharedTitle])
  absent(linked, [hidden.id, hiddenTitle, hiddenSecret])
  const linkHistory = await read(history(project))
  assert.ok(linkHistory.items.length > 0)
  absent(linkHistory, [hidden.id, hiddenTitle, hiddenSecret])
  assert.ok(JSON.stringify(linkHistory).includes(shared.id))
  assert.deepEqual((await read(search(hiddenTitle))).items, [])
  assert.deepEqual(csvRows(await read('/api/v1/records/export-csv', csvInput(itemId, [name.id, copy.id, ratio.id]))), [[sharedTitle, sharedSecret, '8']])
  await read(record(hidden), undefined, 404)
  await read(history(hidden), undefined, 403)

  await policy(rowsOnly.map(rule => rule.entityId === itemId ? { ...rule, readableFields: rule.readableFields.filter(id => ![secret.id, amount.id].includes(id)) } : rule))
  const masked = await read(`${entity(itemId)}/query`, {})
  assert.deepEqual(masked.items.map(row => row.id), [shared.id])
  for (const f of [secret, amount, copy, ratio]) redacted(masked.items[0], f)
  cell(masked.items[0], publicCaption, sharedCaption)
  const maskedDetail = await read(record(shared)), maskedProject = await read(record(project))
  redacted(maskedDetail.record, copy); redacted(maskedProject.record, privateLookup)
  cell(maskedProject.record, publicLookup, [sharedTitle]); cell(maskedProject.record, items, [shared.ref])
  const maskedHistory = await read(history(shared))
  assert.ok(maskedHistory.items.length > 0)
  assert.ok(maskedHistory.items.flatMap(entry => entry.changes).every(change => ![secret.id, amount.id].includes(change.fieldId)))
  assert.ok(JSON.stringify(maskedHistory).includes(sharedTitle))
  const metadata = await read(entity(itemId)), linkedMetadata = await read(entity(projectId))
  assert.ok(!metadata.fields.some(f => [secret.id, amount.id].includes(f.id)))
  for (const f of [copy, ratio]) assert.equal(Object.hasOwn(metadata.fields.find(item => item.id === f.id), 'expression'), false)
  assert.ok(metadata.fields.find(f => f.id === publicCaption.id).expression)
  assert.equal(Object.hasOwn(linkedMetadata.fields.find(f => f.id === privateLookup.id), 'expression'), false)
  assert.ok(linkedMetadata.fields.find(f => f.id === publicLookup.id).expression)
  absent([metadata, linkedMetadata], [secret.id, amount.id])
  const authorizedCsv = csvRows(await read('/api/v1/records/export-csv', csvInput(itemId, [name.id, publicCaption.id])))
  assert.deepEqual(authorizedCsv, [[sharedTitle, sharedCaption]])
  assert.deepEqual(csvRows(await read('/api/v1/records/export-csv', csvInput(projectId, [projectName.id, publicLookup.id]))), [['synthetic-cradle-190-project', JSON.stringify([sharedTitle])]])
  assert.deepEqual((await read(search(sharedTitle))).items.map(hit => hit.id), [shared.id])
  assert.deepEqual((await read(search(sharedSecret))).items, [])
  absent([masked, maskedDetail, maskedProject, maskedHistory, authorizedCsv], [sharedSecret, hiddenSecret, hidden.id, hiddenTitle])

  async function refusals() {
    const results = []
    for (const [path, input, status] of [
      [record(hidden), undefined, 404], [history(hidden), undefined, 403],
      [`${entity(itemId)}/query`, { fields: [secret.id] }, 403],
      [`${entity(itemId)}/query`, { filter: { kind: 'condition', fieldId: amount.id, op: 'eq', value: '5' } }, 403],
      ['/api/v1/records/export-csv', csvInput(itemId, [secret.id]), 403],
      ['/api/v1/records/export-csv', csvInput(itemId, [ratio.id]), 403],
      ['/api/v1/records/export-csv', csvInput(projectId, [privateLookup.id]), 403],
    ]) {
      const error = await read(path, input, status)
      absent(error, [sharedSecret, hiddenSecret, hiddenTitle, 'Division by zero'])
      const { requestId, ...stable } = error
      results.push(stable)
    }
    return results
  }
  const before = await refusals()
  // Identical forbidden requests cannot reveal a private error canary. Owner
  // readback proves the inputs really changed, including successful and failing
  // scalar evaluation; public-only projections remain independently correct.
  let current = shared, hiddenCurrent = hidden
  for (const [privateValue, privateNumber, expectedRatio] of [
    ['synthetic-cradle-190-private-zero', '0', null],
    ['synthetic-cradle-190-private-eight', '8', '5'],
  ]) {
    current = (await owner('/api/v1/commands/record.patch', { commandId: createUlid(), expected: [{ ref: current.ref, version: current.version }], input: { ref: current.ref, changes: { [secret.id]: privateValue, [amount.id]: privateNumber } } })).value
    hiddenCurrent = (await owner('/api/v1/commands/record.patch', { commandId: createUlid(), expected: [{ ref: hiddenCurrent.ref, version: hiddenCurrent.version }], input: { ref: hiddenCurrent.ref, changes: { [secret.id]: `${privateValue}-hidden`, [amount.id]: privateNumber } } })).value
    const control = (await owner(record(shared))).record
    cell(control, secret, privateValue); cell(control, copy, privateValue)
    if (expectedRatio === null) { assert.equal(control.fields[ratio.id].state, 'unavailable'); assert.match(control.fields[ratio.id].message, /Division by zero/) }
    else cell(control, ratio, expectedRatio)
    cell((await owner(record(hidden))).record, secret, `${privateValue}-hidden`)
    assert.deepEqual(await refusals(), before)
    assert.equal((await owner(record(shared))).record.version, current.version, 'Refused requests change no records')
    const safe = (await read(record(shared))).record
    redacted(safe, ratio); redacted(safe, copy); cell(safe, publicCaption, sharedCaption)
    const safeLinked = (await read(record(project))).record
    redacted(safeLinked, privateLookup); cell(safeLinked, publicLookup, [sharedTitle])
    const safeHistory = await read(history(shared))
    const safeSearch = await read(search(privateValue))
    assert.deepEqual(safeSearch.items, [])
    const safeCsv = await read('/api/v1/records/export-csv', csvInput(itemId, [name.id, publicCaption.id]))
    assert.deepEqual(csvRows(safeCsv), authorizedCsv)
    absent([safe, safeLinked, safeHistory, safeSearch, safeCsv], [privateValue, sharedSecret, hiddenSecret, hiddenTitle, hidden.id, 'Division by zero'])
  }
}
