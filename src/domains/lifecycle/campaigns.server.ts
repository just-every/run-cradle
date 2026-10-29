import {requireQuiescentFiles} from './file-writes.server'
import {redactCampaignHistory} from './campaign-history.server'
import {prepareKnowledgeErasure} from '../knowledge/erasure.server'
import {AuthorityError} from '../authority/errors'
import type {RequestContext} from '../authority/ports'
import {effects,append,removeRows,updateRows} from './changes.server'
import {trustedPredicate} from '../admission/sql.server'
import {retainCleanup} from './cleanup.server'
import {prepareExecutionErasure} from '../execution/erasure.server'
import {LAUNCH_APP_ID,launchEntities} from '../../apps/launch/contracts'
import {createUlid} from '../../core/shared/ids'
import {requireAgentCustodyQuiescent} from './agent-custody.server'
/** Launch canonical children cascade; cross-domain copies are explicit here. */
export async function campaignErasure(db:D1Database,ctx:RequestContext,id:string){
 const change=effects(),label=`Anonymous campaign ${createUlid().slice(-8)}`,anonymousId=createUlid()
 await requireAgentCustodyQuiescent(db,change)
 await requireQuiescentFiles(db,change)
 const rows=await db.prepare('SELECT id FROM campaigns WHERE id=? UNION SELECT id FROM deliverables WHERE campaign_id=? UNION SELECT id FROM milestones WHERE campaign_id=? UNION SELECT id FROM risks WHERE campaign_id=? UNION SELECT id FROM decisions WHERE campaign_id=?').bind(id,id,id,id,id).all<{id:string}>(),ids=JSON.stringify(rows.results.map(row=>row.id))
 const sources=(await db.prepare('SELECT id FROM evidence_sources WHERE app_id=? AND record_id IN (SELECT value FROM json_each(?))').bind(LAUNCH_APP_ID,ids).all<{id:string}>()).results.map(row=>row.id)
 const previews=(await db.prepare('SELECT DISTINCT preview_id FROM portability_preview_rows WHERE record_id IN (SELECT value FROM json_each(?))').bind(ids).all<{preview_id:string}>()).results.map(row=>row.preview_id)
 const fileRows=(await db.prepare('SELECT id,object_key FROM evidence_files WHERE (app_id=? AND record_id IN (SELECT value FROM json_each(?))) OR id IN (SELECT file_id FROM portability_previews WHERE id IN (SELECT value FROM json_each(?)))').bind(LAUNCH_APP_ID,ids,JSON.stringify(previews)).all<{id:string;object_key:string}>()).results
 const keys=fileRows.map(row=>row.object_key),sourceIds=JSON.stringify(sources)
 const custody=await db.prepare("SELECT 1 FROM construction_datasets d,json_each(d.source_versions_json) s WHERE json_extract(s.value,'$.id') IN (SELECT value FROM json_each(?)) AND d.state<>'erased' LIMIT 1").bind(sourceIds).first()
 if(custody)throw new AuthorityError('version_conflict','Campaign erasure requires construction dataset and runner-custody cleanup; no campaign was deleted.',409)
 await redactCampaignHistory(db,change,ids,anonymousId,ctx.now)
 const knowledge=new Map<string,typeof change.mutations[number]>()
 for(const source of sources){const effects=await prepareKnowledgeErasure(db,LAUNCH_APP_ID,source,ctx.now);change.guards.push(...effects.guards);for(const m of effects.mutations)knowledge.set(m.table.tableId+JSON.stringify(m.kind==='insert'?m.row:m.where),m)}
 change.mutations.push(...knowledge.values())
 await updateRows(db,change,'evidence_nodes',{erased_at:ctx.now,invalidated_at:ctx.now},"id IN (WITH RECURSIVE descendants(id) AS (SELECT id FROM evidence_nodes WHERE object_id IN (SELECT value FROM json_each(?)) UNION SELECT child_id FROM evidence_dependencies JOIN descendants ON parent_id=descendants.id) SELECT id FROM descendants)",[sourceIds])
 // Keep inbox/read identity and sent-mail receipts, but erase copied content and
 // prevent every pending delivery before detaching the erased campaign lineage.
 // Resolve each affected set once. Admission guards bind through a JSON payload;
 // nesting the unindexed lineage scans there repeats them for every delivery.
 const noticeQuery='SELECT id FROM notifications WHERE subject_id IN (SELECT value FROM json_each(?)) UNION SELECT notification_id AS id FROM channel_notifications WHERE campaign_id=?'
 const notices=(await db.prepare(noticeQuery).bind(ids,id).all<{id:string}>()).results,noticeIds=JSON.stringify(notices.map(row=>row.id))
 const deliveryWhere='campaign_id=? OR notification_id IN (SELECT value FROM json_each(?))'
 const deliveries=(await db.prepare(`SELECT id FROM channel_deliveries WHERE ${deliveryWhere}`).bind(id,noticeIds).all<{id:string}>()).results,deliveryIds=JSON.stringify(deliveries.map(row=>row.id))
 // Keep the selection guarded too: a notice or delivery arriving during
 // preparation must reject the whole erasure rather than escape redaction.
 change.guards.push(trustedPredicate(`(SELECT count(*) FROM (${noticeQuery}))=?`,[ids,id,notices.length]),trustedPredicate(`(SELECT count(*) FROM channel_deliveries WHERE ${deliveryWhere})=?`,[id,noticeIds,deliveries.length]))
 await removeRows(db,change,'channel_deliveries',"id IN (SELECT value FROM json_each(?)) AND state NOT IN ('accepted','delivered','unknown')",[deliveryIds])
 await updateRows(db,change,'channel_deliveries',{campaign_id:null,error_code:null,error_message:null},"id IN (SELECT value FROM json_each(?)) AND state IN ('accepted','delivered','unknown')",[deliveryIds])
 await updateRows(db,change,'notifications',{unavailable:1,subject_id:null,title:'Notification unavailable',body:''},'id IN (SELECT value FROM json_each(?))',[noticeIds])
 await updateRows(db,change,'channel_notifications',{campaign_id:null,failure:null},'campaign_id=?',[id])
 await removeRows(db,change,'portability_preview_rows','preview_id IN (SELECT value FROM json_each(?))',[JSON.stringify(previews)])
 await removeRows(db,change,'portability_previews','id IN (SELECT value FROM json_each(?))',[JSON.stringify(previews)])
 await updateRows(db,change,'evidence_source_versions',{content:null,file_ids:'[]'},'source_id IN (SELECT value FROM json_each(?))',[sourceIds])
 await updateRows(db,change,'evidence_sources',{erased_at:ctx.now,external_id:null},'id IN (SELECT value FROM json_each(?))',[sourceIds])
 await updateRows(db,change,'evidence_files',{state:'erased',filename:'erased',updated_at:ctx.now},'id IN (SELECT value FROM json_each(?))',[JSON.stringify(fileRows.map(row=>row.id))])
 await updateRows(db,change,'evidence_comments',{body:null,mentions_json:'[]',deleted_at:ctx.now},'app_id=? AND record_id IN (SELECT value FROM json_each(?))',[LAUNCH_APP_ID,ids])
 await updateRows(db,change,'evidence_contexts',{content:null,source_refs:'[]',record_refs:'[]',erased_at:ctx.now},'EXISTS(SELECT 1 FROM json_tree(record_refs) WHERE value IN (SELECT value FROM json_each(?))) OR EXISTS(SELECT 1 FROM json_tree(source_refs) WHERE value IN (SELECT value FROM json_each(?)))',[ids,sourceIds])
 for(const table of ['evidence_claims','evidence_proposals'])await updateRows(db,change,table,table==='evidence_claims'?{value_json:null,evidence_json:'[]',state:'erased'}:{input_json:null,evidence_json:'[]',reason:null,state:'stale'},'EXISTS(SELECT 1 FROM json_tree(evidence_json) WHERE value IN (SELECT value FROM json_each(?)))',[sourceIds])
 await updateRows(db,change,'admission_audit',{subject_json:JSON.stringify({appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:anonymousId}),changes_json:'[]',personal_refs_json:'[]',source_ids_json:'[]'},"app_id=? AND json_extract(subject_json,'$.recordId') IN (SELECT value FROM json_each(?))",[LAUNCH_APP_ID,ids])
 await updateRows(db,change,'admission_outbox',{state:'cancelled',input_json:'{}',subject_json:null},"app_id=? AND (json_extract(subject_json,'$.ref.recordId') IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_tree(input_json) WHERE value IN (SELECT value FROM json_each(?))))",[LAUNCH_APP_ID,ids,ids])
 const execution=await prepareExecutionErasure(db,ctx,{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:id},[...rows.results.map(row=>row.id),...sources,...previews]);append(change,execution);keys.push(...execution.objectKeys)
 retainCleanup(change,{id,appId:LAUNCH_APP_ID,kind:'campaign',subjectId:id,label,now:ctx.now,keys})
 return change
}
