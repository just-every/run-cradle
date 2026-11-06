import assert from 'node:assert/strict'
import { expect } from '@playwright/test'

/** Save through Settings; only the independent command identity comes from storage. */
export async function settingsAttributionJourney({ h, page, b, actor, width, receipt }) {
 const read = async route => {
  const response = await h.request(actor.session, route)
  assert.equal(response.status, 200, `The saving operator can read ${route}`)
  return response.json()
 }
 const durable = settings => ({ version: settings.version, workspace: settings.workspace })
 const before = durable((await read('/api/settings')).settings)
 const operator = await h.db.prepare('SELECT name FROM operators WHERE id=?').bind(actor.id).first('name')
 assert.ok(operator, 'The saving operator is known before any audit read')
 const commandIds = async () => (await h.db.prepare("SELECT command_id FROM command_admissions WHERE action='settings.update'").all()).results.map(row => row.command_id)
 const priorCommands = new Set(await commandIds())
 const name = `synthetic-cradle-workspace-${width}`
 await b.visit('/app/settings')
 await page.getByLabel('Workspace name', { exact: true }).fill(name)
 const startedAt = Date.now()
 const [saved] = await Promise.all([
  page.waitForResponse(response => new URL(response.url()).pathname === '/api/settings' && response.request().method() === 'PATCH'),
  page.getByRole('button', { name: 'Save workspace', exact: true }).click(),
 ])
 const finishedAt = Date.now()
 assert.equal(saved.status(), 200, 'The native Settings save succeeds before its document reload')
 const body = saved.request().postDataJSON()
 assert.equal(body.workspaceName, name, 'The actual browser request carries the intended name')
 assert.equal(body.version, before.version, 'The browser saves the version it read')
 const admitted = (await commandIds()).filter(id => !priorCommands.has(id))
 assert.equal(admitted.length, 1, 'One browser save admits exactly one settings command')
 const commandId = admitted[0]
 const status = (await read(`/api/v1/commands/${commandId}`)).data
 assert.equal(status.action, 'settings.update')
 assert.equal(status.state, 'committed', 'The captured save has a publicly committed command')
 assert.equal(status.result.workspaceName, name, 'The admitted command result matches the captured browser save')
 assert.equal(status.result.version, before.version + 1)
 const auditRoute = '/api/v1/launch/admin-audit'
 const audit = (await read(auditRoute)).data.items.filter(row => row.action === 'settings.update')
 const matching = audit.filter(row => row.eventId === commandId)
 assert.equal(matching.length, 1, 'The public audit log contains exactly one entry for the admitted save')
 const entry = matching[0]
 assert.equal(entry.personId, actor.id, 'The audit names the independently known saving operator')
 assert.equal(entry.person, operator, 'The audit displays that operator’s known name')
 const at = Date.parse(entry.createdAt)
 assert.ok(Number.isFinite(at) && at >= startedAt && at <= finishedAt, 'The audit timestamp falls within independently captured save bounds')
 const query = new URLSearchParams({ person: actor.id, from: new Date(startedAt).toISOString(), to: new Date(finishedAt).toISOString() })
 const filtered = (await read(`${auditRoute}?${query}`)).data.items.filter(row => row.eventId === commandId)
 assert.deepEqual(filtered, matching, 'The owner-authorized person and time filters retain the same save')
 // A fresh document, rather than the in-memory form value, must show the committed name.
 await b.visit('/app/settings')
 await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue(name)
 const committed = durable((await read('/api/settings')).settings)
 const workspace = (await read('/api/workspace')).workspace
 assert.equal(committed.workspace.name, name)
 assert.equal(committed.version, before.version + 1, 'The save advances settings exactly once')
 assert.equal(workspace.name, name, 'The workspace projection agrees with reloaded Settings')
 await b.capture('settings-workspace-attributed')
 // Replay the captured browser payload through its original route using its admitted identity.
 const replay = await h.request(actor.session, '/api/settings', { method: 'PATCH', headers: { 'idempotency-key': commandId }, body: JSON.stringify(body) })
 assert.equal(replay.status, 200, await replay.clone().text())
 assert.deepEqual(durable((await replay.json()).settings), committed, 'Replay returns the retained settings without another update')
 assert.deepEqual(durable((await read('/api/settings')).settings), committed, 'Replay leaves settings and their version unchanged')
 assert.deepEqual((await read('/api/workspace')).workspace, workspace, 'Replay leaves the workspace projection and its timestamp unchanged')
 const afterAudit = (await read(auditRoute)).data.items.filter(row => row.action === 'settings.update')
 assert.deepEqual(afterAudit, audit, 'Replay adds no audit entry and changes no existing audit metadata')
 assert.deepEqual((await commandIds()).filter(id => !priorCommands.has(id)), admitted, 'Replay admits no second update')
 receipt.settings ??= []
 receipt.settings.push({ width, operatorId: actor.id, operator, commandId, startedAt: new Date(startedAt).toISOString(), finishedAt: new Date(finishedAt).toISOString(), audit: entry, savedName: name, settingsVersion: committed.version, workspaceVersion: workspace.version, replayStatus: replay.status, matchingAuditEntries: matching.length })
}
