import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {contract} from './contract.mjs'
import {freshLocalCopy} from './helpers/local-signin-copy.mjs'
import {bindings,ownedData} from './helpers/rer-data-fixture.mjs'
import {platformArchive} from './helpers/platform-archive.mjs'
import {platformTable} from '@runeditrun/rer/internal/modules/portability/bookkeeping.mjs'
import {place,matchesArchive} from './helpers/archive-correspondence.mjs'

contract('BASE-DATA-001 RECORDS-006 SYNC-002','a backup made by the previous version, and a native export of a RER Platform install, restore through rer import with every row and file; an unknown table is refused',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-platform-archive-'))
 let target
 try{
  // The previous listed version's backup, made on RER Platform: it carries Platform's migration ledger.
  target=await freshLocalCopy()
  await target.command(['run','db:migrate:local'])
  const ledger=()=>bindings(target.source,async({DB})=>(await DB.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results)
  const before=await ledger()
  // The original Platform v2 archive lacks a schema-object inventory. It stays
  // untouched as a refusal control; legacy-v1 recovery cannot attest a v2 file.
  await place('tests/fixtures/portability/cradle-prior.rer',join(target.source,'unverified.rer'))
  const original=JSON.parse((await readFile(join(target.source,'unverified.rer'),'utf8')).split('\n')[0])
  assert.ok(original.tables.some(t=>t.name==='rer_migrations'),'the retained backup carries the Platform ledger')
  const tables=await bindings(target.source,async({DB})=>(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all()).results.filter(table=>!platformTable(table.name)))
  const empty=await ownedData(target.source,tables)
  await assert.rejects(target.rer(['import','--input','unverified.rer','--yes','--non-interactive']),e=>e.errorCode==='restore_refused'&&e.message.includes('schema_mismatch:legacy_schema'))
  assert.deepEqual(await ownedData(target.source,tables),empty,'Uninventoried v2 refusal writes no product row or file')
  assert.deepEqual(await ledger(),before,'Uninventoried v2 refusal changes no destination migration receipt')
  // Genuine v0.3.0 content exported through rer 0.2.80, never a fabricated archive.
  await place('tests/fixtures/portability/cradle-prior-0.3.0-rer-0.2.80.rer',join(target.source,'retained.rer'))
  await target.rer(['import','--input','retained.rer','--yes','--non-interactive'])
  await matchesArchive(target.source,join(target.source,'retained.rer'))
  assert.deepEqual(await ledger(),before,'restore keeps the destination migration history')
  assert.equal(await bindings(target.source,async({DB})=>DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rer_migrations'").first()),null,'The Platform migration ledger never travels into the destination')
  await target.rer(['reset','--yes','--non-interactive'])
  await target.command(['run','db:migrate:local'])
  const reset=await ledger()
  // This version's own export of a Platform-installed database round-trips; the ledger never travels.
  const platformLedger=await platformArchive(directory)
  assert.equal(platformLedger.length,JSON.parse(await readFile('management/integration/deployment-spec.json','utf8')).migrations.length)
  await place(join(directory,'unknown.rer'),join(target.source,'unknown.rer'))
  await assert.rejects(target.rer(['import','--input','unknown.rer','--yes','--non-interactive']),e=>e.errorCode==='restore_refused'&&e.message.includes('unsupported_record_schema'))
  assert.deepEqual(await ledger(),reset,'an unknown table changes no migration receipt')
  await place(join(directory,'platform.rer'),join(target.source,'platform.rer'))
  await target.rer(['import','--input','platform.rer','--yes','--non-interactive'])
  const native=await matchesArchive(target.source,join(target.source,'platform.rer'))
  assert.ok(!native.tables.some(t=>t.name==='rer_migrations'),'a native export never carries the Platform ledger')
  assert.deepEqual(await ledger(),reset,'restore keeps the destination migration history')
  await bindings(target.source,async({DB})=>{
   const watched=await DB.prepare("SELECT enabled FROM record_watches WHERE id='synthetic-cradle-150-watch'").first();assert.equal(watched.enabled,0,'Restore retains personal watch history with automatic watching paused');
   const event=await DB.prepare("SELECT body,completed_at FROM record_watch_events WHERE id='synthetic-cradle-150-event'").first();assert.equal(event.body,'synthetic-cradle-150-retained-change');assert.notEqual(event.completed_at,null,'A captured daily event cannot be delivered again after restore');
   const chats=(await DB.prepare("SELECT id,state FROM record_watch_chat_deliveries ORDER BY id").all()).results;assert.deepEqual(chats,[{id:'synthetic-cradle-150-queued',state:'cancelled'},{id:'synthetic-cradle-150-unknown',state:'unknown'}],'Queued chat is cancelled and uncertain provider acceptance is retained without replay');
  })
 }finally{
  if(target){await target.log.close();await rm(target.root,{recursive:true,force:true})}
  await rm(directory,{recursive:true,force:true})
 }
})
