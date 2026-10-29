import {z} from 'zod'
import {idSchema} from '../validators'
import {attachmentInput} from './attachments.server'
import {uploadInput} from '../../evidence/validators'

const file=z.object({id:idSchema,version:z.number().int(),filename:z.string(),mediaType:z.string(),bytes:z.number().int(),sha256:z.string(),state:z.literal('uploading')}).loose()
const begin=z.object({replay:z.boolean(),consistencyToken:z.string(),result:z.object({commandId:idSchema,state:z.literal('committed'),value:z.object({file,headers:z.record(z.string(),z.string()),expiresAt:z.iso.datetime(),uploadUrl:z.string(),method:z.literal('PUT'),maximumBytes:z.number().int()})}).loose()})
export function restAttachmentPaths(base:string,entityId:string){
 const operation=(name:string)=>({operationId:`${entityId}_${name}`,'x-cradle-operation':name,'x-cradle-entityId':entityId,security:name==='attachment.download'?[{apiKey:[]},{nativeSession:[]}]:[{nativeSession:[],csrfToken:[]}],
  description:'Uploads require a current workspace owner session and readable, writable attachment field. Record keys do not grant upload writes. After upload, use record update to link the file to its original field. Content reads require current subject and field visibility.',
  parameters:[{name:'recordId',in:'path',required:true,schema:z.toJSONSchema(idSchema)},...(name==='attachment.begin'?[]:[{name:'fileId',in:'path',required:true,schema:z.toJSONSchema(idSchema)}])],
  ...(name==='attachment.begin'?{requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(attachmentInput)}}}}:name==='attachment.upload'?{requestBody:{required:true,content:Object.fromEntries(uploadInput.shape.mediaType.options.map(type=>[type,{schema:{type:'string',format:'binary'}}]))}}:{}),
  responses:{'200':{description:'Verified private attachment bytes or upload state.',content:name==='attachment.download'?Object.fromEntries(uploadInput.shape.mediaType.options.map(type=>[type,{schema:{type:'string',format:'binary'}}])):{'application/json':{schema:z.toJSONSchema(z.object({data:name==='attachment.begin'?begin:z.object({id:idSchema,state:z.literal('available')}),meta:z.object({}).loose()}))}}},'400':{description:'Invalid request.'},'401':{description:'Current authentication required.'},'403':{description:'Current owner or field write authority refused.'},'404':{description:'Subject or attachment unavailable.'},'409':{description:'Subject or upload changed.'},'413':{description:'File validation refused the upload.'},'429':{description:'Credential request limit exceeded.',headers:{'Retry-After':{schema:{type:'integer',minimum:1}}}}},
 })
 return {
  [base+'/records/{recordId}/attachments']:{post:operation('attachment.begin')},
  [base+'/records/{recordId}/attachments/{fileId}/content']:{put:operation('attachment.upload'),get:operation('attachment.download')},
 }
}
