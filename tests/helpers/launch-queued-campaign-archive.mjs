import assert from 'node:assert/strict'
import { LAUNCH_APP_ID, launchEntities } from '../../src/apps/launch/contracts.ts'
import { campaign as installedCampaign, expected as installedExpected, value as installedValue } from './launch-installed.mjs'

/** Actual committed events admit runs while execution delivery is held. Archive
 * and replay use the emitted Worker; D1 reads only correlate durable identities. */
export async function verifyPublicQueuedCampaignArchive(h) {
 const campaign = await installedCampaign(h, 'QUEUED-ARCHIVE')
 const unrelated = await installedCampaign(h, 'QUEUED-CONTROL')
 const ownerId = (await h.read(`/api/campaigns/${campaign.id}`)).campaign.owner.id
 const riskFields = (campaignId, title) => ({ campaignId, ownerId, title, severity: 'High', signal: 'Observed', mitigation: 'Review', dueDate: null })
 const risk = installedValue(await h.command('launch.risk.create', { fields: riskFields(campaign.id, 'Queued archive risk') }))
 const record = async (kind, id) => (await h.read(`/api/v1/apps/${LAUNCH_APP_ID}/entities/${launchEntities[kind]}/records/${id}`)).data.record
 const save = async (name, event, campaignId, message) => installedValue(await h.command('launch.automation.save', {
  definition: { name, enabled: true, trigger: { kind: 'event', event }, actions: [{ command: 'add-activity', input: { campaignId, message } }] },
 }))
 const campaignMessage = 'Archived campaign queued activity must not appear'
 const riskMessage = 'Archived risk queued activity must not appear'
 const controlMessage = 'Unrelated queued activity completes once'
 const campaignAutomation = await save('Queued campaign archive', 'campaign.updated.v1', campaign.id, campaignMessage)
 const riskAutomation = await save('Queued risk archive', 'risk.updated.v1', campaign.id, riskMessage)
 const controlAutomation = await save('Queued unrelated control', 'risk.created.v1', unrelated.id, controlMessage)
 const campaignEvent = await h.command('launch.campaign.patch', { id: campaign.id, changes: { statusSummary: 'Archive queued campaign work' } }, installedExpected(launchEntities.campaign, await record('campaign', campaign.id)))
 const riskEvent = await h.command('launch.risk.patch', { id: risk.id, changes: { signal: 'Archive queued risk work' } }, installedExpected(launchEntities.risk, await record('risk', risk.id)))
 const controlEvent = await h.command('launch.risk.create', { fields: riskFields(unrelated.id, 'Unrelated queued risk') })
 const cases = [
  { automation: campaignAutomation, event: campaignEvent, subjectId: campaign.id, eventName: 'campaign.updated' },
  { automation: riskAutomation, event: riskEvent, subjectId: risk.id, eventName: 'risk.updated' },
  { automation: controlAutomation, event: controlEvent, subjectId: installedValue(controlEvent).id, eventName: 'risk.created' },
 ]
 for (const item of cases) {
  assert.equal(item.event.data.state, 'committed')
  const event = await h.db.prepare('SELECT id,name,subject_json FROM admission_events WHERE command_id=?').bind(item.event.data.commandId).first()
  assert.equal(event.name, item.eventName)
  assert.equal(JSON.parse(event.subject_json).recordId, item.subjectId)
  item.eventId = event.id
  await (await h.runtime.getWorker()).queue('cradle-work', [{ id: `archive-admit-${item.automation.id}`, timestamp: Date.now(), attempts: 1, body: { kind: 'cradle.launch.events.v1', commandId: item.event.data.commandId } }])
  const history = await h.read(`/api/automations/${item.automation.id}/runs`)
  assert.equal(history.total, 1, 'One actual event admits one retained run')
  const run = history.runs[0]
  assert.equal(run.state, 'Queued')
  assert.equal(run.definitionVersion, item.automation.definitionVersion)
  assert.equal(run.subjectId, item.subjectId)
  assert.deepEqual(run.subjectIds, [item.subjectId])
  assert.equal(run.trigger.key, item.eventId)
  assert.equal(run.trigger.event, item.eventName + '.v1')
  assert.equal(run.startedAt, null)
  assert.equal(run.finishedAt, null)
  assert.equal(run.affectedCount, 0)
  assert.deepEqual(run.actions.map(action => [action.command, action.state, action.startedAt]), [['add-activity', 'Pending', null]])
  const outbox = (await h.db.prepare("SELECT id,state FROM admission_outbox WHERE action='launch.automation.execute' AND json_extract(input_json,'$.runId')=?").bind(run.id).all()).results
  assert.equal(outbox.length, 1)
  assert.equal(outbox[0].state, 'pending', 'Execution has not been delivered')
  item.runId = run.id
  item.outboxId = outbox[0].id
 }
 const current = await record('campaign', campaign.id)
 const archived = await h.command('launch.campaign.archive', { id: campaign.id }, installedExpected(launchEntities.campaign, current))
 assert.equal(archived.data.state, 'committed')
 const after = await record('campaign', campaign.id)
 assert.equal(after.lifecycle, 'archived')
 assert.equal(after.version, current.version + 1)
 const cancelled = async () => {
  const histories = []
  for (const item of cases.slice(0, 2)) {
   const history = await h.read(`/api/automations/${item.automation.id}/runs`)
   assert.equal(history.total, 1)
   const run = history.runs[0]
   assert.equal(run.id, item.runId)
   assert.equal(run.state, 'Cancelled', 'Archive cancels the campaign and its risk run')
   assert.equal(run.startedAt, null)
   assert.ok(run.finishedAt, 'Cancellation has a retained finish time')
   assert.equal(run.affectedCount, 0)
   assert.deepEqual(run.actions.map(action => [action.state, action.startedAt, action.finishedAt, action.result]), [['Pending', null, null, null]], 'No canceled action was attempted')
   assert.equal((await h.db.prepare('SELECT state FROM admission_outbox WHERE id=?').bind(item.outboxId).first()).state, 'cancelled', 'The same archive commit cancels execution delivery')
   histories.push(history)
  }
  return histories
 }
 const retained = await cancelled()
 assert.equal((await h.read(`/api/automations/${controlAutomation.id}/runs`)).runs[0].state, 'Queued', 'Archive leaves unrelated work queued')
 assert.equal((await h.db.prepare('SELECT state FROM admission_outbox WHERE id=?').bind(cases[2].outboxId).first()).state, 'pending')
 const activity = async id => (await h.read(`/api/campaigns/${id}`)).activity
 const noArchivedEffect = async () => {
  const entries = await activity(campaign.id)
  assert.deepEqual(entries.filter(entry => [campaignMessage, riskMessage].includes(entry.description)), [], 'Neither distinguishable canceled activity may appear')
 }
 await noArchivedEffect()
 const replay = async label => {
  for (let attempt = 1; attempt <= 2; attempt++) for (const item of cases) {
   await (await h.runtime.getWorker()).queue('cradle-work', [{ id: `${label}-${attempt}-${item.runId}`, timestamp: Date.now(), attempts: attempt, body: { kind: 'cradle.outbox.v1', outboxId: item.outboxId } }])
  }
  assert.deepEqual(await cancelled(), retained, 'Replay preserves canceled history without starting an action')
  await noArchivedEffect()
  const control = await h.read(`/api/automations/${controlAutomation.id}/runs`)
  assert.equal(control.total, 1)
  assert.equal(control.runs[0].state, 'Succeeded')
  assert.equal(control.runs[0].actions[0].state, 'Complete')
  assert.equal((await activity(unrelated.id)).filter(entry => entry.description === controlMessage).length, 1, 'Unrelated work completes exactly once')
 }
 await replay('before-tick')
 const at = Date.now() + 60000
 await h.tick(at)
 assert.deepEqual(await cancelled(), retained)
 await noArchivedEffect()
 await h.restart()
 await replay('after-restart')
 await h.tick(at + 60000)
 assert.deepEqual(await cancelled(), retained)
 await noArchivedEffect()
 for (const { automation } of cases) await h.command('launch.automation.disable', { id: automation.id }, installedExpected(launchEntities.automation, await record('automation', automation.id)))
}
