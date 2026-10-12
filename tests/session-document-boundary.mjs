import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import { contract } from './contract.mjs'
import { migratedD1 } from './helpers/sqlite-d1.mjs'
import { createOperatorAuth } from '../vendor/base/modules/operator-auth/index.mjs'
const [{ createSessionReader }, { prepareLaunchSetup }, { launchDescriptors }, { LAUNCH_APP_ID }, { createUlid }] = await Promise.all([
  import('../src/core/features/session/service.ts'),
  import('../src/apps/launch/setup.server.ts'), import('../src/apps/launch/descriptors.server.ts'),
  import('../src/apps/launch/contracts.ts'), import('../src/core/shared/ids.ts'),
])

// Real SQLite, migrations, session issuers and persisted projection policies.
// No Worker/browser is needed for this focused reader boundary regression.
async function fixture(kind) {
  const h = migratedD1(), { db, sql } = h
  try {
    const secret = 'test-only-document-boundary-signing-key'
    const origin = kind === 'base' ? 'https://boundary.example.test' : 'http://127.0.0.1:4185'
    const configuration = { appOrigin: origin, sessionSecret: secret, mode: kind === 'base' ? 'production' : 'development' }
    const request = cookie => new Request(origin + '/app', { headers: { origin, host: new URL(origin).host, ...(cookie ? { cookie } : {}) } })
    const post = new Request(origin + '/auth/bootstrap', { method: 'POST', headers: { origin, host: new URL(origin).host } })
    await db.prepare("INSERT INTO workspace(id,created_at,updated_at,name,timezone,currency,version) VALUES('workspace',1,1,'Boundary workspace','UTC','USD',1)").run()
    let owner, cookie
    {
      const base = createOperatorAuth({ db, config: { local:kind==='local', origin, OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: secret, SETUP_TOKEN: secret }, clientIp: () => '192.0.2.15' })
      const issued = await base.bootstrap(post, { token: secret, displayName: 'Actual Base owner' })
      cookie = issued.cookie.split(';')[0]
      owner = (await db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(issued.operator.id).first()).principal_id
      configuration.base = base
      configuration.initializeBaseOwner = async baseId => {
        assert.equal(baseId, issued.operator.id)
        await db.batch(await prepareLaunchSetup(db, owner))
      }
    }
    const policyId = createUlid()
    const rules = launchDescriptors.map(descriptor => ({ id: createUlid(), principals: [{ id: owner, kind: 'human' }], entityId: descriptor.schema.id, rows: { kind: 'all', conditions: [] }, readableFields: descriptor.schema.fields.map(field => field.id), writableFields: [], actions: [], effect: 'allow', purposes: ['read'] }))
    await db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,created_at,updated_at) VALUES(?,?,?,?,1,1)').bind(policyId, LAUNCH_APP_ID, 'Complete current Launch read', JSON.stringify(rules)).run()
    await db.prepare('INSERT INTO authority_memberships(principal_id,app_id,policy_id) VALUES(?,?,?)').bind(owner, LAUNCH_APP_ID, policyId).run()
    const reader = createSessionReader({ bindings: {}, database: { $client: db }, auth: { configuration } })
    return { ...h, reader, owner, request: request(cookie), signedOut: request(), rules, policyId,
      async campaign() {
        await db.prepare("INSERT INTO campaigns(id,created_at,updated_at,code,name,owner_id,start_date,launch_date,objective,status_summary,phase,status,health,health_updated_at,budget_minor,spend_minor) VALUES(?,1,1,'PRIVATE','Protected campaign',?,'2026-01-01','2026-12-01','','','Planning','On track',50,1,0,0)").bind(createUlid(), owner).run()
      },
      async policy(next) { await db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(next), policyId).run() },
    }
  } catch (error) { h.close(); throw error }
}

