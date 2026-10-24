import {fileStoreArchive} from './helpers/file-store-archive.mjs'
import assert from 'node:assert/strict'
import {chmod,copyFile,mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {contract} from './contract.mjs'
import {freshLocalCopy} from './helpers/local-signin-copy.mjs'
import {bindings} from './helpers/rer-data-fixture.mjs'
import {platformArchive} from './helpers/platform-archive.mjs'
import {fileRecords} from '@runeditrun/rer/modules/portability/files'
import {encodedRow} from '@runeditrun/rer/modules/portability/catalogue'
import {canonicalJson} from '@runeditrun/rer/modules/portability'
import {platformTable} from '@runeditrun/rer/internal/modules/portability/bookkeeping.mjs'

// rer import reads only an owner's private file, as rer export writes it.
const place=async(from,to)=>{await copyFile(from,to);await chmod(to,0o600)}
const quote=name=>'"'+name.replaceAll('"','""')+'"'
async function matchesArchive(root,path){
 const records=[];for await(const record of fileRecords(path))records.push(record)
 const manifest=records[0],items=records.filter(r=>r.kind==='part').flatMap(r=>r.items),tables=manifest.tables.filter(t=>!platformTable(t.name))
 await bindings(root,async({DB,FILES})=>{
  for(const table of tables){
   const rows=(await DB.prepare(`SELECT * FROM ${quote(table.name)}`).all()).results
   const actual=rows.map(row=>canonicalJson(encodedRow(table,row,manifest.excludedColumns[table.name]??[]))).sort()
   const expected=items.filter(i=>i.kind==='row'&&i.table===table.name).map(i=>canonicalJson(i.row)).sort()
   assert.deepEqual(actual,expected,'Every archived cell: '+table.name)
  }
  for(const object of manifest.objects){
   const file=await FILES.get(object.key);assert.ok(file,object.key)
   const chunks=items.filter(i=>i.kind==='object'&&i.key===object.key&&i.bucket===object.bucket).sort((a,b)=>a.offset-b.offset)
   assert.deepEqual(Buffer.from(await file.arrayBuffer()),Buffer.concat(chunks.map(i=>Buffer.from(i.data,'base64'))),'Every archived file byte: '+object.key)
   assert.deepEqual(file.httpMetadata,object.httpMetadata)
   assert.deepEqual(file.customMetadata,object.customMetadata)
  }
 })
 console.log('ARCHIVE_MATCH '+JSON.stringify({archive:path.split('/').at(-1),tables:tables.length,rows:tables.reduce((n,t)=>n+t.count,0),objects:manifest.objects.length}))
 return manifest
}
contract('BASE-DATA-001 RECORDS-006','a backup made by the previous version, and a native export of a RER Platform install, restore through rer import with every row and file; an unknown table is refused',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-platform-archive-'))
 let target
 try{
  // The previous listed version's backup, made on RER Platform: it carries Platform's migration ledger.
  target=await freshLocalCopy()
  await target.command(['run','db:migrate:local'])
  const ledger=()=>bindings(target.source,async({DB})=>(await DB.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results)
  const before=await ledger()
  await place('tests/fixtures/portability/cradle-prior.rer',join(target.source,'retained.rer'))
  await target.rer(['import','--input','retained.rer','--yes','--non-interactive'])
  const retained=await matchesArchive(target.source,join(target.source,'retained.rer'))
  assert.ok(retained.tables.some(t=>t.name==='rer_migrations'),'the retained backup carries the Platform ledger')
  assert.deepEqual(await ledger(),before,'restore keeps the destination migration history')
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
  // FILE-002: restore real reference/copy cells, while every store credential stays revoked.
  const stores=await fileStoreArchive(directory)
  await target.rer(['reset','--yes','--non-interactive']);await target.command(['run','db:migrate:local'])
  await place(join(directory,'file-stores.rer'),join(target.source,'file-stores.rer'))
  await target.rer(['import','--input','file-stores.rer','--yes','--non-interactive'])
  await matchesArchive(target.source,join(target.source,'file-stores.rer'))
  await bindings(target.source,async({DB,FILES})=>{
   assert.deepEqual((await DB.prepare(`SELECT value FROM "${stores.table}" WHERE record_id=? ORDER BY position`).bind(stores.recordId).all()).results.map(row=>row.value),stores.values)
   const connection=await DB.prepare('SELECT state,credential_ref,consent_scopes_json,share_previews FROM provider_connections WHERE id=?').bind(stores.connectionId).first()
   assert.deepEqual(connection,{state:'unconfigured',credential_ref:null,consent_scopes_json:'[]',share_previews:0},'Restored references require reconnect before provider reads')
   assert.equal((await DB.prepare('SELECT count(*) n FROM connection_credentials').first()).n,0)
   assert.deepEqual(Buffer.from(await(await FILES.get(stores.object_key)).arrayBuffer()),stores.bytes,'The requested copy returns with every byte')
  })
 }finally{
  if(target){await target.log.close();await rm(target.root,{recursive:true,force:true})}
  await rm(directory,{recursive:true,force:true})
 }
})
