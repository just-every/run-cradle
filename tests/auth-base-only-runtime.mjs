import './helpers/typescript-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { ownerSigninDigest } from '../vendor/base/modules/operator-auth/owner-signin-grant.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { baseEmittedRuntime } from './helpers/base-emitted-runtime.mjs'
import { productionBindings } from './helpers/production-bindings.mjs'
import {legacyCookieFixture} from './helpers/legacy-cookie-fixture.mjs'
import { migrateFixture } from './helpers/migrate-fixture.mjs'

const origin = productionBindings.APP_ORIGIN
const secret = 'test-only-base-secret-with-at-least-32-characters'
const ownerEmail = 'owner@example.test'

async function withInstallation(owner, run, overrides = {}, providerStatus = 202) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cradle-base-required-'))
  let runtime
  const deliveries = []
  try {
    migrateFixture(directory)
    runtime = await baseEmittedRuntime(directory, 0, {
      ...productionBindings, SESSION_SECRET: secret, SETUP_TOKEN: secret,
      ...(owner?.trim() ? { MAIL_PROVIDER: 'sendgrid' } : {}),
      ...(owner === undefined ? {} : { OWNER_EMAIL: owner }),
      ...overrides,
    }, async request => {
      deliveries.push({ url: request.url, body: await request.json() })
      return new Response(null, { status: providerStatus, headers: { 'x-message-id': 'test-only-mail-receipt' } })
    })
    const worker = await runtime.getWorker(), db = await runtime.getD1Database('DB')
    const requestOrigin = overrides.APP_ORIGIN ?? origin
    const request = (route, body, cookie, headers = {}, method = body ? 'POST' : 'GET') => worker.fetch(requestOrigin + '/__test_envelope', {
      method: 'POST', redirect: 'manual', body: JSON.stringify({
        url: requestOrigin + route, method,
        headers: { host: new URL(requestOrigin).host, origin: requestOrigin, 'cf-connecting-ip': '192.0.2.56', ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    })
    await run({ db, request, deliveries })
  } finally {
    await runtime?.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

test('AUTH-BASE-001: emitted production rejects missing OWNER_EMAIL despite complete legacy mail configuration', async () => {
 for (const [label, owner] of [['absent', undefined], ['empty', ''], ['whitespace', '   ']]) {
  try { await withInstallation(owner, async ({ db, request, deliveries }) => {
    const health=await request('/health')
    assert.equal(health.status,503)
    assert.ok((await health.json()).missing.includes('OWNER_EMAIL'))
    for (const [route, body] of [
      ['/auth/bootstrap', { token: secret, displayName: 'Owner' }],
      ['/auth/request', { email: ownerEmail }], ['/auth/magic-link', { email: ownerEmail }],
      ['/auth/local-sign-in', {}], ['/auth/callback?token=legacy-token'],
      ['/auth/confirm?token=legacy-token'], ['/auth/session'], ['/app'], ['/api/session'],
    ]) {
      const response = await request(route, body)
      assert.equal(response.status, 503, `${route}: ${await response.clone().text()}`)
      assert.equal(response.headers.get('set-cookie'), null)
      const error = (await response.json()).error
      assert.equal(error.code, 'unconfigured')
    }
    for (const table of ['operators', 'oa_operators', 'authority_sessions', 'oa_sessions', 'authority_magic_tokens', 'oa_tokens']) {
      assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n, 0, table)
    }
    assert.equal(deliveries.length, 0)
  }) } catch (error) {
    throw new Error(`AUTH-BASE-001 ${label} OWNER_EMAIL: ${error.message}`, {cause:error})
  }
 }
})

test('AUTH-BASE-001: emitted production admits one-use owner links and refuses legacy links and cookies', () => withInstallation(ownerEmail, async ({ db, request, deliveries }) => {
  const attempts = await Promise.all(Array.from({ length: 2 }, () => request('/auth/bootstrap', { token: secret, displayName: 'Owner' })))
  assert.deepEqual(attempts.map(response => response.status).sort(), [303, 409], 'First owner bootstrap is atomic')
  const bootstrap = attempts.find(response => response.status === 303)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM oa_operators').first()).n, 1)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM operators').first()).n, 1)
  const baseCookie = bootstrap.headers.get('set-cookie').split(';')[0]
  assert.equal((await request('/api/session', undefined, baseCookie)).status, 200)
  const principal=(await db.prepare('SELECT principal_id FROM cradle_base_operators').first()).principal_id
  const legacyCookie=await legacyCookieFixture(db,principal)
  assert.equal((await request('/api/session',undefined,legacyCookie)).status,401)
  assert.equal((await request('/auth/local-sign-in',{})).status,404)
  assert.equal((await request('/auth/callback?token=test-only-retired-link')).status,404)
  assert.equal((await request('/auth/request', { email: ownerEmail })).status, 200)
  assert.equal(deliveries.length, 1)
  assert.equal(deliveries[0].url, 'https://api.sendgrid.com/v3/mail/send')
  const message = deliveries[0].body.content.find(part => part.type === 'text/plain').value
  assert.match(message, /\/auth\/confirm\?token=/)
  assert.doesNotMatch(message, /\/auth\/callback/)
  const owner = await db.prepare('SELECT id,version FROM oa_operators').first()
  const grant = async (changes = {}) => {
    const token = randomBytes(32).toString('base64url'), now = Date.now()
    const values = { version: owner.version, expiresAt: now + 60_000, ...changes }
    await db.prepare('INSERT INTO oa_owner_signins(id,token_hash,operator_id,operator_version,created_at,expires_at) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), await ownerSigninDigest(token), owner.id, values.version, now, values.expiresAt).run()
    return token
  }
  const token = await grant(), sessions = (await db.prepare('SELECT count(*) n FROM oa_sessions').first()).n
  for (const method of ['GET', 'HEAD']) {
    const response = await request('/auth/owner-signin?token=' + token, undefined, undefined, {}, method)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('set-cookie'), null)
    if (method === 'GET') assert.match(await response.text(), /action="\/auth\/owner-signin"/)
    else assert.equal(await response.text(), '')
  }
  assert.equal((await db.prepare('SELECT count(*) n FROM oa_sessions').first()).n, sessions)
  assert.equal((await db.prepare('SELECT consumed_at FROM oa_owner_signins WHERE token_hash=?').bind(await ownerSigninDigest(token)).first()).consumed_at, null)
  const deniedOrigin = await request('/auth/owner-signin', { token }, undefined, { origin: 'https://foreign.example.test' })
  assert.equal(deniedOrigin.status, 403)
  const ownerAttempts = await Promise.all([request('/auth/owner-signin', { token }), request('/auth/owner-signin', { token })])
  assert.deepEqual(ownerAttempts.map(response => response.status).sort(), [303, 400])
  const ownerCookie = ownerAttempts.find(response => response.status === 303).headers.get('set-cookie').split(';')[0]
  assert.equal((await request('/api/session', undefined, ownerCookie)).status, 200)
  assert.equal((await request('/auth/owner-signin', { token })).status, 400)
  assert.equal((await db.prepare('SELECT count(*) n FROM oa_sessions').first()).n, sessions + 1)
  assert.equal((await db.prepare("SELECT count(*) n FROM oa_auth_audit WHERE action='owner:signin-link'").first()).n, 1)
  for (const changes of [{ expiresAt: Date.now() - 1 }, { expiresAt: Date.now() + 3_600_000 }, { version: owner.version + 1 }]) {
    const response = await request('/auth/owner-signin', { token: await grant(changes) })
    assert.equal(response.status, 400)
    assert.equal(response.headers.get('set-cookie'), null)
  }
  assert.equal(deliveries.length, 1, 'Owner links require no mail provider call')
}))

