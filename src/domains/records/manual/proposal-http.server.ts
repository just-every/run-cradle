import { Hono } from 'hono'
import { createUlid } from '../../../core/shared/ids'
import { errorResponse } from '../../../core/registry/errors.server'
import { ApiError } from '../../../core/registry/errors'
import type { CommandRegistry } from '../../../core/registry/commands'
import type { RequestContext } from '../../authority/ports'

/** REST face of the proposal door's reads; it runs the same registered tools as MCP. */
export function proposalHttp(registry:CommandRegistry,authenticate:(request:Request,ingress:RequestContext['ingress'],id:string)=>Promise<RequestContext>){
 const app=new Hono()
 app.all('*',async c=>{const request=c.req.raw,url=new URL(request.url),id=createUlid();try{
  const ctx=await authenticate(request,'http',id)
  if(request.method!=='GET')throw new ApiError('not_found','Unknown proposal route.')
  const one=url.pathname.match(/^\/api\/v1\/proposals\/([^/]+)$/)
  const [action,input]=url.pathname==='/api/v1/proposals/schema'?['schema.read',{}]:url.pathname==='/api/v1/proposals'?['schema.proposals',{}]:one?['schema.proposal',{proposalId:decodeURIComponent(one[1]!)}]:[null,null]
  const query=action?registry.query(action):undefined
  if(!query||!query.visible(ctx))throw new ApiError('not_found','Unknown proposal route.')
  return c.json({data:await query.run(ctx,input),meta:{requestId:id,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},200,{'cache-control':'no-store'})
 }catch(error){return errorResponse(error,id,request.method+' '+url.pathname)}})
 return app
}
