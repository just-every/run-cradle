import {z} from 'zod'
import type {ServerFoundation} from '../../../core/app/foundation.server'
import type {RequestContext} from '../../authority/ports'
import type {EvidenceDependencies} from '../../evidence/ports'
import type {createRecordReader} from '../query.server'
import type {createRecordWriter} from '../change.server'
import type {fileStoreRequestSchema} from './operation.server'
import type {AttachmentMember} from '../../../contracts/primitives'
import {idSchema} from '../validators'
import {storeProviders,isStoreReferenceMember} from '../store-references'
import {storeCopyOwner,personalStorePermit} from '../../authority/personal-stores.server'
import {createUlid} from '../../../core/shared/ids'
import {sha256,canonical} from '../../../adapters/crypto.server'
import {files,insert} from '../../evidence/shared.server'
import {reserveFileWrite,finishFileWrite,releaseFileWrite} from '../../lifecycle/file-writes.server'
import {ApiError} from '../../../core/registry/errors'
const schema=z.object({commandId:idSchema,appId:idSchema,entityId:idSchema,recordId:idSchema,fieldId:idSchema,provider:z.enum(storeProviders),itemId:z.string().min(1).max(512)}).strict()
type Run=<T>(ctx:RequestContext,connectionId:string,request:z.infer<typeof fileStoreRequestSchema>)=>Promise<T>
/** Bytes become an ordinary attachment in the same guarded commit that replaces this reference. */
export function createStoreCopy(db:D1Database,foundation:ServerFoundation,reader:ReturnType<typeof createRecordReader>,writer:ReturnType<typeof createRecordWriter>,evidence:EvidenceDependencies,run:Run){
 return async(ctx:RequestContext,input:unknown)=>{
  const request=schema.parse(input),owner=await storeCopyOwner(db,ctx,request.appId),ref={appId:request.appId,entityId:request.entityId,recordId:request.recordId}
  const inputHash=await sha256(canonical(request)),replay=await foundation.admission.replay(ctx,request.commandId,'record.patch',request.appId,inputHash)
  if(replay){if(replay.result.state!=='committed')throw new ApiError('version_conflict','Copy request did not commit.');return {record:replay.result.value}}
  const scope=await foundation.policy.scope(ctx,{appId:request.appId,entityId:request.entityId,purpose:'read'})
  if(!scope.writableFieldIds.includes(request.fieldId))throw new ApiError('forbidden','Write authority on this attachment field is required.')
  const record=await reader.record(ctx,scope,ref),cell=record.fields[request.fieldId]
  if(cell?.state!=='value'||!Array.isArray(cell.value))throw new ApiError('not_found','Attachment field not found.')
  const members=cell.value as AttachmentMember[],index=members.findIndex(m=>isStoreReferenceMember(m)&&m.reference.provider===request.provider&&m.reference.itemId===request.itemId),member=members[index]
  if(!member||!isStoreReferenceMember(member)||!member.reference.connectionId||member.reference.resolution==='unresolved'||member.reference.provider==='chest')throw new ApiError('not_found','A connected store reference is required.')
  const reference=member.reference,operation={op:'content' as const,entityId:request.entityId,fieldId:request.fieldId,recordId:request.recordId,itemId:request.itemId}
  const bytes=await run<Uint8Array>(ctx,reference.connectionId!,operation),hash=await sha256(bytes),fileId=createUlid(),objectKey=`private/${fileId}/${hash}`,writeId=await reserveFileWrite(db,objectKey,ctx.now)
  try{
   await evidence.bucket.put(objectKey,bytes,{sha256:hash,httpMetadata:{contentType:reference.mediaType||'application/octet-stream'}})
   const head=await evidence.bucket.head(objectKey)
   if(!head||head.size!==bytes.length||!head.checksums.sha256||Array.from(new Uint8Array(head.checksums.sha256),v=>v.toString(16).padStart(2,'0')).join('')!==hash)throw new Error('Stored copy checksum mismatch')
   const connection=await personalStorePermit(db,foundation.policy,foundation.entities,ctx,{appId:request.appId,action:'connection.sync',expected:[],cost:[],connectionId:reference.connectionId!,inputHash:''},undefined,operation)
   const next=await writer.prepareChange(ctx,scope,{ref,expectedVersion:record.version,changes:{[request.fieldId]:members.map((m,i)=>i===index?{fileId}:m)}},new Map([['file:'+fileId,[]]]))
   const permit=await foundation.policy.authorize(ctx,{appId:request.appId,action:'record.patch',expected:[{ref,version:record.version}],fieldIds:[request.fieldId],cost:[],inputHash,commandId:request.commandId})
   const receipt=await foundation.admission.commit(ctx,{commandId:request.commandId,action:'record.patch',appId:request.appId,canonicalInputHash:inputHash,permit,guards:[owner,...connection?.guards??[],...next.guards],mutations:[insert(files,{id:fileId,app_id:request.appId,entity_id:request.entityId,record_id:request.recordId,field_ids:JSON.stringify([request.fieldId]),filename:reference.name,media_type:reference.mediaType||'application/octet-stream',bytes:bytes.length,sha256:hash,object_key:objectKey,state:'available',source_id:null,rejection:null,version:1,created_at:ctx.now,updated_at:ctx.now}),...next.mutations,releaseFileWrite(writeId)],audit:[...next.audit,{action:'attachment.reference.keep-copy',subject:ref,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:next.next})
   if(receipt.result.state!=='committed'||receipt.replay)throw new ApiError('version_conflict','The reference changed before the copy committed.')
   return {fileId,record:receipt.result.value}
  }catch(error){await evidence.bucket.delete(objectKey);await finishFileWrite(db,writeId);throw error}
 }
}
