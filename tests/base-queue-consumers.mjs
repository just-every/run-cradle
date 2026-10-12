import test from 'node:test'
import assert from 'node:assert/strict'
import { consumerResponseApi } from '../scripts/deployment/cloudflare-api.mjs'
import { reconcileTriggers } from '../vendor/base/modules/deploy-kit/resources.mjs'

const queueId = 'a'.repeat(32)
const consumerId = 'b'.repeat(32)
const settings = { batch_size: 10, max_retries: 3, max_wait_time_ms: 5000, retry_delay: 0 }
const plan = { worker: 'test-install', crons: [], queues: [{ binding: 'WORK', consumer: settings }] }
const resources = { queues: [{ binding: 'WORK', id: queueId }] }

function fixture(consumers) {
  const calls = []
  const api = consumerResponseApi({ async request(path, options) {
    calls.push({ path, options })
    assert.equal(options?.method ?? 'GET', 'GET', 'read-only health must never mutate')
    if (path === `/queues/${queueId}/consumers`) return consumers
    assert.equal(path, '/workers/scripts/test-install/schedules')
    return { schedules: [] }
  } })
  return { api, calls }
}

test('Base accepts the observed Cloudflare script consumer shape and documented script_name shape without writes', async () => {
  for (const name of [{ script: plan.worker }, { script_name: plan.worker }, { script: plan.worker, script_name: plan.worker }]) {
    const { api, calls } = fixture([{ type: 'worker', ...name, consumer_id: consumerId, settings }])
    await reconcileTriggers(api, plan, resources, { mutate: false })
    assert.equal(calls.length, 2)
  }
})

test('consumer normalization rejects conflicting or malformed Worker identities', async () => {
  for (const name of [{ script: plan.worker, script_name: 'foreign-install' }, { script: null }, {}, { script_name: 5 }]) {
    const { api } = fixture([{ type: 'worker', ...name, settings }])
    await assert.rejects(reconcileTriggers(api, plan, resources, { mutate: false }), /invalid-queue-consumer-worker/)
  }
})

test('Base still rejects foreign, duplicate, HTTP and settings-drift consumers after normalization', async () => {
  const owned = { type: 'worker', script: plan.worker, consumer_id: consumerId, settings }
  for (const rows of [[{ ...owned, script: 'foreign-install' }], [owned, owned], [{ type: 'http', endpoint: 'https://example.test' }]]) {
    const { api } = fixture(rows)
    await assert.rejects(reconcileTriggers(api, plan, resources, { mutate: false }), /queue-consumer-conflict/)
  }
  const { api } = fixture([{ ...owned, settings: { ...settings, batch_size: 1 } }])
  await assert.rejects(reconcileTriggers(api, plan, resources, { mutate: false }), /queue-consumer-drift/)
})

test('provider boundary leaves other endpoint and mutation responses untouched', async () => {
  const response = { script: 'test-install' }
  const api = consumerResponseApi({ async request() { return response } })
  assert.equal(await api.request('/workers/scripts'), response)
  assert.equal(await api.request(`/queues/${queueId}/consumers`, { method: 'POST' }), response)
})
