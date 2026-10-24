import { Hono } from 'hono'
import { z } from 'zod'
import type { RequestContext } from '../authority/ports'
import { idSchema,instantSchema } from '../authority/validators'
import { readBoundedJson } from '../authority/http.server'
import { recordAutomationDefinition } from './contracts'
import type {createAutomationTests} from './test-runs.server'
import type { createRecordAutomationConfiguration } from './configuration.server'
import type { createRecordAutomationHistory } from './history.server'
import type { createAutomationDestinations } from './destinations.server'

export function recordAutomationsHttp(deps:{
 slack?:ReturnType<typeof import('../slack-app/service.server').createSlackApp>;
 sms:ReturnType<typeof import('../sms/settings.server').smsSettings>;
 retry:ReturnType<typeof import('./retry.server').createAutomationRetry>;
 tests:ReturnType<typeof createAutomationTests>;
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
 if(deps.slack)router.route('/slack',deps.slack.http)
 router.get('/sms/settings',async c=>{const ctx=await deps.authenticate(c.req.raw);return c.json(reply(ctx,await deps.sms.read(ctx)))})
 router.put('/sms/settings',async c=>{const ctx=await deps.authenticate(c.req.raw);return c.json(reply(ctx,await deps.sms.save(ctx,await readBoundedJson(c.req.raw,8192))))})
 router.delete('/sms/settings',async c=>{const ctx=await deps.authenticate(c.req.raw);return c.json(reply(ctx,await deps.sms.remove(ctx)))})
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
 router.post('/:id/test',async c=>{const ctx=await deps.authenticate(c.req.raw),input=z.object({commandId:idSchema,recordId:idSchema,event:z.enum(['created','updated']),live:z.object({previewId:idSchema,effects:z.array(z.object({position:z.number().int().nonnegative(),kind:z.string(),destination:z.string().max(2048)}).strict()).max(10)}).strict().optional()}).strict().parse(await readBoundedJson(c.req.raw,32768));return c.json(reply(ctx,await deps.tests.run(ctx,{...input,id:idSchema.parse(c.req.param('id'))})))})
 router.get('/:id/runs',async c=>{
  const ctx=await deps.authenticate(c.req.raw)
  return c.json(reply(ctx,{runs:await deps.history.runs(ctx,idSchema.parse(c.req.param('id')))}))
 })
 router.post('/:id/runs/:runId/retry',async c=>{const ctx=await deps.authenticate(c.req.raw),input=z.object({commandId:idSchema}).strict().parse(await readBoundedJson(c.req.raw,4096));return c.json(reply(ctx,await deps.retry(ctx,{...input,id:idSchema.parse(c.req.param('id')),runId:idSchema.parse(c.req.param('runId'))})))})
 router.post('/:id/disable',async c=>{
  const ctx=await deps.authenticate(c.req.raw),input=z.object({commandId:idSchema,version:z.number().int().positive()}).strict()
   .parse(await readBoundedJson(c.req.raw,4096))
  return c.json(reply(ctx,await deps.configuration.disable(ctx,{...input,id:idSchema.parse(c.req.param('id'))})))
 })
 router.post('/destinations/:id/rotate',async c=>{
  const ctx=await deps.authenticate(c.req.raw),input=z.object({commandId:idSchema,appId:idSchema,entityId:idSchema}).strict().parse(await readBoundedJson(c.req.raw,4096))
  return c.json(reply(ctx,await deps.destinations.rotate(ctx,{...input,id:idSchema.parse(c.req.param('id'))})))
 })
 router.post('/destinations/:id/revoke',async c=>{
  const ctx=await deps.authenticate(c.req.raw),input=z.object({commandId:idSchema,appId:idSchema,entityId:idSchema}).strict().parse(await readBoundedJson(c.req.raw,4096))
  return c.json(reply(ctx,await deps.destinations.revoke(ctx,{...input,id:idSchema.parse(c.req.param('id'))})))
 })
 router.post('/destinations',async c=>{
  const ctx=await deps.authenticate(c.req.raw),input=z.object({commandId:idSchema,appId:idSchema,
   entityId:idSchema,kind:z.enum(['webhook','slack']),url:z.string().max(2048)}).strict()
   .parse(await readBoundedJson(c.req.raw,8192))
  return c.json(reply(ctx,await deps.destinations.create(ctx,input)),201)
 })
 return router
}
