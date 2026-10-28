import test from 'node:test'
import assert from 'node:assert/strict'
import { launchBaseAuthorityRuntime } from './helpers/launch-base-authority-runtime.mjs'

test('[AUTH-BASE-001 BASE-ACCESS-003 OPS-001] production requires Base configuration and credentials without weakening host or session guards', async () => {
 const h = await launchBaseAuthorityRuntime()
 try {
  const { request, post, origin } = h
  for (const OWNER_EMAIL of [undefined, '', '   ']) {
   await h.reconfigure({ OWNER_EMAIL })
   const health=await request('/health');assert.equal(health.status,503);assert.ok((await health.json()).missing.includes('OWNER_EMAIL'))
   for (const route of ['/', '/signin', '/auth/capabilities', '/app', '/api/session']) {
    const response = await request(route)
    assert.equal(response.status, 503, `${route}: ${await response.clone().text()}`)
    assert.equal(response.headers.get('set-cookie'), null)
    const failure = await response.json(); assert.equal(failure.error.code, 'unconfigured'); assert.ok(failure.error.missing.includes('OWNER_EMAIL'))
   }
   const bootstrap = await post('/auth/bootstrap', { token: h.bindings.SETUP_TOKEN, displayName: 'Owner' })
   assert.equal(bootstrap.status, 503); assert.equal((await bootstrap.json()).error.code,'unconfigured')
   assert.equal(bootstrap.headers.get('set-cookie'), null)
   assert.equal((await h.dispatch('https://hostile.example.test/auth/capabilities')).status, 404)
  }
  for (const table of ['operators', 'oa_operators', 'authority_sessions', 'oa_sessions', 'oa_bootstrap']) assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${table}`).first()).n, 0, table)
  assert.equal(h.deliveries.length, 0)
  await h.reconfigure({})
  const owner = await h.bootstrap()
  const publicPage = await request('/'); assert.equal(publicPage.status, 200)
  const signin = await request('/signin'); assert.equal(signin.status, 200); assert.doesNotMatch(await signin.text(), /Continue with local development identity/)
  const capabilities = await request('/auth/capabilities'); assert.equal(capabilities.status, 200, await capabilities.clone().text()); assert.deepEqual(await capabilities.json(), { localDevelopmentSignIn: false, magicLink: { status: 'configured' } })
  const signedOut = await request('/app'); assert.equal(signedOut.status, 303); assert.match(signedOut.headers.get('location'), /\/signin/)
  const signedIn = await request('/app', { headers: { cookie: owner.cookie } }); assert.equal(signedIn.status, 200, await signedIn.clone().text()); assert.match(await signedIn.text(), /href="\/app\/records"/, 'The signed-in Home links to daily record work')
  assert.equal((await request('/api/campaigns', { headers: { cookie: owner.cookie } })).status, 200)
  assert.equal((await post('/auth/local-sign-in', {})).status, 404)
  assert.equal((await h.dispatch('https://hostile.example.test/auth/capabilities')).status, 404)
  assert.equal((await request('/auth/capabilities', { headers: { host: 'hostile.example.test' } })).status, 404)
  assert.equal((await request('/app', { headers: { host: 'hostile.example.test', cookie: owner.cookie } })).status, 404)
  const nativeCookie = await h.nativeCredential(owner.owner)
  const nativeDocument = await request('/app', { headers: { cookie: nativeCookie } })
  assert.equal(nativeDocument.status, 303); assert.match(nativeDocument.headers.get('location'), /\/signin/)
  assert.equal((await request('/api/campaigns', { headers: { cookie: nativeCookie } })).status, 401)
  assert.equal((await request('/auth/callback?token=legacy-token')).status, 404)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM authority_magic_tokens').first()).n, 0)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM execution_runs').first()).n, 0)
  // Exercise Base's real mail adapter against the test-only provider double.
  const requested = await post('/auth/request', { email: h.bindings.OWNER_EMAIL })
  assert.equal(requested.status, 200, await requested.clone().text()); assert.deepEqual(await requested.json(), { status: 'accepted' })
  assert.equal(h.deliveries.length, 1)
  const message = h.deliveries[0].content.find(part => part.type === 'text/plain').value
  const link = new URL(message.match(/https:\/\/\S+/)[0])
  assert.equal(link.origin, origin); assert.equal(link.pathname, '/auth/confirm')
  const preview = await request(link.pathname + link.search); assert.equal(preview.status, 200); assert.equal(preview.headers.get('set-cookie'), null)
  const confirmed = await post('/auth/confirm', { token: link.searchParams.get('token') })
  assert.equal(confirmed.status, 303)
  const magicCookie = confirmed.headers.get('set-cookie').split(';')[0]; assert.ok(magicCookie.startsWith('__Host-operator_session='))
  assert.equal((await request('/app', { headers: { cookie: magicCookie } })).status, 200)
  assert.equal((await post('/auth/confirm', { token: link.searchParams.get('token') })).status, 400)
  // Missing required Base provider selection fails visibly, with no fallback.
  await h.reconfigure({ MAIL_PROVIDER: undefined })
  const missing = await request('/auth/capabilities'); assert.equal(missing.status, 503)
  const failure = await missing.json(); assert.equal(failure.error.code, 'unconfigured'); assert.ok(failure.error.missing.some(value => value.includes('MAIL_PROVIDER')))
  assert.equal((await request('/app', { headers: { cookie: owner.cookie } })).status, 503)
  assert.equal(h.deliveries.length, 1)
 } finally { await h.close() }
})
