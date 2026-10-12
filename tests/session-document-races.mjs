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

const navigation = 'SELECT 1 AS used FROM campaigns LIMIT 1'
const finalGuard = text => text.startsWith('SELECT 1 WHERE ')

async function fixture(kind) {
  const h = migratedD1(), { db, sql } = h
  try {
    // Execute every real SQLite statement, then interleave a real persisted
    // update at its return boundary. No auth/policy/query response is replaced.
    let pending
    const events = [], prepare = db.prepare
    db.prepare = text => {
      const statement = prepare(text), first = statement.first
      statement.first = async (...args) => {
        let result
        try { result = await first(...args); return result }
        finally {
          events.push({ text, result })
          if (pending?.matches(text)) {
            const action = pending; pending = undefined
            action.run()
          }
        }
      }
      return statement
    }
    const secret = 'test-only-current-session-race-signing-key'
    const origin = kind === 'base' ? 'https://session-race.example.test' : 'http://127.0.0.1:4185'
    const configuration = { appOrigin: origin, sessionSecret: secret, mode: kind === 'base' ? 'production' : 'development' }
    const request = (cookie, method = 'GET') => new Request(origin + '/app', { method, headers: { origin, host: new URL(origin).host, ...(cookie ? { cookie } : {}) } })
    await db.prepare("INSERT INTO workspace(id,created_at,updated_at,name,timezone,currency,version) VALUES('workspace',1,1,'Original workspace','UTC','USD',1)").run()
    let owner, cookie, alternate
    {
      let delivered
      const base = createOperatorAuth({ db, config: { local:kind==='local', origin, OWNER_EMAIL: 'owner@example.test', SESSION_SECRET: secret, SETUP_TOKEN: secret, MAIL_FROM: 'auth@example.test' },
        clientIp: () => '192.0.2.20', mailSender: { async send(message) { delivered = message; return { status: 'accepted' } } } })
      const issued = await base.bootstrap(request(undefined, 'POST'), { token: secret, displayName: 'Original owner' })
      cookie = issued.cookie.split(';')[0]
      owner = (await db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(issued.operator.id).first()).principal_id
      configuration.base = base
      configuration.initializeBaseOwner = async () => { await db.batch(await prepareLaunchSetup(db, owner)) }
      alternate = async differentPrincipal => {
        if (differentPrincipal) await base.invite(request(cookie, 'POST'), { email: 'other@example.test', displayName: 'Other operator' })
        else await base.requestMagicLink(request(undefined, 'POST'), { email: 'owner@example.test' })
        const link = delivered.text.match(/https?:\/\/[^\s]+\/auth\/confirm\?token=[^\s]+/)[0]
        const confirmed = await base.confirmLink(request(undefined, 'POST'), { token: new URL(link).searchParams.get('token') })
        return confirmed.cookie.split(';')[0]
      }
    }
    const policyId = createUlid()
    const rules = launchDescriptors.map(descriptor => ({ id: createUlid(), principals: [{ id: owner, kind: 'human' }], entityId: descriptor.schema.id, rows: { kind: 'all', conditions: [] }, readableFields: descriptor.schema.fields.map(field => field.id), writableFields: [], actions: [], effect: 'allow', purposes: ['read'] }))
    await db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,created_at,updated_at) VALUES(?,?,?,?,1,1)').bind(policyId, LAUNCH_APP_ID, 'Current Launch read', JSON.stringify(rules)).run()
    await db.prepare('INSERT INTO authority_memberships(principal_id,app_id,policy_id) VALUES(?,?,?)').bind(owner, LAUNCH_APP_ID, policyId).run()
    await db.prepare("INSERT INTO campaigns(id,created_at,updated_at,code,name,owner_id,start_date,launch_date,objective,status_summary,phase,status,health,health_updated_at,budget_minor,spend_minor) VALUES(?,1,1,'PRIVATE','Protected campaign',?,'2026-01-01','2026-12-01','','','Planning','On track',50,1,0,0)").bind(createUlid(), owner).run()
    const reader = createSessionReader({ bindings: {}, database: { $client: db }, auth: { configuration } })
    const currentRequest = request(cookie)
    assert.equal((await reader.getIdentity(currentRequest)).operator.id, owner)
    events.length = 0
    return { ...h, reader, owner, rules, events, request: currentRequest,
      arm(boundary, run) { pending = { matches: boundary === 'navigation' ? text => text === navigation : finalGuard, run } },
      assertInterleaved() { assert.equal(pending, undefined, 'The actual query boundary must execute') },
      policy(next) { sql.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').run(JSON.stringify(next), policyId) },
      async rebind(differentPrincipal) {
        const other = request(await alternate(differentPrincipal))
        const otherIdentity = await reader.getIdentity(other)
        assert.ok(otherIdentity, 'Replacement credentials must be genuinely admitted')
        assert.equal(otherIdentity.operator.id === owner, !differentPrincipal)
        const table = 'oa_sessions'
        const rows = sql.prepare(`SELECT id,token_hash FROM ${table} ORDER BY created_at,id`).all()
        assert.equal(rows.length, 2)
        return () => {
          sql.exec('BEGIN')
          try {
            const update = sql.prepare(`UPDATE ${table} SET token_hash=? WHERE id=?`)
            update.run('test-only-temporary-hash', rows[0].id)
            update.run(rows[0].token_hash, rows[1].id)
            update.run(rows[1].token_hash, rows[0].id)
            sql.exec('COMMIT')
          } catch (error) { sql.exec('ROLLBACK'); throw error }
        }
      },
    }
  } catch (error) { h.close(); throw error }
}

