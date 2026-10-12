import {baseHttpSession} from './helpers/base-http-session.mjs'
import { installLegacyFixture } from './helpers/install-legacy-fixture.mjs'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {freePort} from './helpers/free-port.mjs'

const port = Number(process.env.CRADLE_TEST_PORT ?? await freePort())
const baseUrl = `http://127.0.0.1:${port}`

const waitForWorker = async () => {
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {
      // The Worker has not opened its local port yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('Timed out waiting for the local Cloudflare Worker.')
}

test('the Worker seeds and serves the real portfolio spine locally', async (context) => {
  const persistenceDirectory = await mkdtemp(path.join(tmpdir(), 'cradle-worker-'))
  const migration = spawnSync(process.execPath, ['scripts/migrate-local.mjs', '--persist-to', persistenceDirectory], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  })
  assert.equal(migration.status, 0, migration.stderr || migration.stdout)

  await installLegacyFixture(persistenceDirectory)
  const worker = spawn(process.execPath, ['tests/helpers/compiled-worker.mjs', '--port', String(port), '--persist-to', persistenceDirectory, '--var', 'AUTH_LOCAL:true', '--var', 'OWNER_EMAIL:maya@northstar.example', '--var', 'MAIL_PROVIDER:development', '--var', 'MAIL_FROM:auth@localhost.test', '--var', `APP_ORIGIN:${baseUrl}`, '--var', 'SESSION_SECRET:test-only-session-secret-32-characters-long'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let workerOutput = ''

  worker.stdout.on('data', (chunk) => { workerOutput += chunk })
  worker.stderr.on('data', (chunk) => { workerOutput += chunk })
  context.after(async () => {
    if (worker.exitCode === null) {
      const exited = new Promise(resolve => worker.once('exit', resolve))
      process.kill(-worker.pid, 'SIGTERM')
      await exited
    }
    await rm(persistenceDirectory, { force: true, recursive: true })
  })

  try {
    await waitForWorker()
  } catch (error) {
    throw new Error(`${error.message}\n${workerOutput}`)
  }

  const health = await fetch(`${baseUrl}/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok', database: 'available' })

  const landing = await fetch(`${baseUrl}/`)
  assert.equal(landing.status, 200)
  assert.match(await landing.text(), /id="root"/)

  const signInPage = await fetch(`${baseUrl}/signin`)
  assert.equal(signInPage.status, 200)
  assert.match(await signInPage.text(), /src="\/assets\//)

  const signedOut = await fetch(`${baseUrl}/api/session`)
  assert.equal(signedOut.status, 401, `${await signedOut.clone().text()}\n${workerOutput}`)

  const accessCapabilities = await fetch(`${baseUrl}/auth/capabilities`)
  assert.equal(accessCapabilities.status, 200)
  assert.deepEqual(await accessCapabilities.json(), {
    localDevelopmentSignIn: false,
    magicLink: { status: 'configured' },
  })

  const {cookie,csrfToken}=await baseHttpSession(baseUrl)

  const request = (pathname, init = {}) => fetch(`${baseUrl}${pathname}`, { ...init, headers: { ...init.headers, Cookie: cookie, origin: baseUrl, 'x-csrf-token': csrfToken } })

  const session = await request('/api/session')
  assert.equal(session.status, 200)
  assert.deepEqual(await session.json(), {
    editorOwner: false,
    editorConfigured: false,
    launchInUse: true,
    operator: { email: 'maya@northstar.example', id: '01ARZ3NDEKTSV4RRFFQ69G5FAA', initials: 'MC', name: 'Maya Chen' },
    workspace: { currency: 'USD', id: 'workspace', name: 'Northstar Studio Launches', timezone: 'Australia/Brisbane' },
    unreadNotifications: 1,
  })

  const app = await request('/app', { redirect: 'manual' })
  assert.equal(app.status, 200)

  const status = await request('/api/status')
  assert.equal(status.status, 200)
  assert.deepEqual(await status.json(), { product: 'Cradle', status: 'data-spine' })

  const campaignCollection = await request('/api/campaigns')
  const campaigns = await campaignCollection.json()
  assert.equal(campaigns.total, 4)
  const vertex = campaigns.items.find((campaign) => campaign.code === 'CMP-261')
  const security = campaigns.items.find((campaign) => campaign.code === 'CMP-264')
  assert.ok(vertex && security)

  const vertexDetail = await (await request(`/api/campaigns/${vertex.id}`)).json()
  const securityDetail = await (await request(`/api/campaigns/${security.id}`)).json()
  assert.equal(vertexDetail.campaign.name, 'Vertex AI Platform Rollout')
  assert.equal(securityDetail.campaign.name, 'Security Compliance Update')
  assert.notEqual(vertexDetail.campaign.id, securityDetail.campaign.id)

  const campaignPatch = await request(`/api/campaigns/${vertex.id}`, {
    body: JSON.stringify({ statusSummary: 'Updated through the real campaign route.', version: vertex.version }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  })
  assert.equal(campaignPatch.status, 200)
  assert.equal((await campaignPatch.json()).campaign.id, vertex.id)

  const toggle = await request(`/api/deliverables/${vertexDetail.deliverables[1].id}/toggle-completion`, {
    body: JSON.stringify({ version: vertexDetail.deliverables[1].version }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  assert.equal(toggle.status, 200)

  const risks = await (await request('/api/risks/lens')).json()
  assert.equal(risks.total, 3)
  assert.equal(risks.risks.length, 3)
  assert.equal(risks.items[0].severity, 'Critical')
  const escalatedRisk = await request(`/api/risks/${risks.items[0].id}/escalate`, {
    body: JSON.stringify({ reason: 'Escalated through the verified API path.', version: risks.items[0].version }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  assert.equal(escalatedRisk.status, 200)
  assert.equal((await escalatedRisk.json()).risk.state, 'Escalated')

  const timeline = await (await request('/api/milestones/timeline')).json()
  assert.equal(timeline.milestones.length, timeline.total)
  assert.ok(timeline.items.some((milestone) => milestone.startDate === '2026-09-21' && milestone.endDate === '2026-09-23'))
  const milestoneDetail = await request(`/api/milestones/${timeline.items[0].id}`)
  assert.equal(milestoneDetail.status, 200)

  const decisions = await (await request('/api/decisions')).json()
  assert.equal(decisions.decisions.length, decisions.total)
  assert.equal(decisions.items[0].priority, 'Critical')
  const outcome = await request(`/api/decisions/${decisions.items[0].id}/outcome`, {
    body: JSON.stringify({ outcome: 'Approved', version: decisions.items[0].version }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  assert.equal(outcome.status, 200)
  assert.equal((await outcome.json()).decision.state, 'Approved')

  const lensDefinition = {
    conditions: [{ field: 'severity', operator: 'one of', value: ['High', 'Critical'] }],
    description: 'Live verification lens.',
    display: 'Cards',
    fields: ['title', 'severity'],
    name: 'Live risk review',
    recordType: 'Risk',
    sort: { direction: 'desc', field: 'severity' },
  }
  const preview = await request('/api/lenses/preview', { body: JSON.stringify(lensDefinition), headers: { 'Content-Type': 'application/json' }, method: 'POST' })
  assert.equal(preview.status, 200)
  assert.equal((await preview.json()).total, 3)
  const savedLens = await request('/api/lenses', { body: JSON.stringify(lensDefinition), headers: { 'Content-Type': 'application/json' }, method: 'POST' })
  assert.equal(savedLens.status, 201)
  const savedLensBody = await savedLens.json()
  const updatedLens = await request(`/api/lenses/${savedLensBody.lens.id}`, {
    body: JSON.stringify({ ...lensDefinition, name: 'Updated live risk review', version: savedLensBody.lens.version }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  })
  assert.equal(updatedLens.status, 200)
  const lenses = await (await request('/api/lenses')).json()
  assert.ok(lenses.lenses.some((lens) => lens.id === savedLensBody.lens.id))

  const automations = await (await request('/api/automations')).json()
  assert.equal(automations.total, 4)
  assert.equal(automations.automations.length, 4)
  const runs = await (await request(`/api/automations/${automations.items[1].id}/runs`)).json()
  assert.equal(runs.total, 1)

  const notifications = await (await request('/api/notifications')).json()
  assert.equal(notifications.total, 1)
  assert.equal(notifications.notifications.length, 1)
  const read = await request(`/api/notifications/${notifications.items[0].id}/read`, { method: 'POST', headers: { origin: baseUrl } })
  assert.equal(read.status, 204)
  const readNotifications = await (await request('/api/notifications')).json()
  assert.ok(readNotifications.items[0].readAt)

  const settings = await (await request('/api/settings')).json()
  assert.equal(settings.settings.ai.status, 'disabled')
  assert.equal(settings.settings.mail.status, 'unavailable')

  const search = await (await request('/api/search?q=security')).json()
  assert.ok(search.items.some((item) => item.recordType === 'Campaign'))

  const missingApiRoute = await request('/api/missing')
  assert.equal(missingApiRoute.status, 404)
  assert.deepEqual(await missingApiRoute.json(), {
    error: {
      code: 'api_route_not_found',
      message: 'No API route matches /api/missing.',
    },
  })
})
