import {trustedPredicate} from '../admission/sql.server'
import type {Effects} from './changes.server'
import type {D1Sql} from '../../../vendor/base/modules/import-kit/src/d1/types'
/** Global inventory closes the gap between destination discovery and commit.
 * Retirements can delete jobs/stages/streams but cannot introduce a new scope or
 * redirect an existing ID to one. Rechecked after every custody write too. */
export async function importInventory(db:D1Database,change:Effects):Promise<D1Sql[]>{
 const final:D1Sql[]=[]
 for(const [table,id,destination] of [
  ['ik_jobs','id','destination'],['ik_d1_staging','id','destination'],['ik_d1_native_staging','id','destination'],
  ['ik_d1_streams','id','destination'],['ik_d1_stream_revisions','stream_id','destination'],['ik_d1_stream_origins','job_id','parent_destination'],
 ]){
  const rows=(await db.prepare(`SELECT ${id} id,${destination} destination FROM ${table} ORDER BY ${id}`).all<{id:string;destination:string}>()).results
  const values=JSON.stringify(rows.map(r=>[r.id,r.destination]))
  change.guards.push(trustedPredicate(`(SELECT json_group_array(json_array(${id},${destination})) FROM (SELECT ${id},${destination} FROM ${table} ORDER BY ${id}))=?`,[values]))
  final.push({sql:`NOT EXISTS(SELECT 1 FROM ${table} current WHERE NOT EXISTS(SELECT 1 FROM json_each(?) prior WHERE json_extract(prior.value,'$[0]')=current.${id} AND json_extract(prior.value,'$[1]')=current.${destination}))`,params:[values]})
 }
 return final
}
