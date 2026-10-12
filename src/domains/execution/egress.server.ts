import type { RequestContext,PolicyPort } from '../authority/ports';
import type { ConfiguredModelProfile } from './model.server';
import { ApiError } from '../../core/registry/errors';
import { canonical,sha256 } from '../../adapters/crypto.server';
/** Context assembly grants no inference or business authority. All field reads remain E/A checked. */
export function createModelEgress(d:{db:D1Database;policy:PolicyPort;profile(ctx:RequestContext,id:string):Promise<ConfiguredModelProfile>}){return async(ctx:RequestContext,input:{appId:string;profileId:string;purpose:string;fieldIds:string[]})=>{
 const configured=await d.profile(ctx,input.profileId),p=configured.profile;
 if(configured.appId!==input.appId||p.state!=='ready'||!p.evaluationIds.length||!p.purposes.includes(input.purpose)||input.fieldIds.some(id=>!p.allowedFieldIds.includes(id)))throw new ApiError('forbidden','Model context is outside the evaluated profile consent.');
 const c=await d.db.prepare('SELECT adapter_id,state,version,revoked_at,scopes_json FROM provider_connections WHERE id=? AND app_id=?').bind(configured.connectionId,input.appId).first<{adapter_id:string;state:string;version:number;revoked_at:string|null;scopes_json:string}>();
 if(!c||c.adapter_id!=='openai'||c.state!=='connected'||c.revoked_at||c.version!==configured.connectionVersion)throw new ApiError('unconfigured','Model provider connection is not currently configured.');
 const scopes=JSON.parse(c.scopes_json) as {resource:string;readFields:string[];actions:string[]}[];
 if(!scopes.some(scope=>scope.resource===p.model&&scope.actions.includes('model.generate')&&input.fieldIds.every(id=>scope.readFields.includes(id))))throw new ApiError('forbidden','Provider egress consent does not cover these fields and model.');
 const permit=await d.policy.authorize(ctx,{appId:input.appId,action:'execution.read',expected:[],cost:[],purpose:input.purpose,fieldIds:input.fieldIds,inputHash:await sha256(canonical(input))});
 return {destination:'https://api.openai.com/v1/responses',expiresAt:new Date(Math.min(Date.now()+60_000,Date.parse(permit.validUntil),Date.parse(ctx.principal.expiresAt))).toISOString()};
};}
