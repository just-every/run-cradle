import {AuthorityError} from '../authority/errors'
import {effects} from './changes.server'
import {installationTransfersIdle,preparePortabilityCustody} from './portability-custody.server'
import {restoreCheckpoint} from './restore-checkpoint.server'

/** R2 cleanup runs outside D1. A transfer may have captured personal object keys
 * during that interval, so completion retires its terminal custody again. The
 * new epoch also rejects a delayed export whose object listing preceded cleanup.
 * Active transfers leave this receipt pending; maintenance can serve other jobs. */
export async function finishMemberErasure(db:D1Database,id:string){
 let transfers
 try{transfers=await preparePortabilityCustody(db,effects())}catch(error){
  if(error instanceof AuthorityError&&error.code==='version_conflict')return
  throw error
 }
 const statements=[{sql:"INSERT INTO rer_portability_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM lifecycle_erasures WHERE id=? AND subject_kind='member' AND state='pending') AND NOT EXISTS(SELECT 1 FROM lifecycle_erasure_blobs WHERE erasure_id=? AND deleted_at IS NULL) THEN 1 ELSE 0 END",params:[id,id]},
  ...transfers.statements,...await restoreCheckpoint(db),
  {sql:"UPDATE lifecycle_erasures SET state='complete',completed_at=? WHERE id=? AND state='pending' AND NOT EXISTS(SELECT 1 FROM lifecycle_erasure_blobs WHERE erasure_id=? AND deleted_at IS NULL)",params:[new Date().toISOString(),id,id]},
  {sql:"DELETE FROM lifecycle_erasure_blobs WHERE erasure_id=? AND EXISTS(SELECT 1 FROM lifecycle_erasures WHERE id=? AND state='complete')",params:[id,id]},
  ...transfers.final.map(guard=>({sql:`INSERT INTO rer_portability_guard(value) SELECT CASE WHEN (${guard.sql}) THEN 1 ELSE 0 END`,params:guard.params})),
  {sql:'DELETE FROM rer_portability_guard'},
 ]
 try{await db.batch(statements.map(statement=>db.prepare(statement.sql).bind(...statement.params??[])))}catch(error){
  if(await db.prepare("SELECT 1 FROM lifecycle_erasures WHERE id=? AND state='complete'").bind(id).first())return
  if(!await installationTransfersIdle(db))return
  throw error
 }
}
