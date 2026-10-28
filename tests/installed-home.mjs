import {installationArchive} from './helpers/installation-archive.mjs'
import assert from 'node:assert/strict'
import { contract } from './contract.mjs'
import { launchBaseAuthorityRuntime } from './helpers/launch-base-authority-runtime.mjs'
import { workspaceOperations } from './helpers/workspace-operations.mjs'

contract('DATA-001 HOME-003 BASE-DATA-001 RECORDS-006 SET-003 AUTH-BASE-001 OPS-003 OPS-006', '[DATA-001] [OPS-006] [OPS-003] The installed Lobby recognizes the owner claim, validates workspace setup, preserves money on relabel and moves workspace schedules', async () => {
  const h = await launchBaseAuthorityRuntime()
  try {
    const state = async () => {
      const response = await h.request('/setup/state')
      assert.equal(response.status, 200)
      assert.match(response.headers.get('cache-control') ?? '', /no-store/)
      return response.json()
    }
    const home = async () => {
      const response = await h.request('/')
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-type') ?? '', /^text\/html/)
      return response.text()
    }
    assert.deepEqual(await state(), { state: 'unclaimed' })
    const unclaimed = await home()
    assert.match(unclaimed, /<a class="btn" href="\/setup">/, 'Before the claim the Lobby leads to setup')
    assert.doesNotMatch(unclaimed, /href="\/signin"|<script/)
    for (const file of ['/rer-theme.css', '/brand/mark.svg', '/brand/band.svg']) assert.equal((await h.request(file)).status, 200, `${file} is served for the Lobby`)

    const bootstrap = await h.post('/auth/bootstrap', { token: h.bindings.SETUP_TOKEN, displayName: 'Launch owner', returnTo: '/app' })
    assert.equal(bootstrap.status, 303)
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0]
    assert.deepEqual(await state(), { state: 'claimed' })
    const firstVisit = await h.request('/app', { headers: { cookie } })
    assert.equal(firstVisit.status, 303)
    const firstTarget = new URL(firstVisit.headers.get('location'), h.origin)
    assert.equal(firstTarget.origin, h.origin)
    assert.equal(firstTarget.pathname, '/setup')
    assert.match(await home(), /<a class="btn" href="\/signin">/, 'A deployed owner signs in without a setup token')
    // Without configured workspace details the owner confirms them at the native /setup form.
    const setupPage = await h.request('/setup', { headers: { cookie } })
    assert.equal(setupPage.status, 200, 'An unconfigured installation asks for workspace details')
    assert.match(setupPage.headers.get('cache-control') ?? '', /no-store/, 'The owner form and CSRF token are never cached')
    assert.match(await setupPage.text(), /Set up your workspace/)
    const deep = await h.request('/app/records', { headers: { cookie } })
    assert.equal(new URL(deep.headers.get('location'), h.origin).pathname, '/setup')
    const { csrfToken } = await (await h.request('/auth/csrf', { headers: { cookie } })).json()
    const submit = (body, origin = h.origin) => h.request('/setup', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() })
    assert.equal((await submit(new URLSearchParams({ name: 'Changed without authority', timezone: 'UTC', currency: 'USD' }))).status, 403, 'Setup refuses missing CSRF')
    assert.equal((await submit(new URLSearchParams({ csrf: csrfToken, name: 'Changed without authority', timezone: 'UTC', currency: 'USD' }), 'https://foreign.example.test')).status, 403, 'Setup refuses foreign-origin mutation')
    assert.equal((await submit(new URLSearchParams([['csrf', csrfToken], ['name', 'First'], ['name', 'Second'], ['timezone', 'UTC'], ['currency', 'USD']]))).status, 400, 'Setup refuses ambiguous form fields')
    assert.equal((await submit(new URLSearchParams({ csrf: csrfToken, name: 'x'.repeat(9000), timezone: 'UTC', currency: 'USD' }))).status, 413, 'Setup bounds the request body before mutation')
    const workspaceVersion=(await h.db.prepare('SELECT version FROM workspace').first()).version,settingsVersion=(await h.db.prepare('SELECT version FROM workspace_settings').first()).version
    const details={csrf:csrfToken,name:'Northwind',timezone:'Australia/Sydney',currency:'AUD',workspaceVersion:String(workspaceVersion),settingsVersion:String(settingsVersion)}
    for(const invalid of [{timezone:'Mars/Olympus'},{timezone:'+05:45'},{currency:'ZZZ'},{currency:'usd'}]){
      assert.equal((await submit(new URLSearchParams({...details,...invalid}))).status,400,'Setup rejects non-IANA timezones and non-ISO currencies')
      assert.equal((await h.db.prepare('SELECT version FROM workspace').first()).version,workspaceVersion)
      assert.equal((await h.db.prepare('SELECT completed_at FROM cradle_first_run').first()).completed_at,null)
    }
    assert.equal((await submit(new URLSearchParams(details))).status,303)
    await h.db.prepare("UPDATE workspace SET name='Northwind' WHERE id='workspace'").run()
    assert.deepEqual(await state(), { state: 'claimed' })
    const claimed = await home()
    assert.match(claimed, /<a class="btn" href="\/signin">/, 'Once claimed the Lobby leads to sign-in')
    assert.ok(claimed.includes('Northwind'), 'The Lobby names the persisted workspace')
    assert.doesNotMatch(claimed, /href="\/setup"|<script/)
    assert.equal((await h.request('/setup/state', { method: 'POST' })).status, 405)
    const owner=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators').first()).principal_id
    await workspaceOperations(h,cookie)
    await installationArchive(h,{cookie,owner})
  } finally { await h.close() }
  await configuredInstallation()
})

