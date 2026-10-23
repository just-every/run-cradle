import {z} from 'zod'
import type {ServerFoundation} from '../../../core/app/foundation.server'
import type {RequestContext} from '../../authority/ports'
import type {createRecordReader} from '../query.server'
import type {createRecordWriter} from '../change.server'
import type {StoreItem} from '../../../adapters/file-stores.server'
import type {fileStoreRequestSchema} from './operation.server'
import type {SqlPredicate} from '../../admission/ports'
import type {AttachmentMember,StoreReference} from '../../../contracts/primitives'
import {createUlid} from '../../../core/shared/ids'
import {canonical,sha256} from '../../../adapters/crypto.server'
import {ApiError} from '../../../core/registry/errors'
import {idSchema} from '../validators'
import {storeDigestSchema,canonicalStoreJson} from '../portable-store-references'
import {isStoreReferenceMember,referenceValue} from '../store-references'
import {trustedPredicate} from '../../admission/sql.server'
const inputSchema=z.object({appId:idSchema,entityId:idSchema,recordId:idSchema,fieldId:idSchema,itemId:z.string().min(1).max(512),confirmChanged:z.boolean().default(false),observedDigest:storeDigestSchema.nullable().optional()}).strict()
type Run=<T>(ctx:RequestContext,connectionId:string,request:z.infer<typeof fileStoreRequestSchema>)=>Promise<T>
const sameDigest=(a:NonNullable<StoreReference['digest']>,b:NonNullable<StoreReference['digest']>)=>a.algorithm===b.algorithm&&(a.algorithm==='quickxor'?a.value===b.value:a.value.toLowerCase()===b.value.toLowerCase())
/** Resolve only a returned reference, using this writer's own exact account. Metadata jobs never write to a store. */
export function createStoreResolution(db:D1Database,foundation:ServerFoundation,reader:ReturnType<typeof createRecordReader>,writer:ReturnType<typeof createRecordWriter>,run:Run){
 return async(ctx:RequestContext,input:unknown)=>{
  const request=inputSchema.parse(input),ref={appId:request.appId,entityId:request.entityId,recordId:request.recordId}
  if(ctx.principal.kind!=='human')throw new ApiError('forbidden','A person resolves references with their own file store.')
  const scope=await foundation.policy.scope(ctx,{appId:request.appId,entityId:request.entityId,purpose:'read'})
  if(!scope.writableFieldIds.includes(request.fieldId))throw new ApiError('forbidden','Write authority on this attachment field is required.')
  const record=await reader.record(ctx,scope,ref),cell=record.fields[request.fieldId]
  if(cell?.state!=='value'||!Array.isArray(cell.value))throw new ApiError('not_found','Attachment field not found.')
  const members=cell.value as AttachmentMember[],index=members.findIndex(member=>isStoreReferenceMember(member)&&member.reference.itemId===request.itemId),member=members[index]
  if(!member||!isStoreReferenceMember(member)||!member.reference.portable||member.reference.resolution!=='unresolved')throw new ApiError('not_found','Unresolved reference not found.')
  const before=member.reference,portable=before.portable!
  if(portable.provider==='chest'||portable.account===null)return {state:'unresolved' as const,reason:'No matching account identity is recorded.'}
  const candidates=(await db.prepare("SELECT id,version FROM provider_connections WHERE app_id=? AND owner_id=? AND adapter_id=? AND account_id=? AND state='connected' AND revoked_at IS NULL ORDER BY created_at DESC,id").bind(request.appId,ctx.principal.id,portable.provider,portable.account).all<{id:string;version:number}>()).results
  if(!candidates.length)return {state:'unresolved' as const,reason:'Connect your own matching store account to resolve this file.'}
  const connection=candidates[0]!,item=await run<StoreItem|null>(ctx,connection.id,{op:'metadata',entityId:request.entityId,fieldId:request.fieldId,recordId:request.recordId,itemId:request.itemId})
  if(!item)return {state:'unresolved' as const,reason:'The store did not find this file or did not grant access.'}
  if(item.itemId!==portable.itemId)throw new ApiError('invalid_provider_output','The store returned a different item identity.')
  const changed=portable.digest!==null&&(!item.digest||!sameDigest(portable.digest,item.digest))
  if(changed&&!request.confirmChanged)return {state:'changed' as const,reason:'The content digest changed. Confirm this specific file to accept its current content.',item:{name:item.name,size:item.size,modified:item.modifiedAt,digest:item.digest}}
  if(changed&&(!Object.hasOwn(request,'observedDigest')||canonicalStoreJson(request.observedDigest)!==canonicalStoreJson(item.digest)))throw new ApiError('version_conflict','The file changed after review. Check it again before confirmation.')
  const nextPortable=changed?{...portable,name:item.name,size:item.size,modified:item.modifiedAt,digest:item.digest}:portable
  const next:StoreReference={...before,name:nextPortable.name,size:nextPortable.size,modifiedAt:nextPortable.modified,digest:nextPortable.digest,portable:nextPortable,connectionId:connection.id,resolution:portable.digest===null?'unverified':'resolved'}
  const guards:SqlPredicate[]=[trustedPredicate("EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND app_id=? AND owner_id=? AND adapter_id=? AND account_id=? AND version=? AND state='connected' AND revoked_at IS NULL)",[connection.id,request.appId,ctx.principal.id,portable.provider,portable.account,connection.version])]
  const changes={[request.fieldId]:members.map((value,i)=>i===index?{reference:next}:value)},commandId=createUlid(),hash=await sha256(canonical({request,portable:nextPortable})),permit=await foundation.policy.authorize(ctx,{appId:request.appId,action:'record.patch',expected:[{ref,version:record.version}],fieldIds:[request.fieldId],cost:[],inputHash:hash,commandId})
  const prepared=await writer.prepareChange(ctx,scope,{ref,expectedVersion:record.version,changes},new Map([[referenceValue(next),guards]]))
  await foundation.admission.commit(ctx,{commandId,action:'record.patch',appId:request.appId,canonicalInputHash:hash,permit,guards:prepared.guards,mutations:prepared.mutations,audit:[...prepared.audit,{action:changed?'attachment.reference.confirm-changed':'attachment.reference.resolve',subject:ref,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:prepared.next})
  return {state:next.resolution,record:prepared.next}
 }
}
