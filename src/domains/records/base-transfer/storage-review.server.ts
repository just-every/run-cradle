import { canonicalJson, sha256 } from '../../../../vendor/base/modules/import-kit/src/d1/index'
import { AdmissionError } from '../../admission/errors'
import { and } from '../../admission/sql.server'
import type { SqlPredicate } from '../../admission/ports'
import type { BasePreview } from './contracts'
import { type ReviewRetention } from './review-retention'
import { canonicalHash } from './canonical-stream'
export type StoredReview={id:string;app_id:string;principal_id:string;fingerprint:string;physical_fingerprint:string;schema_fingerprint:string;schema_preview_id:string;detail_json:string;detail_hash:string;created_at:string}
function reviewHash(row:Omit<StoredReview,'detail_json'|'detail_hash'>,detailHash:string){return sha256(canonicalJson({detailHash,physicalFingerprint:row.physical_fingerprint,schemaFingerprint:row.schema_fingerprint,plannedAt:row.created_at,principalId:row.principal_id,appId:row.app_id,schemaPreviewId:row.schema_preview_id}))}
export async function retainReview(db:D1Database,row:Omit<StoredReview,'detail_json'|'detail_hash'>,retained:ReviewRetention,guards:readonly SqlPredicate[]){
 const hash=reviewHash(row,retained.detailHash),p=and(...guards),guard=()=>db.prepare(`INSERT INTO record_import_assertions(ok) SELECT CASE WHEN (${p.sql}) THEN 1 ELSE 0 END`).bind(...p.values)
 await db.batch([guard(),db.prepare('INSERT INTO record_import_reviews(id,app_id,principal_id,fingerprint,physical_fingerprint,schema_fingerprint,schema_preview_id,detail_json,detail_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(row.id,row.app_id,row.principal_id,row.fingerprint,row.physical_fingerprint,row.schema_fingerprint,row.schema_preview_id,retained.manifest,hash,row.created_at),...retained.statements.map(statement=>db.prepare(statement.sql).bind(row.id,statement.params[1])),guard(),db.prepare('DELETE FROM record_import_assertions')])
}
export async function loadReview(db:D1Database,id:string,principalId:string){
 const row=await db.prepare('SELECT * FROM record_import_reviews WHERE id=? AND principal_id=?').bind(id,principalId).first<StoredReview>();if(!row)throw new AdmissionError('not_found','Import review not found.')
 const manifest=JSON.parse(row.detail_json) as {chunks:number},chunks=(await db.prepare('SELECT ordinal,body FROM record_import_review_chunks WHERE review_id=? ORDER BY ordinal').bind(id).all<{ordinal:number;body:string}>()).results
 if(chunks.length!==manifest.chunks||chunks.some((c,i)=>c.ordinal!==i))throw new AdmissionError('version_conflict','Stored import review chunks changed.')
 const detail=JSON.parse(chunks.map(c=>c.body).join('')) as BasePreview
 if(reviewHash(row,canonicalHash(detail))!==row.detail_hash||detail.fingerprint!==row.fingerprint||detail.identities.appId!==row.app_id)throw new AdmissionError('version_conflict','Stored import review changed.')
 return {row,detail}
}
