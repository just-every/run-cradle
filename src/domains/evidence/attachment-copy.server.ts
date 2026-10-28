import type { EvidenceDependencies } from './ports'
import type { Ref } from '../../contracts/primitives'
import type { RequestContext } from '../authority/ports'
import type { PreparedAttachmentCopy } from '../records/attachments.server'
import { files, createUlid, eq, and } from './shared.server'
import { exists } from '../admission/sql.server'
import { reserveFileWrite, releaseFileWrite, finishFileWrite } from '../lifecycle/file-writes.server'
import { AdmissionError } from '../admission/errors'

/** Copies have independent custody, so deleting an original never breaks its copy. */
export async function prepareAttachmentCopy(deps:EvidenceDependencies,ctx:RequestContext,fileId:string,source:Ref,target:Ref,fieldId:string):Promise<PreparedAttachmentCopy> {
  await deps.access.checkReference(ctx,source,[fieldId],'read')
  const original=await deps.db.prepare("SELECT * FROM evidence_files WHERE id=? AND app_id=? AND entity_id=? AND record_id=? AND state='available'").bind(fileId,source.appId,source.entityId,source.recordId).first<Record<string,string|number|null>>()
  if(!original || !(JSON.parse(String(original.field_ids)) as string[]).includes(fieldId))throw new AdmissionError('not_found','Attachment is unavailable.')
  const object=await deps.bucket.get(String(original.object_key))
  if(!object)throw new AdmissionError('not_found','Attachment bytes are unavailable.')
  const id=createUlid(),key=`private/${id}/${original.sha256}`,reservation=await reserveFileWrite(deps.db,key,ctx.now)
  const discard=async()=>{await deps.bucket.delete(key);await finishFileWrite(deps.db,reservation)}
  try {
    await deps.bucket.put(key,object.body,{sha256:String(original.sha256),httpMetadata:{contentType:String(original.media_type)}})
    const stored=await deps.bucket.head(key)
    if(!stored||stored.size!==Number(original.bytes))throw new AdmissionError('validation','Attachment copy is incomplete.')
    return {fileId:id,guards:[exists(files,and(eq(files,'id',fileId),eq(files,'version',Number(original.version)),eq(files,'state','available')))],mutations:[{kind:'insert',table:files,row:{...original,id,app_id:target.appId,entity_id:target.entityId,record_id:target.recordId,field_ids:JSON.stringify([fieldId]),object_key:key,source_id:null,version:1,created_at:ctx.now,updated_at:ctx.now}},releaseFileWrite(reservation)],discard}
  }catch(error){await discard();throw error}
}
