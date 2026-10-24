import type {PlatformBindings} from '../../core/platform/bindings'
import {RelayTransport} from '../integrations/relay-transport.server'
import {AuthorityError} from '../authority/errors'
/** Provider JSON crosses the maintained HTTPS/DNS/size-bounded relay only. */
export async function chatJson(env:PlatformBindings,url:string,method:'GET'|'POST'|'PUT'|'DELETE'|'HEAD',token:string|null,body?:unknown,form=false){
 if(!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new AuthorityError('unconfigured','Configure the trusted HTTPS egress relay before using chat apps.',503)
 const payload=body===undefined?'':form?(body as URLSearchParams).toString():JSON.stringify(body),bytes=new TextEncoder().encode(payload)
 let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192))
 const response=await new RelayTransport(env.EGRESS_RELAY_URL,env.EGRESS_RELAY_SECRET).send({url,method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':form?'application/x-www-form-urlencoded':'application/json; charset=utf-8'})},body:btoa(raw),bodyEncoding:'base64'})
 let value:Record<string,any>
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(response.body),char=>char.charCodeAt(0))))}catch{throw new AuthorityError('provider_unavailable','The chat provider returned an unreadable acknowledgement.',503)}
 return {status:response.status,value}
}
