import { Hono } from 'hono'
import { z } from 'zod'
import type { RequestContext } from './ports'
import type { createUserKeyService } from './user-keys.server'
import { idSchema, instantSchema } from './validators'
import { readBoundedJson } from './http.server'

export function createUserKeysHttp(service:ReturnType<typeof createUserKeyService>,authenticate:(request:Request)=>Promise<RequestContext>) {
 const router=new Hono()
 const reply=(ctx:RequestContext,data:unknown)=>({data,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}})
 router.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()})
 router.get('/',async c=>{
  const ctx=await authenticate(c.req.raw),appId=idSchema.parse(c.req.query('appId'))
  return c.json(reply(ctx,{keys:await service.list(ctx,appId)}))
 })
 router.post('/',async c=>{
  const ctx=await authenticate(c.req.raw)
  const input=z.object({commandId:idSchema,appId:idSchema,entityId:idSchema,
   name:z.string().trim().min(1).max(100),permissions:z.enum(['read','write']),allowDelete:z.boolean().optional(),expiresAt:instantSchema}).strict()
   .parse(await readBoundedJson(c.req.raw,16384))
  return c.json(reply(ctx,{key:await service.issue(ctx,input.commandId,input)}),201)
 })
 router.post('/:id/revoke',async c=>{
  const ctx=await authenticate(c.req.raw)
  const input=z.object({commandId:idSchema,appId:idSchema}).strict().parse(await readBoundedJson(c.req.raw,4096))
  await service.revoke(ctx,input.commandId,input.appId,idSchema.parse(c.req.param('id')))
  return c.json(reply(ctx,{revoked:true}))
 })
 return router
}
