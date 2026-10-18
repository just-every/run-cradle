import { Hono } from 'hono'
import { z } from 'zod'
import { createUlid } from '../../../core/shared/ids'
import { readJsonBody } from '../../../core/registry/body'
import { errorResponse } from '../../../core/registry/errors.server'
import { AdmissionError } from '../../admission/errors'
import { idSchema } from '../validators'
import type { RequestContext } from '../../authority/ports'
import type { createManualSchemas } from './service.server'
import type { createProposalReview } from './proposal-review.server'
export function manualSchemaHttp(service:ReturnType<typeof createManualSchemas>,review:ReturnType<typeof createProposalReview>,authenticate:(request:Request,ingress:RequestContext['ingress'],id:string)=>Promise<RequestContext>){
 const app=new Hono()
 app.all('*',async c=>{const request=c.req.raw,url=new URL(request.url),id=createUlid();try{
  const ctx=await authenticate(request,'http',id)
  if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)throw new AdmissionError('forbidden','A same-origin owner request is required.')
  const csv=url.pathname.match(/^\/api\/v1\/records\/releases\/([^/]+)\/recovery\/([^/]+)\.csv$/)
  if(request.method==='GET'&&csv){const recovery=await service.recovery(ctx,idSchema.parse(csv[1])),table=recovery.tables.find(t=>t.entityId===idSchema.parse(csv[2]));if(!table)throw new AdmissionError('not_found','Recovery table not found.');return new Response(table.csv,{headers:{'content-type':'text/csv;charset=utf-8','content-disposition':`attachment; filename="schema-recovery.csv"; filename*=UTF-8''${encodeURIComponent(table.name+'-recovery.csv')}`,'cache-control':'no-store'}})}
  let data:unknown
  const baseRoute=url.pathname.match(/^\/api\/v1\/records\/bases\/([^/]+)\/(access|collaborators|reviews)$/)
  if(baseRoute){
   const appId=idSchema.parse(baseRoute[1]),surface=baseRoute[2]
   if(request.method==='GET')data=surface==='access'?await service.collaborators.access(ctx,appId):surface==='reviews'?await service.pending(ctx,appId):await service.collaborators.list(ctx,appId)
   else if(request.method==='POST'&&surface==='collaborators')data=await service.collaborators.save(ctx,appId,await readJsonBody(request))
   else throw new AdmissionError('not_found','Unknown base operation.')
  }else if(request.method==='POST'&&url.pathname==='/api/v1/records/schema-preview')data=await service.preview(ctx,await readJsonBody(request))
  else if(request.method==='POST'&&url.pathname==='/api/v1/commands/release.adopt'){
   const input=z.object({commandId:idSchema,expected:z.array(z.unknown()).max(0),input:z.discriminatedUnion('kind',[z.object({kind:z.literal('manual_schema'),previewId:idSchema}).strict(),z.object({kind:z.literal('agent_proposal'),proposalId:idSchema}).strict()])}).strict().parse(await readJsonBody(request))
   data=(input.input.kind==='manual_schema'?await service.adopt(ctx,input.commandId,input.input.previewId):await review.adopt(ctx,input.commandId,input.input.proposalId)).result
  }else if(request.method==='GET'&&url.pathname==='/api/v1/records/proposals')data=await review.list(ctx)
  else if(request.method==='GET'&&/^\/api\/v1\/records\/proposals\/[^/]+$/.test(url.pathname))data=await review.detail(ctx,idSchema.parse(url.pathname.split('/').at(-1)))
  else if(request.method==='POST'&&/^\/api\/v1\/records\/proposals\/[^/]+\/decline$/.test(url.pathname)){
   const input=z.object({commandId:idSchema,note:z.string().trim().max(2000).default('')}).strict().parse(await readJsonBody(request))
   data=await review.decline(ctx,input.commandId,idSchema.parse(url.pathname.split('/').at(-2)),input.note)
  }else if(request.method==='GET'&&/^\/api\/v1\/records\/bases\/[^/]+$/.test(url.pathname))data=await service.read(ctx,idSchema.parse(url.pathname.split('/').at(-1)))
  else if(request.method==='GET'&&/^\/api\/v1\/records\/releases\/[^/]+\/recovery$/.test(url.pathname))data=await service.recovery(ctx,idSchema.parse(url.pathname.split('/').at(-2)))
  else throw new AdmissionError('not_found','Unknown manual schema route.')
  return c.json({data,meta:{requestId:id,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},200,{'cache-control':'no-store'})
 }catch(error){return errorResponse(error,id,request.method+' '+url.pathname)}})
 return app
}
