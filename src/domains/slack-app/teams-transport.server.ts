import type {PlatformBindings} from '../../core/platform/bindings'
import type {slackSettings} from './settings.server'
import {AuthorityError} from '../authority/errors'
import {chatJson} from './relay.server'
export const teamsScopes=['Team.ReadBasic.All','Channel.ReadBasic.All','ChannelMessage.Send']
export const cardText=(text:string)=>text.replace(/[\\`*_{}\[\]()#+.!<>-]/g,'\\$&')
export function teamsCard(blocks:any[]){return {$schema:'http://adaptivecards.io/schemas/adaptive-card.json',type:'AdaptiveCard',version:'1.4',body:blocks.filter(block=>block.type==='section').map(block=>({type:'TextBlock',wrap:true,text:block.text.type==='mrkdwn'?String(block.text.text).replace(/^<([^|]+)\|([^>]+)>$/,'[$2]($1)'):cardText(String(block.text.text))})),actions:blocks.flatMap(block=>block.elements??[]).filter(element=>element.type==='button').map(button=>({type:'Action.Submit',title:button.text.text,data:{action_id:button.action_id,value:button.value}}))}}
/** Delegated Graph token: installation consent explicitly names these scopes.
 * Bot callbacks have a separate Bot Framework audience/JWKS check. */
export function teamsTransport(env:PlatformBindings,settings:ReturnType<typeof slackSettings>){return async(method:string,token:string|null,body?:unknown)=>{
 const {installation,credentials}=await settings.resolve(),tenant=credentials.tenantId
 if(!tenant)throw new AuthorityError('unconfigured','Configure the Microsoft tenant ID for Teams.',503)
 if(method==='oauth.v2.access'){
  const input=body as URLSearchParams,result=await chatJson(env,'https://login.microsoftonline.com/'+tenant+'/oauth2/v2.0/token','POST',null,new URLSearchParams({client_id:installation.client_id,client_secret:credentials.clientSecret,code:input.get('code')??'',redirect_uri:input.get('redirect_uri')??'',grant_type:'authorization_code',scope:teamsScopes.join(' ')}),true)
  const granted=typeof result.value.scope==='string'?result.value.scope.split(' '):[]
  if(result.status!==200||typeof result.value.access_token!=='string'||teamsScopes.some(scope=>!granted.includes(scope)))throw new AuthorityError('provider_unavailable','Microsoft did not grant the required Teams scopes. Install again.',503)
  return {status:200,value:{ok:true,access_token:result.value.access_token,team:{id:tenant,name:'Microsoft Teams'},scope:granted.join(',')}}
 }
 if(!token)throw new AuthorityError('unconfigured','Install Teams through Microsoft consent before using it.',503)
 if(method==='conversations.list'){
  const channels:{id:string;name:string;is_member:boolean}[]=[]
  async function pages(url:string){const result:any[]=[];const seen=new Set<string>();while(url){const parsed=new URL(url);if(parsed.origin!=='https://graph.microsoft.com'||!parsed.pathname.startsWith('/v1.0/')||seen.has(url))throw new AuthorityError('provider_unavailable','Microsoft channel pagination did not complete.',503);seen.add(url);const response=await chatJson(env,url,'GET',token);if(response.status!==200||!Array.isArray(response.value.value))throw new AuthorityError('provider_unavailable','Microsoft channels could not be read with the current consent.',503);result.push(...response.value.value);url=response.value['@odata.nextLink']??'';if(typeof url!=='string')throw new AuthorityError('provider_unavailable','Microsoft returned an invalid channel cursor.',503)}return result}
  for(const team of await pages('https://graph.microsoft.com/v1.0/me/joinedTeams')){if(typeof team.id!=='string'||typeof team.displayName!=='string')throw new AuthorityError('provider_unavailable','Microsoft returned an invalid team.',503);for(const channel of await pages('https://graph.microsoft.com/v1.0/teams/'+encodeURIComponent(team.id)+'/channels')){if(typeof channel.id!=='string'||typeof channel.displayName!=='string')throw new AuthorityError('provider_unavailable','Microsoft returned an invalid channel.',503);channels.push({id:team.id+'/'+channel.id,name:team.displayName+' · '+channel.displayName,is_member:true})}}
  return {status:200,value:{ok:true,channels,response_metadata:{next_cursor:''}}}
 }
 if(method==='chat.postMessage'){
  const input=body as {channel:string;blocks:any[]},parts=input.channel.split('/')
  if(parts.length!==2||!parts.every(Boolean))throw new AuthorityError('validation','Choose a Teams team and channel from the picker.',400)
  const card=teamsCard(input.blocks),result=await chatJson(env,'https://graph.microsoft.com/v1.0/teams/'+encodeURIComponent(parts[0])+'/channels/'+encodeURIComponent(parts[1])+'/messages','POST',token,{body:{contentType:'html',content:'<attachment id="cradle-card"></attachment>'},attachments:[{id:'cradle-card',contentType:'application/vnd.microsoft.card.adaptive',content:JSON.stringify(card)}]})
  return {status:result.status===201?200:result.status,value:result.status===201&&typeof result.value.id==='string'?{ok:true,ts:result.value.id}:{ok:false,error:result.value.error?.code??'teams_delivery_unconfirmed'}}
 }
 throw new AuthorityError('validation','This Teams API operation is unsupported.',400)
}}
