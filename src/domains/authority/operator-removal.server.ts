import type {RequestContext} from './ports'
import type {MemberLifecyclePort} from './members.server'
import type {SqlMutation} from '../admission/ports'
import {registerTable,trustedPredicate} from '../admission/sql.server'
import {AuthorityError,denied} from './errors'
const principals=registerTable('authority_principals',['id','state','authentication_epoch','version','updated_at'])
const operators=registerTable('operators',['id','active','updated_at'])
/** Shared OPS-004 effects. Callers add their own current authority and commit atomically. */
export async function prepareOperatorRemoval(db:D1Database,lifecycle:Pick<MemberLifecyclePort,'prepareRemoval'>,ctx:Pick<RequestContext,'now'>,memberId:string,expectedVersion:number){
const row=await db.prepare('SELECT * FROM authority_principals WHERE id=?').bind(memberId).first<{initial_owner:number;authentication_epoch:number;version:number;state:string}>();if(!row)throw new AuthorityError('not_found','Member not found.',404);if(row.initial_owner)return denied('The installation owner must hand ownership to another member before leaving.')
   const blockers=await db.prepare(`SELECT id,'Owns an active campaign' AS message FROM campaigns WHERE owner_id=? AND archived_at IS NULL UNION ALL SELECT id,'Assigned an unresolved decision' AS message FROM decisions WHERE assignee_id=? AND state IN ('Awaiting approval','In review')`).bind(memberId,memberId).all<{id:string;message:string}>()
   const related=await lifecycle.prepareRemoval(ctx,memberId);if(blockers.results.length||related.blockers.length)throw new AuthorityError('version_conflict',`Removal blocked: ${[...blockers.results,...related.blockers].map(b=>`${b.id}: ${b.message}`).join('; ')}`,409)
   const where=trustedPredicate(`id=? AND version=? AND state IN ('active','invited') AND initial_owner=0`,[memberId,expectedVersion])
   const guards=[...related.guards,trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals WHERE ${where.sql})`,where.values),trustedPredicate(`NOT EXISTS(SELECT 1 FROM campaigns WHERE owner_id=? AND archived_at IS NULL) AND NOT EXISTS(SELECT 1 FROM decisions WHERE assignee_id=? AND state IN ('Awaiting approval','In review'))`,[memberId,memberId])]
   // Epoch and state invalidate all sessions, credentials and queued grants in the same commit.
   const mutations:SqlMutation[]=related.principalProjected?[...related.mutations]:[{kind:'update',table:principals,set:{state:'removed',authentication_epoch:row.authentication_epoch+1,version:expectedVersion+1,updated_at:Date.parse(ctx.now)},where,expectedRows:1},{kind:'update',table:operators,set:{active:0,updated_at:Date.parse(ctx.now)},where:trustedPredicate('id=?',[memberId]),expectedRows:1},...related.mutations]
   for(const definition of [
    {table:'authority_sessions',columns:['id','revoked_at','version'],condition:'principal_id=? AND revoked_at IS NULL',values:[memberId]},
    {table:'authority_credentials',columns:['id','revoked_at','version'],condition:'principal_id=? AND revoked_at IS NULL',values:[memberId]},
    {table:'authority_grants',columns:['id','revoked_at','version','state','updated_at'],condition:"(delegate_id=? OR issuer_id=?) AND state IN ('active','proposed')",values:[memberId,memberId]},
   ]){const rows=await db.prepare(`SELECT id,version FROM ${definition.table} WHERE ${definition.condition}`).bind(...definition.values).all<{id:string;version:number}>();const table=registerTable(definition.table,definition.columns);for(const old of rows.results){const match=trustedPredicate('id=? AND version=?',[old.id,old.version]);mutations.push({kind:'update',table,set:{revoked_at:Date.parse(ctx.now),version:old.version+1,...(definition.table==='authority_grants'?{state:'revoked',updated_at:Date.parse(ctx.now)}:{})},where:match,expectedRows:1})}}
return {guards,mutations}
}
