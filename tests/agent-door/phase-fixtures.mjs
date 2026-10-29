import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const encode = (value, length) => {
  let text = ''
  for (let n = 0; n < length; n++) { text = alphabet[Number(value & 31n)] + text; value >>= 5n }
  return text
}
const id = () => encode(BigInt(Date.now()), 10) + encode(BigInt('0x' + randomBytes(10).toString('hex')), 16)
const schemaEntity = '00000000000000000000000001'
const command = (input, expected = []) => ({ commandId: id(), expected, input })
const field = (label, type = 'text') => ({ id: id(), label, type, required: false, unique: false })

/** Fresh native records are prepared through the same owner/proposer REST doors
 * used by the product. The conformance harness alone adopts company policy. */
export default async function phaseFixtures({ phase, request, origin, cookie }) {
  const csrfResponse = await request(new URL('/auth/csrf', origin).href, { headers: { cookie } })
  assert.equal(csrfResponse.status, 200, 'Native fixture owner session is available')
  const { csrfToken } = await csrfResponse.json()
  assert.equal(typeof csrfToken, 'string', 'The native owner supplies CSRF')
  const call = async (path, body, { token, status = 200 } = {}) => {
    const response = await request(new URL(path, origin).href, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : { cookie, 'x-csrf-token': csrfToken }),
        ...(body === undefined ? {} : { origin, 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    assert.equal(response.status, status, `Native phase fixture ${path.split('/').at(-1)} returned its expected status`)
    const value = await response.json()
    assert.ok(value && typeof value === 'object' && 'data' in value, 'Native fixture response has its public data envelope')
    return value.data
  }
  const label = `synthetic-cradle-1 ${String(phase).replace(/[^a-z0-9 -]/gi, ' ').slice(0, 48)}`
  const baseId = id(), tableId = id(), title = field('Item'), quantity = field('Quantity', 'number')
  const draft = { appId: baseId, name: label, tables: [{ id: tableId, label: 'Items', primaryFieldId: title.id, fields: [title, quantity] }] }
  const preview = await call('/api/v1/records/schema-preview', draft)
  const adopted = await call('/api/v1/commands/release.adopt', command({ kind: 'manual_schema', previewId: preview.id }))
  assert.equal(adopted.state, 'committed', 'The native schema adoption completes')
  const schema = await call(`/api/v1/apps/${baseId}/entities/${tableId}`)
  const schemaRevision = { ref: { appId: baseId, entityId: schemaEntity, recordId: tableId }, version: schema.version }
  const created = await call('/api/v1/commands/record.create', command({ appId: baseId, entityId: tableId, values: { [title.id]: 'synthetic-cradle-1', [quantity.id]: '7' } }, [schemaRevision]))
  assert.equal(created.state, 'committed', 'The native record creation completes')
  const records = await call(`/api/v1/apps/${baseId}/entities/${tableId}/query`, { limit: 200 })
  assert.equal(records.items.length, 1, 'Each phase starts with one real native record')
  const form = {
    appId: baseId, entityId: tableId, title: 'Synthetic item intake',
    fields: [title, quantity].map(value => ({ fieldId: value.id, label: value.label, help: '', required: false })),
    submitAction: 'record.create', authenticated: true,
  }
  const savedForm = await call('/api/v1/commands/form.save', command({ form }, [schemaRevision]))
  assert.equal(savedForm.state, 'committed', 'The native form save completes')
  const viewDefinition = {
    appId: baseId, entityId: tableId, name: 'Synthetic personal items', display: 'grid',
    fields: [title.id, quantity.id], filter: { kind: 'all', conditions: [] }, sort: [], groupBy: [],
    layout: { titleFieldId: title.id }, visibility: 'private', shipped: false,
  }
  const savedView = await call('/api/v1/commands/view.save', command({ view: viewDefinition }, [schemaRevision]))
  assert.equal(savedView.state, 'committed', 'The native private view save completes')
  const views = await call(`/api/v1/apps/${baseId}/views`)
  assert.equal(views.items.filter(value => value.visibility === 'private').length, 1, 'Each phase starts with one native personal view')
  const keyName = `Synthetic proposer ${String(phase).replace(/[^a-z0-9 -]/gi, ' ').slice(0, 48)}`
  const { key } = await call('/api/proposer-keys', {
    commandId: id(), appId: baseId, name: keyName, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  }, { status: 201 })
  assert.equal(typeof key.secret, 'string', 'The native key lifecycle issues the disposable credential')
  assert.equal(typeof key.principalId, 'string', 'The native key response identifies its actual authority principal')
  const current = await call('/api/v1/proposals/schema', undefined, { token: key.secret })
  assert.equal(current.appId, baseId, 'The proposing credential remains bound to its native base')
  const proposalInput = {
    schema: { appId: baseId, name: label, tables: current.tables.map(table => ({ ...table, fields: [...table.fields, field('Prepared note')] })) },
    views: [], forms: [], note: 'synthetic-cradle-1 prepared proposal; no live schema or record changes',
  }
  const pending = await call('/api/v1/commands/schema.propose', command(proposalInput), { token: key.secret })
  assert.equal(pending.state, 'committed', 'The native pending proposal is retained without adoption')
  assert.equal(pending.value.state, 'pending', 'Withdrawal receives a fresh pending proposal each phase')
  return {
    values: {
      base: {
        id: baseId, tableId, name: label, nameFieldId: title.id, numberFieldId: quantity.id,
        recordId: created.value.id, recordVersion: created.value.version, recordCount: records.items.length,
        formId: savedForm.value.id, viewId: savedView.value.id, viewVersion: savedView.value.version,
        viewCount: views.items.length, viewDefinition, schemaVersion: schema.version,
      },
      proposal: { input: proposalInput, proposalId: pending.value.id, id: pending.value.id, appId: baseId },
    },
    clients: { proposer: { token: key.secret, clientId: key.id, agent: { id: key.principalId, name: keyName, specialist: 'operations app steward' } } },
  }
}