for (const kind of ['local', 'base']) {
  contract('AUTH-BASE-001', `${kind}: document identity is genuine and reread after credential revocation`, async () => {
    const h = await fixture(kind)
    try {
      assert.equal((await h.reader.getIdentity(h.request)).operator.id, h.owner)
      assert.equal(await h.reader.getIdentity(h.signedOut), undefined)
      assert.equal(await h.reader.getDocumentCurrent(h.signedOut), undefined)
      assert.equal(await h.reader.getCurrent(h.signedOut), undefined)
      await h.db.prepare('UPDATE authority_sessions SET revoked_at=1').run()
      for (const method of ['getIdentity', 'getDocumentCurrent', 'getCurrent']) assert.equal(await h.reader[method](h.request), undefined)
    } finally { h.close() }
  })

  contract('BASE-PUBLIC-003', `${kind}: navigation Boolean requires current complete policy and actual campaigns`, async () => {
    const h = await fixture(kind)
    try {
      assert.equal((await h.reader.getCurrent(h.request)).launchInUse, false)
      await h.campaign()
      assert.equal((await h.reader.getCurrent(h.request)).launchInUse, true)
      for (const restricted of [h.rules.slice(1), h.rules.map((rule, index) => index ? rule : { ...rule, readableFields: rule.readableFields.slice(1) }), h.rules.map(rule => ({ ...rule, purposes: ['export'] }))]) {
        await h.policy(restricted)
        const current = await h.reader.getCurrent(h.request)
        assert.equal(current.launchInUse, false)
        assert.doesNotMatch(JSON.stringify(current), /Protected campaign|PRIVATE/)
      }
      await h.policy(h.rules)
      assert.equal((await h.reader.getCurrent(h.request)).launchInUse, true)
      await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=?").bind(h.owner).run()
      // A denied collaborator must not even query campaigns: the real missing
      // table would throw if the policy gate were bypassed.
      h.sql.exec('ALTER TABLE campaigns RENAME TO unavailable_campaigns')
      assert.equal((await h.reader.getCurrent(h.request)).launchInUse, false)
      assert.equal((await h.reader.getDocumentCurrent(h.request)).launchAvailability, 'available')
    } finally { h.close() }
  })

  contract('VIEW-001', `${kind}: missing campaigns retain current identity as unavailable, reject ordinary reads, and recover`, async () => {
    const h = await fixture(kind)
    try {
      await h.campaign()
      const current = await h.reader.getCurrent(h.request)
      assert.equal(current.launchInUse, true)
      h.sql.exec('ALTER TABLE campaigns RENAME TO unavailable_campaigns')
      assert.deepEqual(await h.reader.getIdentity(h.request), { operator: current.operator, workspace: current.workspace, unreadNotifications: current.unreadNotifications, editorOwner: false, editorConfigured: false })
      await assert.rejects(h.reader.getCurrent(h.request))
      const unavailable = await h.reader.getDocumentCurrent(h.request)
      assert.equal(unavailable.launchAvailability, 'unavailable')
      assert.equal(Object.hasOwn(unavailable, 'launchInUse'), false, 'Database failure must not invent false')
      assert.deepEqual(unavailable.operator, current.operator)
      assert.doesNotMatch(JSON.stringify(unavailable), /SELECT |SQLITE|unavailable_campaigns|signing-key|Protected campaign/)
      h.sql.exec('ALTER TABLE unavailable_campaigns RENAME TO campaigns')
      const restored = await h.reader.getDocumentCurrent(h.request)
      assert.equal(restored.launchAvailability, 'available')
      assert.equal(restored.launchInUse, true)
      assert.deepEqual(restored.operator, current.operator)
      h.sql.exec('ALTER TABLE campaigns RENAME TO unavailable_campaigns')
      await h.db.prepare('UPDATE operators SET active=0 WHERE id=?').bind(h.owner).run()
      assert.equal(await h.reader.getDocumentCurrent(h.request), undefined, 'Unavailable data cannot preserve deactivated identity')
    } finally { h.close() }
  })
}
