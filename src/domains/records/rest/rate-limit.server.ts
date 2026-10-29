import type {RequestContext} from '../../authority/ports'
import {AuthorityError} from '../../authority/errors'
import {digest} from '../../authority/crypto.server'

export const restCredentialRateLimit={requests:120,windowSeconds:60,scope:'authenticated credential'} as const
export class RestRateLimitError extends AuthorityError{
 constructor(readonly retryAfter:number){super('rate_limited','The REST credential request limit has been reached.',429)}
}
/** Each authenticated credential has one durable window across the REST namespace. */
export function createRestRateLimit(db:D1Database){
 return async(ctx:RequestContext)=>{
  if(!ctx.principal.credentialId)return
  const now=Date.parse(ctx.now),window=restCredentialRateLimit.windowSeconds*1000,key=await digest('cradle.rest.v1:'+ctx.principal.credentialId)
  const row=await db.prepare(`INSERT INTO authority_rate_limits(key_hash,window_start,count) VALUES(?,?,1)
   ON CONFLICT(key_hash) DO UPDATE SET
    window_start=CASE WHEN authority_rate_limits.window_start+?<=excluded.window_start THEN excluded.window_start ELSE authority_rate_limits.window_start END,
    count=CASE WHEN authority_rate_limits.window_start+?<=excluded.window_start THEN 1 ELSE authority_rate_limits.count+1 END
   WHERE authority_rate_limits.window_start+?<=excluded.window_start OR authority_rate_limits.count<?
   RETURNING window_start,count`).bind(key,now,window,window,window,restCredentialRateLimit.requests).first<{window_start:number;count:number}>()
  if(row)return
  const current=await db.prepare('SELECT window_start FROM authority_rate_limits WHERE key_hash=?').bind(key).first<{window_start:number}>()
  throw new RestRateLimitError(Math.max(1,Math.ceil(((current?.window_start??now)+window-now)/1000)))
 }
}
