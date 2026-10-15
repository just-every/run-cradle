import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { launchAuthorityRuntime, createUlid, LAUNCH_APP_ID, launchEntities } from './helpers/launch-authority-runtime.mjs'

// High-stakes launch doors through the emitted Worker: data import, sample removal,
// ownership handover and paging. Each request uses the app's own routes and session.
const h = await launchAuthorityRuntime({}, { installedLaunchDefinitions: true, installationOwner: true })
after(() => h.close())
const envelope = (input, expected = []) => JSON.stringify({ commandId: createUlid(), expected, input })
async function call(route, init = {}, session = h.ownerSession) {
 const response = await h.request(session, route, init)
 return { status: response.status, body: await response.json().catch(() => null) }
}
const command = (action, input, expected = [], session) => call(`/api/v1/commands/${action}`, { method: 'POST', body: envelope(input, expected) }, session)
const campaignRef = row => ({ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: row.id }, version: row.version })
async function upload(filename, text) {
 const staged = (await command('source.stage', { appId: LAUNCH_APP_ID, purpose: 'import' })).body.data.value
 const sha256 = createHash('sha256').update(text).digest('hex')
 const begun = await command('upload.begin', { appId: LAUNCH_APP_ID, subject: staged.subject, filename, mediaType: 'text/csv', bytes: Buffer.byteLength(text), sha256 })
 assert.equal(begun.status, 200, JSON.stringify(begun.body))
 const put = await h.request(h.ownerSession, begun.body.data.value.uploadUrl, { method: 'PUT', headers: { 'content-type': 'text/csv' }, body: text })
 assert.equal(put.status, 200, await put.text())
 return begun.body.data.value.file.id
}
const preview = (kind, fileId, mapping) => call('/api/v1/launch/imports/preview', { method: 'POST', body: envelope({ kind, fileId, mapping: Object.entries(mapping).map(([column, field]) => ({ column, field })) }) })

