import {Hono} from 'hono';
import type {RequestContext} from '../authority/ports';
import type {EvidenceDependencies} from './ports';
import type {createAuditReader} from '../admission/audit.server';
import type {createCommentReader} from './comment-reader.server';
import type {MentionPort} from './comments.server';
import {createUlid} from './shared.server';
import {ref} from './validators';
import {ApiError,errorResponse} from '../../core/registry/errors.server';

export function createEvidenceHistoryHttp(deps:EvidenceDependencies & {authenticate(request:Request,requestId:string):Promise<RequestContext>;audit:ReturnType<typeof createAuditReader>;cursorSecret:string;comments:ReturnType<typeof createCommentReader>;mentions:MentionPort}){
 const app=new Hono();
 app.get('*',async c=>{
  const requestId=createUlid(),request=c.req.raw,url=new URL(request.url);
  try{
   const ctx=await deps.authenticate(request,requestId),subject=ref.parse(Object.fromEntries(['appId','entityId','recordId'].map(k=>[k,url.searchParams.get(k)]))),limit=Number(url.searchParams.get('limit')??200),q=(url.searchParams.get('q')??'').trim();
   if(!Number.isInteger(limit)||limit<1||limit>200||q.length>200)throw new ApiError('validation','Invalid page limit or search text.');
   await deps.access.checkReference(ctx,subject,[],'read');
   let data:unknown;
   if(url.pathname==='/api/v1/history')data=await deps.audit.subject(ctx,subject,limit,url.searchParams.get('cursor')??undefined);
   else if(url.pathname==='/api/v1/comments')data=await deps.comments(ctx,subject,{limit,q,cursor:url.searchParams.get('cursor')??undefined});
   else if(url.pathname==='/api/v1/comments/mentions')data=await deps.mentions.candidates(ctx,subject,q);
   else throw new ApiError('not_found','Unknown history route.');
   return Response.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error,requestId,`GET ${url.pathname}`);}
 });
 return app;
}
