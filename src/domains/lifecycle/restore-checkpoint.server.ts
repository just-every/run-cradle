import {canonicalJson,sha256} from '../../../vendor/base/modules/import-kit/src/d1/index'
import type {D1Sql} from '../../../vendor/base/modules/import-kit/src/d1/types'
import {AuthorityError} from '../authority/errors'
/** The exact redaction checkpoint contract in Base portability/journal.mjs.
 * Its convenience helper also initializes storage before returning statements.
 * Erasure requires initialized storage and performs no write during preparation. */
export async function restoreCheckpoint(db:D1Database):Promise<D1Sql[]>{
 const state=await db.prepare('SELECT source_identity FROM rer_portability_state WHERE id=1').first<{source_identity:string}>()
 if(!state)throw new AuthorityError('version_conflict','Portable erasure checkpoint is not initialized.',409)
 return [
  {sql:'INSERT OR IGNORE INTO rer_portability_journal VALUES(?,?)',params:[state.source_identity,sha256(canonicalJson([state.source_identity,'rer_portability_state',{id:1}]))]},
  {sql:'UPDATE rer_portability_state SET epoch=epoch+1 WHERE id=1'},
  {sql:'INSERT INTO rer_portability_epochs SELECT source_identity,epoch FROM rer_portability_state WHERE id=1 ON CONFLICT(source) DO UPDATE SET epoch=MAX(epoch,excluded.epoch)'},
 ]
}
