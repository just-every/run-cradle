import {z} from 'zod'
import type {ServerFoundation} from '../../../core/app/foundation.server'
import type {RequestContext} from '../../authority/ports'
import type {createRecordReader} from '../query.server'
import type {createRecordWriter} from '../change.server'
import type {StoreItem} from '../../../adapters/file-stores.server'
import type {fileStoreRequestSchema} from './operation.server'
import type {SqlPredicate,AuditFact} from '../../admission/ports'
import {personalStorePermit} from '../../authority/personal-stores.server'
import type {AttachmentMember,StoreReference} from '../../../contracts/primitives'
import {createUlid} from '../../../core/shared/ids'
import {canonical,sha256} from '../../../adapters/crypto.server'
import {ApiError} from '../../../core/registry/errors'
import {idSchema} from '../validators'
import {storeDigestSchema,canonicalStoreJson,portableStoreSchema} from '../portable-store-references'
import {isStoreReferenceMember,referenceValue,storeProviders} from '../store-references'
import {trustedPredicate} from '../../admission/sql.server'
const addressSchema=z.object({appId:idSchema,entityId:idSchema,recordId:idSchema,fieldId:idSchema})
const selectionSchema=z.object({provider:z.enum(storeProviders),itemId:z.string().min(1).max(512),observedDigest:storeDigestSchema.nullable()}).strict()
const inputSchema=addressSchema.extend({provider:z.enum(storeProviders),itemId:z.string().min(1).max(512),confirmChanged:z.boolean().default(false),observedDigest:storeDigestSchema.nullable().optional()}).strict()
const bulkSchema=addressSchema.extend({items:z.array(selectionSchema).min(1).max(100).refine(items=>new Set(items.map(item=>JSON.stringify([item.provider,item.itemId]))).size===items.length,'Choose each reference once.')}).strict()
type Run=<T>(ctx:RequestContext,connectionId:string,request:z.infer<typeof fileStoreRequestSchema>)=>Promise<T>
const sameDigest=(a:NonNullable<StoreReference['digest']>,b:NonNullable<StoreReference['digest']>)=>a.algorithm===b.algorithm&&(a.algorithm==='quickxor'?a.value===b.value:a.value.toLowerCase()===b.value.toLowerCase())
/** Resolve returned references only with this writer's own account. A bulk confirmation commits all selected changes together. */
export function createStoreResolution(db:D1Database,foundation:ServerFoundation,reader:ReturnType<typeof createRecordReader>,writer:ReturnType<typeof createRecordWriter>,run:Run){
 async function apply(ctx:RequestContext,address:z.infer<typeof addressSchema>,requests:Omit<z.infer<typeof inputSchema>,keyof z.infer<typeof addressSchema>>[],bulk:boolean){
  const ref={appId:address.appId,entityId:address.entityId,recordId:address.recordId}
  if(ctx.principal.kind!=='human')throw new ApiError('forbidden','A person resolves references with their own file store.')
  const scope=await foundation.policy.scope(ctx,{appId:address.appId,entityId:address.entityId,purpose:'read'})
  if(!scope.writableFieldIds.includes(address.fieldId))throw new ApiError('forbidden','Write authority on this attachment field is required.')
  const record=await reader.record(ctx,scope,ref),cell=record.fields[address.fieldId]
  if(cell?.state!=='value'||!Array.isArray(cell.value))throw new ApiError('not_found','Attachment field not found.')
  const members=cell.value as AttachmentMember[],nextMembers=[...members],bindings=new Map<string,SqlPredicate[]>(),audit:AuditFact[]=[]
  const unavailable=(reason:string)=>{if(bulk)throw new ApiError('forbidden',reason);return {state:'unresolved' as const,reason}}
  for(const request of requests){
   const index=members.findIndex(member=>isStoreReferenceMember(member)&&member.reference.itemId===request.itemId&&member.reference.provider===request.provider),member=members[index]
   if(!member||!isStoreReferenceMember(member)||!member.reference.portable||member.reference.resolution!=='unresolved')throw new ApiError('not_found','Unresolved reference not found.')
   const before=member.reference,portable=before.portable!
   if(portable.provider==='chest'||portable.account===null)return unavailable('No matching account identity is recorded.')
   const candidates=(await db.prepare("SELECT id,control_epoch FROM provider_connections WHERE app_id=? AND owner_id=? AND adapter_id=? AND account_id=? AND state='connected' AND revoked_at IS NULL ORDER BY created_at DESC,id").bind(address.appId,ctx.principal.id,portable.provider,portable.account).all<{id:string;control_epoch:number}>()).results
   if(!candidates.length)return unavailable('Connect your own matching store account to resolve this file.')
   const connection=candidates[0]!,operation={op:'metadata' as const,entityId:address.entityId,fieldId:address.fieldId,recordId:address.recordId,itemId:request.itemId}
   const storePermit=await personalStorePermit(db,foundation.policy,foundation.entities,ctx,{appId:address.appId,action:'connection.sync',expected:[],cost:[],connectionId:connection.id,inputHash:''},undefined,operation)
   if(!storePermit)throw new ApiError('forbidden','A current personal store permit is required.')
   const item=await run<StoreItem|null>(ctx,connection.id,operation)
   if(!item)return unavailable('The store did not find this file or did not grant access.')
   if(item.itemId!==portable.itemId)throw new ApiError('invalid_provider_output','The store returned a different item identity.')
   const changed=portable.digest!==null&&(!item.digest||!sameDigest(portable.digest,item.digest))
   if(changed&&!request.confirmChanged)return {state:'changed' as const,reason:'The content digest changed. Review and explicitly confirm its current content.',item:{name:item.name,size:item.size,modified:item.modifiedAt,digest:item.digest}}
   if((bulk||changed)&&(!Object.hasOwn(request,'observedDigest')||canonicalStoreJson(request.observedDigest)!==canonicalStoreJson(item.digest)))throw new ApiError('version_conflict','The file changed after review. Check it again before confirmation.')
   const nextPortable=changed?portableStoreSchema.parse({...portable,name:item.name,size:item.size,modified:item.modifiedAt,digest:item.digest}):portable
   const next:StoreReference={...before,name:nextPortable.name,size:nextPortable.size,modifiedAt:nextPortable.modified,digest:nextPortable.digest,portable:nextPortable,connectionId:connection.id,resolution:nextPortable.digest===null?'unverified':'resolved'}
   const guards:SqlPredicate[]=[...storePermit.guards,trustedPredicate("EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND app_id=? AND owner_id=? AND adapter_id=? AND account_id=? AND control_epoch=? AND state='connected' AND revoked_at IS NULL)",[connection.id,address.appId,ctx.principal.id,portable.provider,portable.account,connection.control_epoch])]
   nextMembers[index]={reference:next};bindings.set(referenceValue(next),guards)
   audit.push({action:changed?'attachment.reference.confirm-changed':'attachment.reference.resolve',subject:ref,changes:[{fieldId:address.fieldId,before:{state:'value',value:[member]},after:{state:'value',value:[{reference:next}]}}],sourceIds:[],personalContentRefs:[]})
  }
  const changes={[address.fieldId]:nextMembers},commandId=createUlid(),hash=await sha256(canonical({address,requests,changes})),permit=await foundation.policy.authorize(ctx,{appId:address.appId,action:'record.patch',expected:[{ref,version:record.version}],fieldIds:[address.fieldId],cost:[],inputHash:hash,commandId})
  const prepared=await writer.prepareChange(ctx,scope,{ref,expectedVersion:record.version,changes},bindings)
  const saved=await foundation.admission.commit(ctx,{commandId,action:'record.patch',appId:address.appId,canonicalInputHash:hash,permit,guards:prepared.guards,mutations:prepared.mutations,audit:[...prepared.audit,...audit],events:[],outbox:[],committedResult:prepared.next})
  if(saved.result.state!=='committed')throw new ApiError('version_conflict','Reference confirmation was not admitted. Check the selected files again.')
  return {state:bulk?'confirmed':nextMembers.filter(isStoreReferenceMember).find(member=>member.reference.itemId===requests[0]!.itemId&&member.reference.provider===requests[0]!.provider)!.reference.resolution,record:prepared.next}
 }
 const resolve=(ctx:RequestContext,input:unknown)=>{const request=inputSchema.parse(input);return apply(ctx,request,[request],false)}
 return Object.assign(resolve,{bulk:(ctx:RequestContext,input:unknown)=>{const request=bulkSchema.parse(input);return apply(ctx,request,request.items.map(item=>({...item,confirmChanged:true})),true)}})
}
