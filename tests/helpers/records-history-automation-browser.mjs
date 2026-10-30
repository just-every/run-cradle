import assert from 'node:assert/strict'
import { createUlid } from '../../src/core/shared/ids.ts'
import { browserCall } from './records-live-fixture.mjs'

/** An ordinary owner-approved automation observes the actual range commands. */
export async function rangeAutomationBrowser(owner, runtime, fixture) {
  const recipient = await runtime.db.prepare('SELECT human_id FROM authority_principals WHERE initial_owner=1').first()
  const title = 'synthetic-cradle-159 range history'
  const saved = await owner.evaluate(async input => {
    const csrf = (await (await fetch('/auth/csrf')).json()).csrfToken
    const response = await fetch('/api/user-automations', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(input) })
    return { status: response.status, body: await response.json() }
  }, { commandId: createUlid(), expiresAt: new Date(Date.now() + 86400000).toISOString(), definition: {
    name: title, appId: fixture.appId, entityId: fixture.entityId, event: 'updated', enabled: true,
    actions: [{ kind: 'notify', operatorId: recipient.human_id, title }],
  } })
  assert.equal(saved.status, 201, JSON.stringify(saved.body))
  const id = saved.body.data.result.value.id, completed = []
  async function tick(commandId) {
    const worker = await runtime.runtime.getWorker()
    await worker.queue('cradle-work', [{ id: createUlid(), timestamp: Date.now(), attempts: 1, body: { kind: 'cradle.records.automations.v1', commandId } }])
  }
  async function evidence(commandId) {
    const rows = (await runtime.db.prepare(`SELECT r.id,r.subject_id,r.state,a.state AS action_state,c.command_id,c.state AS effect_state,c.result_json
      FROM automation_runs r JOIN launch_automation_actions a ON a.run_id=r.id
      JOIN command_admissions c ON c.command_id=json_extract(a.result_json,'$.commandId')
      WHERE r.automation_id=? AND json_extract(r.definition_json,'$.event.commandId')=?`)
      .bind(id, commandId).all()).results
    assert.equal(rows.length, 50, 'Every changed range record causes one admitted automation effect')
    assert.deepEqual(rows.map(row => row.subject_id).sort(), [...fixture.ids].sort())
    const history = (await browserCall(owner, `/api/user-automations/${id}/runs`)).runs
    const notices = (await browserCall(owner, '/api/v1/notifications?limit=200')).items
    const notificationIds = []
    for (const row of rows) {
      assert.equal(row.state, 'Complete'); assert.equal(row.action_state, 'Complete'); assert.equal(row.effect_state, 'committed')
      const visible = history.find(run => run.id === row.id)
      assert.ok(visible, 'The real run is present in public history')
      assert.equal(visible.state, 'Complete'); assert.equal(visible.recordId, row.subject_id)
      const notificationId = JSON.parse(row.result_json).value.notificationId
      notificationIds.push(notificationId)
      const notice = notices.find(item => item.id === notificationId)
      assert.ok(notice, 'The committed effect is present in the public inbox')
      assert.equal(notice.title, title); assert.equal(notice.subject.id, row.subject_id); assert.equal(notice.subject.available, true)
      const audit = await runtime.db.prepare('SELECT action,subject_json FROM admission_audit WHERE command_id=?').bind(row.command_id).first()
      assert.equal(audit.action, 'automation.notify'); assert.equal(JSON.parse(audit.subject_json).recordId, row.subject_id)
    }
    assert.equal(new Set(notificationIds).size, 50)
    return notificationIds.sort()
  }
  return {
    async observe(commandId) {
      await tick(commandId)
      const notices = await evidence(commandId)
      await tick(commandId)
      assert.deepEqual(await evidence(commandId), notices, 'Duplicate queue delivery creates no extra effect')
      completed.push(commandId)
    },
    async finish() {
      await browserCall(owner, `/api/user-automations/${id}/disable`, { commandId: createUlid(), version: saved.body.data.result.value.version })
      return { commands: completed, runs: completed.length * 50, notifications: completed.length * 50 }
    },
  }
}
