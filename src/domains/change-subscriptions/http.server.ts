import {Hono} from 'hono'
import {z} from 'zod'
import type {RequestContext} from '../authority/ports'
import {idSchema} from '../authority/validators'
import {readBoundedJson} from '../authority/http.server'
import type {createChangeSubscriptions} from './service.server'
export function changeSubscriptionsHttp(service:ReturnType<typeof createChangeSubscriptions>,authenticate:(request:Request)=>Promise<RequestContext>){
 const router=new Hono(),command=z.object({commandId:idSchema}).strict()
 const reply=(ctx:RequestContext,data:unknown)=>({data,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}})
 router.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()})
 router.post('/',async c=>{const ctx=await authenticate(c.req.raw),input=z.object({commandId:idSchema,appId:idSchema,entityId:idSchema.optional(),viewId:idSchema.optional(),url:z.string().max(2048)}).strict().parse(await readBoundedJson(c.req.raw,8192));return c.json(reply(ctx,await service.create(ctx,input)),201)})
 router.get('/',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await service.list(ctx,idSchema.parse(c.req.query('appId')))))})
 router.post('/:id/refresh',async c=>{const ctx=await authenticate(c.req.raw),input=command.parse(await readBoundedJson(c.req.raw,1024));return c.json(reply(ctx,await service.refresh(ctx,idSchema.parse(c.req.param('id')),input.commandId)))})
 router.delete('/:id',async c=>{const ctx=await authenticate(c.req.raw),input=command.parse(await readBoundedJson(c.req.raw,1024));return c.json(reply(ctx,await service.remove(ctx,idSchema.parse(c.req.param('id')),input.commandId)))})
 router.get('/:id/changes',async c=>{const ctx=await authenticate(c.req.raw),input=z.object({cursor:z.string().max(4096),through:z.string().max(4096).optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).strict().parse(c.req.query());return c.json(reply(ctx,await service.changes(ctx,idSchema.parse(c.req.param('id')),input)))})
 return router
}
