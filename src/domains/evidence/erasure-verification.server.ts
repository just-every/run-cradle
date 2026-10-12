import type {Ref} from '../../contracts/primitives';
/** E's retained metadata remains addressable while every owned personal value must be gone. */
export async function verifyEvidenceErasure(db:D1Database,subject:Ref){
 const refs=[subject.appId,subject.entityId,subject.recordId];
 const sources=(await db.prepare('SELECT id FROM evidence_sources WHERE app_id=? AND entity_id=? AND record_id=?').bind(...refs).all<{id:string}>()).results.map(r=>r.id);
 const errors:string[]=[];
 if(await db.prepare('SELECT 1 FROM evidence_sources WHERE app_id=? AND entity_id=? AND record_id=? AND (erased_at IS NULL OR external_id IS NOT NULL) LIMIT 1').bind(...refs).first())errors.push('source metadata');
 if(await db.prepare("SELECT 1 FROM evidence_files WHERE app_id=? AND entity_id=? AND record_id=? AND (state!='erased' OR filename!='erased') LIMIT 1").bind(...refs).first())errors.push('file metadata');
 if(await db.prepare("SELECT 1 FROM evidence_comments WHERE app_id=? AND entity_id=? AND record_id=? AND (body IS NOT NULL OR mentions_json!='[]') LIMIT 1").bind(...refs).first())errors.push('comments');
 if(sources.length){
  if(await db.prepare("SELECT 1 FROM evidence_source_versions WHERE source_id IN(SELECT value FROM json_each(?)) AND (content IS NOT NULL OR file_ids!='[]') LIMIT 1").bind(JSON.stringify(sources)).first())errors.push('source bytes');
  const descendants="WITH RECURSIVE d(id) AS (SELECT id FROM evidence_nodes WHERE kind='source' AND object_id IN(SELECT value FROM json_each(?)) UNION SELECT child_id FROM evidence_dependencies JOIN d ON parent_id=d.id)";
  for(const [kind,table,predicate] of [['prompt','evidence_contexts','content IS NOT NULL'],['claim','evidence_claims','value_json IS NOT NULL'],['proposal','evidence_proposals','input_json IS NOT NULL OR reason IS NOT NULL']])if(await db.prepare(`${descendants} SELECT 1 FROM ${table} t JOIN evidence_nodes n ON n.object_id=t.id AND n.kind=? JOIN d ON d.id=n.id WHERE ${predicate} LIMIT 1`).bind(JSON.stringify(sources),kind).first())errors.push(kind);
 }
 if(await db.prepare("SELECT 1 FROM portability_preview_rows WHERE record_id=? AND content!='{}' LIMIT 1").bind(subject.recordId).first())errors.push('import previews');
 return{complete:errors.length===0,errors,sourceIds:sources};
}
