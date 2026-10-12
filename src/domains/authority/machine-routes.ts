import { Hono } from 'hono'
import { z } from 'zod'
import type { RequestContext, PolicyPort } from './ports'
import type { AdmissionPort } from '../admission/ports'
import { createMachineService } from './machine.server'
import { readBoundedJson } from './http.server'
import { idSchema, instantSchema } from './validators'
export const createMachineCredentialRouter=(db:D1Database,policy:PolicyPort,admission:AdmissionPort,authenticate:(request:Request,ingress:'http')=>Promise<RequestContext>)=>{
 const router=new Hono(),service=createMachineService(db,policy,admission)
 router.post('/credentials',async c=>{const ctx=await authenticate(c.req.raw,'http'),input=z.object({commandId:idSchema,principalId:idSchema,audience:z.string().url().max(2048),expiresAt:instantSchema,scopes:z.array(z.object({appId:idSchema,actions:z.array(z.string().min(1).max(128)).min(1).max(100),purposes:z.array(z.string().max(128)).max(100)}).strict()).min(1).max(100)}).strict().parse(await readBoundedJson(c.req.raw,65536));const result=await service.issue(ctx,input.commandId,input);c.header('Cache-Control','no-store');return c.json({data:result,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:input.commandId}},201)})
 router.post('/credentials/:id/revoke',async c=>{const ctx=await authenticate(c.req.raw,'http'),input=z.object({commandId:idSchema,appId:idSchema}).strict().parse(await readBoundedJson(c.req.raw));const result=await service.revoke(ctx,input.commandId,input.appId,idSchema.parse(c.req.param('id')));c.header('Cache-Control','no-store');return c.json({data:result.result,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:result.consistencyToken}})})
 return router
}