test('AUTH-BASE-001: emitted product and direct Base auth deny foreign origins without mail, tokens or sessions', () => withInstallation(ownerEmail, async ({ db, request, deliveries }) => {
  const bootstrap = await request('/auth/bootstrap', { token: secret, displayName: 'Owner' })
  assert.equal(bootstrap.status, 303)
  const cookie = bootstrap.headers.get('set-cookie').split(';')[0]
  const counts = async () => Object.fromEntries(await Promise.all(['oa_sessions', 'oa_tokens', 'oa_limits', 'operators'].map(async table => [table, (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n])))
  const before = await counts()
  for (const route of ['/auth/request', '/auth/magic-link']) {
    for (const headers of [{ origin: 'https://foreign.example.test' }, { origin: 'null' }, { origin: undefined }, { 'sec-fetch-site': 'cross-site' }]) {
      const response = await request(route, { email: ownerEmail }, cookie, headers)
      assert.equal(response.status, 403, `${route}: ${await response.clone().text()}`)
      const body = await response.json()
      assert.equal(route === '/auth/request' ? body.error.code : body.error, 'invalid_origin')
      assert.equal(response.headers.get('set-cookie'), null)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  }
  assert.deepEqual(await counts(), before)
  assert.equal(deliveries.length, 0)
}))

test('AUTH-BASE-001: emitted product auth keeps Base rate limits and rejected mail failures explicit', () => withInstallation(ownerEmail, async ({ db, request, deliveries }) => {
  const bootstrap = await request('/auth/bootstrap', { token: secret, displayName: 'Owner' })
  assert.equal(bootstrap.status, 303)
  const failedMail = await request('/auth/request', { email: ownerEmail })
  assert.equal(failedMail.status, 503, await failedMail.clone().text())
  assert.equal((await failedMail.json()).error.code, 'mail_unavailable')
  assert.equal(failedMail.headers.get('set-cookie'), null)
  assert.equal(deliveries.length, 1)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM oa_tokens WHERE revoked_at IS NULL').first()).n, 0, 'Failed mail leaves no usable sign-in token')
  assert.equal((await db.prepare('SELECT count(*) AS n FROM oa_sessions').first()).n, 1, 'Only the bootstrap session exists')
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await request('/auth/request', { email: 'unknown@example.test' })).status, 200)
  }
  const limited = await request('/auth/request', { email: 'unknown@example.test' })
  assert.equal(limited.status, 429, await limited.clone().text())
  assert.equal((await limited.json()).error.code, 'rate_limited')
  assert.equal(limited.headers.get('set-cookie'), null)
  assert.equal(deliveries.length, 1)
}, {}, 400))
