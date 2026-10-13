import { Hono } from 'hono';
import { z } from 'zod';
import type { RequestContext } from '../authority/ports';
import type { Page } from '../../contracts/primitives';
import { createCursorCodec } from '../records/cursor.server';
import { ApiError,errorResponse } from '../../core/registry/errors.server';
import { createUlid } from '../../core/shared/ids';
import type { createExecutionService } from './service.server';
import type { createConnectionService } from '../connections/service.server';
import type { createModelProfiles } from './profiles.server';
import { attemptDTO,type AttemptRow } from './repository.server';
type Dependencies={db:D1Database;execution:ReturnType<typeof createExecutionService>;connections:ReturnType<typeof createConnectionService>|((ctx:RequestContext)=>ReturnType<typeof createConnectionService>);profiles:Pick<ReturnType<typeof createModelProfiles>,'read'>;cursorSecret:string;authenticate(request:Request):Promise<RequestContext>};
const query=z.object({limit:z.coerce.number().int().min(1).max(100).default(50),cursor:z.string().max(4096).optional()});
export function createExecutionCollections(d:Dependencies){const connections=(ctx:RequestContext)=>typeof d.connections==='function'?d.connections(ctx):d.connections;const app=new Hono(),codec=createCursorCodec(d.cursorSecret);
 async function page<T>(ctx:RequestContext,name:string,raw:unknown,filter:unknown,sql:string,args:(string|number)[],read:(id:string)=>Promise<T>):Promise<Page<T>>{
  const q=query.parse(raw),revision=(await d.db.prepare('SELECT revision FROM execution_collection_revisions WHERE name=?').bind(name).first<{revision:number}>())?.revision;if(!revision)throw new ApiError('unconfigured','Collection revision tracking is unavailable.');const binding=await codec.binding({principalId:ctx.principal.id,authenticationEpoch:ctx.principal.authenticationEpoch,name,filter}),cursor=q.cursor?await codec.decode(q.cursor):null;if(cursor&&(cursor.binding!==binding||cursor.revision!==revision))throw new ApiError('stale_cursor','Collection or authority changed; restart this page.');
  const offset=cursor?.offset??0,rows=(await d.db.prepare(sql+' ORDER BY id LIMIT 101 OFFSET ?').bind(...args,offset).all<{id:string}>()).results,items:T[]=[];let consumed=0;
  for(const row of rows.slice(0,100)){if(items.length===q.limit)break;consumed++;try{items.push(await read(row.id));}catch(error){if(!error||typeof error!=='object'||!('code'in error)||!['forbidden','not_found'].includes(String(error.code)))throw error;}}
  const current=(await d.db.prepare('SELECT revision FROM execution_collection_revisions WHERE name=?').bind(name).first<{revision:number}>())?.revision;if(current!==revision)throw new ApiError('stale_cursor','Collection changed during this page.');const more=consumed<rows.length;
  return {items,nextCursor:more?await codec.encode({binding,revision,offset:offset+consumed}):null,total:{kind:'at_least',value:items.length},evaluatedAt:ctx.now};
 }
 for(const route of ['/api/v1/connections','/api/v1/connections/:id/unknowns','/api/v1/connections/:id/resolutions','/api/v1/model-profiles','/api/v1/model-calls'] as const)app.get(route,async c=>{const requestId=createUlid();try{const ctx=await d.authenticate(c.req.raw);let data:Page<unknown>;
  if(route==='/api/v1/connections')data=await page(ctx,'connections',c.req.query(),{},'SELECT id FROM provider_connections',[],id=>connections(ctx).read(ctx,id));
  else if(route==='/api/v1/connections/:id/unknowns'||route==='/api/v1/connections/:id/resolutions'){const connectionId=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).parse(c.req.param('id'));await connections(ctx).read(ctx,connectionId);data=await page(ctx,'attempts',c.req.query(),{connectionId,route},route.endsWith('/resolutions')?"SELECT id FROM execution_attempts WHERE connection_id=? AND EXISTS(SELECT 1 FROM execution_receipts r WHERE r.attempt_id=execution_attempts.id AND r.method='human_evidence')":"SELECT id FROM execution_attempts WHERE connection_id=? AND state IN ('unknown','dispatching')",[connectionId],async id=>{const a=await d.execution.repository.attempt(id);if(!a)throw new ApiError('not_found','Attempt not found.');await d.execution.read(ctx,a.run_id);return attemptDTO(a);});}
  else if(route==='/api/v1/model-profiles')data=await page(ctx,'profiles',c.req.query(),{},'SELECT id FROM execution_model_profiles',[],id=>d.profiles.read(ctx,id));
  else {const q=z.object({from:z.iso.datetime(),to:z.iso.datetime(),feature:z.string().max(128).optional()}).parse(c.req.query());if(Date.parse(q.to)<=Date.parse(q.from)||Date.parse(q.to)-Date.parse(q.from)>366*86400000)throw new ApiError('validation','Model call date window must be within one year.');data=await page(ctx,'calls',c.req.query(),q,"SELECT id FROM execution_model_calls WHERE created_at>=? AND created_at<?"+(q.feature?" AND json_extract(call_json,'$.feature')=?":''),[q.from,q.to,...(q.feature?[q.feature]:[])],async id=>{const row=await d.db.prepare('SELECT run_id,call_json FROM execution_model_calls WHERE id=?').bind(id).first<{run_id:string;call_json:string}>();if(!row)throw new ApiError('not_found','Model call not found.');await d.execution.read(ctx,row.run_id);return JSON.parse(row.call_json);});}
  return c.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}});
 }catch(error){return errorResponse(error,requestId,'execution.collection');}});
 return app;
}
