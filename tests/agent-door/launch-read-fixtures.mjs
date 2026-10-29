import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const encoded = (value, length) => { let text = ''; for (let i = 0; i < length; i++) { text = alphabet[Number(value & 31n)] + text; value >>= 5n } return text }
const id = () => encoded(BigInt(Date.now()), 10) + encoded(BigInt('0x' + randomBytes(10).toString('hex')), 16)
const appId = '00000000000000000000000700', campaignEntity = '00000000000000000000000701'
const command = (input, expected = []) => ({ commandId: id(), input, expected })

/** An ordinary native owner prepares real Launch and file custody records.
 * A reader never substitutes SQL, a provider fake or a verification-only route. */
export default async function launchReadFixtures({ phase, request, origin, cookie, base }) {
  const csrfResponse = await request(new URL('/auth/csrf', origin).href, { headers: { cookie } })
  assert.equal(csrfResponse.status, 200, 'Launch fixture has its current native owner')
  const { csrfToken } = await csrfResponse.json()
  const call = async (path, body) => {
    const response = await request(new URL(path, origin).href, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { cookie, origin, 'x-csrf-token': csrfToken, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    assert.equal(response.status, 200, `Native Launch fixture ${path.split('/').at(-1)} succeeds`)
    const result = await response.json(); assert.ok(result && 'data' in result, 'The native data envelope is present'); return result.data
  }
  const session = await call('/api/v1/session'), ownerId = session.member.id
  const marker = id(), now = Date.now(), label = `synthetic-cradle-1 ${String(phase).slice(0, 40)}`
  const created = await call('/api/v1/commands/launch.campaign.create', command({ fields: {
    code: `synthetic-cradle-${marker}`, name: label, ownerId, startDate: new Date(now).toISOString().slice(0, 10), launchDate: new Date(now + 60 * 86400000).toISOString().slice(0, 10),
    objective: 'Review the native launch evidence', statusSummary: 'Synthetic verification preparation', phase: 'Planning', status: 'On track', health: 75, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {},
  } }))
  assert.equal(created.state, 'committed', 'Native campaign is committed')
  const campaign = created.value, ref = { appId, entityId: campaignEntity, recordId: campaign.id }
  const decision = await call('/api/v1/commands/launch.decision.create', command({ fields: { campaignId: campaign.id, riskId: null, supersedesId: null, title: 'Synthetic launch evidence review', requesterId: ownerId, assigneeId: null, priority: 'High', dueAt: new Date(now + 30 * 86400000).toISOString(), recommendation: 'Inspect the retained evidence', impact: 'No business sign-off is recorded by fixture preparation' } }))
  assert.equal(decision.state, 'committed', 'Native decision draft is committed')
  const comment = await call('/api/v1/commands/comment.add', command({ subject: ref, body: 'synthetic-cradle-1 native review comment', mentions: [] }, [{ ref, version: campaign.version }]))
  assert.equal(comment.state, 'committed', 'Native comment is committed without delivery')
  const history = await call(`/api/v1/history?appId=${appId}&entityId=${campaignEntity}&recordId=${campaign.id}`)
  const comments = await call(`/api/v1/comments?appId=${appId}&entityId=${campaignEntity}&recordId=${campaign.id}`)
  const inbox = await call('/api/v1/notifications?limit=200')
  const recordHistory = await call(`/api/v1/history?appId=${base.id}&entityId=${base.tableId}&recordId=${base.recordId}`)
  const stage = await call('/api/v1/commands/source.stage', command({ appId: base.id, purpose: 'source' }))
  assert.equal(stage.state, 'committed', 'Native private source custody is committed')
  const content = new TextEncoder().encode('synthetic-cradle-1 attachment verification\n'), sha256 = createHash('sha256').update(content).digest('hex')
  const upload = await call('/api/v1/commands/upload.begin', command({ appId: base.id, filename: 'synthetic-cradle-1.txt', mediaType: 'text/plain', bytes: content.byteLength, sha256, subject: stage.value.subject }))
  assert.equal(upload.state, 'committed', 'Native upload authorization is committed')
  const fileId = upload.value.file.id
  const uploaded = await request(new URL(upload.value.uploadUrl, origin).href, { method: 'PUT', headers: { cookie, origin, 'x-csrf-token': csrfToken, 'content-type': 'text/plain' }, body: content })
  assert.equal(uploaded.status, 200, 'The native file door retains the actual bytes')
  await uploaded.body?.cancel()
  const completed = await call('/api/v1/commands/upload.complete', command({ fileId, sha256 }))
  assert.equal(completed.state, 'committed', 'The actual native file checksum is verified')
  return {
    campaignId: campaign.id, campaignName: campaign.name, campaignVersion: campaign.version,
    decisionId: decision.value.id, decisionTitle: decision.value.title, commentId: comment.value.id,
    activityCount: 1 + history.items.length + comments.items.length, historyCount: recordHistory.items.length,
    notificationCount: inbox.items.length, fileId, fileName: completed.value.filename,
    operationCount: 1, decisionCount: 1,
  }
}
