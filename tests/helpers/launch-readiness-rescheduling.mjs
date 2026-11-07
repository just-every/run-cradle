import assert from 'node:assert/strict'
import { LAUNCH_APP_ID, launchEntities } from '../../src/apps/launch/contracts.ts'
import { launchFieldIds } from '../../src/apps/launch/descriptors.server.ts'
import { readinessScreens } from './launch-readiness-screens.mjs'

const shift = (day, count) => new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10)

// The emitted Worker owns every write, including the actual shipped cron action.
// Direct D1 access only correlates the public requests with their durable notices.
export async function verifyReadinessRescheduling(harness) {
 const screens = await readinessScreens(harness.h)
 try { await reschedulingJourney({ ...harness, screens }) }
 finally { harness.setNow(undefined); await screens.close() }
}

async function reschedulingJourney({ h, command, read, expected, owner, setNow, diagnostic, screens }) {
 const day = new Date().toISOString().slice(0, 10), evaluationDay = shift(day, 1)
 setNow(Date.parse(day + 'T12:00:00Z'))
 const root = kind => `/api/v1/apps/${LAUNCH_APP_ID}/entities/${launchEntities[kind]}`
 const current = async (kind, row) => (await read(root(kind) + '/records/' + row.id)).record
 const patch = async (row, changes) => command('launch.milestone.patch', { id: row.id, changes }, expected('milestone', await current('milestone', row)))
 const settings = await read('/api/v1/settings')
 await command('settings.update', { version: settings.version, changes: { timezone: 'UTC', readinessVersion: settings.readinessVersion, readinessLeadDays: 5, readinessHour: 8 } })
 const readiness = await h.db.prepare("SELECT * FROM automations WHERE shipped_key='launch-readiness'").first()
 if (!readiness.enabled) await command('launch.automation.enable', { id: readiness.id }, expected('automation', readiness))
 const campaign = async code => command('launch.campaign.create', { fields: { code, name: 'Release readiness ' + code, ownerId: owner, startDate: day, launchDate: shift(day, 3), objective: 'Confirm release readiness', statusSummary: 'Reviewing', phase: 'Planning', status: 'On track', health: 70, budgetMinor: 0, spendMinor: 0, tags: [], customFields: {} } })
 const active = await campaign('RESCHEDULE'), archived = await campaign('WITHDRAW')
 const create = (parent, title, startDate = shift(evaluationDay, 2)) => command('launch.milestone.create', { fields: { campaignId: parent.id, title, ownerId: owner, type: 'Launch', status: 'Not started', startDate, endDate: null, conflictReason: null } })
 const moving = await create(active, 'Rescheduled launch'), completing = await create(active, 'Completed launch')
 const deleting = await create(active, 'Deleted launch'), archiving = await create(archived, 'Archived launch')
 const past = await create(active, 'Past launch control', shift(day, -1))
 const schema = await read(root('readiness')), fields = launchFieldIds.readiness
 const state = label => {
  const option = schema.fields.find(field => field.id === fields.state).options.find(option => option.label === label)
  assert.ok(option, 'Readiness state is available in its public schema')
  return { state: 'value', value: option.id }
 }
 const requests = async row => (await read(root('readiness') + '/query', undefined, { filter: { kind: 'condition', fieldId: fields.milestoneId, op: 'eq', value: { appId: LAUNCH_APP_ID, entityId: launchEntities.milestone, recordId: row.id } }, limit: 100 })).items
 const durable = async row => (await h.db.prepare('SELECT * FROM launch_readiness WHERE milestone_id=? ORDER BY created_at,id').bind(row.id).all()).results
 const outstanding = async row => (await requests(row)).filter(request => request.fields[fields.state].value === state('Outstanding').value)
 const notices = async () => (await read('/api/v1/notifications')).items
 const evaluate = async day => {
  const result = await (await h.runtime.getWorker()).scheduled({ scheduledTime: Date.parse(day + 'T08:00:00Z'), cron: '* * * * *' })
  assert.equal(result.outcome, 'ok', 'The emitted daily evaluation completes')
 }
 for (const row of [moving, completing, deleting, archiving, past]) assert.deepEqual(await requests(row), [], 'Creation alone sends no readiness request')
 await evaluate(evaluationDay)
 const originals = new Map()
 for (const row of [moving, completing, deleting, archiving]) {
  const visible = await requests(row), stored = await durable(row)
  assert.equal(visible.length, 1, 'Emitted cron creates one real request per eligible milestone')
  assert.deepEqual(visible[0].fields[fields.state], state('Outstanding'))
  assert.deepEqual(visible[0].fields[fields.ownerId], { state: 'value', value: owner })
  assert.equal(stored.length, 1); assert.equal(stored[0].id, visible[0].id)
  const notice = (await notices()).find(item => item.id === stored[0].notification_id)
  assert.ok(notice, 'The addressed owner can read the scheduled notification')
  assert.equal(notice.subject.available, true); assert.equal(notice.subject.id, row.id)
  assert.ok(notice.subject.href.includes(row.id))
  originals.set(row.id, { request: visible[0], notice })
 }
 assert.deepEqual(await requests(past), []); assert.deepEqual(await durable(past), [])
 await screens.capture('outstanding', [...originals.values()].map(item => item.notice))
 setNow(Date.parse(evaluationDay + 'T12:00:00Z'))
 await patch(moving, { startDate: shift(evaluationDay, 6) })
 const cancelled = await requests(moving)
 assert.equal(cancelled.length, 1); assert.deepEqual(cancelled[0].fields[fields.state], state('Cancelled'))
 assert.equal((await durable(moving))[0].state, 'Cancelled')
 await patch(moving, { startDate: shift(evaluationDay, 2) })
 assert.deepEqual(await requests(moving), cancelled, 'Returning inside the five-day window makes no immediate replacement')
 assert.deepEqual(await outstanding(moving), [])
 await patch(completing, { status: 'Complete' })
 assert.deepEqual((await requests(completing))[0].fields[fields.state], state('Cancelled'))
 assert.equal((await durable(completing))[0].state, 'Cancelled')
 await command('launch.milestone.delete', { id: deleting.id }, expected('milestone', await current('milestone', deleting)))
 assert.deepEqual(await requests(deleting), []); assert.deepEqual(await durable(deleting), [])
 await command('launch.campaign.archive', { id: archived.id }, expected('campaign', await current('campaign', archived)))
 assert.deepEqual(await outstanding(archiving), [])
 assert.equal((await durable(archiving))[0].state, 'Cancelled')
 for (const { notice } of originals.values()) {
  const visible = (await notices()).find(item => item.id === notice.id)
  assert.ok(visible, 'Withdrawal retains the prior inbox notice')
  assert.equal(visible.subject.available, false); assert.equal(visible.subject.href, undefined)
  assert.equal((await h.db.prepare('SELECT unavailable FROM notifications WHERE id=?').bind(notice.id).first()).unavailable, 1)
 }
 await screens.capture('withdrawn', (await notices()).filter(item => [...originals.values()].some(original => original.notice.id === item.id)))
 diagnostic('PROBE MILE-005 1: emitted cron and fresh-version date commands -> Outstanding, Cancelled outside five days, no immediate replacement inside')
 diagnostic('PROBE MILE-005 2: fresh-version complete, delete and archive commands -> no Outstanding request and each prior notice unavailable')
 await evaluate(evaluationDay)
 assert.deepEqual(await requests(moving), cancelled, 'A duplicate tick on the same daily evaluation creates no replacement')
 const nextDay = shift(evaluationDay, 1)
 await evaluate(nextDay)
 const renewed = await requests(moving), storedRenewed = await durable(moving)
 assert.equal(renewed.length, 2, 'The next daily evaluation adds exactly one replacement')
 assert.equal((await outstanding(moving)).length, 1)
 assert.deepEqual(renewed.find(row => row.id === originals.get(moving.id).request.id), cancelled[0])
 const replacement = renewed.find(row => row.id !== cancelled[0].id)
 assert.deepEqual(replacement.fields[fields.state], state('Outstanding'))
 assert.equal(storedRenewed.length, 2)
 const replacementNotice = (await notices()).find(item => item.id === storedRenewed.find(row => row.id === replacement.id).notification_id)
 assert.ok(replacementNotice); assert.equal(replacementNotice.subject.available, true); assert.equal(replacementNotice.subject.id, moving.id)
 await evaluate(nextDay); await evaluate(nextDay)
 assert.deepEqual(await requests(moving), renewed, 'Duplicate next-day ticks retain exactly one replacement')
 assert.deepEqual(await durable(moving), storedRenewed)
 assert.deepEqual((await notices()).filter(item => item.kind === 'readiness' && item.subject.id === moving.id).map(item => item.id), [replacementNotice.id])
 for (const row of [completing, deleting, archiving]) assert.deepEqual(await outstanding(row), [], 'Cancelled work remains without an Outstanding request at the next evaluation')
 for (const { notice } of originals.values()) assert.equal((await notices()).find(item => item.id === notice.id).subject.available, false, 'Later ticks do not revive withdrawn notices')
 assert.deepEqual(await requests(past), []); assert.deepEqual(await durable(past), [])
 await screens.capture('renewed', (await notices()).filter(item => item.id === replacementNotice.id || [...originals.values()].some(original => original.notice.id === item.id)))
 diagnostic('PROBE MILE-005 1 next-day: emitted daily evaluation and duplicate ticks -> one new Outstanding request, one available replacement notice, original remains withdrawn')
 diagnostic('PROBE MILE-005 3: past-date control across both emitted daily evaluations -> zero public or durable requests')
 setNow(undefined)
}
