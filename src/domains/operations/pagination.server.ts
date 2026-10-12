import {base64url,unbase64,bytes,sha256,canonical} from '../../adapters/crypto.server';
import {ApiError} from '../../core/registry/errors';
import type {Page,PageQuery} from '../../contracts/primitives';
import type {RequestContext} from '../authority/ports';
export async function page<T extends {id:string}>(ctx:RequestContext,items:T[],query:PageQuery,scope:string,secret:string):Promise<Page<T>>{
 const limit=query.limit??50;if(!Number.isInteger(limit)||limit<1||limit>200)throw new ApiError('validation','Page size must be 1–200.');
 const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const revision=await sha256(canonical(items)),binding=await sha256(canonical({principal:ctx.principal,scope,revision}));let offset=0;
 if(query.cursor){try{const [payload,signature]=query.cursor.split('.');if(!payload||!signature||!await crypto.subtle.verify('HMAC',key,unbase64(signature) as Uint8Array<ArrayBuffer>,bytes(payload)))throw Error();const value=JSON.parse(new TextDecoder().decode(unbase64(payload)));if(value.binding!==binding||!Number.isInteger(value.offset)||value.offset<0)throw Error();offset=value.offset;}catch{throw new ApiError('stale_cursor','The authorized collection changed; reload this bucket.');}}
 const selected=items.slice(offset,offset+limit);let nextCursor:string|null=null;if(offset+limit<items.length){const payload=base64url(bytes(canonical({binding,offset:offset+limit})));nextCursor=payload+'.'+base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(payload))));}
 return{items:selected,nextCursor,total:items.length>10000?{kind:'at_least',value:10000}:{kind:'exact',value:items.length},evaluatedAt:ctx.now};
}
