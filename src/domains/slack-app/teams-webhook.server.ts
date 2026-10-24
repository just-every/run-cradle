import type {PlatformBindings} from '../../core/platform/bindings'
import type {ChatCredentials,SlackInstall} from './settings.server'
import {externalTeam} from './settings.server'
import {chatJson} from './relay.server'
import {AuthorityError} from '../authority/errors'
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(value.length/4)*4,'=')),char=>char.charCodeAt(0))
/** Microsoft Bot Framework JWT verification: signed RS256, exact app audience,
 * bounded lifetime, fixed Microsoft discovery/JWKS origin and configured tenant. */
export async function teamsWebhook(env:PlatformBindings,request:Request,raw:Uint8Array<ArrayBuffer>,installation:SlackInstall,credentials:ChatCredentials){
 const authorization=request.headers.get('authorization'),parts=authorization?.match(/^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/)
 if(!parts)throw new AuthorityError('signed_out','A Bot Framework bearer token is required.',401)
 let header:any,claims:any
 try{header=JSON.parse(new TextDecoder().decode(decode(parts[1])));claims=JSON.parse(new TextDecoder().decode(decode(parts[2])))}catch{throw new AuthorityError('signed_out','The Bot Framework token is invalid.',401)}
 const now=Date.now()/1000
 if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.aud!==installation.client_id||claims.iss!=='https://api.botframework.com'||!Number.isFinite(claims.exp)||claims.exp<now||!Number.isFinite(claims.nbf)||claims.nbf>now+300)throw new AuthorityError('signed_out','The Bot Framework token audience, issuer or lifetime is invalid.',401)
 const metadata=await chatJson(env,'https://login.botframework.com/v1/.well-known/openidconfiguration','GET',null)
 if(metadata.status!==200||typeof metadata.value.jwks_uri!=='string')throw new AuthorityError('provider_unavailable','Bot Framework signing-key discovery failed.',503)
 const url=new URL(metadata.value.jwks_uri)
 if(url.origin!=='https://login.botframework.com'||url.pathname!=='/v1/.well-known/keys'||url.search||url.hash)throw new AuthorityError('provider_unavailable','Bot Framework returned an unexpected signing-key origin.',503)
 const keys=await chatJson(env,url.href,'GET',null),matches=Array.isArray(keys.value.keys)?keys.value.keys.filter((key:any)=>key.kid===header.kid&&key.kty==='RSA'&&(!key.use||key.use==='sig')&&(!key.alg||key.alg==='RS256')):[]
 if(keys.status!==200||matches.length!==1)throw new AuthorityError('signed_out','The Bot Framework signing key is unavailable.',401)
 let valid=false
 try{const key=await crypto.subtle.importKey('jwk',matches[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[3]),new TextEncoder().encode(parts[1]+'.'+parts[2]))}catch{}
 if(!valid)throw new AuthorityError('signed_out','The Bot Framework signature is invalid.',401)
 const activity=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))
 if(activity.channelId!=='msteams'||activity.channelData?.tenant?.id!==credentials.tenantId||typeof activity.from?.aadObjectId!=='string'||claims.serviceurl&&claims.serviceurl!==activity.serviceUrl)throw new AuthorityError('forbidden','The Teams activity does not belong to the configured tenant.')
 const team=externalTeam('teams',credentials.tenantId!),user=activity.from.aadObjectId,channel=activity.channelData?.team?.id+'/'+activity.channelData?.channel?.id
 const text=typeof activity.text==='string'?activity.text.replace(/^<at>[^<]*<\/at>\s*/,'').trim():''
 if(activity.type==='message'&&text.startsWith('/cradle-link '))return {kind:'link' as const,payload:{team_id:team,user_id:user,command:'/cradle-link',text:text.slice('/cradle-link '.length)}}
 if(activity.type==='invoke'&&activity.name==='composeExtension/queryLink'&&typeof activity.value?.url==='string')return {kind:'events' as const,payload:{type:'event_callback',team_id:team,event:{type:'link_shared',user,channel,message_ts:activity.replyToId??activity.id,links:[{url:activity.value.url}]}}}
 const data=activity.value?.action?.data??activity.value
 if((activity.type==='invoke'||activity.type==='message')&&typeof data?.action_id==='string'&&typeof data?.value==='string')return {kind:'actions' as const,payload:{type:'block_actions',team:{id:team},user:{id:user},channel:{id:channel},container:{message_ts:activity.replyToId},actions:[{action_id:data.action_id,value:data.value}]}}
 throw new AuthorityError('validation','This Teams activity is unsupported.',400)
}
