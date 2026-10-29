import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import prepare from './phase-fixtures.mjs'

/** Supplemental native evidence inside the released verifier's journey hook.
 * Its tool helper is the harness's real credential and audit path. */
export default async function nativeJourney(context) {
  const { request, origin, cookie, tool } = context
  const fixture = await prepare({ ...context, phase: 'native-core' })
  const person = async (path, body) => {
    const response = await request(new URL(path, origin).href, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    assert.equal(response.status, 200, 'The native person door remains available')
    return response.json()
  }
  const code = answer => answer.result?._meta?.['com.runeditrun/error']?.code
    ?? answer.message?.error?.data?.code
  const value = answer => {
    assert.equal(answer.status, 200, 'The native agent call completes over MCP')
    assert.ok(!answer.result?.isError, 'The native agent call has no refusal')
    assert.ok(answer.result?.structuredContent, 'The native agent call returns structured evidence')
    return answer.result.structuredContent
  }
  const revisions = async () => value(await tool('cradle.views.revisions', { baseId: fixture.values.base.id }))
  const before = await revisions()
  const view = { ...fixture.values.base.viewDefinition, name: 'Synthetic agent personal view' }
  const args = { view, idempotency_key: randomUUID() }
  const created = value(await tool('cradle.views.save', args))
  const after = await revisions()
  assert.equal(after.count, before.count + 1, 'One real native view is created')
  assert.deepEqual(value(await tool('cradle.views.save', args)), created, 'Replay retains the original native receipt')
  assert.deepEqual(await revisions(), after, 'Replay creates no additional native view')
  const changed = await tool('cradle.views.save', { ...args, view: { ...view, name: 'Changed effect' } })
  assert.equal(code(changed), 'idempotency_conflict', 'Changed arguments cannot reuse an admitted key')
  const stale = await tool('cradle.views.save', {
    id: created.id, version: created.version, view,
    expected_revision: created.version - 1, idempotency_key: randomUUID(),
  })
  assert.equal(code(stale), 'revision_conflict', 'A stale native revision refuses')
  assert.deepEqual(await revisions(), after, 'Both conflicts leave the native witness unchanged')
  const native = (await person(`/api/v1/views/${created.id}`)).data
  assert.ok(native.preparedBy?.agent.id && native.preparedBy?.for.id, 'The native record retains agent and sponsor separately')
  assert.equal(native.preparedBy.label, `${native.preparedBy.agent.name} for ${native.preparedBy.for.name}`)
  assert.deepEqual(native.preparedBy.approvers, [], 'Autonomous work invents no human approval')
  await person('/agents/api/pause', { paused: true })
  try {
    assert.equal(code(await tool('cradle.views.save', { view, idempotency_key: randomUUID() })), 'agents_paused')
  } finally {
    await person('/agents/api/pause', { paused: false })
  }
  assert.deepEqual(await revisions(), after, 'Pause prevents the next native effect')
  console.log(`Cradle native journey: views ${before.count}->${after.count}; replay/conflict/stale/Pause unchanged=${after.count}; native agent/sponsor attribution verified`)
}
