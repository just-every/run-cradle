import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {contract} from './contract.mjs'
import {emittedRuntime} from './helpers/emitted-runtime.mjs'
import {migrationGroups,migrationConfiguration} from '../scripts/migration-groups.mjs'

for(const priorBase of [false,true])contract('RECORDS-005 BASE-OPS-002',`additive import migrations preserve ${priorBase?'an existing Base installation':'the original core family'} bytes, ledger, rows and IDs`,async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cradle-import-upgrade-'))
 let runtime
 const apply=async group=>{const config=path.join(directory,group+'.json');await writeFile(config,JSON.stringify(migrationConfiguration(group)));const result=spawnSync('pnpm',['exec','wrangler','d1','migrations','apply','cradle','--local','--persist-to',directory,'--config',config],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(result.status,0,result.stderr||result.stdout)}
 const open=async()=>{runtime=await emittedRuntime(directory,0,{});return runtime.getD1Database('DB')}
 try {
  await apply('core');if(priorBase)await apply('base');let db=await open()
  await db.prepare("INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES('00000000000000000000000701','Retained owner','retained@example.test',1,1,1,1)").run()
  const rows=(await db.prepare('SELECT * FROM operators ORDER BY id').all()).results,ledger=(await db.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results
  assert.ok(ledger.length > 0)
  await runtime.dispose();runtime=undefined
  for(const group of migrationGroups.filter(group=>group!=='core'&&(!priorBase||group!=='base')))await apply(group)
  db=await open()
  assert.deepEqual((await db.prepare('SELECT * FROM operators ORDER BY id').all()).results,rows)
  const migrated=(await db.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results
  assert.deepEqual(migrated.slice(0,ledger.length),ledger)
  for(const table of ['ik_jobs','ik_d1_reversal_reports','ik_d1_creation_plans','record_import_reviews'])assert.ok(await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(table).first(),table)
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[])
 }finally{await runtime?.dispose();await rm(directory,{recursive:true,force:true})}
})
