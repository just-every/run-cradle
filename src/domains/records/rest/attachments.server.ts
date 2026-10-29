import type {PolicyPort,RequestContext} from '../../authority/ports'
import type {EvidenceDependencies} from '../../evidence/ports'
import type {createRecordServices} from '../service.server'
import {ownerDelegationSnapshot} from '../../authority/delegation.server'
import {createFileService} from '../../evidence/files.server'
import {EvidenceError} from '../../evidence/shared.server'
import {uploadInput} from '../../evidence/validators'
import {readBoundedJson} from '../../authority/http.server'
import {AdmissionError} from '../../admission/errors'
import {idSchema} from '../validators'

export const attachmentInput=uploadInput.omit({subject:true,fieldIds:true}).extend({fieldId:idSchema})
/** Upload authority stays with a current owner session and the target field's write policy. */
export function createRestAttachments(deps:EvidenceDependencies,services:ReturnType<typeof createRecordServices>){
 const policy:PolicyPort={scope:deps.policy.scope,async authorize(ctx,request){
  if(!['upload.begin','upload.complete'].includes(request.action))return deps.policy.authorize(ctx,request)
  const owner=await ownerDelegationSnapshot(deps.db,ctx,request.appId)
  const permit=await deps.policy.authorize(ctx,{...request,action:'record.patch'})
  return {...permit,action:request.action,guards:[...permit.guards,owner.guard]}
 }}
 const files=createFileService({...deps,policy})
 return async(ctx:RequestContext,request:Request,match:RegExpMatchArray)=>{
  const subject={appId:idSchema.parse(match[1]),entityId:idSchema.parse(match[2]),recordId:idSchema.parse(match[3])}
  const fileId=match[4]?idSchema.parse(match[4]):undefined
  const scope=await services.policy.scope(ctx,{...subject,purpose:'read'})
  await services.reader.record(ctx,scope,subject)
  try{
   if(!fileId&&request.method==='POST'){
    const {fieldId,...input}=attachmentInput.parse(await readBoundedJson(request,16384))
    const receipt=await files.begin(ctx,{...input,subject,fieldIds:[fieldId]})
    if(receipt.result.state!=='committed')throw new AdmissionError('version_conflict','The attachment upload was not admitted')
    return {...receipt,result:{...receipt.result,value:{...receipt.result.value,uploadUrl:new URL(request.url).pathname+'/'+receipt.result.value.file.id+'/content'}}}
   }
   if(fileId){
    const file=await files.row(ctx,fileId)
    if(file.app_id!==subject.appId||file.entity_id!==subject.entityId||file.record_id!==subject.recordId)throw new AdmissionError('not_found','Attachment not found')
    if(request.method==='GET')return await files.download(ctx,fileId)
    if(request.method==='PUT'){
     if(!request.body)throw new AdmissionError('validation','Upload bytes are required')
     return await files.upload(ctx,fileId,request.body,request.headers.get('Content-Type')??'')
    }
   }
   throw new AdmissionError('not_found','Unknown REST attachment operation')
  }catch(error){if(error instanceof EvidenceError)throw new AdmissionError(error.code as 'upload_rejected',error.message);throw error}
 }
}
