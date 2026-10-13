import type { RequestContext, PolicyPort } from '../authority/ports';
import type { SqlPredicate } from '../admission/ports';
import { trustedPredicate } from '../admission/sql.server';
import { ApiError } from '../../core/registry/errors';
import { STAGING_ENTITY, STAGING_FILES } from '../evidence/staging.server';

/** Attach only the current operator's private, verified source upload. No new read grant. */
export async function resolutionFile(db:D1Database,policy:PolicyPort,ctx:RequestContext,appId:string,fileId?:string):Promise<{guards:SqlPredicate[];sha256?:string}> {
 if(!fileId)return {guards:[]};
 const denied=()=>new ApiError('forbidden','Evidence attachment must be an available file in your private source intake for this app.');
 const row=await db.prepare(`SELECT f.version,f.sha256,f.record_id,f.field_ids,s.version AS source_version
  FROM evidence_files f JOIN evidence_staging s ON s.id=f.record_id AND s.app_id=f.app_id
  WHERE f.id=? AND f.app_id=? AND f.entity_id=? AND f.state='available'
   AND s.owner_id=? AND s.lifecycle='active' AND s.purpose='source'`)
  .bind(fileId,appId,STAGING_ENTITY,ctx.principal.id).first<{version:number;sha256:string;record_id:string;field_ids:string;source_version:number}>();
 if(!row)throw denied();
 let scope;
 try{scope=await policy.scope(ctx,{appId,entityId:STAGING_ENTITY,purpose:'read'});}catch{throw denied();}
 const fields=JSON.parse(row.field_ids) as string[];
 if(!fields.includes(STAGING_FILES)||fields.some(id=>!scope.readableFieldIds.includes(id)))throw denied();
 const guards=[...scope.currentAuthorityGuards,
  trustedPredicate(`EXISTS(SELECT 1 FROM evidence_staging WHERE id=? AND app_id=? AND owner_id=? AND lifecycle='active' AND purpose='source' AND version=? AND (${scope.rowPredicate.sql}))`,[row.record_id,appId,ctx.principal.id,row.source_version,...scope.rowPredicate.values]),
  trustedPredicate("EXISTS(SELECT 1 FROM evidence_files WHERE id=? AND app_id=? AND entity_id=? AND record_id=? AND field_ids=? AND state='available' AND version=? AND sha256=?)",[fileId,appId,STAGING_ENTITY,row.record_id,row.field_ids,row.version,row.sha256])];
 for(const guard of guards)if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw denied();
 return {guards,sha256:row.sha256};
}
