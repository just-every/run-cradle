import { z } from 'zod'
import type { PolicyPort, RequestContext } from './ports'
import { and } from '../admission/sql.server'
import { digest, signToken, verifyToken } from './crypto.server'
import { AuthorityError } from './errors'
import { createAuthorityReads } from './reads.server'
const cursorSchema=z.object({actor:z.string(),epoch:z.number(),app:z.string(),policy:z.number(),snapshot:z.string(),after:z.string(),expires:z.number()}).strict()
export const listGrants=async(db:D1Database,policy:PolicyPort,secret:string,ctx:RequestContext,query:{appId:string;limit:number;cursor?:string})=>{
 const permit=await policy.authorize(ctx,{appId:query.appId,action:'grant.read',expected:[],cost:[],inputHash:''}),guard=and(...permit.guards)
 const revision=await db.prepare(`SELECT count(*) AS n,COALESCE(sum(version),0) AS revisions,COALESCE(max(updated_at),0) AS latest FROM authority_grants WHERE app_id=? AND (${guard.sql})`).bind(query.appId,...guard.values).first<{n:number;revisions:number;latest:number}>()
 const snapshot=await digest(JSON.stringify(revision)),now=Date.now();let after=''
 if(query.cursor){let c:z.infer<typeof cursorSchema>;try{c=cursorSchema.parse(await verifyToken(query.cursor,secret))}catch{throw new AuthorityError('validation','Invalid grant cursor.',400)}if(c.actor!==ctx.principal.id||c.epoch!==ctx.principal.authenticationEpoch||c.app!==query.appId||c.policy!==permit.policyVersion||c.snapshot!==snapshot||c.expires<=now)throw new AuthorityError('stale_cursor','Grant list changed; refresh the list.',409);after=c.after}
 const rows=await db.prepare(`SELECT id FROM authority_grants WHERE app_id=? AND id>? AND (${guard.sql}) ORDER BY id LIMIT ?`).bind(query.appId,after,...guard.values,query.limit+1).all<{id:string}>()
 const visible=rows.results.slice(0,query.limit),reads=createAuthorityReads(db,policy),items=await Promise.all(visible.map(row=>reads.grant(ctx,row.id)))
 return {items,nextCursor:rows.results.length>query.limit?await signToken({actor:ctx.principal.id,epoch:ctx.principal.authenticationEpoch,app:query.appId,policy:permit.policyVersion,snapshot,after:visible.at(-1)!.id,expires:now+900000},secret):null,total:{kind:(revision?.n??0)>10000?'at_least' as const:'exact' as const,value:Math.min(revision?.n??0,10000)},evaluatedAt:ctx.now}
}
