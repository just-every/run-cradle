import type {Effects} from './changes.server'
import type {D1Sql} from '../../../vendor/base/modules/import-kit/src/d1/types'
import {trustedPredicate} from '../admission/sql.server'
import {AuthorityError} from '../authority/errors'
/** A clean current source does not prove its reversible before-image is clean.
 * Only selected source tombstones and retired jobs authorize removing these
 * images. Other personal history refuses before mutation and stays byte-exact. */
export async function inspectImportHistory(db:D1Database,change:Effects,selected:ReadonlySet<string>,retired:ReadonlySet<string>,matches:(value:unknown)=>boolean):Promise<D1Sql[]>{
 const final:D1Sql[]=[]
 for(const table of ['ik_provenance','ik_d1_history']){
  const rows=(await db.prepare(`SELECT id,job_id,source_identity,record_json FROM ${table} ORDER BY id`).all<{id:string;job_id:string;source_identity:string;record_json:string}>()).results
  for(const row of rows)if(matches(JSON.parse(row.record_json))&&!selected.has(row.source_identity)&&!retired.has(row.job_id))throw new AuthorityError('version_conflict','Import history contains an unattributed identity in a reversible before-image. Resolve its custody before erasure; no identity was erased.',409)
  const image=JSON.stringify(rows.map(r=>[r.id,r.record_json]))
  const handled=[...new Set(rows.filter(r=>selected.has(r.source_identity)||retired.has(r.job_id)).map(r=>r.job_id))]
  change.guards.push(trustedPredicate(`(SELECT json_group_array(json_array(id,record_json)) FROM (SELECT id,record_json FROM ${table} ORDER BY id))=?`,[image]))
  // Erasure deletes selected images. The Kit fences every changed job's complete custody (including safe
  // artifact-location withdrawal). Independently fence all untouched jobs.
  final.push({sql:`NOT EXISTS(SELECT 1 FROM ${table} current WHERE current.job_id NOT IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM json_each(?) prior WHERE json_extract(prior.value,'$[0]')=current.id AND json_extract(prior.value,'$[1]')=current.record_json))`,params:[JSON.stringify(handled),image]})
 }
 return final
}
