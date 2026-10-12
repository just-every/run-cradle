import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { contract } from './contract.mjs'
const env = {}
globalThis[Symbol.for('cradle.public-name-test')] = env
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env=globalThis[Symbol.for("cradle.public-name-test")]', shortCircuit: true }
  return next(specifier, context)
} })
const { publicDocument } = await import('../src/core/app/public-document.server.ts')
const query = "SELECT name FROM workspace WHERE id='workspace'"
contract('HOME-002 AUTH-BASE-001', 'Public name read failure retains only configured public identity and current capabilities, then recovers', async () => {
  const sentinel = 'PRIVATE-QUERY-ERROR-SENTINEL'
  for (const production of [false, true]) {
    Object.assign(env, { AUTH_LOCAL: 'true', APP_ORIGIN: 'http://127.0.0.1:4185', MAIL_PROVIDER: 'development', MAIL_FROM: 'synthetic@example.test', RER_VERSION: production ? '0.1.0' : undefined })
    const expected = { developmentOutbox: !production, magicLink: !production }
    for (const failure of ['prepare', 'first', 'empty', 'success']) {
      env.DB = { prepare(sql) {
        assert.equal(sql, query, 'Only the public workspace name is queried')
        if (failure === 'prepare') throw new Error(sentinel)
        return { async first() { if (failure === 'first') throw new Error(sentinel); return failure === 'empty' ? null : { name: 'Persisted rename' } } }
      } }
      const result = await publicDocument()
      assert.deepEqual(result, { workspaceName: failure === 'success' ? 'Persisted rename' : null, ...expected })
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE|QUERY|SELECT|session|record/)
    }
  }
  env.DB = { prepare: () => ({ first: async () => null }) }
  Object.defineProperty(env, 'MAIL_FROM', { configurable: true, get() { throw new Error('capability failure') } })
  await assert.rejects(publicDocument(), /capability failure/, 'Errors outside the name read are not swallowed')
  delete env.MAIL_FROM
})
