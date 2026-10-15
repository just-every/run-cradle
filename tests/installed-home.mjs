import assert from 'node:assert/strict'
import { contract } from './contract.mjs'
import { launchBaseAuthorityRuntime } from './helpers/launch-base-authority-runtime.mjs'
import { completeFirstRun } from './helpers/complete-first-run.mjs'

contract('HOME-003', 'The installed Lobby recognizes the owner claim before workspace setup is completed', async () => {
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
    await completeFirstRun(h.origin, cookie, h.dispatch)
    await h.db.prepare("UPDATE workspace SET name='Northwind' WHERE id='workspace'").run()
    assert.deepEqual(await state(), { state: 'claimed' })
    const claimed = await home()
    assert.match(claimed, /<a class="btn" href="\/signin">/, 'Once claimed the Lobby leads to sign-in')
    assert.ok(claimed.includes('Northwind'), 'The Lobby names the persisted workspace')
    assert.doesNotMatch(claimed, /href="\/setup"|<script/)
    assert.equal((await h.request('/setup/state', { method: 'POST' })).status, 405)
  } finally { await h.close() }
})
