import {errorResponse} from '../../../core/registry/errors.server'
import {createUlid} from '../../../core/shared/ids'
import {Hono} from 'hono'
import {z} from 'zod'
import {idSchema} from '../validators'
import {readBoundedJson} from '../../authority/http.server'
import {AdmissionError} from '../../admission/errors'
import type {RequestContext} from '../../authority/ports'
import type {createRecordCalendarSync} from './service.server'
export function recordCalendarSyncHttp(service:ReturnType<typeof createRecordCalendarSync>,authenticate:(request:Request)=>Promise<RequestContext>){const app=new Hono()
 app.onError(error=>errorResponse(error,createUlid(),'Record calendar sync'))
 app.all('*',async c=>{const ctx=await authenticate(c.req.raw),url=new URL(c.req.url),reply=(data:unknown)=>c.json({data,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now}},200,{'cache-control':'no-store'})
  if(c.req.method!=='GET'&&c.req.header('origin')!==url.origin)throw new AdmissionError('forbidden','A same-origin request is required.')
  const path=url.pathname.replace('/api/v1/record-calendar-sync',''),id=(s:string)=>idSchema.parse(s)
  if(c.req.method==='GET'&&path==='')return reply(await service.list(ctx,id(url.searchParams.get('appId')??''),id(url.searchParams.get('entityId')??'')))
  if(c.req.method==='POST'&&path==='')return reply(await service.save(ctx,await readBoundedJson(c.req.raw,32768)))
  const refresh=path.match(/^\/connections\/([^/]+)\/refresh$/)
  const input=()=>readBoundedJson(c.req.raw,4096)
  if(c.req.method==='POST'&&refresh){const v=z.object({commandId:idSchema}).strict().parse(await input());return reply(await service.refresh(ctx,id(refresh[1]!),v.commandId))}
  const reconcile=path.match(/^\/([^/]+)\/records\/([^/]+)\/reconcile$/)
  if(c.req.method==='POST'&&reconcile)return reply(await service.reconcile(ctx,id(reconcile[1]!),id(reconcile[2]!)))
  const sync=path.match(/^\/([^/]+)\/records\/([^/]+)\/sync$/)
  if(c.req.method==='POST'&&sync){const v=z.object({commandId:idSchema}).strict().parse(await input());return reply(await service.sync(ctx,id(sync[1]!),id(sync[2]!),v.commandId))}
  const resolve=path.match(/^\/([^/]+)\/records\/([^/]+)\/resolve$/)
  if(c.req.method==='POST'&&resolve){const v=z.object({commandId:idSchema,action:z.enum(['apply','restore'])}).strict().parse(await input());return reply(await service.resolve(ctx,id(resolve[1]!),id(resolve[2]!),v.commandId,v.action))}
  throw new AdmissionError('not_found','Calendar sync operation is unavailable.')
 });return app}
