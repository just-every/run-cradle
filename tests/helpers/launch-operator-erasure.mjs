import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import { LAUNCH_APP_ID } from './launch-authority-runtime.mjs'

const FIVE_MINUTES = 5 * 60 * 1000

/** Rows in any table whose text carries one of the literals. */
async function copiesOf(h, literals) {
 const found = []
 const tables = (await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name NOT GLOB '*_fts*'").all()).results
 for (const { name } of tables) {
  const columns = (await h.db.prepare(`PRAGMA table_info("${name}")`).all()).results.filter(column => !/^(INTEGER|REAL)/i.test(column.type))
  if (!columns.length) continue
  const where = columns.map(column => literals.map(() => `instr(CAST("${column.name}" AS TEXT),?)>0`).join(' OR ')).join(' OR ')
  const n = Number((await h.db.prepare(`SELECT COUNT(*) n FROM "${name}" WHERE ${where}`).bind(...columns.flatMap(() => literals)).first()).n)
  if (n) found.push(`${name}: ${n}`)
 }
 return found
}

/** [OPS-005] Erasure of the removed operator from the same fixture, read back through the doors. */
export async function verifyErasure(doors, w, { confirm, erasureProbe }) {
 const { h, call, command, memberRef, member, count } = doors
 const { leaver } = w
 const before = await member(leaver.id), label = `Anonymous ${leaver.id.slice(-8)}`
 assert.equal(before.state, 'removed')
 assert.equal(before.allowedActions.find(action => action.action === 'member.erase').enabled, true)
 const literals = [before.name, before.email]
 const baseId = (await h.db.prepare('SELECT base_id FROM cradle_base_operators WHERE principal_id=?').bind(leaver.id).first()).base_id
 const authored = {
  comments: await count('SELECT COUNT(*) n FROM comments WHERE author_id=?', leaver.id),
  activity: await count('SELECT COUNT(*) n FROM activity_entries WHERE actor_id=?', leaver.id),
  outcomes: await count('SELECT COUNT(*) n FROM decisions WHERE outcome_by_id=?', leaver.id),
 }
 assert.ok(authored.comments > 0 && authored.activity > 0 && authored.outcomes > 0)
 assert.ok(await count('SELECT COUNT(*) n FROM notifications WHERE operator_id=?', leaver.id) > 0 && await count('SELECT COUNT(*) n FROM channel_deliveries WHERE operator_id=?', leaver.id) > 0)
 assert.ok((await copiesOf(h, literals)).length > 0, 'Before erasure their name and email appear in stored rows')

 const started = Date.now()
 const body=JSON.stringify({commandId:createUlid(),expected:memberRef(before),input:{memberId:leaver.id,reason:'Owner privacy request'}})
 const send=()=>call('/api/v1/commands/member.erase',{method:'POST',body})
 if(erasureProbe)await erasureProbe(send)
 const erased = await send()
 assert.equal(erased.status, 200, JSON.stringify(erased.body))
 let receipt = await call(`/api/v1/erasures/${leaver.id}`)
 while (receipt.body.data.state !== 'complete' && Date.now() - started < FIVE_MINUTES) receipt = await call(`/api/v1/erasures/${leaver.id}`)
 assert.equal(erased.body.data.value.confirmed || receipt.body.data.state === 'complete', true, 'The erasure is confirmed when complete')
 assert.equal(receipt.body.data.state, 'complete', JSON.stringify(receipt.body))
 assert.ok(Date.now() - started < FIVE_MINUTES, 'Erasure completes within five minutes')
 assert.equal(receipt.body.data.anonymousLabel ?? label, label)

 // One stable label replaces the name and email in every read.
 const after = await member(leaver.id)
 assert.deepEqual([after.state, after.name], ['erased', label])
 assert.ok(!literals.includes(after.email), 'The email is replaced')
 const base = await h.db.prepare('SELECT display_name,email,status FROM oa_operators WHERE id=?').bind(baseId).first()
 assert.equal(base.display_name, label); assert.ok(!literals.includes(base.email))
 const reads = {
  members: (await call(`/api/v1/members?appId=${LAUNCH_APP_ID}`)).body,
  owners: (await call('/api/v1/launch/owners')).body,
  owned: (await call(`/api/campaigns/${w.owned.id}`)).body,
  archived: (await call(`/api/campaigns/${w.archived.id}`)).body,
  risk: (await call(`/api/risks/${w.risk.id}`)).body,
  milestone: (await call(`/api/milestones/${w.milestone.id}`)).body,
  decided: (await call(`/api/decisions/${w.decided.id}`)).body,
  decisions: (await call('/api/decisions')).body,
  campaigns: (await call('/api/campaigns')).body,
 }
 for (const [name, body] of Object.entries(reads)) for (const literal of literals) assert.ok(!JSON.stringify(body).includes(literal), `${name} no longer shows ${literal}`)
 assert.equal(reads.archived.campaign.owner.name, label)
 assert.equal(reads.risk.risk.owner.name, label)
 assert.equal(reads.milestone.milestone.owner.name, label)
 assert.deepEqual([reads.decided.decision.requester.name, reads.decided.decision.assignee.name], [label, label])
 const comment = reads.owned.comments.find(item => item.id === w.comment.id)
 assert.equal(comment.authorName, label); assert.equal(comment.body, 'Supplier call is booked for Tuesday.')
 assert.ok(reads.owned.activity.filter(item => item.actor?.id === leaver.id).every(item => item.actor.name === label))
 assert.deepEqual(await copiesOf(h, literals), [], 'Their name and email appear nowhere else')

 // Their notifications and delivery records are deleted; what they authored stays under the label.
 for (const table of ['notifications', 'channel_deliveries', 'notification_reads', 'channel_preferences']) assert.equal(await count(`SELECT COUNT(*) n FROM ${table} WHERE operator_id=?`, leaver.id), 0, `${table} are deleted`)
 assert.deepEqual({
  comments: await count('SELECT COUNT(*) n FROM comments WHERE author_id=?', leaver.id),
  activity: await count('SELECT COUNT(*) n FROM activity_entries WHERE actor_id=?', leaver.id),
  outcomes: await count("SELECT COUNT(*) n FROM decisions WHERE outcome_by_id=? AND state='Approved'", leaver.id),
 }, authored, 'Comments, activity entries and decision outcomes remain')

 // It cannot be undone: no door restores or re-erases the person.
 assert.notEqual((await command('member.erase', { memberId: leaver.id, reason: 'Again' }, memberRef(after))).status, 200, 'A second erasure is refused')
 assert.notEqual((await command('member.remove', { memberId: leaver.id, reason: 'Again' }, memberRef(after))).status, 200)
 await confirm(doors.admin)
 const restore = await h.request(doors.admin, '/auth/operator/status', { method: 'POST', body: JSON.stringify({ operatorId: baseId, status: 'active' }) })
 assert.notEqual(restore.status, 200, `Re-activation is refused: ${await restore.clone().text()}`)
 assert.equal((await h.db.prepare('SELECT status FROM oa_operators WHERE id=?').bind(baseId).first()).status, 'inactive')
 assert.deepEqual([(await member(leaver.id)).state, (await h.request(leaver.session, '/api/v1/session')).status], ['erased', 401])
}
