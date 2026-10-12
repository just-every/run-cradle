import type {RecordAttachmentPort} from '../records/attachments.server';
import type {EvidenceDependencies} from './ports';
import {files,eq,and} from './shared.server';
import {exists} from '../admission/sql.server';
export function createEvidenceAttachmentPort(deps:EvidenceDependencies):RecordAttachmentPort{
 async function inspect(ctx:Parameters<RecordAttachmentPort['readable']>[0],fileId:string,subject:Parameters<RecordAttachmentPort['readable']>[2],fieldId:string){await deps.access.checkReference(ctx,subject,[fieldId],'read');const f=await deps.db.prepare("SELECT version,field_ids FROM evidence_files WHERE id=? AND app_id=? AND entity_id=? AND record_id=? AND state='available'").bind(fileId,subject.appId,subject.entityId,subject.recordId).first<{version:number;field_ids:string}>();if(!f||!(JSON.parse(f.field_ids) as string[]).includes(fieldId))return null;return f;}
 return{async readable(ctx,fileId,subject,fieldId){try{return !!await inspect(ctx,fileId,subject,fieldId);}catch(error){if(error instanceof Error&&'code'in error&&['forbidden','not_found'].includes(String(error.code)))return false;throw error;}},async prepareLink(ctx,fileId,subject,fieldId){const f=await inspect(ctx,fileId,subject,fieldId);if(!f)throw new Error('Attachment is unavailable for this field');return[exists(files,and(eq(files,'id',fileId),eq(files,'version',f.version),eq(files,'state','available'),eq(files,'app_id',subject.appId),eq(files,'entity_id',subject.entityId),eq(files,'record_id',subject.recordId)))];}};
}
