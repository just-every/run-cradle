import {Hono} from 'hono'
import {z} from 'zod'
import type {RequestContext} from '../../authority/ports'
import {idSchema} from '../../authority/validators'
import {readBoundedJson} from '../../authority/http.server'
import type {recordTrashService} from './service.server'
export function recordTrashHttp(service:ReturnType<typeof recordTrashService>,authenticate:(request:Request)=>Promise<RequestContext>){const router=new Hono();const reply=(ctx:RequestContext,data:unknown)=>({data,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}})
 router.get('/',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await service.list(ctx,idSchema.parse(c.req.query('appId')))),200,{'cache-control':'no-store'})})
 router.post('/restore',async c=>{const ctx=await authenticate(c.req.raw),input=z.object({commandId:idSchema,appId:idSchema,entityId:idSchema,recordId:idSchema,version:z.number().int().positive()}).strict().parse(await readBoundedJson(c.req.raw,4096));return c.json(reply(ctx,await service.restore(ctx,input)),200,{'cache-control':'no-store'})})
 return router
}
