import {readFile} from 'node:fs/promises'

/** The isolated repair authority uses the installed identity and guest schema. */
export async function repairAuthorityMigrations(db){
 const migrations=[
  'core/0001_portfolio_spine.sql',
  'core/0100_authority.sql','core/0101_authority_previews.sql',
  'core/0102_native_auth_mail.sql','core/0103_authority_epochs.sql',
  'core/0104_authority_restore_hold.sql','core/0105_reservation_binding.sql',
  'base/9000_base_operator_auth.sql','base/9001_cradle_auth_projection.sql',
  'updates/9081_guests.sql',
 ]
 for(const file of migrations){
  const sql=await readFile(new URL('../../migrations/'+file,import.meta.url),'utf8')
  await db.exec(sql.replace(/^\s*--.*$/gm,'').replaceAll('\n',' '))
 }
}
