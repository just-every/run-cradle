import assert from 'node:assert/strict'
import { expected, writeContext, mutationSnapshot, launchSource } from './launch-write-context.mjs'

// Retain a real production plan against the emitted installation's D1. Only the
// mail network edge is doubled by the caller; Base issues and revokes credentials.
export async function verifyBaseSessionMutationRevocation(h) {
 const { db, request, cookie, controlCookie } = h
 const csrfResponse = await request('/auth/csrf', undefined, cookie)
 assert.equal(csrfResponse.status, 200)
 const { csrfToken } = await csrfResponse.json()
 const headers = { 'x-csrf-token': csrfToken }
 const current = await writeContext(h, { cookie, request: new Request(h.origin + '/api/v1/commands/launch.campaign.patch', {
  method: 'POST', headers: { host: new URL(h.origin).host, origin: h.origin, cookie, ...headers },
 }) })
 assert.ok(current.ctx.principal.baseSessionId, 'Preparation uses a native Base session')
 const fields = { code: 'SYNTHETIC-CRADLE-1', name: 'Current session launch', ownerId: current.ctx.principal.humanId,
  startDate: '2026-01-01', launchDate: '2027-01-01', objective: 'Retained objective', statusSummary: '',
  phase: 'Planning', status: 'On track', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} }
 const allowed = await current.prepare('campaign.create', { fields })
 const receipt = await current.admission.commit(current.ctx, allowed)
 assert.equal(receipt.replay, false)
 assert.equal(receipt.result.state, 'committed')
 let campaign = receipt.result.value
 assert.equal(campaign.name, fields.name)
 assert.equal(campaign.version, 1)
 const control = { commandId: launchSource.createUlid(), expected: expected('campaign', campaign),
  input: { id: campaign.id, changes: { name: 'Current HTTP session launch' } } }
 const response = await request('/api/v1/commands/launch.campaign.patch', control, cookie, headers)
 assert.equal(response.status, 200, await response.clone().text())
 campaign = (await response.json()).data.value
 assert.equal(campaign.name, control.input.changes.name)
 assert.equal(campaign.version, 2, 'The same current credential can commit through HTTP')

 const input = { id: campaign.id, changes: { objective: 'Must never be committed' } }
 const revisions = expected('campaign', campaign)
 const retained = await current.prepare('campaign.patch', input, revisions)
 const captured = { commandId: retained.commandId, input, expected: revisions }
 // Preserve the exact submitted payload and CSRF credential from preparation.
 const sessions = await request('/auth/sessions', undefined, cookie)
 assert.equal(sessions.status, 200)
 const listed = (await sessions.json()).sessions
 assert.ok(listed.some(row => row.id === current.ctx.principal.baseSessionId && row.current && row.active))
 assert.ok(listed.some(row => !row.current && row.active), 'An independently admitted session remains available')
 const revoked = await request('/auth/sessions/' + current.ctx.principal.baseSessionId + '/revoke', {}, cookie, headers)
 assert.equal(revoked.status, 200, await revoked.clone().text())
 assert.deepEqual(await revoked.json(), { revoked: true })
 assert.notEqual((await db.prepare('SELECT revoked_at FROM oa_sessions WHERE id=?').bind(current.ctx.principal.baseSessionId).first()).revoked_at, null)
 assert.equal((await db.prepare('SELECT revoked_at FROM authority_sessions WHERE id=?').bind(current.ctx.principal.sessionId).first()).revoked_at, null,
  'The retained plan must fence Base revocation even while its product policy handle remains live')

 const before = await mutationSnapshot(db)
 for (const table of ['campaigns', 'activity_entries', 'command_admissions', 'admission_audit', 'admission_events']) {
  assert.ok(before[table].length > 0, `${table} contains successful control effects`)
 }
 const unchanged = async door => {
  const after = await mutationSnapshot(db)
  // Check each effect independently as well as the complete persisted state.
  for (const table of ['campaigns', 'activity_entries', 'command_admissions', 'admission_audit', 'admission_events', 'admission_outbox']) {
   assert.deepEqual(after[table], before[table], `${door} changes no ${table}`)
  }
  assert.equal(after.command_admissions.some(row => row.command_id === retained.commandId), false)
  assert.deepEqual(after, before, `${door} leaves every persisted table unchanged`)
 }
 await assert.rejects(current.admission.commit(current.ctx, retained), error => error.code === 'forbidden')
 await unchanged('Retained prepared mutation')
 const refused = await request('/api/v1/commands/launch.campaign.patch', captured, cookie, headers)
 assert.equal(refused.status, 401, await refused.clone().text())
 assert.equal((await refused.json()).error.code, 'signed_out')
 await unchanged('Captured HTTP submission')

 const readback = await request('/api/campaigns/' + campaign.id, undefined, controlCookie)
 assert.equal(readback.status, 200, await readback.clone().text())
 const detail = await readback.json()
 assert.equal(detail.campaign.version, 2)
 assert.equal(detail.campaign.name, control.input.changes.name)
 assert.equal(detail.campaign.objective, fields.objective)
 assert.equal(detail.activity.some(row => row.nextValue === input.changes.objective), false)
}
