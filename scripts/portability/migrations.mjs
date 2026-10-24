import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {PortabilityError} from '@runeditrun/rer/modules/portability';
import {policy,schemaIdentity} from '@runeditrun/rer/modules/portability/catalogue';
import {migrationReplay} from '@runeditrun/rer/modules/portability/migration-history';
import {appliedMigrations} from '@runeditrun/rer/internal/modules/portability/bridge.mjs';
import {migrationInventory} from '../migration-groups.mjs';

// Records bases are schema the owner builds at runtime, not migrations: each
// base's physical table and its indexes and search tables are named r_<entity
// ULID>... (src/domains/records/descriptors.server.ts generatedName). No
// migration creates an object in that namespace. Calendar capture triggers are
// likewise rebuilt by the seed compiler from the archived record definitions.
const recordObject=name=>/^(?:r_[0-9a-hjkmnp-tv-z]{26}(?:_|$)|record_calendar_[0-9a-hjkmnp-tv-z]{26}_(?:insert|update)$)/.test(name);

/**
 * Replay the destination's applied files in its recorded order, never the
 * archive's SQL, followed by the destination's own Records base objects (those
 * prepareRecordRestore compiled from the archived record schema, or created
 * here earlier). Any other object no migration makes still differs from the
 * replay, and Base refuses the restore.
 */
export async function restoreMigrations(db,root,input){
 const {unstable_splitSqlQuery:split}=createRequire(join(root,'package.json'))('wrangler');
 const files=new Map(migrationInventory().map(m=>[m.name,m.sql]));
 const names=await appliedMigrations(db)??[];
 const plan=names.map(name=>{
  const sql=files.get(name);
  if(sql===undefined)throw new PortabilityError('schema_mismatch:migration_history',409);
  // A Wrangler ledger records no hash; the file's own hash checks an archived ledger's claim.
  return {name,statements:split(sql),sha256:createHash('sha256').update(sql).digest('hex')};
 });
 const records=(await db.prepare('SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid').all()).results.filter(o=>recordObject(o.name));
 const replay=migrationReplay(plan,input),config=policy(input);
 return {...replay,async schemaAfter(chosen){
  const scratch=new DatabaseSync(':memory:');
  const reader={prepare:sql=>{const query=scratch.prepare(sql);let values=[];return {bind(...args){values=args;return this;},async all(){return {results:query.all(...values)};}};}};
  const exists=name=>scratch.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name);
  try{
   for(const migration of plan.filter(m=>chosen.includes(m.name)))for(const sql of migration.statements)scratch.exec(sql);
   // A search table's shadow tables already exist once its virtual table is made.
   for(const object of records)if(!exists(object.name))scratch.exec(object.sql);
   return await schemaIdentity(reader,config);
  }finally{scratch.close();}
 }};
}
