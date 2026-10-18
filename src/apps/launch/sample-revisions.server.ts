import type { RevisionRef } from '../../contracts/primitives'
import { identifier } from '../../domains/admission/sql.server'
import { LAUNCH_APP_ID,launchEntities } from './contracts'
import { launchTables,type LaunchKind } from './descriptors.server'

/** The review includes every surviving sample record, including its current revision. */
export async function sampleRevisions(db:D1Database,installationId:string):Promise<RevisionRef[]> {
 const revisions:RevisionRef[]=[]
 for(const kind of ['campaign','deliverable','milestone','risk','decision'] as LaunchKind[]) {
  const rows=await db.prepare(`SELECT r.id,r.version FROM ${identifier(launchTables[kind])} r
   JOIN launch_sample_records s ON s.record_id=r.id AND s.table_name=? WHERE s.installation_id=? ORDER BY r.id`)
   .bind(launchTables[kind],installationId).all<{id:string;version:number}>()
  for(const row of rows.results)revisions.push({ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version})
 }
 return revisions
}
