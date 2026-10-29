import {z} from 'zod'
import type {CommandRegistry} from '../../../core/registry/commands'
import type {RequestContext} from '../../authority/ports'
import type {createCommentReader} from '../../evidence/comment-reader.server'
import type {createRecordServices} from '../service.server'
import {readBoundedJson} from '../../authority/http.server'
import {AdmissionError} from '../../admission/errors'
import {idSchema} from '../validators'

const text={body:z.string().min(1).max(10000),mentions:z.array(idSchema).max(100).default([])}
export const addCommentInput=z.object({commandId:idSchema,recordVersion:z.number().int().positive(),...text}).strict()
export const editCommentInput=addCommentInput.extend({version:z.number().int().positive()})
export const deleteCommentInput=addCommentInput.omit({body:true,mentions:true}).extend({version:z.number().int().positive()})
const pageInput=z.object({limit:z.coerce.number().int().min(1).max(200).default(200),q:z.string().trim().max(200).optional(),cursor:z.string().max(4096).optional()}).strict()

/** REST comments invoke the native commands, including author checks and replay fences. */
export function createRestComments(services:ReturnType<typeof createRecordServices>,comments:ReturnType<typeof createCommentReader>,commands:CommandRegistry){
 return async(ctx:RequestContext,request:Request,match:RegExpMatchArray)=>{
  const subject={appId:idSchema.parse(match[1]),entityId:idSchema.parse(match[2]),recordId:idSchema.parse(match[3])}
  const commentId=match[4]?idSchema.parse(match[4]):undefined,url=new URL(request.url)
  const scope=await services.policy.scope(ctx,{...subject,purpose:'read'})
  // Keep deleted and policy-hidden subjects behind the same door as REST records.
  await services.reader.record(ctx,scope,subject)
  if(!commentId&&request.method==='GET')return comments(ctx,subject,pageInput.parse(Object.fromEntries(url.searchParams)))
  const input=await readBoundedJson(request,65536)
  let action:string,body:unknown
  if(!commentId&&request.method==='POST'){
   const {commandId,recordVersion,...text}=addCommentInput.parse(input)
   action='comment.add';body={commandId,expected:[{ref:subject,version:recordVersion}],input:{subject,...text}}
  }else if(commentId&&request.method==='PATCH'){
   const {commandId,recordVersion,...text}=editCommentInput.parse(input)
   action='comment.edit';body={commandId,expected:[{ref:subject,version:recordVersion}],input:{subject,id:commentId,...text}}
  }else if(commentId&&request.method==='DELETE'){
   const {commandId,recordVersion,version}=deleteCommentInput.parse(input)
   action='comment.delete';body={commandId,expected:[{ref:subject,version:recordVersion}],input:{subject,id:commentId,version}}
  }else throw new AdmissionError('not_found','Unknown REST comment operation')
  const command=commands.get(action)
  if(!command)throw new Error('Native comment command is unavailable')
  return command.execute(ctx,body)
 }
}
