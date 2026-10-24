import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {migrationInventory} from '../../scripts/migration-groups.mjs'
/** Recreate the actual pre-9050 boundary around populated records and consent custody, then apply its shipped additive SQL. */
export async function recordCalendarUpgrade({h,call,base,recordId,connectionId}){
 const tables=['record_calendar_changes','record_calendar_events','record_calendar_versions','record_calendar_catalogues','record_calendar_definitions']
 assert.equal((await h.db.prepare('SELECT count(*) n FROM record_calendar_definitions').first()).n,0,'The upgrade fixture has no calendar configuration yet')
 const record=(await call(base+'/records/'+recordId)).record,schema=await call(base),connection=await h.db.prepare('SELECT account_id,state,consent_scopes_json,version FROM provider_connections WHERE id=?').bind(connectionId).first(),sealed=await h.db.prepare('SELECT sealed_json FROM connection_credentials WHERE connection_id=?').bind(connectionId).first(),hash=value=>createHash('sha256').update(value).digest('hex'),cipherHash=hash(sealed.sealed_json)
 for(const table of tables)await h.db.prepare('DROP TABLE '+table).run()
 assert.equal((await h.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'record_calendar_%'").first()).n,0)
 const migration=migrationInventory().find(m=>m.name==='9050_record_calendar_sync.sql');assert.ok(migration)
 await h.db.exec(migration.sql.replace(/^\s*--.*$/gm,'').replaceAll('\n',' '))
 assert.deepEqual((await call(base+'/records/'+recordId)).record,record,'The populated pre-calendar record survives the additive migration')
 assert.deepEqual(await call(base),schema,'Schema identity and typed date fields remain unchanged')
 assert.deepEqual(await h.db.prepare('SELECT account_id,state,consent_scopes_json,version FROM provider_connections WHERE id=?').bind(connectionId).first(),connection,'The existing calendar account and approval scopes are preserved')
 assert.ok(hash((await h.db.prepare('SELECT sealed_json FROM connection_credentials WHERE connection_id=?').bind(connectionId).first()).sealed_json)===cipherHash,'Existing sealed consent bytes are unchanged')
 // The caller immediately configures this field through the native UI and exercises real effects.
}
