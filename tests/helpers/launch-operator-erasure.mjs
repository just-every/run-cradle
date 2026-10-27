import assert from 'node:assert/strict'
import {recordThread} from './record-comment-command.mjs'
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
  const quote=value=>'"'+value.replaceAll('"','""')+'"'
  const primary=(await h.db.prepare(`PRAGMA table_info(${quote(name)})`).all()).results.filter(column=>column.pk>0).sort((a,b)=>a.pk-b.pk)
  const keys=primary.length?primary.map(column=>quote(column.name)):['rowid'],rows=new Set()
  // Scan every column while keeping D1's binding and expression-depth bounds.
  // Deduplicate by the full primary key so a row matching several batches is
  // still counted once; WITHOUT ROWID tables remain covered.
  const width=Math.max(1,Math.min(16,Math.floor(80/Math.max(literals.length,1))))
  for(let offset=0;offset<columns.length;offset+=width){
   const batch=columns.slice(offset,offset+width),where=batch.map(column=>literals.map(()=>`instr(CAST(${quote(column.name)} AS TEXT),?)>0`).join(' OR ')).join(' OR ')
   const matches=(await h.db.prepare(`SELECT ${keys.map((key,index)=>key+' AS key_'+index).join(',')} FROM ${quote(name)} WHERE ${where}`).bind(...batch.flatMap(()=>literals)).all()).results
   for(const row of matches)rows.add(JSON.stringify(keys.map((_,index)=>row['key_'+index])))
  }
  if (rows.size) found.push(`${name}: ${rows.size}`)
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
  comments: await count('SELECT COUNT(*) n FROM evidence_comments WHERE author_id=?', leaver.id),
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
 const comment = (await recordThread(h,doors.ref('campaign',w.owned)[0].ref,doors.admin)).items.find(item=>item.id===w.comment.id)
 assert.equal(comment.authorLabel, label); assert.equal(comment.body, 'Supplier call is booked for Tuesday.')
 assert.ok(reads.owned.activity.filter(item => item.actor?.id === leaver.id).every(item => item.actor.name === label))
 assert.deepEqual(await copiesOf(h, literals), [], 'Their name and email appear nowhere else')

 // Their notifications and delivery records are deleted; what they authored stays under the label.
 for (const table of ['notifications', 'channel_deliveries', 'notification_reads', 'channel_preferences']) assert.equal(await count(`SELECT COUNT(*) n FROM ${table} WHERE operator_id=?`, leaver.id), 0, `${table} are deleted`)
 assert.deepEqual({
  comments: await count('SELECT COUNT(*) n FROM evidence_comments WHERE author_id=?', leaver.id),
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

 // OPS-005 retains the anonymous author's words until an owner/admin explicitly
 // redacts the body. Record authority alone never makes a member an admin.
 const subject=doors.ref('campaign',reads.owned.campaign)[0].ref,expected=doors.ref('campaign',reads.owned.campaign)
 assert.equal(comment.canDelete,false,'Another person cannot delete the erased author’s comment')
 const input={subject,id:comment.id,version:comment.version,reason:'Personal information removal requested'}
 const memberThread=await recordThread(h,subject,w.stay.session)
 assert.equal(memberThread.items.find(item=>item.id===comment.id).canRedact,false)
 assert.equal((await command('comment.redact',input,expected,w.stay.session)).status,403,'A non-admin member is refused')
 assert.equal((await command('comment.redact',{...input,reason:'  '},expected)).status,400,'A reason is required')
 assert.equal((await command('comment.redact',{...input,version:comment.version+1},expected)).status,409,'A stale redaction changes nothing')
 assert.equal(await count('SELECT count(*) n FROM evidence_comment_redactions WHERE comment_id=?',comment.id),0)
 const redaction={commandId:createUlid(),expected,input},sendRedaction=()=>call('/api/v1/commands/comment.redact',{method:'POST',body:JSON.stringify(redaction)})
 for(let i=0;i<2;i++){const result=await sendRedaction();assert.equal(result.status,200,JSON.stringify(result.body))}
 const redacted=(await recordThread(h,subject,doors.admin)).items.find(item=>item.id===comment.id)
 assert.deepEqual([redacted.id,redacted.authorLabel,redacted.createdAt],[comment.id,label,comment.createdAt],'Redaction preserves the place, author label and original time')
 assert.deepEqual([redacted.body,redacted.redacted,redacted.version,redacted.canEdit,redacted.canDelete,redacted.canRedact],[null,true,comment.version+1,false,false,false])
 const audit=(await h.db.prepare('SELECT * FROM evidence_comment_redactions WHERE comment_id=?').bind(comment.id).all()).results
 assert.equal(audit.length,1,'Replaying a redaction records it once')
 assert.deepEqual([audit[0].reason,audit[0].actor_id,audit[0].actor_kind,audit[0].app_id,audit[0].entity_id,audit[0].record_id],[input.reason,w.adminId,'human',subject.appId,subject.entityId,subject.recordId])
 assert.ok(Number.isFinite(Date.parse(audit[0].created_at)))
 assert.ok(!JSON.stringify(audit).includes(comment.body),'The audit never stores the old body')
 const history=await call('/api/v1/history?'+new URLSearchParams(subject))
 assert.equal(history.status,200);assert.ok(!JSON.stringify(history.body).includes(comment.body),'Record history contains no old body')
 assert.equal(history.body.data.items.filter(item=>item.commandId===redaction.commandId).length,1)
 const search=await recordThread(h,{...subject},doors.admin)
 assert.ok(!JSON.stringify(search).includes(comment.body))
 assert.deepEqual(await copiesOf(h,[comment.body]),[],'The body leaves every stored receipt and search index, including exported product rows')
}
