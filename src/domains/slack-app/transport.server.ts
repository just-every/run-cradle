import type {PlatformBindings} from '../../core/platform/bindings'
import {RelayTransport} from '../integrations/relay-transport.server'
import {AuthorityError} from '../authority/errors'
const bytes=(value:string)=>new TextEncoder().encode(value)
function base64(value:Uint8Array){let raw='';for(let i=0;i<value.length;i+=8192)raw+=String.fromCharCode(...value.subarray(i,i+8192));return btoa(raw)}
/** Fixed Slack API hosts cross the installation's pinned HTTPS relay. */
export function slackTransport(env:PlatformBindings){
 return async(method:string,token:string|null,body?:unknown,form=false,query=false)=>{
  if(!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new AuthorityError('unconfigured','Configure the trusted HTTPS egress relay before using the Slack app.',503)
  const relay=new RelayTransport(env.EGRESS_RELAY_URL,env.EGRESS_RELAY_SECRET)
  if(!/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/.test(method))throw new Error('Unknown Slack API method')
  const payload=body===undefined||query?'':form?(body as URLSearchParams).toString():JSON.stringify(body)
  const response=await relay.send({url:'https://slack.com/api/'+method+(query?'?'+(body as URLSearchParams).toString():''),method:body===undefined||query?'GET':'POST',headers:{...(token?{authorization:'Bearer '+token}:{}),...(body===undefined||query?{}:{'content-type':form?'application/x-www-form-urlencoded':'application/json; charset=utf-8'})},body:base64(bytes(payload)),bodyEncoding:'base64'})
  let value:Record<string,any>
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(response.body),char=>char.charCodeAt(0))))}catch{throw new AuthorityError('provider_unavailable','Slack returned an unreadable acknowledgement.',503)}
  return {status:response.status,value}
 }
}
export async function verifySlack(request:Request,raw:Uint8Array<ArrayBuffer>,secret:string){
 const stamp=request.headers.get('x-slack-request-timestamp'),signature=request.headers.get('x-slack-signature')
 if(!stamp||!/^\d+$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>300||!signature||!/^v0=[a-f0-9]{64}$/.test(signature))return false
 const prefix=bytes('v0:'+stamp+':'),data=new Uint8Array(prefix.length+raw.length);data.set(prefix);data.set(raw,prefix.length)
 const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])
 const proof=Uint8Array.from(signature.slice(3).match(/../g)!,pair=>parseInt(pair,16))
 return crypto.subtle.verify('HMAC',key,proof,data)
}