test('[IMPORT-001] [IMPORT-002] [IMPORT-003] [IMPORT-004] [IMPORT-005] campaign CSV previews changes, refuses stale or invalid files, commits once and keeps its file', async () => {
 const vertex = await h.db.prepare("SELECT id,name FROM campaigns WHERE code='CMP-261'").first(), brand = await h.db.prepare("SELECT name FROM campaigns WHERE code='CMP-262'").first()
 const owner = await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(h.owner).first()
 const csv = `\uFEFFCode,Name,Owner,Start,Launch,Health\r\nCMP-261,${vertex.name} v2,,,,\r\nCMP-262,${brand.name},,,,\r\nIMP-NEW,"Imported, quoted launch",${owner.email},2026-11-01,2026-12-01,80\r\n`
 const mapping = { Code: 'code', Name: 'name', Owner: 'ownerId', Start: 'startDate', Launch: 'launchDate', Health: 'health' }
 const fileId = await upload('portfolio.csv', csv)
 const first = await preview('campaign', fileId, mapping)
 assert.equal(first.status, 200, JSON.stringify(first.body))
 const result = first.body.data.value
 assert.deepEqual([result.state, result.creates, result.updates, result.unchanged, result.errors], ['valid', 1, 1, 1, []])
 const rows = await call(`/api/v1/launch/imports/${result.id}/rows`)
 const update = rows.body.data.rows.find(row => row.operation === 'update')
 assert.deepEqual(update.changes, [{ field: 'name', before: vertex.name, after: `${vertex.name} v2` }], 'An update names each changing field with its stored and incoming value')

 // A record changed after preview makes confirm ask for a new preview and changes nothing.
 const stale = await h.db.prepare("SELECT id,version FROM campaigns WHERE code='CMP-262'").first()
 assert.equal((await command('launch.campaign.patch', { id: stale.id, changes: { statusSummary: 'Edited after preview' } }, [campaignRef(stale)])).status, 200)
 const refused = await call(`/api/v1/launch/imports/${result.id}/commit`, { method: 'POST', body: envelope({ token: result.token }) })
 assert.equal(refused.status, 409, JSON.stringify(refused.body))
 assert.equal(await h.db.prepare("SELECT COUNT(*) AS n FROM campaigns WHERE code='IMP-NEW'").first('n'), 0)

 // One invalid row blocks the whole file.
 const invalid = await preview('campaign', await upload('invalid.csv', 'Code,Name,Owner\r\nCMP-261,Fine,\r\nIMP-BAD,Bad,nobody@example.invalid\r\n'), { Code: 'code', Name: 'name', Owner: 'ownerId' })
 assert.equal(invalid.body.data.value.state, 'invalid')
 assert.match(invalid.body.data.value.errors[0].message, /does not identify one current operator/)
 assert.equal((await call(`/api/v1/launch/imports/${invalid.body.data.value.id}/commit`, { method: 'POST', body: envelope({ token: invalid.body.data.value.token }) })).status, 400)

 // A fresh preview commits atomically; replaying the same key returns the original result.
 const fresh = (await preview('campaign', fileId, mapping)).body.data.value
 const body = JSON.stringify({ commandId: createUlid(), expected: [], input: { token: fresh.token } })
 const committed = await call(`/api/v1/launch/imports/${fresh.id}/commit`, { method: 'POST', body })
 assert.equal(committed.status, 200, JSON.stringify(committed.body))
 assert.deepEqual(committed.body.data.value, { id: fresh.id, rows: 3 })
 const replay = await call(`/api/v1/launch/imports/${fresh.id}/commit`, { method: 'POST', body })
 assert.deepEqual(replay.body.data.value, committed.body.data.value)
 const created = await h.db.prepare("SELECT id,name FROM campaigns WHERE code='IMP-NEW'").first()
 assert.equal(created.name, 'Imported, quoted launch')
 assert.equal(await h.db.prepare("SELECT name FROM campaigns WHERE code='CMP-261'").first('name'), `${vertex.name} v2`)
 assert.equal(await h.db.prepare("SELECT COUNT(*) AS n FROM activity_entries WHERE campaign_id=? AND type='import.committed'").bind(created.id).first('n'), 1, 'Replay writes no second activity entry')

 // The committed import record keeps the original upload for any launch operator.
 const listed = await call('/api/v1/launch/imports')
 assert.equal(listed.body.data.items[0].filename, 'portfolio.csv')
 const file = await h.request(h.ownerSession, `/api/v1/launch/imports/${fresh.id}/file`)
 assert.equal(file.status, 200)
 assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from(csv), 'The stored file is the original upload byte for byte')

 // Deliverable rows merge by campaign code and title; an unknown campaign is a row error.
 const deliverables = (await preview('deliverable', await upload('tasks.csv', 'Campaign,Title,Owner\r\nIMP-NEW,Brief agency,' + owner.email + '\r\nNOPE-1,Orphan,' + owner.email + '\r\n'), { Campaign: 'campaignCode', Title: 'title', Owner: 'ownerId' })).body.data.value
 assert.deepEqual([deliverables.creates, deliverables.errors.map(error => error.message)], [1, ['Referenced campaign must already exist']])
})

