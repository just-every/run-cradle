import type {PlatformBindings} from '../../core/platform/bindings'
import type {slackSettings} from './settings.server'
import {AuthorityError} from '../authority/errors'
import {chatJson} from './relay.server'
import {teamsTransport} from './teams-transport.server'
const bytes=(value:string)=>new TextEncoder().encode(value)
/** Slack has a fixed host; Nook has an explicitly configured public origin. */
export function slackTransport(env:PlatformBindings,settings:ReturnType<typeof slackSettings>){
 const teams=teamsTransport(env,settings)
 return async(method:string,token:string|null,body?:unknown,form=false,query=false):Promise<{status:number;value:Record<string,any>} >=>{
  const {installation}=await settings.resolve()
  if(!/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/.test(method))throw new Error('Unknown chat API method')
  if(installation.provider==='teams')return teams(method,token,body)
  const origin=installation.provider==='nook'?installation.api_origin:'https://slack.com'
  if(!origin)throw new AuthorityError('unconfigured','Configure the Nook installation origin.',503)
  return chatJson(env,origin+(installation.provider==='nook'?'/api/slack/':'/api/')+method+(query?'?'+(body as URLSearchParams).toString():''),body===undefined||query?'GET':'POST',token,query?undefined:body,form)
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
