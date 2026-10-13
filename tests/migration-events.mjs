import {sessionCookieWithToken} from './helpers/session-cookies.mjs'
import {baseHttpSession} from './helpers/base-http-session.mjs'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { emittedRuntime } from './helpers/emitted-runtime.mjs'
import { installLegacyFixture } from './helpers/install-legacy-fixture.mjs'
import { expiredToken, revokedToken, authoritySessionControlsSql } from './helpers/session-controls.mjs'
import { contract } from './contract.mjs'
import {freePort} from './helpers/free-port.mjs'

contract('BASE-OPS-004','emitted event exports preserve durable failure state without external sending',async(context)=>{
  const directory=await mkdtemp(path.join(tmpdir(),'cradle-events-')),port=Number(process.env.CRADLE_TEST_PORT ?? await freePort())
  let runtime
  try {
    const migration=spawnSync(process.execPath, ['scripts/migrate-local.mjs', '--persist-to', directory],{encoding:'utf8',maxBuffer:16*1024*1024})
    assert.equal(migration.status,0,migration.stderr||migration.stdout)
    const member=await installLegacyFixture(directory)
    runtime=await emittedRuntime(directory,port,{APP_ORIGIN:`http://127.0.0.1:${port}`,AUTH_LOCAL:'true',OWNER_EMAIL:'maya@northstar.example',MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test',SESSION_SECRET:'test-only-session-secret-32-characters-long'})
    const worker=await runtime.getWorker(),db=await runtime.getD1Database('DB')
    await context.test('[BASE-ACCESS-002] versioned API known and unknown members independently check session controls',async()=>{
      const origin=`http://127.0.0.1:${port}`
      await runtime.ready
      const {cookie}=await baseHttpSession(origin)
      await db.exec(authoritySessionControlsSql(member,Date.now()))
      for(const control of ['',sessionCookieWithToken(cookie,expiredToken),sessionCookieWithToken(cookie,revokedToken),cookie])for(const route of ['/api/v1','/api/v1/session','/api/v1/migration/unknown']){
        const response=await fetch(origin+route,{headers:control?{cookie:control}:{}}),body=await response.text()
        assert.equal(response.status,control===cookie?(route.endsWith('/session')?200:404):401,route)
        if(control!==cookie)assert.doesNotMatch(body,/Maya Chen|maya@|Northstar/)
      }
    })
    const notification=await db.prepare('SELECT id FROM notifications LIMIT 1').first()
    const insert=async id=>db.prepare("INSERT INTO channel_deliveries(id,notification_id,operator_id,kind,state,due_at,created_at,updated_at,version) VALUES(?,?,?,'migration-event','queued',0,0,0,1)").bind(id,notification.id,member).run()
    await insert('migration-scheduled')
    const scheduled=await worker.scheduled({cron:'* * * * *'})
    const afterScheduled=await db.prepare('SELECT state,version,error_code FROM channel_deliveries WHERE id=?').bind('migration-scheduled').first()
    assert.deepEqual(afterScheduled,{state:'failed',version:2,error_code:'delivery_preparation_failed'})
    await insert('migration-queue')
    const queue=await worker.queue('cradle-work',[{id:'migration-wake',timestamp:Date.now(),attempts:1,body:{kind:'cradle.channels.wake.v1'}}])
    const afterQueue=await db.prepare('SELECT state,version,error_code FROM channel_deliveries WHERE id=?').bind('migration-queue').first()
    assert.deepEqual(afterQueue,afterScheduled)
    const invalid=await worker.queue('cradle-work',[{id:'invalid-envelope',timestamp:Date.now(),attempts:1,body:{kind:'invalid'}}])
    assert.ok(JSON.stringify(invalid).includes('invalid-envelope'))
    const evidence={scheduled,queue,invalid,afterScheduled,afterQueue,namedExports:'isHonoRequest is a pure dispatcher predicate; no Durable Object/Workflow/email exports are declared',externalSending:'none; missing sender configuration durably fails deliveries'}
    if(process.env.CRADLE_EVENT_EVIDENCE)await writeFile(process.env.CRADLE_EVENT_EVIDENCE,JSON.stringify(evidence,null,2))
    console.log(JSON.stringify(evidence))
  } finally {if(runtime)await runtime.dispose();await rm(directory,{recursive:true,force:true})}
})