// RER's setup and Managed hosting configure the workspace: the owner's first sign-in opens the app.
async function configuredInstallation() {
  const workspace = { WORKSPACE_NAME: 'Northwind', WORKSPACE_TIMEZONE: 'Australia/Sydney', WORKSPACE_CURRENCY: 'AUD' }
  const h = await launchBaseAuthorityRuntime({ configuration: workspace })
  try {
    const bootstrap = await h.post('/auth/bootstrap', { token: h.bindings.SETUP_TOKEN, displayName: 'Launch owner', returnTo: '/app' })
    assert.equal(bootstrap.status, 303)
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0]
    const firstVisit = await h.request('/app', { headers: { cookie } })
    assert.equal(firstVisit.status, 200, 'The owner opens the app without a second setup')
    await firstVisit.arrayBuffer()
    const read = async route => {
      const response = await h.request(route, { headers: { cookie } })
      assert.equal(response.status, 200, route)
      return response.json()
    }
    const apps = (await read('/api/v1/apps')).data.items
    for (const base of apps) {
      assert.equal(base.entryUrl, `/app/records/${base.id}`, 'Home discovery opens each authorized base')
      assert.equal(Number.isInteger(base.tableCount), true, 'One discovery read supplies the table count')
      assert.equal(Number.isInteger(base.recordCount), true, 'One discovery read supplies the record count')
      assert.equal(base.latestChange, null, 'A fresh install has no native record changes')
    }
    const readiness = (await read('/api/v1/construction/readiness')).data
    assert.equal(readiness.ready, false, 'An installation without construction cannot offer App studio')
    assert.equal((await h.request('/api/v1/apps')).status, 401, 'Base summaries never expose installation data without a session')
    const setup = await h.request('/setup', { headers: { cookie } })
    assert.equal(setup.status, 303)
    assert.equal(new URL(setup.headers.get('location'), h.origin).pathname, '/app')
    const { settings } = await (await h.request('/api/settings', { headers: { cookie } })).json()
    assert.deepEqual({ name: settings.workspace.name, timezone: settings.workspace.timezone, currency: settings.workspace.currency }, { name: 'Northwind', timezone: 'Australia/Sydney', currency: 'AUD' })
    const signin = await (await h.request('/signin?login_hint=' + encodeURIComponent('owner@example.test'))).text()
    assert.match(signin, /<input[^>]*id="signin-email"[^>]*value="owner@example.test"|<input[^>]*value="owner@example.test"[^>]*id="signin-email"/, 'Sign-in fills the email field from login_hint')
  } finally { await h.close() }
}
