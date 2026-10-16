import {canonicalJson,sha256} from '../../../vendor/base/modules/import-kit/src/d1/index'
import type {D1Sql} from '../../../vendor/base/modules/import-kit/src/d1/types'
/** The exact redaction checkpoint contract in Base portability/journal.mjs.
 * Its convenience helper also initializes storage before returning statements.
 * Initialize within the admission instead: preparation must perform no writes. */
export async function restoreCheckpoint(db:D1Database):Promise<D1Sql[]>{
 const state=await db.prepare('SELECT source_identity FROM rer_portability_state WHERE id=1').first<{source_identity:string}>()
 const source=state?.source_identity??crypto.randomUUID()
 return [
  ...(!state?[{sql:'INSERT OR IGNORE INTO rer_portability_state(id,source_identity) VALUES(1,?)',params:[source]}]:[]),
  {sql:'INSERT INTO rer_portability_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM rer_portability_state WHERE id=1 AND source_identity=?) THEN 1 ELSE 0 END',params:[source]},
  {sql:'INSERT OR IGNORE INTO rer_portability_journal VALUES(?,?)',params:[source,sha256(canonicalJson([source,'rer_portability_state',{id:1}]))]},
  {sql:'UPDATE rer_portability_state SET epoch=epoch+1 WHERE id=1'},
  {sql:'INSERT INTO rer_portability_epochs SELECT source_identity,epoch FROM rer_portability_state WHERE id=1 ON CONFLICT(source) DO UPDATE SET epoch=MAX(epoch,excluded.epoch)'},
  {sql:'DELETE FROM rer_portability_guard'},
 ]
}
