import type {RequestContext} from '../authority/ports';
import type {EvidenceDependencies} from './ports';
import {createSourceService} from './source.server';
import {createCursorCodec} from '../records/cursor.server';
import {EvidenceError} from './shared.server';
/** Stable, permission-filtered pagination. Hidden source IDs never enter counts or cursors. */
export function createSourceList(deps:EvidenceDependencies,secret:string){
 const sources=createSourceService(deps),cursor=createCursorCodec(secret);
 return async(ctx:RequestContext,query:{appId:string;limit?:number;cursor?:string})=>{
  const limit=query.limit??50;if(!Number.isInteger(limit)||limit<1||limit>200)throw new EvidenceError('validation','Page limit must be 1–200');
  const revision=(await deps.db.prepare("SELECT COALESCE(MAX(rowid),0) n FROM command_admissions WHERE state='committed'").first<{n:number}>())!.n;
  const binding=await cursor.binding({principal:ctx.principal.id,epoch:ctx.principal.authenticationEpoch,appId:query.appId,limit,kind:'sources'});
  let offset=0;if(query.cursor){const p=await cursor.decode(query.cursor);if(p.binding!==binding||p.revision!==revision)throw new EvidenceError('stale_cursor','Sources changed; reload first page',409);offset=p.offset;}
  const candidates=(await deps.db.prepare('SELECT id FROM evidence_sources WHERE app_id=? AND erased_at IS NULL ORDER BY created_at,id').bind(query.appId).all<{id:string}>()).results;
  const items=[];let total=0;
  for(const candidate of candidates){try{const result=await sources.source(ctx,candidate.id);if(total>=offset&&items.length<limit)items.push(result.source);total++;}catch(error){if(error instanceof Error&&'code'in error&&['forbidden','not_found'].includes(String(error.code)))continue;throw error;}}
  return{items,total:total>10000?{kind:'at_least' as const,value:10000}:{kind:'exact' as const,value:total},nextCursor:offset+items.length<total?await cursor.encode({binding,revision,offset:offset+items.length}):null,evaluatedAt:ctx.now};
 };
}
