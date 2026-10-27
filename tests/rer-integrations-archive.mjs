import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {contract} from './contract.mjs'
import {freshLocalCopy} from './helpers/local-signin-copy.mjs'
import {bindings} from './helpers/rer-data-fixture.mjs'
import {place,matchesArchive} from './helpers/archive-correspondence.mjs'
// Load application TypeScript only after the retained loader has registered.
const {fileStoreArchive}=await import('./helpers/file-store-archive.mjs')
const {restoredRecordCalendar}=await import('./helpers/record-calendar-archive.mjs')

contract('BASE-DATA-001 RECORDS-006 FILE-002 INTEG-004 SYNC-002','file references, copied bytes, calendar and warehouse custody restore through rer import without restored provider authority, and owner reset erases file bytes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-integrations-archive-'))
 let target,stores
 try{
  target=await freshLocalCopy()
  await target.command(['run','db:migrate:local'])
  stores=await fileStoreArchive(directory)
  // FILE-002: restore real reference/copy cells, while every store credential stays revoked.
  await place(join(directory,'file-stores.rer'),join(target.source,'file-stores.rer'))
  await target.rer(['import','--input','file-stores.rer','--yes','--non-interactive'])
  await matchesArchive(target.source,join(target.source,'file-stores.rer'))
  await bindings(target.source,async({DB,FILES})=>{
   assert.deepEqual((await DB.prepare(`SELECT value FROM "${stores.table}" WHERE record_id=? ORDER BY position`).bind(stores.recordId).all()).results.map(row=>row.value),stores.values)
   const connection=await DB.prepare('SELECT state,credential_ref,consent_scopes_json,share_previews FROM provider_connections WHERE id=?').bind(stores.connectionId).first()
   assert.deepEqual(connection,{state:'unconfigured',credential_ref:null,consent_scopes_json:'[]',share_previews:0},'Restored references require reconnect before provider reads')
   assert.equal((await DB.prepare('SELECT count(*) n FROM connection_credentials').first()).n,0)
   assert.deepEqual(Buffer.from(await(await FILES.get(stores.object_key)).arrayBuffer()),stores.bytes,'The requested copy returns with every byte')
   assert.deepEqual(Buffer.from(await(await FILES.get(stores.uploadedKey)).arrayBuffer()),stores.uploadedBytes,'The ordinary uploaded control also returns before the owner erases the installation')
  })
  // The same archive carries the calendar; restoring it never restores provider authority.
  await restoredRecordCalendar(target.source,stores.calendar)
  await target.rer(['reset','--yes','--non-interactive']);await target.command(['run','db:migrate:local'])
  await bindings(target.source,async({DB,FILES})=>{assert.equal((await DB.prepare('SELECT count(*) n FROM evidence_files').first()).n,0);assert.equal(await FILES.get(stores.object_key),null,'Owner reset erases the retained copy bytes');assert.equal(await FILES.get(stores.uploadedKey),null,'Owner reset erases ordinary uploaded bytes equally')})
 }finally{
  if(stores?.calendar.warehouse)await stores.calendar.warehouse.edge.close()
  if(target){await target.log.close();await rm(target.root,{recursive:true,force:true})}
  await rm(directory,{recursive:true,force:true})
 }
})
