import {errorResponse} from '../../registry/errors.server'
import {launchCommandSchema} from '../../../apps/launch/contracts'
import {Hono} from 'hono'
import {z} from 'zod'
import type {Platform} from '../../platform'
import type {ServerFoundation} from '../foundation.server'
import {createMemberService,erasureInput} from '../../../domains/authority/members.server'
import {memberLifecycle} from '../../../domains/lifecycle/members.server'
import {createLifecycleCleanup} from '../../../domains/lifecycle/cleanup.server'
import {idSchema} from '../../../domains/authority/validators'
import {readBoundedJson} from '../../../domains/authority/http.server'
import {AuthorityError} from '../../../domains/authority/errors'
import {canonicalJson} from '../../../domains/authority/grants.server'
import {digest} from '../../../domains/authority/crypto.server'
import {createUlid} from '../../shared/ids'
import type {Json} from '../../../contracts/primitives'
export function createLifecycleComposition(platform:Platform,foundation:ServerFoundation){
 const db=platform.bindings.DB,service=createMemberService(db,foundation.policy,memberLifecycle(db,platform.bindings.FILES,foundation.descriptors)),cleanup=createLifecycleCleanup(db,platform.bindings.FILES)
 const ref=z.object({appId:idSchema,entityId:idSchema,recordId:idSchema}).strict(),expected=z.array(z.object({ref,version:z.number().int().positive()}).strict()).min(1).max(100)
 const input=z.object({memberId:idSchema,reason:z.string().trim().min(1).max(2000),keepCopies:z.array(z.string().min(1).max(200)).max(500).optional()}).strict(),command=z.object({commandId:idSchema,expected,input}).strict()
 for(const operation of ['remove','erase'] as const){const action=`member.${operation}`
  foundation.commands.register({action,description:operation==='erase'?'Permanently erase a removed operator.':'Remove operator access.',inputSchema:z.toJSONSchema(command) as Json,input:command,
   visible:async ctx=>{if(ctx.principal.kind!=='human')return false;for(const app of (await db.prepare("SELECT app_id FROM authority_memberships WHERE principal_id=? AND state='active'").bind(ctx.principal.id).all<{app_id:string}>()).results){try{await foundation.policy.authorize(ctx,{appId:app.app_id,action,expected:[],cost:[],inputHash:''});return true}catch(error){if(!(error instanceof AuthorityError))throw error}}return false},
   replayIdentity:async(_ctx,value)=>{const subject=value.expected.find(e=>e.ref.recordId===value.input.memberId);if(!subject)throw new AuthorityError('validation','The current member version is required.',400);return {appId:subject.ref.appId,canonicalInputHash:await digest(canonicalJson(operation==='remove'?{memberId:value.input.memberId,expectedVersion:subject.version,reason:value.input.reason}:erasureInput(value.input.memberId,subject.version,value.input.keepCopies??[])))}},
   prepare:async(ctx,value)=>{const subject=value.expected.find(e=>e.ref.recordId===value.input.memberId);if(!subject)throw new AuthorityError('validation','The current member version is required.',400)
    const plan=operation==='erase'?await service.erase(ctx,value.commandId,subject.ref.appId,value.input.memberId,subject.version,value.input.keepCopies??[]):await service.remove(ctx,value.commandId,subject.ref.appId,value.input.memberId,subject.version,value.input.reason)
    return {...plan,committedResult:{...plan.committedResult,...(operation==='erase'?{erasureId:value.input.memberId,confirmed:false}:{})}}
   },
  })
 }
 const http=new Hono()
 http.onError((error,c)=>errorResponse(error,createUlid(),c.req.method+' '+c.req.path))
 http.post('/api/v1/commands/member.erase',async c=>{
  const request=c.req.raw,ctx=await foundation.authenticate(request,'http',createUlid())
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new AuthorityError('forbidden','A same-origin request is required.',403)
  const value=command.parse(await readBoundedJson(request,16384)),receipt=await foundation.commands.get('member.erase')!.execute(ctx,value)
  if(receipt.result.state!=='committed')return c.json({data:receipt.result})
  const result=await cleanup.advance(value.input.memberId)
  return c.json({data:{...receipt.result,value:{...(receipt.result.state==='committed'?receipt.result.value as object:{}),confirmed:result.state==='complete',erasureState:result.state}},meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:receipt.consistencyToken}},200,{'cache-control':'no-store'})
 })
 http.post('/api/v1/commands/launch.campaign.delete',async c=>{
  const request=c.req.raw,ctx=await foundation.authenticate(request,'http',createUlid())
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new AuthorityError('forbidden','A same-origin request is required.',403)
  const value=launchCommandSchema('campaign.delete').parse(await readBoundedJson(request,16384)),receipt=await foundation.commands.get('launch.campaign.delete')!.execute(ctx,value)
  if(receipt.result.state!=='committed')return c.json({data:receipt.result})
  const result=await cleanup.advance(value.input.id)
  return c.json({data:{...receipt.result,value:{...(receipt.result.state==='committed'?receipt.result.value as object:{}),confirmed:result.state==='complete',erasureState:result.state}},meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:receipt.consistencyToken}},200,{'cache-control':'no-store'})
 })
 http.get('/api/v1/erasures/:id',async c=>{const ctx=await foundation.authenticate(c.req.raw,'http',createUlid()),id=idSchema.parse(c.req.param('id'));await cleanup.status(ctx,foundation.policy,id);await cleanup.advance(id);return c.json({data:await cleanup.status(ctx,foundation.policy,id)})})
 return {http,cleanup}
}
