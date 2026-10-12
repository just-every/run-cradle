import { Hono } from 'hono'
import { z } from 'zod'
import type { RequestContext } from '../authority/ports'
import { idSchema,instantSchema } from '../authority/validators'
import { readBoundedJson } from '../authority/http.server'
import { recordAutomationDefinition } from './contracts'
import type { createRecordAutomationConfiguration } from './configuration.server'
import type { createRecordAutomationHistory } from './history.server'
import type { createAutomationDestinations } from './destinations.server'

export function recordAutomationsHttp(deps:{
 configuration:ReturnType<typeof createRecordAutomationConfiguration>;
 history:ReturnType<typeof createRecordAutomationHistory>;
 destinations:ReturnType<typeof createAutomationDestinations>;
 authenticate:(request:Request)=>Promise<RequestContext>;
 recipients:(ctx:RequestContext,appId:string,entityId:string)=>Promise<unknown>;
}) {
 const router=new Hono()
 const reply=(ctx:RequestContext,data:unknown)=>({data,meta:{requestId:ctx.requestId,
  apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}})
 router.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()})
 router.get('/',async c=>{
  const ctx=await deps.authenticate(c.req.raw),appId=idSchema.parse(c.req.query('appId'))
  return c.json(reply(ctx,{automations:await deps.history.list(ctx,appId)}))
 })
 router.post('/',async c=>{
  const ctx=await deps.authenticate(c.req.raw),input=z.object({commandId:idSchema,id:idSchema.optional(),
   version:z.number().int().positive().optional(),expiresAt:instantSchema,definition:recordAutomationDefinition}).strict()
   .parse(await readBoundedJson(c.req.raw,65536))
  return c.json(reply(ctx,await deps.configuration.save(ctx,input)),201)
 })
 router.get('/recipients',async c=>{
  const ctx=await deps.authenticate(c.req.raw)
  return c.json(reply(ctx,{recipients:await deps.recipients(ctx,idSchema.parse(c.req.query('appId')),idSchema.parse(c.req.query('entityId')))}))
 })
 router.get('/:id/runs',async c=>{
  const ctx=await deps.authenticate(c.req.raw)
  return c.json(reply(ctx,{runs:await deps.history.runs(ctx,idSchema.parse(c.req.param('id')))}))
 })
 router.post('/:id/disable',async c=>{
  const ctx=await deps.authenticate(c.req.raw),input=z.object({commandId:idSchema,version:z.number().int().positive()}).strict()
   .parse(await readBoundedJson(c.req.raw,4096))
  return c.json(reply(ctx,await deps.configuration.disable(ctx,{...input,id:idSchema.parse(c.req.param('id'))})))
 })
 router.post('/destinations',async c=>{
  const ctx=await deps.authenticate(c.req.raw),input=z.object({commandId:idSchema,appId:idSchema,
   entityId:idSchema,kind:z.enum(['webhook','slack']),url:z.string().max(2048)}).strict()
   .parse(await readBoundedJson(c.req.raw,8192))
  return c.json(reply(ctx,await deps.destinations.create(ctx,input)),201)
 })
 return router
}
