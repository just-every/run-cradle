import {createUlid} from '../../core/shared/ids'
import {AuthorityError} from '../authority/errors'
import {registerTable,trustedPredicate} from '../admission/sql.server'
import type {SqlMutation} from '../admission/ports'
import type {Effects} from './changes.server'
const writes=registerTable('lifecycle_file_writes',['id','object_key','started_at'])
/** Reservations precede R2 effects and survive an interrupted writer. */
export async function reserveFileWrite(db:D1Database,key:string,startedAt:string){
 if(!Number.isFinite(Date.parse(startedAt)))throw new Error('File write requires the original request timestamp')
 const id=createUlid()
 const result=await db.prepare("INSERT INTO lifecycle_file_writes(id,object_key,started_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM lifecycle_erasures WHERE state='pending' OR completed_at>=?)").bind(id,key,startedAt,startedAt).run()
 if(result.meta.changes!==1)throw new AuthorityError('version_conflict','Erasure invalidated this file operation. Start the operation again.',409)
 return id
}
export function releaseFileWrite(id:string):SqlMutation{return {kind:'delete',table:writes,where:trustedPredicate('id=?',[id]),expectedRows:1}}
export async function requireQuiescentFiles(db:D1Database,change:Effects){
 if(await db.prepare('SELECT 1 FROM lifecycle_file_writes LIMIT 1').first())throw new AuthorityError('version_conflict','Erasure is waiting for an in-flight file write. Finish or recover that operation before erasing.',409)
 change.guards.push(trustedPredicate('NOT EXISTS(SELECT 1 FROM lifecycle_file_writes)',[]))
}
export async function finishFileWrite(db:D1Database,id:string){await db.prepare('DELETE FROM lifecycle_file_writes WHERE id=?').bind(id).run()}

/** Every admitted write is fenced against privacy work since its trusted request began. */
export const erasureAdmissionGuard=(startedAt:string)=>trustedPredicate("NOT EXISTS(SELECT 1 FROM lifecycle_erasures WHERE state='pending' OR completed_at>=?)",[startedAt])
