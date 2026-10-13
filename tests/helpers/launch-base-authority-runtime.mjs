import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { request as httpsRequest } from 'node:https'
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_getMiniflareWorkerOptions } from 'wrangler'
import { productionBindings } from './production-bindings.mjs'
import {legacyCookieFixture} from './legacy-cookie-fixture.mjs'
import {completeFirstRun} from './complete-first-run.mjs'

// A fresh installation, using the real emitted Worker over canonical HTTPS.
// Only the outbound mail provider is doubled; credentials come from Base HTTP.
export async function launchBaseAuthorityRuntime({providerFetch,configuration={},automaticQueues=true}={}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cradle-launch-base-'))
  let port = Number(process.env.CRADLE_BASE_AUTHORITY_PORT ?? 0)
  const bindings = { ...productionBindings, APP_ORIGIN: 'https://cradle.authority.test', OWNER_EMAIL: 'owner@example.test', MAIL_PROVIDER: 'sendgrid', SESSION_SECRET: 'synthetic-base-authority-session-secret', SETUP_TOKEN: 'synthetic-base-authority-bootstrap-secret',...configuration }
  const deliveries = []
  let runtime
  const close = async () => { try { await runtime?.dispose() } finally { await rm(directory, { recursive: true, force: true }) } }
  try {
    const sql = []
    for (const folder of ['migrations/core', 'migrations/base', 'migrations/import', 'migrations/updates']) {
      for (const file of (await readdir(folder)).filter(file => file.endsWith('.sql')).sort()) sql.push(await readFile(path.join(folder, file), 'utf8'))
    }
    const schema = path.join(directory, 'fresh-schema.sql')
    await writeFile(schema, sql.join('\n'))
    const migration = spawnSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'cradle', '--local', '--persist-to', directory, '--file', schema], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    assert.equal(migration.status, 0, migration.stderr + migration.stdout)
    const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions('dist/server/wrangler.json')
    const modulesRoot = path.dirname(main), { modulesRules, ...options } = workerOptions
    const modules = [main, ...(await readdir(modulesRoot, { recursive: true })).filter(file => /\.m?js$/.test(file)).map(file => path.join(modulesRoot, file)).filter(file => file !== main)].map(file => ({ type: 'ESModule', path: file }))
    const optionsFor = changes => {
      const current = { ...options.bindings, ...bindings, ...changes }
      for (const key of Object.keys(current)) if (current[key] === undefined) delete current[key]
      const config = convertV4MiniflareOptions({ host: '127.0.0.1', port, https: true, inspectorPort: 0, resourcePersistencePath: path.join(directory, 'v3'), workers: [{ ...options, ...automaticQueues?{}:{queueConsumers:{}}, modules, modulesRoot, bindings: current }, ...externalWorkers] })
      for (const worker of config.workers) if (worker.dev) worker.dev.unsafeRegisterWorker = false
      config.workers[0].dev??={}
      config.workers[0].dev.outboundService={type:'fetcher',handler:async request=>{
        if(providerFetch){try{return await providerFetch(request)}catch(error){console.error('Provider edge rejected',request.method,request.url,error.message);throw error}}
        assert.equal(request.url, 'https://api.sendgrid.com/v3/mail/send', 'Only the selected test mail provider may be contacted')
        deliveries.push(await request.json())
        return new Response(null, { status: 202, headers: { 'x-message-id': 'test-only-launch-mail-receipt' } })
      }}
      return config
    }
    runtime = new Miniflare(optionsFor({}))
    // Let workerd bind an OS-assigned port, then configure the canonical origin
    // before issuing any requests. Pin that listener across subsequent reloads.
    const listener = await runtime.ready
    port = Number(listener.port || 443)
    const origin = new URL(`https://cradle.authority.test:${port}`).origin
    bindings.APP_ORIGIN = origin
    await runtime.setOptions(optionsFor({}))
    let db = await runtime.getD1Database('DB')
    const dispatch = (url, init = {}) => new Promise((resolve, reject) => {
      const target = new URL(url)
      const request = httpsRequest({ hostname: '127.0.0.1', port, path: target.pathname + target.search, method: init.method ?? 'GET', rejectUnauthorized: false, headers: { host: target.host, 'cf-connecting-ip': '192.0.2.61', ...init.headers } }, response => {
        const chunks = []; response.on('data', data => chunks.push(data)); response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })))
      })
      request.on('error', reject); if (init.body) request.write(init.body); request.end()
    })
    const request = (route, init = {}) => dispatch(origin + route, init)
    const post = (route, body, headers = {}) => request(route, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const bootstrap = async () => {
      const response = await post('/auth/bootstrap', { token: bindings.SETUP_TOKEN, displayName: 'Launch owner', returnTo: '/app' })
      assert.equal(response.status, 303, await response.clone().text())
      const cookie = response.headers.get('set-cookie')?.split(';')[0]
      assert.ok(cookie?.startsWith('__Host-operator_session='))
      const owner = await db.prepare('SELECT principal_id FROM cradle_base_operators').first()
      assert.ok(owner?.principal_id)
      await completeFirstRun(origin,cookie,dispatch)
      return { cookie, owner: owner.principal_id }
    }
    const nativeCredential = owner => legacyCookieFixture(db,owner)
    return { origin, get runtime(){return runtime}, get db() { return db }, deliveries, bindings, request, post, dispatch, bootstrap, nativeCredential, reconfigure: async changes => { await runtime.setOptions(optionsFor(changes)); db = await runtime.getD1Database('DB') }, close }
  } catch (error) { await close(); throw error }
}
