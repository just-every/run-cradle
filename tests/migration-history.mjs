import {baseHttpSession} from './helpers/base-http-session.mjs'
import {migrationConfiguration,migrationInventory,migrationGroups} from '../scripts/migration-groups.mjs'
import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { emittedRuntime } from './helpers/emitted-runtime.mjs'
import {createFixtureMail} from './helpers/fixture-mail.mjs'
const { createSampleDataRepository } = await import('../src/core/features/sample-data/repository.ts')
const { prepareLaunchSetup } = await import('../src/apps/launch/setup.server.ts')
import test from 'node:test'
import {freePort} from './helpers/free-port.mjs'

test('prior portfolio IDs and history survive all forward migrations and accept a versioned change',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'cradle-history-')),port=Number(process.env.CRADLE_TEST_PORT ?? await freePort()),origin=`http://127.0.0.1:${port}`
  let runtime,mail
  const bindings={APP_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'maya@northstar.example',MAIL_FROM:'auth@localhost.test',SESSION_SECRET:'test-only-session-secret-32-characters-long'}
  const cli=args=>{const result=spawnSync('pnpm',['exec','wrangler',...args],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(result.status,0,result.stderr||result.stdout)}
  try {
    mail=await createFixtureMail(port)
    Object.assign(bindings,mail.bindings)
    const initial=path.join(directory,'initial');await mkdir(initial)
    for(const file of ['0000_foundation.sql','0001_portfolio_spine.sql'])await copyFile('migrations/core/'+file,path.join(initial,file))
    const config=path.join(directory,'wrangler.json')
    await writeFile(config,JSON.stringify({name:'cradle',compatibility_date:'2026-09-08',d1_databases:[{binding:'DB',database_name:'cradle',database_id:'00000000-0000-0000-0000-000000000000',migrations_dir:initial}]}))
    cli(['d1','migrations','apply','cradle','--config',config,'--local','--persist-to',directory])
    runtime=await emittedRuntime(directory,port,bindings,mail.fetch)
    let db=await runtime.getD1Database('DB')
    const fixture=JSON.parse(await readFile('sample-data/cradle.json','utf8'))
    await createSampleDataRepository({$client:db}).install(fixture)
    const snapshot=async()=>({campaigns:(await db.prepare('SELECT * FROM campaigns ORDER BY id').all()).results,activity:(await db.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results,operators:(await db.prepare('SELECT id,name,email FROM operators ORDER BY id').all()).results})
    const before=await snapshot(),oldLedger=(await db.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results
    assert.ok(oldLedger.length>0)
    await runtime.dispose();runtime=null
    cli(['d1','migrations','apply','cradle','--local','--persist-to',directory])
    const owner=fixture.operators.slice().sort((a,b)=>a.id.localeCompare(b.id))[0].id
    for(const group of migrationGroups.filter(group=>group!=='core')){const config=path.join(directory,group+'.json');await writeFile(config,JSON.stringify(migrationConfiguration(group)));cli(['d1','migrations','apply','cradle','--config',config,'--local','--persist-to',directory])}
    runtime=await emittedRuntime(directory,port,bindings,mail.fetch);db=await runtime.getD1Database('DB')
    const after=await snapshot()
    for(const table of Object.keys(before)){assert.equal(after[table].length,before[table].length);for(const row of before[table]){const retained=after[table].find(value=>value.id===row.id);assert.ok(retained);assert.deepEqual(Object.fromEntries(Object.keys(row).map(key=>[key,retained[key]])),row)}}
    const ledger=(await db.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results
    assert.deepEqual(ledger.slice(0,oldLedger.length),oldLedger,'Applied ledger rows retain their IDs, names and timestamps')
    assert.deepEqual(ledger.map(row=>row.name),migrationInventory().map(m=>m.name),'Every supplied forward migration is applied once in declaration order')
    await db.batch(await prepareLaunchSetup(db,owner))
    await runtime.ready
    const {cookie,csrfToken}=await baseHttpSession(origin)
    const campaign=before.campaigns[0]
    const changed=await fetch(origin+'/api/campaigns/'+campaign.id,{method:'PATCH',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({version:campaign.version,name:'Prior portfolio after rendering transition'})})
    assert.equal(changed.status,200,await changed.clone().text())
    const current=await db.prepare('SELECT id,name,version FROM campaigns WHERE id=?').bind(campaign.id).first()
    assert.deepEqual(current,{id:campaign.id,name:'Prior portfolio after rendering transition',version:campaign.version+1})
    const oldActivity=(await db.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results
    for(const row of before.activity){const retained=oldActivity.find(value=>value.id===row.id);assert.ok(retained);assert.deepEqual(Object.fromEntries(Object.keys(row).map(key=>[key,retained[key]])),row)}
    const report={oldMigrations:oldLedger,newMigrationCount:ledger.length,preservedCampaignIds:before.campaigns.map(row=>row.id),preservedHistoryRows:before.activity.length,current}
    if(process.env.CRADLE_HISTORY_EVIDENCE)await writeFile(process.env.CRADLE_HISTORY_EVIDENCE,JSON.stringify(report,null,2))
    console.log(JSON.stringify(report))
  } finally {try{if(runtime)await runtime.dispose()}finally{await mail?.close();await rm(directory,{recursive:true,force:true})}}
})