test('[SET-003] sample data installs and removes in one action, and removal is refused naming edited records', async () => {
 const install = async () => (await command('launch.samples.install', {})).body.data.value
 const edited = await install(), kept = await install()
 const listed = (await call('/api/v1/launch/samples')).body.data.items
 assert.equal(listed.length, 2)
 const sample = await h.db.prepare('SELECT c.id,c.name,c.version FROM campaigns c JOIN launch_sample_records s ON s.record_id=c.id WHERE s.installation_id=? ORDER BY c.id LIMIT 1').bind(edited.installationId).first()
 assert.equal((await command('launch.campaign.patch', { id: sample.id, changes: { statusSummary: 'Changed by an operator' } }, [campaignRef(sample)])).status, 200)
 const refused = await call('/api/v1/commands/launch.samples.remove', { method: 'POST', body: envelope({ installationId: edited.installationId }) })
 assert.equal(refused.status, 400, JSON.stringify(refused.body))
 assert.match(refused.body.error.message, new RegExp(`campaign “${sample.name}”`))
 assert.equal(await h.db.prepare('SELECT COUNT(*) AS n FROM launch_sample_records WHERE installation_id=?').bind(edited.installationId).first('n'), edited.recordIds.length, 'A refused removal deletes nothing')
 const removed = await call('/api/v1/commands/launch.samples.remove', { method: 'POST', body: envelope({ installationId: kept.installationId }) })
 assert.equal(removed.status, 200, JSON.stringify(removed.body))
 assert.equal(await h.db.prepare('SELECT COUNT(*) AS n FROM campaigns WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(kept.recordIds)).first('n'), 0)
 assert.equal(await h.db.prepare("SELECT COUNT(*) AS n FROM lifecycle_erasures WHERE subject_kind='campaign' AND state<>'complete' AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(kept.recordIds)).first('n'), 0)
})

test('[VIEW-007] campaign pages follow a keyset cursor: a record added before the cursor neither repeats nor skips others', async () => {
 const read = async cursor => (await h.request(h.ownerSession, `/api/campaigns?sort=name&limit=2${cursor ? `&cursor=${cursor}` : ''}`)).json()
 const before = []
 for (let page = await read(); ; page = await read(page.cursor)) { before.push(...page.items.map(item => item.id)); if (!page.cursor) break }
 const first = await read()
 const owner = h.owner
 assert.equal((await command('launch.campaign.create', { fields: { code: 'PAGE-AAA', name: '!! First by name', ownerId: owner, startDate: '2026-01-01', launchDate: '2026-02-01', objective: '', statusSummary: '', phase: 'Planning', status: 'On track', health: 50, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} } })).status, 200)
 const rest = []
 for (let page = await read(first.cursor); ; page = await read(page.cursor)) { rest.push(...page.items.map(item => item.id)); if (!page.cursor) break }
 assert.deepEqual([...first.items.map(item => item.id), ...rest], before, 'Every existing record appears once and in order')
})

test('[OPS-002] [BASE-ACCESS] the sole owner hands over ownership after a fresh confirmation, the installation keeps exactly one owner, the former owner removes themselves, and Base operator routes cannot remove the owner', async () => {
 const person = await h.addPerson({ name: 'Alex Successor' })
 const member = async (id = person.id, session = h.ownerSession) => (await call(`/api/v1/members?appId=${LAUNCH_APP_ID}`, {}, session)).body.data.items.find(item => item.id === id)
 const memberRef = row => [{ ref: { appId: LAUNCH_APP_ID, entityId: '00000000000000000000000101', recordId: row.id }, version: row.version }]
 const owners = async () => (await h.db.prepare("SELECT p.id FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.state='active' AND (p.initial_owner=1 OR (o.role='owner' AND o.status='active'))").all()).results.map(row => row.id)
 const roleOf = id => h.db.prepare('SELECT p.initial_owner,o.role FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=?').bind(id).first()
 // The confirmation link completes in the owner's own session.
 const confirm = async session => {
  const asked = await h.request(session, '/auth/step-up', { method: 'POST', body: JSON.stringify({ action: 'owner:transfer', returnTo: '/app/settings' }) })
  assert.equal(asked.status, 202, await asked.text())
  const mail = JSON.parse((await h.db.prepare('SELECT message FROM rer_mail_development_outbox ORDER BY sequence DESC LIMIT 1').first()).message)
  const token = new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token')
  assert.equal((await h.request(session, '/auth/confirm', { method: 'POST', body: JSON.stringify({ token }), redirect: 'manual' })).status, 303)
 }
 const target = await member()
 assert.equal(target.allowedActions.find(action => action.action === 'member.transfer-ownership').enabled, true)

 // A session without a fresh email-link proof is refused, as is a member who is not the owner.
 await h.db.prepare('UPDATE oa_sessions SET created_at=created_at-700000 WHERE id=?').bind(h.ownerSession.baseId).run()
 const unproven = await command('member.transfer-ownership', { memberId: person.id }, memberRef(target))
 assert.equal(unproven.status, 400, JSON.stringify(unproven.body))
 assert.equal(unproven.body.error.blockers[0].code, 'step_up_required')
 const self = await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(h.owner).first()
 assert.equal((await command('member.transfer-ownership', { memberId: h.owner }, memberRef({ id: h.owner, version: self.version }), person.session)).status, 403)

 // The owner cannot leave without handing over first.
 const ownerLeaves = await command('member.remove', { memberId: h.owner, reason: 'Leaving' }, memberRef(await member(h.owner)))
 assert.equal(ownerLeaves.status, 403, JSON.stringify(ownerLeaves.body))

 await confirm(h.ownerSession)
 const handed = await command('member.transfer-ownership', { memberId: person.id }, memberRef(target))
 assert.equal(handed.status, 200, JSON.stringify(handed.body))
 assert.deepEqual(await roleOf(person.id), { initial_owner: 1, role: 'owner' })
 assert.deepEqual(await roleOf(h.owner), { initial_owner: 0, role: 'admin' }, 'The former owner becomes a Base admin in the same commit')
 assert.deepEqual(await owners(), [person.id], 'Exactly one owner remains')
 assert.equal((await h.request(h.ownerSession, '/api/v1/session')).status, 401, 'Losing the owner role ends the former owner\'s sessions, as any Base role change does')
 assert.equal((await h.request(person.session, `/api/v1/members?appId=${LAUNCH_APP_ID}`)).status, 401, 'Becoming owner ends the new owner\'s older sessions, as any Base role change does')

 // The new owner cannot remove themselves and leave the installation without an owner.
 const owner = await h.signIn(person.id)
 assert.equal((await member(person.id, owner)).owner, true)
 const ownerless = await command('member.remove', { memberId: person.id, reason: 'Leaving' }, memberRef(await member(person.id, owner)), owner)
 assert.equal(ownerless.status, 403, JSON.stringify(ownerless.body))
 assert.deepEqual(await owners(), [person.id])

 // The former owner signs in again with their app access and can leave once their campaigns move to someone else.
 const former = await h.signIn(h.owner)
 const formerSelf = () => member(h.owner, former)
 const blocked = await command('member.remove', { memberId: h.owner, reason: 'Handing the workspace over' }, memberRef(await formerSelf()), former)
 assert.equal(blocked.status, 409, JSON.stringify(blocked.body))
 const owned = (await h.db.prepare('SELECT id,version FROM campaigns WHERE owner_id=? AND archived_at IS NULL').bind(h.owner).all()).results
 assert.equal((await command('launch.bulk.apply', { recordType: 'Campaign', ids: owned.map(row => row.id), change: { kind: 'field', field: 'ownerId', value: person.id } }, owned.map(campaignRef), former)).status, 200)
 for (const decision of (await h.db.prepare("SELECT id,version FROM decisions WHERE assignee_id=? AND state IN ('Awaiting approval','In review')").bind(h.owner).all()).results)
  assert.equal((await command('launch.decision.assign', { id: decision.id, assigneeId: person.id }, [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.decision, recordId: decision.id }, version: decision.version }], former)).status, 200)
 const removed = await command('member.remove', { memberId: h.owner, reason: 'Handing the workspace over' }, memberRef(await formerSelf()), former)
 assert.equal(removed.status, 200, JSON.stringify(removed.body))
 assert.equal((await h.request(former, '/api/v1/session')).status, 401, 'The former owner is signed out everywhere')

 // Ownership can still be handed on: the new owner hands over to a third member.
 const next = await h.addPerson({ name: 'Jo Next' })
 await confirm(owner)
 const again = await command('member.transfer-ownership', { memberId: next.id }, memberRef(await member(next.id, owner)), owner)
 assert.equal(again.status, 200, JSON.stringify(again.body))
 assert.deepEqual(await owners(), [next.id])

 // Base's own operator routes cannot leave the installation without an owner: a Base co-owner
 // cannot deactivate or demote the installation owner, nor can the owner demote themselves.
 const baseId = id => h.db.prepare('SELECT base_id FROM cradle_base_operators WHERE principal_id=?').bind(id).first('base_id')
 const operator = async (session, route, body) => { const response = await h.request(session, route, { method: 'POST', body: JSON.stringify(body) }); return { status: response.status, body: await response.json().catch(() => null) } }
 const current = await h.signIn(next.id)
 await confirm(current)
 assert.equal((await operator(current, '/auth/operator/role', { operatorId: await baseId(person.id), role: 'owner' })).status, 200)
 const coOwner = await h.signIn(person.id)
 await confirm(coOwner)
 for (const [session, route, change] of [[coOwner, '/auth/operator/status', { status: 'inactive' }], [coOwner, '/auth/operator/role', { role: 'admin' }], [current, '/auth/operator/role', { role: 'admin' }]]) {
  const refused = await operator(session, route, { operatorId: await baseId(next.id), ...change })
  assert.deepEqual([refused.status, refused.body?.error], [409, 'last_owner'], `${route} ${JSON.stringify(change)}`)
 }
 assert.deepEqual(await roleOf(next.id), { initial_owner: 1, role: 'owner' }, 'The installation owner stays active and the Base owner')
 assert.deepEqual((await h.db.prepare("SELECT id FROM authority_principals WHERE state='active' AND initial_owner=1").all()).results.map(row => row.id), [next.id])
})
