import {Hono} from 'hono'
import {z} from 'zod'
import type {RequestContext} from '../../authority/ports'
import type {createRecordInterfaces} from './service.server'
import {idSchema} from '../validators'
import {createUlid} from '../../../core/shared/ids'
import {readJsonBody} from '../../../core/registry/body'
import {errorResponse} from '../../../core/registry/errors.server'
import {AdmissionError} from '../../admission/errors'
import {publishInterfaceInput} from './contracts'

const revision=z.number().int().positive(),identity=z.object({commandId:idSchema,version:revision}).strict()
export function recordInterfacesHttp(service:ReturnType<typeof createRecordInterfaces>,authenticate:(request:Request,ingress:RequestContext['ingress'],id:string)=>Promise<RequestContext>){
 const app=new Hono()
 app.all('*',async c=>{const request=c.req.raw,url=new URL(request.url),requestId=createUlid(),path=url.pathname;try{
  const ctx=await authenticate(request,'http',requestId)
  if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)throw new AdmissionError('forbidden','A same-origin operator request is required.')
  const collection=path.match(/^\/api\/v1\/apps\/([^/]+)\/interfaces(?:\/(publish))?$/),item=path.match(/^\/api\/v1\/interfaces\/([^/]+)(?:\/(versions)(?:\/(\d+))?|\/(restore|delete|trash-restore))?$/)
  let data:unknown
  if(collection&&request.method==='GET'&&!collection[2]){const state=url.searchParams.get('state')??'active';if(!['active','deleted'].includes(state))throw new AdmissionError('validation','Invalid interface state.');data=await service.list(ctx,idSchema.parse(collection[1]),state==='deleted')}
  else if(collection&&request.method==='POST'&&collection[2]){const input=publishInterfaceInput.parse(await readJsonBody(request));if(input.definition.appId!==idSchema.parse(collection[1]))throw new AdmissionError('validation','Interface belongs to another base.');data=await service.publish(ctx,input)}
  else if(item){const id=idSchema.parse(item[1]);if(request.method==='GET'&&item[2]==='versions')data=item[3]?await service.readVersion(ctx,id,revision.parse(Number(item[3]))):await service.versions(ctx,id)
   else if(request.method==='GET'&&!item[4])data=await service.read(ctx,id)
   else if(request.method==='POST'&&item[4]==='restore')data=await service.restore(ctx,id,identity.extend({restoreVersion:revision}).parse(await readJsonBody(request)))
   else if(request.method==='POST'&&['delete','trash-restore'].includes(item[4]??''))data=await service.trash(ctx,id,identity.parse(await readJsonBody(request)),item[4]==='trash-restore')
   else throw new AdmissionError('not_found','Unknown interface operation.')
  }else throw new AdmissionError('not_found','Unknown interface route.')
  return c.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},200,{'cache-control':'no-store'})
 }catch(error){return errorResponse(error,requestId,request.method+' '+path)}})
 return app
}
