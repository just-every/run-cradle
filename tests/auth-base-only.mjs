import './helpers/typescript-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { productionBindings } from './helpers/production-bindings.mjs'
import { AuthError } from '../vendor/base/modules/operator-auth/index.mjs'

const { createBaseAuth } = await import('../src/core/platform/base-auth.server.ts')
const { createPlatform } = await import('../src/core/platform/index.ts')
const { configurationFaults } = await import('../src/core/platform/configuration.ts')
const { createBaseProductAuth } = await import('../src/domains/authority/base-session.server.ts')
const { errorResponse } = await import('../src/core/registry/errors.server.ts')

const secret = 'test-only-session-secret-with-at-least-32-characters'
const legacy = { ...productionBindings, SESSION_SECRET: secret, SETUP_TOKEN: secret, MAIL_PROVIDER: 'sendgrid' }

test('AUTH-BASE-001: absent and blank OWNER_EMAIL reject Base/platform creation even with all legacy mail bindings', () => {
  for (const owner of [undefined, '', '   ', '\t\n']) {
    let queries = 0
    const bindings = { ...legacy, OWNER_EMAIL: owner, DB: { prepare() { queries++; throw new Error('Unexpected query') } } }
    for (const create of [createBaseAuth, createPlatform]) {
      assert.throws(() => create(bindings), error => error.code === 'unconfigured' && /OWNER_EMAIL/.test(error.message))
    }
    assert.equal(queries, 0, 'No identity or session can be created before owner validation')
    assert.ok(configurationFaults({...bindings,FILES:{head(){}},WORK_QUEUE:{send(){}},ASSETS:{fetch(){}}}).includes('OWNER_EMAIL'))
  }
})

test('AUTH-BASE-001: local mode constructs real Base auth and refuses missing owner',()=>{
 for(const host of ['localhost','127.0.0.1','[::1]']){
  const local={...legacy,DB:{prepare(){},batch(){}},AUTH_LOCAL:'true',APP_ORIGIN:`http://${host}:4185`,MAIL_PROVIDER:'development',OWNER_EMAIL:'owner@example.test'}
  assert.ok(createBaseAuth(local));assert.throws(()=>createBaseAuth({...local,OWNER_EMAIL:''}));
 }
})

test('AUTH-BASE-001: owner-account deployment refuses missing/blank owner before provider I/O', () => {
  for (const owner of [undefined, '', '   ']) {
    for (const script of ['scripts/deployment/deploy.mjs']) {
      const env = { ...process.env, ...legacy }
      delete env.OWNER_EMAIL
      if (owner !== undefined) env.OWNER_EMAIL = owner
      const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8', timeout: 10000 })
      assert.equal(result.error, undefined)
      assert.notEqual(result.status, 0)
      assert.ok(JSON.parse(result.stderr).inputs.includes('OWNER_EMAIL'))
    }
  }
})

test('AUTH-BASE-001: actual Base product requests preserve origin denials before querying any identity or rate store', async () => {
  let queries = 0
  const db = { prepare() { queries++; throw new Error('Unexpected query') }, batch() { queries++; throw new Error('Unexpected batch') } }
  const base = createBaseAuth({ ...legacy, OWNER_EMAIL: 'owner@example.test', DB: db })
  const auth = createBaseProductAuth(db, { appOrigin: legacy.APP_ORIGIN, sessionSecret: secret, mode: 'production' }, base)
  for (const headers of [{ origin: 'https://foreign.example.test' }, { origin: 'null' }, {}, { origin: legacy.APP_ORIGIN, 'sec-fetch-site': 'cross-site' }]) {
    const request = new Request(legacy.APP_ORIGIN + '/auth/request', { method: 'POST', headers })
    let denied
    await assert.rejects(auth.requestLink(request, { email: 'owner@example.test', returnTo: '/app' }), error => {
      assert.ok(error instanceof AuthError)
      assert.equal(error.code, 'invalid_origin')
      denied = error
      return true
    })
    const response = errorResponse(denied, 'origin-regression', 'POST /auth/request')
    assert.equal(response.status, 403)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal((await response.json()).error.code, 'invalid_origin')
  }
  assert.equal(queries, 0)
})

test('AUTH-BASE-001: only exported Base AuthError preserves auth denial, rate-limit and provider HTTP semantics', async () => {
  for (const [code, status] of [['invalid_input', 400], ['unauthenticated', 401], ['invalid_host', 403], ['invalid_origin', 403], ['operator_not_found', 404], ['method_not_allowed', 405], ['authority_changed', 409], ['rate_limited', 429], ['mail_unavailable', 503], ['invalid_configuration', 503]]) {
    const response = errorResponse(new AuthError(code, status), 'auth-error-test', 'auth')
    assert.equal(response.status, status)
    assert.equal((await response.json()).error.code, code)
    assert.equal(response.headers.get('set-cookie'), null)
  }
  for (const error of [Object.assign(new Error('private provider detail'), { name: 'AuthError', code: 'invalid_origin', status: 403 }), { name: 'AuthError', code: 'rate_limited', status: 429 }]) {
    const response = errorResponse(error, 'auth-error-test', 'auth')
    assert.equal(response.status, 500)
    const body = await response.json()
    assert.equal(body.error.code, 'internal')
    assert.equal(body.error.message, 'The operation could not be completed.')
  }
})
