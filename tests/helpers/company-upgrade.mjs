import assert from 'node:assert/strict'
import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {bindings,visibleData} from './rer-data-fixture.mjs'
/** Recreate the preceding populated schema, then replay its creation and dependent audit migration. */
export async function companyUpgrade(copy){
 const upgrades=(await readdir(join(copy.source,'migrations/updates'))).filter(name=>/^904[123]_/.test(name)||name==='9071_rotation_audit_keys.sql'),before=await visibleData(copy.source)
 const previous=await bindings(copy.source,async({DB})=>{
  for(const {name}of (await DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE '%_capacity_insert' OR name LIKE '%_capacity_delete')").all()).results)await DB.prepare('DROP TRIGGER "'+name.replaceAll('"','""')+'"').run()
  for(const table of ['record_capacity','record_sheet_schedules','record_sheet_snapshots','company_identity_audit','company_saml_assertions','company_saml_requests','company_scim_users','company_scim_credentials','company_identity_config'])await DB.prepare('DROP TABLE '+table).run()
  for(const name of upgrades)await DB.prepare('DELETE FROM d1_migrations WHERE name=?').bind(name).run()
  return (await DB.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results
 })
 await copy.command(['run','db:migrate:local'])
 assert.deepEqual(await visibleData(copy.source),before,'Company, sheet and capacity upgrades retain populated records, generated values, files and search')
 const ledger=await bindings(copy.source,async({DB})=>(await DB.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results)
 assert.deepEqual(ledger.filter(row=>!upgrades.includes(row.name)),previous,'Company campaign upgrade preserves prior migration entries and timestamps')
 console.log('COMPANY_WORKBOOK_CAPACITY_UPGRADE: populated preceding schema retained through shipped migration command')
}
