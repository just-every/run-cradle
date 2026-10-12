import type {Ref} from '../../contracts/primitives';
import type {RequestContext,PolicyPort} from '../authority/ports';
import type {DescriptorRegistry} from '../records/descriptors.server';
import {schemaGuard} from '../records/change.server';
import {exists,and,eq,identifier,trustedPredicate} from '../admission/sql.server';
import {EvidenceError} from './shared.server';
/** Actual row version, row scope and writable fields are frozen again inside admission. */
export function createEvidenceWriteAccess(db:D1Database,policy:PolicyPort,registry:DescriptorRegistry){
 return async(ctx:RequestContext,ref:Ref,fieldIds:readonly string[],purpose:'upload'|'capture')=>{
  if(!fieldIds.length)throw new EvidenceError('forbidden','A writable source field is required',403);
  const d=registry.get(ref.appId,ref.entityId),scope=await policy.scope(ctx,{appId:ref.appId,entityId:ref.entityId,purpose:'read'});
  for(const id of fieldIds){const f=d.fields.get(id)?.field;if(!f||f.readOnly||!scope.writableFieldIds.includes(id)||!scope.readableFieldIds.includes(id)||purpose==='upload'&&f.type!=='attachment')throw new EvidenceError('forbidden','Source field is not writable',403);}
  const staging=d.table.tableId==='evidence_staging',owned=staging?trustedPredicate("owner_id=? AND app_id=? AND lifecycle='active' AND schema_version=1",[ctx.principal.id,ref.appId]):trustedPredicate('1');
  const raw=await db.prepare(`SELECT ${identifier(d.versionColumn)} AS version FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)}=? AND (${scope.rowPredicate.sql}) AND (${owned.sql})`).bind(ref.recordId,...scope.rowPredicate.values,...owned.values).first<{version:number}>();
  if(!raw)throw new EvidenceError('not_found','Source subject unavailable',404);
  return{revision:{ref,version:raw.version},guards:[...(staging?[]:[schemaGuard(d)]),...scope.currentAuthorityGuards,exists(d.table,and(owned,scope.rowPredicate,eq(d.table,d.idColumn,ref.recordId),eq(d.table,d.versionColumn,raw.version)))]};
 };
}
