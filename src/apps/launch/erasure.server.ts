import type { RequestContext } from '../../domains/authority/ports'
import { registerTable,trustedPredicate,eq } from '../../domains/admission/sql.server'
import { emptyChange,type LaunchContext } from './domain.server'
const analyses=registerTable('launch_analyses',['id'])
const requests=registerTable('launch_analysis_requests',['id'])
/** Launch owns its stored analysis projections; E owns context/provider artifacts and dependency erasure. */
export async function prepareLaunchAnalysisErasure(context:LaunchContext,_ctx:RequestContext,campaignId:string){
 const set=emptyChange(),ids=(await context.db.prepare('SELECT id FROM campaigns WHERE id=? UNION ALL SELECT id FROM risks WHERE campaign_id=? UNION ALL SELECT id FROM decisions WHERE campaign_id=? UNION ALL SELECT id FROM milestones WHERE campaign_id=? UNION ALL SELECT id FROM deliverables WHERE campaign_id=?').bind(campaignId,campaignId,campaignId,campaignId,campaignId).all<{id:string}>()).results.map(row=>row.id)
 const encoded=JSON.stringify(ids),where="subject_id=? OR EXISTS(SELECT 1 FROM json_each(input_versions_json) ref WHERE json_extract(ref.value,'$.ref.recordId') IN (SELECT value FROM json_each(?)))",rows=await context.db.prepare(`SELECT id FROM launch_analyses WHERE ${where}`).bind(campaignId,encoded).all<{id:string}>()
 set.guards.push(trustedPredicate(`(SELECT COUNT(*) FROM launch_analyses WHERE ${where})=?`,[campaignId,encoded,rows.results.length]));for(const row of rows.results)set.mutations.push({kind:'delete',table:analyses,where:eq(analyses,'id',row.id),expectedRows:1})
 const requestWhere="json_extract(input_json,'$.campaignId')=? OR analysis_id IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_each(task_json,'$.source.versions') ref WHERE json_extract(ref.value,'$.ref.recordId') IN (SELECT value FROM json_each(?)))",analysisIds=JSON.stringify(rows.results.map(row=>row.id)),pending=await context.db.prepare(`SELECT id FROM launch_analysis_requests WHERE ${requestWhere}`).bind(campaignId,analysisIds,encoded).all<{id:string}>()
 set.guards.push(trustedPredicate(`(SELECT COUNT(*) FROM launch_analysis_requests WHERE ${requestWhere})=?`,[campaignId,analysisIds,encoded,pending.results.length]));for(const row of pending.results)set.mutations.push({kind:'delete',table:requests,where:eq(requests,'id',row.id),expectedRows:1})
 return set
}
