import {Hono} from 'hono';
import {createUlid} from '../../../core/shared/ids';
import {errorResponse} from '../../../core/registry/errors.server';
import {readJsonBody} from '../../../core/registry/body';
import {AdmissionError} from '../../admission/errors';
import {idSchema} from '../validators';
import type {RequestContext} from '../../authority/ports';
import type {createRecordWatches} from './service.server';
export function createRecordWatchHttp(watches:ReturnType<typeof createRecordWatches>,authenticate:(request:Request,ingress:RequestContext['ingress'],requestId:string)=>Promise<RequestContext>){const app=new Hono();app.all('/api/v1/watches',async c=>{const requestId=createUlid();try{const request=c.req.raw,url=new URL(request.url),ctx=await authenticate(request,'http',requestId);if(request.method==='PUT'&&request.headers.has('cookie')&&request.headers.get('origin')!==url.origin)throw new AdmissionError('forbidden','A same-origin request is required.');const data=request.method==='GET'?await watches.read(ctx,{appId:idSchema.parse(url.searchParams.get('appId')),entityId:idSchema.parse(url.searchParams.get('entityId')),...(url.searchParams.has('recordId')?{recordId:idSchema.parse(url.searchParams.get('recordId'))}:{}),...(url.searchParams.has('viewId')?{viewId:idSchema.parse(url.searchParams.get('viewId'))}:{})}):request.method==='PUT'?await watches.save(ctx,await readJsonBody(request) as Parameters<typeof watches.save>[1]):null;if(data===null)return c.body(null,405);return c.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now}},{headers:{'cache-control':'no-store'}});}catch(error){return errorResponse(error,requestId,'watches');}});return app;}
