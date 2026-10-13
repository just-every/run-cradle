import type {Effects} from './changes.server'
import type {D1Sql} from '../../../vendor/base/modules/import-kit/src/d1/types'
import {trustedPredicate} from '../admission/sql.server'
import {AuthorityError} from '../authority/errors'
/** Undo observations can outlive both a personal native edit and its source.
 * Affected jobs have their reports sanitized by the Kit; independent jobs are
 * preserved exactly, or refuse if their report alone holds personal content. */
export async function inspectImportReports(db:D1Database,change:Effects,affected:ReadonlySet<string>,matches:(value:unknown)=>boolean):Promise<D1Sql[]>{
 const rows=(await db.prepare('SELECT job_id,effect_id,record_json FROM ik_d1_reversal_reports ORDER BY job_id,effect_id').all<{job_id:string;effect_id:string;record_json:string}>()).results
 for(const row of rows)if(!affected.has(row.job_id)&&matches(JSON.parse(row.record_json)))throw new AuthorityError('version_conflict','Import undo report contains an unattributed identity. Resolve its custody before erasure; no identity was erased.',409)
 const image=JSON.stringify(rows.map(r=>[r.job_id,r.effect_id,r.record_json]))
 change.guards.push(trustedPredicate('(SELECT json_group_array(json_array(job_id,effect_id,record_json)) FROM (SELECT job_id,effect_id,record_json FROM ik_d1_reversal_reports ORDER BY job_id,effect_id))=?',[image]))
 return [{sql:"NOT EXISTS(SELECT 1 FROM ik_d1_reversal_reports current WHERE current.job_id NOT IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM json_each(?) prior WHERE json_extract(prior.value,'$[0]')=current.job_id AND json_extract(prior.value,'$[1]')=current.effect_id AND json_extract(prior.value,'$[2]')=current.record_json))",params:[JSON.stringify([...affected]),image]}]
}
