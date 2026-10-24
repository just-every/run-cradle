import assert from 'node:assert/strict'
import {migrationInventory} from '../../scripts/migration-groups.mjs'
/** The actual populated pre-9074 D1 schema crosses the additive upgrade. */
export async function chatInstallationUpgrade(db){
 const migrations=migrationInventory(),cut=migrations.findIndex(migration=>migration.name==='9074_parallel_chat_providers.sql')
 assert.ok(cut>0)
 const migrate=async migration=>db.exec(migration.sql.replace(/^\s*--.*$/gm,'').replaceAll('\n',' '))
 for(const migration of migrations.slice(0,cut))await migrate(migration)
 const instance='synthetic-cradle-126-retained-instance',team='synthetic-cradle-126-retained-team'
 await db.prepare("INSERT INTO slack_app_installation(id,owner_id,client_id,sealed_json,bot_sealed_json,team_id,team_name,version,updated_at,provider,api_origin,instance_id) VALUES('installation','synthetic-cradle-126-owner','synthetic-cradle-126-client','synthetic-cradle-126-sealed','synthetic-cradle-126-bot',?,'synthetic-cradle-126-workspace',9,'2026-10-24T00:00:00Z','slack',NULL,?)").bind(team,instance).run()
 await db.prepare("INSERT INTO slack_app_links VALUES(?,'synthetic-cradle-126-person','synthetic-cradle-126-principal',3,'synthetic-cradle-126-base',4,123)").bind(team).run()
 await db.prepare("INSERT INTO slack_app_oauth_states VALUES('synthetic-cradle-126-state','synthetic-cradle-126-owner','synthetic-cradle-126-session',9,9999999999999,NULL,?)").bind(instance).run()
 await db.prepare("INSERT INTO slack_app_link_codes VALUES('synthetic-cradle-126-code','synthetic-cradle-126-principal',3,'synthetic-cradle-126-base',4,9999999999999,NULL,?)").bind(instance).run()
 await db.prepare("INSERT INTO slack_app_actions(id,run_id,author_id,app_id,entity_id,record_id,record_version,field_id,approve_json,reject_json,team_id,channel_id,config_version,delivery_state,choice_state,created_at,installation_instance) VALUES('synthetic-cradle-126-card','synthetic-cradle-126-run','synthetic-cradle-126-owner','synthetic-cradle-126-app','synthetic-cradle-126-table','synthetic-cradle-126-record',1,'synthetic-cradle-126-field','true','false',?,'synthetic-cradle-126-channel',9,'sent','pending',123,?)").bind(team,instance).run()
 const before=await db.prepare("SELECT * FROM slack_app_installation WHERE id='installation'").first()
 const tables=['slack_app_links','slack_app_oauth_states','slack_app_link_codes','slack_app_actions'],retained={}
 for(const table of tables)retained[table]=(await db.prepare('SELECT * FROM '+table).all()).results
 for(const migration of migrations.slice(cut))await migrate(migration)
 const after=await db.prepare("SELECT * FROM slack_app_installation WHERE id='slack'").first()
 assert.deepEqual(after,{...before,id:'slack'},'Provider expansion preserves every credential, instance, workspace and version byte')
 for(const table of tables)assert.deepEqual((await db.prepare('SELECT * FROM '+table).all()).results,retained[table],table+' survives the populated upgrade unchanged')
 // Retained synthetic credentials are not a usable installation; public-door
 // journeys below provision valid credentials through Settings and native auth.
 for(const table of tables)await db.prepare('DELETE FROM '+table).run()
 await db.prepare('DELETE FROM slack_app_installation').run()
 console.log('CHAT_INSTALLATION_UPGRADE_PASS pre-9074 credentials instance cards links consent retained')
}