for (const kind of ['local', 'base']) {
  const losses = [
    ['product session revocation', 'UPDATE authority_sessions SET revoked_at=1'],
    ['authentication epoch change', 'UPDATE authority_principals SET authentication_epoch=authentication_epoch+1'],
    ['operator deactivation', 'UPDATE operators SET active=0'],
    ...(kind === 'base' ? [['Base session revocation', 'UPDATE oa_sessions SET revoked_at=1'], ['Base operator version change', 'UPDATE oa_operators SET version=version+1']] : []),
  ]
  contract('VIEW-001', `${kind}: unavailable document data retains only fresh identity without a navigation Boolean`, async () => {
    const h = await fixture(kind)
    try {
      h.sql.exec('ALTER TABLE campaigns RENAME TO unavailable_campaigns')
      h.arm('navigation', () => h.sql.exec("UPDATE workspace SET name='Current unavailable workspace'"))
      const current = await h.reader.getDocumentCurrent(h.request)
      h.assertInterleaved()
      assert.equal(current.launchAvailability, 'unavailable')
      assert.equal(Object.hasOwn(current, 'launchInUse'), false)
      assert.equal(current.workspace.name, 'Current unavailable workspace')
      assert.equal(current.operator.id, h.owner)
    } finally { h.close() }
  })
  for (const differentPrincipal of [false, true]) {
    contract('AUTH-BASE-001 VIEW-001', `${kind}: unavailable document data cannot retain a changed ${differentPrincipal ? 'principal' : 'session'}`, async () => {
      const h = await fixture(kind)
      try {
        const rebind = await h.rebind(differentPrincipal)
        h.sql.exec('ALTER TABLE campaigns RENAME TO unavailable_campaigns')
        h.arm('navigation', rebind)
        assert.equal(await h.reader.getDocumentCurrent(h.request), undefined)
        h.assertInterleaved()
        assert.ok(await h.reader.getIdentity(h.request))
      } finally { h.close() }
    })
  }
  for (const method of ['getDocumentCurrent', 'getCurrent']) {
    for (const boundary of ['navigation', 'final guard']) {
      for (const [loss, update] of losses) {
        contract('AUTH-BASE-001 BASE-ACCESS-003', `${kind} ${method}: ${loss} after ${boundary} never returns authenticated state`, async () => {
          const h = await fixture(kind)
          try {
            h.arm(boundary, () => h.sql.exec(update))
            assert.equal(await h.reader[method](h.request), undefined)
            h.assertInterleaved()
            assert.equal(h.events.filter(event => event.text === navigation).length, 1)
            const guards = h.events.filter(event => finalGuard(event.text))
            assert.equal(guards.length, 1, 'The actual post-query projection guard must execute')
            // Operator activity is read by current identity; the projection's
            // principal guard alone does not observe the product operator row.
            if (loss !== 'operator deactivation') assert.equal(!!guards[0].result, boundary !== 'navigation')
            assert.equal(await h.reader.getIdentity(h.request), undefined)
          } finally { h.close() }
        })
      }
    }

    for (const [loss, update] of losses) {
      contract('AUTH-BASE-001 VIEW-001', `${kind} ${method}: unavailable campaigns plus ${loss} cannot become an empty authenticated session`, async () => {
        const h = await fixture(kind)
        try {
          h.sql.exec('ALTER TABLE campaigns RENAME TO unavailable_campaigns')
          h.arm('navigation', () => h.sql.exec(update))
          if (method === 'getCurrent') await assert.rejects(h.reader[method](h.request), /no such table: campaigns/)
          else assert.equal(await h.reader[method](h.request), undefined)
          h.assertInterleaved()
          assert.equal(await h.reader.getIdentity(h.request), undefined)
        } finally { h.close() }
      })
    }

    contract('BASE-ACCESS-003', `${kind} ${method}: current restricted policy returns false without querying campaigns`, async () => {
      const h = await fixture(kind)
      try {
        h.sql.exec('ALTER TABLE campaigns RENAME TO unavailable_campaigns')
        for (const restricted of [h.rules.slice(1), h.rules.map(rule => ({ ...rule, readableFields: [] })), h.rules.map(rule => ({ ...rule, purposes: ['export'] }))]) {
          h.policy(restricted)
          const current = await h.reader[method](h.request)
          assert.equal(current.operator.id, h.owner)
          assert.equal(current.launchInUse, false)
          if (method === 'getDocumentCurrent') assert.equal(current.launchAvailability, 'available')
          assert.equal(h.events.filter(event => event.text === navigation).length, 0)
        }
      } finally { h.close() }
    })

    contract('BASE-ACCESS-003', `${kind} ${method}: policy revocation during navigation still fences the projection`, async () => {
      const h = await fixture(kind)
      try {
        h.arm('navigation', () => h.policy([]))
        const current = await h.reader[method](h.request)
        h.assertInterleaved()
        assert.equal(current.operator.id, h.owner)
        assert.equal(current.launchInUse, false)
        assert.equal(h.events.find(event => finalGuard(event.text)).result, null)
      } finally { h.close() }
    })

    for (const differentPrincipal of [false, true]) {
      contract('AUTH-BASE-001 BASE-ACCESS-003', `${kind} ${method}: navigation cannot join a different ${differentPrincipal ? 'principal' : 'session'}`, async () => {
        const h = await fixture(kind)
        try {
          const rebind = await h.rebind(differentPrincipal)
          h.arm('final guard', rebind)
          assert.equal(await h.reader[method](h.request), undefined)
          h.assertInterleaved()
          const replacement = await h.reader.getIdentity(h.request)
          assert.ok(replacement, 'Fail closed for a changed binding even though the replacement credential is valid')
          assert.equal(replacement.operator.id === h.owner, !differentPrincipal)
        } finally { h.close() }
      })
    }

    contract('VIEW-001', `${kind} ${method}: a successful projection returns freshly read session fields`, async () => {
      const h = await fixture(kind)
      try {
        h.arm('final guard', () => {
          h.sql.prepare("UPDATE operators SET name='Current operator',email='current@example.test' WHERE id=?").run(h.owner)
          h.sql.exec("UPDATE workspace SET name='Current workspace',timezone='Australia/Brisbane',currency='AUD'")
          h.sql.prepare("INSERT INTO notifications(id,created_at,updated_at,operator_id,kind,title,body) VALUES(?,1,1,?,'test','Current notification','Current body')").run(createUlid(), h.owner)
        })
        const current = await h.reader[method](h.request)
        h.assertInterleaved()
        assert.deepEqual(current.operator, { id: h.owner, name: 'Current operator', email: 'current@example.test', initials: 'CO' })
        assert.deepEqual(current.workspace, { id: 'workspace', name: 'Current workspace', timezone: 'Australia/Brisbane', currency: 'AUD' })
        assert.equal(current.unreadNotifications, 1)
        assert.equal(current.launchInUse, true)
        if (method === 'getDocumentCurrent') assert.equal(current.launchAvailability, 'available')
      } finally { h.close() }
    })
  }
}
