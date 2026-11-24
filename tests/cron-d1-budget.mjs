import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {migrationInventory} from '../scripts/migration-groups.mjs'

// The minute cron on Workers Free shares 5,000,000 D1 rows read a day with every other tool on the
// account. One scheduled run, at the default 30 days of history, must read a flat handful of rows.
const LAUNCH='00000000000000000000000700',OTHER='00000000000000000000000900'
const DAYS=30,EVENTS_PER_DAY=150,ATTEMPTS_PER_DAY=50,ANALYSES_PER_DAY=20,DAY=86_400_000
const rowsPerRunCeiling=1_500

const meter=(statement,log)=>({
 bind:(...values)=>meter(statement.bind(...values),log),
 all:async()=>{const r=await statement.all();log.push(r.meta.rows_read);return r},
 first:async column=>{const r=await statement.all();log.push(r.meta.rows_read);const row=r.results[0]??null;return column?(row?row[column]:null):row},
 run:async()=>{const r=await statement.run();log.push(r.meta.rows_read);return r},
 raw:(...args)=>statement.raw(...args),statement,
})
const metered=(db,log)=>({
 prepare:sql=>meter(db.prepare(sql),log),
 batch:async statements=>{const results=await db.batch(statements.map(s=>s.statement??s));for(const r of results)log.push(r.meta?.rows_read??0);return results},
 exec:sql=>db.exec(sql),
})

async function seedHistory(db,now){
 const iso=expression=>`strftime('%Y-%m-%dT%H:%M:%fZ',(${expression})/1000.0,'unixepoch')`
 await db.prepare("INSERT INTO workspace_settings(id,created_at,updated_at,workspace_name,timezone,currency,quiet_hours_start,quiet_hours_end) VALUES('w',0,0,'Co','UTC','USD','22:00','07:00')").run()
 await db.prepare("INSERT INTO command_admissions(command_id,batch_nonce,actor_id,actor_kind,app_id,action,input_hash,state,access_json,created_at,updated_at) VALUES('c0','n0','a','human','x','x','h','committed','{}','t','t')").run()
 await db.prepare("INSERT INTO execution_runs(id,app_id,origin_command_id,request_json,state,control_epoch,cause_identity,created_at,updated_at) VALUES('r0','x','c0','{}','completed',1,'ci','t','t')").run()
 const series=(count,columns,values)=>db.prepare(`WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<${count-1}) ${columns} SELECT ${values} FROM n`).bind(now).run()
 const age=(perDay,step)=>`?1-(i/${perDay})*${DAY}-(i%${perDay})*${step}-600000`
 await series(DAYS*EVENTS_PER_DAY,'INSERT INTO admission_events(id,command_id,app_id,name,version,payload_json,cause_run_ids_json,created_at)',
  `'ev'||i,'c0',CASE WHEN i%3=0 THEN '${LAUNCH}' ELSE '${OTHER}' END,'record.updated',1,'{}','[]',${iso(age(EVENTS_PER_DAY,1000))}`)
 await db.prepare(`INSERT INTO launch_event_dispatches(event_id,processed_at) SELECT id,created_at FROM admission_events WHERE app_id='${LAUNCH}'`).run()
 await series(DAYS*ATTEMPTS_PER_DAY,'INSERT INTO execution_attempts(id,run_id,command_id,connection_id,action,provider,idempotency_key,input_hash,state,lease_epoch,reservation_ids_json,unknown_deadline,custodian_id,created_at,updated_at)',
  `'at'||i,'r0','c0','conn',CASE WHEN i%5=0 THEN 'record.calendar.sync' ELSE 'channel.mail' END,'p','k'||i,'h','confirmed',1,'[]','t','cu',${iso(age(ATTEMPTS_PER_DAY,60000))},${iso(age(ATTEMPTS_PER_DAY,60000))}`)
 await series(DAYS*ATTEMPTS_PER_DAY/4,'INSERT INTO record_calendar_changes(id,definition_id,record_id,command_id,state,created_at,updated_at)',
  `'cc'||i,'d0','rec','c'||i,'complete',${iso(age(ATTEMPTS_PER_DAY/4,60000))},${iso(age(ATTEMPTS_PER_DAY/4,60000))}`)
 await series(DAYS*ANALYSES_PER_DAY,'INSERT INTO launch_analysis_requests(id,created_at,updated_at,version,actor_id,state,input_json)',
  `'ar'||i,${age(ANALYSES_PER_DAY,1000)},${age(ANALYSES_PER_DAY,1000)},1,'a',CASE WHEN i%7=0 THEN 'Unknown' ELSE 'Complete' END,'{}'`)
 await series(DAYS*ANALYSES_PER_DAY,'INSERT INTO launch_model_calls(id,created_at,updated_at,local_day,feature,model,request_id,state)',
  `'mc'||i,${age(ANALYSES_PER_DAY,1000)},${age(ANALYSES_PER_DAY,1000)},'2026-01-01','f','m','ar'||i,'complete'`)
}

