import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_getMiniflareWorkerOptions } from 'wrangler'
import { installLegacyFixture } from './install-legacy-fixture.mjs'
import {createFixtureMail,fixtureMessages} from './fixture-mail.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {completeFirstRun} from './complete-first-run.mjs'
import { migrateFixture } from './migrate-fixture.mjs'
const { createUlid } = await import('../../src/core/shared/ids.ts')
const { LAUNCH_APP_ID, launchEntities } = await import('../../src/apps/launch/contracts.ts')
const { launchFieldIds } = await import('../../src/apps/launch/descriptors.server.ts')
const { prepareLaunchSetup } = await import('../../src/apps/launch/setup.server.ts')
const { initializeLegacyAuthority } = await import('../../src/domains/authority/setup.server.ts')

export { createUlid, LAUNCH_APP_ID, launchEntities, launchFieldIds, prepareLaunchSetup, initializeLegacyAuthority }
export async function launchAuthorityRuntime(overrides = {}, {automaticQueues=true,installedLaunchDefinitions=false,installationOwner=false,providerFetch} = {}) {
  const port = Number(process.env.CRADLE_AUTHORITY_PORT ?? 41879), origin = `http://127.0.0.1:${port}`
  const available = await new Promise(resolve => { const server=createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true))) })
  assert.equal(available,true,'Authority test listener must be unoccupied')
  const directory = await mkdtemp(path.join(tmpdir(), 'cradle-launch-authority-'))
  let runtime, mail, logs = ''
  const close = async () => {
    try { if (runtime) await runtime.dispose() } finally { await mail?.close() }
    if (process.env.CRADLE_AUTHORITY_EVIDENCE) { await mkdir(process.env.CRADLE_AUTHORITY_EVIDENCE, { recursive: true }); await writeFile(path.join(process.env.CRADLE_AUTHORITY_EVIDENCE, 'worker.log'), logs) }
    await rm(directory, { recursive: true, force: true })
  }
  try {
    if(!overrides.MAIL_PROVIDER||overrides.MAIL_PROVIDER==='development')mail=await createFixtureMail(port,providerFetch)
    migrateFixture(directory)
    const owner = await installLegacyFixture(directory, { installedLaunchDefinitions, installationOwner })
    const configuration = { appOrigin: origin, sessionSecret: 'synthetic-launch-authority-test-signing-key', mode: 'development' }
    // One actual emitted Worker owns HTTP, assets and the local D1 binding.
    // Database assertions use that same binding, avoiding competing SQLite owners.
    const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions('dist/server/wrangler.json')
    const modulesRoot = path.dirname(main)
    const { modulesRules, ...options } = workerOptions
    const modules = [main, ...(await readdir(modulesRoot, { recursive: true })).filter(file => /\.m?js$/.test(file)).map(file => path.join(modulesRoot, file)).filter(file => file !== main)].map(file => ({ type: 'ESModule', path: file }))
    const bindings = { ...options.bindings, AUTH_LOCAL: 'true', OWNER_EMAIL:'maya@northstar.example', MAIL_PROVIDER:'development', MAIL_FROM:'auth@localhost.test', SESSION_SECRET: configuration.sessionSecret, APP_ORIGIN: origin, ...overrides }
    const optionsFor = (changes = {}, https = overrides.APP_ORIGIN?.startsWith('https:') ?? false) => {
      const current = { ...bindings, ...changes }
      const captureMail=current.AUTH_LOCAL==='true'&&current.MAIL_PROVIDER==='development'
      if(captureMail){
        assert.ok(mail,'Development mail fixture must be configured explicitly before reloading')
        Object.assign(current,mail.bindings)
      }
      for (const key of Object.keys(current)) if (current[key] === undefined) delete current[key]
      const result = convertV4MiniflareOptions({ host:'127.0.0.1',port,https,inspectorPort:0,resourcePersistencePath:path.join(directory,'v3'),workers:[{...options,...automaticQueues?{}:{queueConsumers:{}},modules,modulesRoot,bindings:current},...externalWorkers] })
      for (const worker of result.workers) if (worker.dev) worker.dev.unsafeRegisterWorker = false
      const rejectNetwork=()=>{throw new Error('Unexpected external request blocked by authority fixture')}
      result.workers[0].dev??={}
      result.workers[0].dev.outboundService={type:'fetcher',handler:captureMail?mail.fetch:providerFetch??rejectNetwork}
      return result
    }
    let runtimeOptions = optionsFor()
    const reconfigure = async (changes, https) => { runtimeOptions = optionsFor(changes, https); await runtime.setOptions(runtimeOptions) }
    runtime = new Miniflare(runtimeOptions)
    logs += `Emitted Worker listening at ${await runtime.ready}\n`
    const db = await runtime.getD1Database('DB')
    // Send real HTTP/TLS to our listener with the canonical Host. Miniflare's
    // dispatchFetch rewrites the URL to its proxy origin and cannot prove this guard.
    const dispatch = (url, init = {}) => new Promise((resolve, reject) => {
      const target = new URL(url), send = runtimeOptions.https ? httpsRequest : httpRequest
      const request = send({hostname:'127.0.0.1',port,path:target.pathname+target.search,method:init.method??'GET',rejectUnauthorized:false,headers:{host:target.host,...init.headers}}, response => {
        const chunks=[];response.on('data',data=>chunks.push(data));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})))
      })
      request.on('error',reject);if(init.body)request.write(init.body);request.end()
    })
    assert.equal((await dispatch(new URL('/health',bindings.APP_ORIGIN).href)).status, 200, logs)
    const fixtureAuth=await createFixtureAuth(db,configuration,owner)
    const signIn = id => fixtureAuth.signIn(id)
    const request = (session, route, init = {}) => fetch(`${origin}${route}`, { ...init, headers: { cookie: session.cookie, origin, 'x-csrf-token': session.csrf, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } })
    const ownerSession = await signIn(owner)
    await completeFirstRun(origin,ownerSession.cookie,dispatch)
    const policy = await db.prepare('SELECT p.* FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(owner, LAUNCH_APP_ID).first()
    const addPerson = async ({ appId = LAUNCH_APP_ID, legacy = false, change = rules => rules, name = 'Scoped collaborator' } = {}) => {
      const id = createUlid(), policyId = createUlid(), now = Date.now()
      const rules = appId === LAUNCH_APP_ID ? change(JSON.parse(policy.rules_json).map(rule => ({ ...rule, id: createUlid(), principals: [{ kind: 'human', id }], rows: rule.rows.kind === 'condition' && rule.rows.value === owner ? { ...rule.rows, value: id } : rule.rows }))) : []
      await db.batch([
        db.prepare('INSERT INTO operators(id,created_at,updated_at,version,name,email,active) VALUES(?,?,?,1,?,?,1)').bind(id, now, now, name, `${id.toLowerCase()}@example.test`),
        db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(id,id,now,now),
        db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policyId,appId,name,JSON.stringify(rules),now,now),
        db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,?,'active',1)").bind(id,appId,policyId,Number(legacy)),
      ])
      const auth=await createFixtureAuth(db,configuration,id)
      return { id, policyId, rules, session: await auth.signIn(id) }
    }
    const mailMessages=()=>{if(!mail)throw new Error('Mail capture is not configured for this explicit provider fixture');return fixtureMessages(origin)}
    return { mailMessages, db, configuration, owner, ownerSession, policy, directory, origin, request, signIn, addPerson, close, runtime, reconfigure, dispatch }
  } catch (error) { await close(); throw error }
}
