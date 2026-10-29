import {z} from 'zod'
import {idSchema} from '../validators'
import {addCommentInput,editCommentInput,deleteCommentInput} from './comments.server'

const comment=z.object({id:idSchema,version:z.number().int().positive(),body:z.string().nullable(),authorLabel:z.string(),mentions:z.array(idSchema),deletedAt:z.string().nullable(),canEdit:z.boolean(),canDelete:z.boolean()}).loose()
const page=z.object({items:z.array(comment),canAdd:z.boolean(),nextCursor:z.string().nullable(),total:z.object({kind:z.enum(['exact','at_least']),value:z.number().int()}),evaluatedAt:z.iso.datetime()})
const receipt=z.object({replay:z.boolean(),consistencyToken:z.string(),result:z.object({commandId:idSchema,state:z.literal('committed'),value:z.object({id:idSchema,version:z.number().int().positive()}).loose()}).loose()})
export function restCommentPaths(base:string,entityId:string){
 const operation=(name:string,input?:z.ZodType,item=false)=>({
  operationId:`${entityId}_${name}`,'x-cradle-operation':name,'x-cradle-entityId':entityId,security:[{apiKey:[]},{nativeSession:[],csrfToken:[]}],
  description:'Uses current record visibility and native comment permissions. Record keys do not grant comment writes. Only the original author may edit or delete.',
  parameters:[{name:'recordId',in:'path',required:true,schema:z.toJSONSchema(idSchema)},...(item?[{name:'commentId',in:'path',required:true,schema:z.toJSONSchema(idSchema)}]:[]),...(name==='comments'?[
   {name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:200,default:200}},
   {name:'q',in:'query',schema:{type:'string',maxLength:200}},
   {name:'cursor',in:'query',schema:{type:'string',maxLength:4096}},
  ]:[])],
  ...(input?{requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(input)}}}}:{}),
  responses:{'200':{description:'Current policy checked comments or native command receipt.',content:{'application/json':{schema:z.toJSONSchema(z.object({data:name==='comments'?page:receipt,meta:z.object({}).loose()}))}}},'400':{description:'Invalid input; no comment changed.'},'401':{description:'Current authentication required.'},'403':{description:'Record or comment authority refused.'},'404':{description:'Record or comment unavailable.'},'409':{description:'Record, comment or authority changed.'},'429':{description:'Credential request limit exceeded; no comment changed.',headers:{'Retry-After':{description:'Seconds until another request may be admitted.',schema:{type:'integer',minimum:1}}}}},
 })
 return {
  [base+'/records/{recordId}/comments']:{get:operation('comments'),post:operation('comment.create',addCommentInput)},
  [base+'/records/{recordId}/comments/{commentId}']:{patch:operation('comment.update',editCommentInput,true),delete:operation('comment.delete',deleteCommentInput,true)},
 }
}
