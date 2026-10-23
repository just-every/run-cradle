import assert from 'node:assert/strict'
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {emittedRuntime} from './emitted-runtime.mjs'
import {migrationInventory} from '../../scripts/migration-groups.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {prepareLaunchSetup} from '../../src/apps/launch/setup.server.ts'
import {completeFirstRun} from './complete-first-run.mjs'
export async function recordsBrowserRuntime(port=0,{networkEdge,bindings={}}={}){
 const directory=await mkdtemp(path.join(process.env.TMPDIR??tmpdir(),'records-ui-')),owner='00000000000000000000000981'
 const runtime=await emittedRuntime(directory,port,{APP_ORIGIN:`http://127.0.0.1:${port}`,AUTH_LOCAL:'true',OWNER_EMAIL:'records-owner@example.test',MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test',SESSION_SECRET:'test-only-records-session-secret-at-least-32-characters',...bindings},networkEdge)
 try{
  const origin=(await runtime.ready).origin
  const db=await runtime.getD1Database('DB')
  for(const {sql} of migrationInventory())await db.exec(sql.replace(/^\s*--.*$/gm,'').replaceAll('\n',' '))
  const time=Date.now()
  await db.prepare('INSERT INTO operators(id,created_at,updated_at,name,email,active) VALUES(?,?,?,?,?,1)').bind(owner,time,time,'Records Owner','records-owner@example.test').run()
  await db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',1,?,?)").bind(owner,owner,time,time).run()
  await db.prepare("INSERT INTO workspace(id,created_at,updated_at,name,timezone,currency) VALUES('workspace',?,?,'Records test','Australia/Brisbane','AUD')").bind(time,time).run()
  await db.prepare("INSERT INTO workspace_settings(id,created_at,updated_at,workspace_name,timezone,currency,quiet_hours_start,quiet_hours_end) VALUES('workspace',?,?,'Records test','Australia/Brisbane','AUD','18:00','08:00')").bind(time,time).run()
  await db.batch(await prepareLaunchSetup(db,owner))
  await runtime.ready
  const auth=await createFixtureAuth(db,{appOrigin:origin,sessionSecret:'test-only-records-session-secret-at-least-32-characters',mode:'development'},owner)
  const {cookie}=await auth.signIn(owner)
  await completeFirstRun(origin,cookie)
  return {runtime,db,origin,cookie,async close(){await runtime.dispose();await rm(directory,{recursive:true,force:true})}}
 }catch(error){await runtime.dispose();await rm(directory,{recursive:true,force:true});throw error}
}
