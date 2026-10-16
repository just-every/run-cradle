import { Hono } from 'hono';
import { z } from 'zod';
import type { Ref } from '../../contracts/primitives';
import type { RequestContext } from '../authority/ports';
import type { EvidenceDependencies } from './ports';
import {createSourceStaging,STAGING_FILES,STAGING_TEXT,STAGING_ENTITY} from './staging.server';
import {createSourceList} from './source-list.server';
import { createSourceService } from './source.server';
import { createFileService } from './files.server';
import { createUlid,EvidenceError } from './shared.server';
import { id,ref,instant } from './validators';
import { ApiError,errorResponse } from '../../core/registry/errors.server';
import { readJsonBody } from '../../core/registry/body';
const envelope=<T extends z.ZodType>(input:T)=>z.object({commandId:id,expected:z.array(z.object({ref,version:z.number().int().positive()}).strict()),input}).strict();
const upload=envelope(z.object({appId:id,filename:z.string(),mediaType:z.string(),bytes:z.number().int(),sha256:z.string(),subject:ref.optional()}).strict());
const complete=envelope(z.object({fileId:id,sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict());
const capture=envelope(z.object({appId:id,kind:z.enum(['file','form','inspection']),fileIds:z.array(id),text:z.string().optional(),subject:ref.optional(),effectiveAt:instant.optional()}).strict());
export type EvidenceHttpDependencies=EvidenceDependencies & {cursorSecret:string;authenticate(request:Request,requestId:string):Promise<RequestContext>;resolveCapture(ctx:RequestContext,appId:string,subject:Ref|undefined,kind:'source'|'file'):Promise<{subject:Ref;fieldIds:string[]}>};
/** Private staging has the same owner/field guards in every HTTP composition; business capture resolves the app's registered form/attachment definition. */
export function createEvidenceHttp(deps:EvidenceHttpDependencies){
 const resolveCapture:EvidenceHttpDependencies['resolveCapture']=async(ctx,appId,subject,kind)=>{
  if(subject?.entityId!==STAGING_ENTITY)return deps.resolveCapture(ctx,appId,subject,kind);
  if(subject.appId!==appId)throw new ApiError('validation','Staging app differs');
  const fieldIds=kind==='file'?[STAGING_FILES]:[STAGING_FILES,STAGING_TEXT];
  await deps.access.prepareWrite(ctx,subject,fieldIds,kind==='file'?'upload':'capture');
  return{subject,fieldIds};
 };
 const app=new Hono(),sources=createSourceService(deps),files=createFileService(deps),listSources=createSourceList(deps,deps.cursorSecret);app.all('*',async c=>{const request=c.req.raw,url=new URL(request.url),requestId=createUlid(),operation=`${request.method} ${url.pathname}`;try{const ctx=await deps.authenticate(request,requestId);if(request.method!=='GET'&&request.headers.has('cookie')&&request.headers.get('Origin')!==url.origin)throw new ApiError('forbidden','A same-origin request is required.');const respond=(data:unknown)=>Response.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},{headers:{'Cache-Control':'no-store'}});
 if(request.method==='GET'&&url.pathname==='/api/v1/sources')return respond(await listSources(ctx,{appId:id.parse(url.searchParams.get('appId')),limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):undefined,cursor:url.searchParams.get('cursor')??undefined}));
 const sourceMatch=url.pathname.match(/^\/api\/v1\/sources\/([^/]+)(\/content)?$/);if(request.method==='GET'&&sourceMatch){const sourceId=id.parse(sourceMatch[1]),version=url.searchParams.has('version')?z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(url.searchParams.get('version')):undefined;return respond(sourceMatch[2]?{text:(await sources.read(ctx,sourceId,version)).content}:(await sources.source(ctx,sourceId,version)).source);}
 const fileMatch=url.pathname.match(/^\/api\/v1\/files\/([^/]+)(\/content)?$/);if(fileMatch){const fileId=id.parse(fileMatch[1]);if(request.method==='GET')return fileMatch[2]?await files.download(ctx,fileId):respond(await files.metadata(ctx,fileId));if(request.method==='PUT'&&fileMatch[2]){if(!request.body)throw new ApiError('validation','Upload body is required.');return respond(await files.upload(ctx,fileId,request.body,request.headers.get('Content-Type')??''));}}
 if(request.method==='POST'&&url.pathname==='/api/v1/commands/source.stage'){const command=envelope(z.object({appId:id,purpose:z.enum(['import','source'])}).strict()).parse(await readJsonBody(request));return respond((await createSourceStaging(deps).create(ctx,{commandId:command.commandId,...command.input})).result);}
 if(request.method==='POST'&&url.pathname==='/api/v1/commands/upload.begin'){const command=upload.parse(await readJsonBody(request)),ownership=await resolveCapture(ctx,command.input.appId,command.input.subject,'file'),receipt=await files.begin(ctx,{commandId:command.commandId,...ownership,filename:command.input.filename,mediaType:command.input.mediaType,bytes:command.input.bytes,sha256:command.input.sha256});return respond(receipt.result);}
 if(request.method==='POST'&&url.pathname==='/api/v1/commands/upload.complete'){const command=complete.parse(await readJsonBody(request));return respond((await files.complete(ctx,{commandId:command.commandId,...command.input})).result);}
 if(request.method==='POST'&&url.pathname==='/api/v1/commands/source.capture'){const command=capture.parse(await readJsonBody(request)),ownership=await resolveCapture(ctx,command.input.appId,command.input.subject,'source'),result=await sources.capture(ctx,{commandId:command.commandId,...ownership,kind:command.input.kind,content:command.input.text??'',fileIds:command.input.fileIds,effectiveAt:command.input.effectiveAt??null});return respond({commandId:command.commandId,state:'committed',value:result.source,changed:[],eventIds:[]});}
 throw new ApiError('not_found','Unknown evidence route.');}catch(error){return errorResponse(error instanceof EvidenceError?new ApiError(error.code as never,error.message):error,requestId,operation);}});return app;}
