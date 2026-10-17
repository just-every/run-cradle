import { Hono } from 'hono'
import { z } from 'zod'
import { createUlid } from '../../core/shared/ids'
import { readJsonBody } from '../../core/registry/body'
import { errorResponse } from '../../core/registry/errors.server'
import { AdmissionError } from '../admission/errors'
import type { RequestContext } from '../authority/ports'
import type { createRecordsCsv } from './csv.server'
import { idSchema } from './validators'
export function recordsCsvHttp(service:ReturnType<typeof createRecordsCsv>,authenticate:(request:Request,ingress:RequestContext['ingress'],id:string)=>Promise<RequestContext>){const app=new Hono();app.all('*',async c=>{const request=c.req.raw,url=new URL(request.url),id=createUlid();try{
 const ctx=await authenticate(request,'http',id)
 if(request.method!=='POST'||request.headers.get('origin')!==url.origin)throw new AdmissionError('forbidden','A same-origin request is required.')
 const input=await readJsonBody(request,url.pathname==='/api/v1/records/import-preview'?64*1024*1024:1048576);let data:unknown
 if(url.pathname==='/api/v1/records/export-csv')data=await service.exportCsv(ctx,input)
 else if(url.pathname==='/api/v1/records/import-mappings')data=await service.mappings(ctx,input)
 else if(url.pathname==='/api/v1/records/link-candidates')data=await service.linkCandidates(ctx,input)
 else if(url.pathname==='/api/v1/records/import-preview')data=await service.preview(ctx,input)
 else if(url.pathname==='/api/v1/commands/records.import-commit'){const command=z.object({commandId:idSchema,expected:z.array(z.unknown()).max(0),input:z.object({previewId:idSchema}).strict()}).strict().parse(input);data=(await service.commit(ctx,command.commandId,command.input.previewId)).result}
 else throw new AdmissionError('not_found','Unknown records CSV route.')
 return c.json({data,meta:{requestId:id,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},200,{'cache-control':'no-store'})
 }catch(error){return errorResponse(error,id,request.method+' '+url.pathname)}});return app}