test('a minute cron run reads a flat handful of D1 rows however much history the install holds',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-cron-budget-'))
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-07',d1Databases:{DB:'cron-budget'}}))
 try{
  await writeFile(join(directory,'cloudflare-workers.mjs'),'export class DurableObject{};export class WorkerEntrypoint{};export const env={}')
  await build({entryPoints:['tests/cron-runtime-entry.ts'],outfile:join(directory,'runtime.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error',alias:{'cloudflare:workers':join(directory,'cloudflare-workers.mjs')}})
  const {createPlatform,createRuntime,createRuntimeEvents}=await import(join(directory,'runtime.mjs'))
  const raw=await mf.getD1Database('DB')
  for(const {sql} of migrationInventory())await raw.exec(sql.replace(/^\s*--.*$/gm,'').replaceAll('\n',' '))
  const now=Date.now()
  await seedHistory(raw,now)
  const log=[],store=()=>({get:()=>({fetch:async()=>new Response('{}')}),idFromName:()=>'installation'}),bucket={head:async()=>null,get:async()=>null,put:async()=>({}),delete:async()=>{},list:async()=>({objects:[]})}
  const bindings={DB:metered(raw,log),FILES:bucket,WAREHOUSE:bucket,WORK_QUEUE:{send:async()=>{},sendBatch:async()=>{}},ASSETS:{fetch:async()=>new Response('')},INSTALLATION:store(),
   OWNER_EMAIL:'owner@example.test',APP_ORIGIN:'http://localhost:8787',SESSION_SECRET:'s'.repeat(40),MAIL_PROVIDER:'development',RER_DEV_KEY:'k',INSTALLATION_RELEASE_ID:'00000000000000000000000782',AUTH_LOCAL:'true'}
  const cron=async()=>{
   log.length=0
   const platform=createPlatform(bindings),clock=()=>new Date()
   await createRuntimeEvents(platform,await createRuntime(platform,clock),clock).scheduled()
   return log.reduce((a,b)=>a+b,0)
  }
  await cron() // first run proves schema facts and moves the launch-event cursor over the history
  // A launch event that arrives after the history is still dispatched, and the run stays flat.
  await raw.prepare(`INSERT INTO admission_events(id,command_id,app_id,name,version,subject_json,payload_json,cause_run_ids_json,created_at) VALUES('late','c0',?,'record.updated',1,'null','null','[]',?)`).bind(LAUNCH,new Date(now).toISOString()).run()
  const rows=await cron()
  assert.equal((await raw.prepare("SELECT count(*) n FROM launch_event_dispatches WHERE event_id='late'").first()).n,1,'the new launch event is dispatched')
  assert.ok(rows<=rowsPerRunCeiling,`one cron run read ${rows} rows at ${DAYS} days of history; ceiling ${rowsPerRunCeiling}`)
  console.log(`CRON_D1_ROWS_READ: ${rows} rows in ${log.length} statements at ${DAYS} days of history`)
 }finally{await mf.dispose();await rm(directory,{recursive:true,force:true})}
})
