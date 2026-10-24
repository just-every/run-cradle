import {Hono} from 'hono'
import {z} from 'zod'
import type {RequestContext} from '../../authority/ports'
import {createUlid} from '../../../core/shared/ids'
import {readJsonBody} from '../../../core/registry/body'
import {errorResponse} from '../../../core/registry/errors.server'
import {AdmissionError} from '../../admission/errors'
import {idSchema} from '../validators'
import type {createBaseExport} from './export-json.server'
import {safeDownloadName} from './export-csv-set'
import {schemaOnlyBase} from './schema-only'
import {workbookMime} from '../workbooks/export'
import {byteStream} from '../workbooks/stream-zip'
import {streamBaseJson,streamBaseWorkbook,streamBaseCsvSet,streamDownloadEnvelope} from './stream-formats.server'

export function baseExportHttp(exportBase:ReturnType<typeof createBaseExport>,authenticate:(request:Request,ingress:RequestContext['ingress'],id:string)=>Promise<RequestContext>){
 const app=new Hono()
 app.all('*',async c=>{
  const request=c.req.raw,url=new URL(request.url),id=createUlid()
  try{
   const ctx=await authenticate(request,'http',id)
   if(request.method!=='POST'||request.headers.get('origin')!==url.origin)throw new AdmissionError('forbidden','A same-origin request is required.')
   const input=z.object({appId:idSchema,format:z.enum(['json','csv-set','xlsx']),includeRecords:z.boolean().optional()}).strict().parse(await readJsonBody(request,4096))
   if(input.format!=='json'&&input.includeRecords===false)throw new AdmissionError('validation','Schema-only copies use base JSON.')
   const source=await exportBase.prepare(ctx,input.appId),omissions:string[]=[]
   if(input.includeRecords===false){
    const projected=schemaOnlyBase(source.snapshot)
    for(const table of source.snapshot.base.tables){let count=0;for await(const row of source.rows(table)){void row;count++}if(count)omissions.push(`${table.label}: exclude ${count} records and their values and links.`)}
    omissions.push(...projected.omissions);source.snapshot=projected.snapshot
   }
   const format=input.format,contentType=format==='xlsx'?workbookMime:format==='csv-set'?'application/zip':'application/json',encoding=format==='json'?'utf8' as const:'base64' as const,filename=safeDownloadName(source.snapshot.base.name)+(format==='xlsx'?'.xlsx':format==='csv-set'?'-tables.zip':'.cradle.json'),bytes=format==='xlsx'?streamBaseWorkbook(source):format==='csv-set'?streamBaseCsvSet(source):streamBaseJson(source,input.includeRecords!==false)
   const headers={'cache-control':'no-store','x-content-type-options':'nosniff'}
   // Existing clients retain their JSON envelope; direct downloads opt in by MIME.
   if(request.headers.get('accept')?.split(',').some(value=>value.trim().split(';')[0]===(format==='json'?'application/vnd.cradle.base+json':contentType)))return new Response(byteStream(bytes),{headers:{...headers,'content-type':contentType,'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(filename)}})
   const meta={requestId:id,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}
   return new Response(byteStream(streamDownloadEnvelope(bytes,{filename,encoding,contentType,...(format==='json'?{omissions}:{})},meta)),{headers:{...headers,'content-type':'application/json'}})
  }catch(error){return errorResponse(error,id,request.method+' '+url.pathname)}
 })
 return app
}
