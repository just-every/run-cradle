import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {PortabilityError} from '@runeditrun/rer/modules/portability';
import {migrationReplay} from '@runeditrun/rer/modules/portability/migration-history';
import {appliedMigrations} from '@runeditrun/rer/internal/modules/portability/bridge.mjs';
import {migrationInventory} from '../migration-groups.mjs';

/** Replay the destination's applied files in its recorded order; never the archive's SQL. */
export async function restoreMigrations(db,root,policy){
 const {unstable_splitSqlQuery:split}=createRequire(join(root,'package.json'))('wrangler');
 const files=new Map(migrationInventory().map(m=>[m.name,m.sql]));
 const names=await appliedMigrations(db)??[];
 const plan=names.map(name=>{
  const sql=files.get(name);
  if(sql===undefined)throw new PortabilityError('schema_mismatch:migration_history',409);
  // A Wrangler ledger records no hash; the file's own hash checks an archived ledger's claim.
  return {name,statements:split(sql),sha256:createHash('sha256').update(sql).digest('hex')};
 });
 return migrationReplay(plan,policy);
}
