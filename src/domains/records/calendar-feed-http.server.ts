import { Hono } from 'hono'
import { createUlid } from '../../core/shared/ids'
import { errorResponse } from '../../core/registry/errors.server'
import { AdmissionError } from '../admission/errors'
import type { RequestContext } from '../authority/ports'
import { idSchema } from './validators'
import type { createCalendarFeeds } from './calendar-feed.server'
export function calendarFeedHttp(service: ReturnType<typeof createCalendarFeeds>, authenticate:(request:Request,ingress:RequestContext['ingress'],id:string)=>Promise<RequestContext>) {
  const app=new Hono()
  app.all('*',async c=>{
    const request=c.req.raw,url=new URL(request.url),id=createUlid()
    try {
      const feed=url.pathname.match(/^\/api\/v1\/calendar-feeds\/([a-f0-9]{64})\.ics$/)
      if(feed && request.method==='GET') return new Response(await service.read(feed[1]!),{headers:{'content-type':'text/calendar; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}})
      const match=url.pathname.match(/^\/api\/v1\/views\/([^/]+)\/calendar-feed(?:\/([^/]+))?$/)
      if(!match)throw new AdmissionError('not_found','Calendar subscription is unavailable.')
      const ctx=await authenticate(request,'http',id),viewId=idSchema.parse(match[1])
      if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==url.origin)throw new AdmissionError('forbidden','A same-origin request is required.')
      let data:unknown
      if(request.method==='GET'&&!match[2])data=await service.list(ctx,viewId)
      else if(request.method==='POST'&&!match[2])data=await service.create(ctx,viewId)
      else if(request.method==='DELETE'&&match[2])data=await service.revoke(ctx,viewId,idSchema.parse(match[2]))
      else throw new AdmissionError('not_found','Calendar subscription is unavailable.')
      return c.json({data,meta:{requestId:id,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},200,{'cache-control':'no-store'})
    }catch(error){return errorResponse(error,id,'Calendar subscription')}
  })
  return app
}
