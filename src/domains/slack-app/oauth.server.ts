import type {RequestContext} from '../authority/ports'
import {ownerDelegationSnapshot} from '../authority/delegation.server'
import {LAUNCH_APP_ID} from '../../apps/launch/contracts'
import {randomSecret} from '../authority/crypto.server'
import {sha256} from '../../adapters/crypto.server'
import {AuthorityError} from '../authority/errors'
import type {slackSettings} from './settings.server'
import type {slackTransport} from './transport.server'
const scopes=['chat:write','channels:read','groups:read','links:read','links:write','commands']
export function slackOAuth(db:D1Database,settings:ReturnType<typeof slackSettings>,api:ReturnType<typeof slackTransport>,origin:string){return {
 async start(ctx:RequestContext){
  await ownerDelegationSnapshot(db,ctx,LAUNCH_APP_ID)
  const {installation}=await settings.resolve(),state=randomSecret()
  await db.prepare('INSERT INTO slack_app_oauth_states(state_hash,actor_id,session_id,config_version,expires_at) VALUES(?,?,?,?,?)').bind(await sha256(state),ctx.principal.id,ctx.principal.baseSessionId!,installation.version,Date.now()+600000).run()
  const url=new URL('https://slack.com/oauth/v2/authorize');url.searchParams.set('client_id',installation.client_id);url.searchParams.set('scope',scopes.join(','));url.searchParams.set('redirect_uri',origin+'/oauth/slack/callback');url.searchParams.set('state',state)
  return {authorizeUrl:url.href}
 },async callback(ctx:RequestContext,state:string,code:string){
  const own=await ownerDelegationSnapshot(db,ctx,LAUNCH_APP_ID),{installation,credentials,guard}=await settings.resolve(),hash=await sha256(state)
  const claimed=await db.prepare(`UPDATE slack_app_oauth_states SET consumed_at=? WHERE state_hash=? AND actor_id=? AND session_id=? AND config_version=? AND expires_at>? AND consumed_at IS NULL AND (${own.guard.sql}) AND (${guard.sql}) RETURNING state_hash`).bind(Date.now(),hash,ctx.principal.id,ctx.principal.baseSessionId!,installation.version,Date.now(),...own.guard.values,...guard.values).first()
  if(!claimed)throw new AuthorityError('version_conflict','Slack OAuth state is expired, already consumed or belongs to another session.',409)
  const result=await api('oauth.v2.access',null,new URLSearchParams({client_id:installation.client_id,client_secret:credentials.clientSecret,code,redirect_uri:origin+'/oauth/slack/callback'}),true),body=result.value
  if(result.status!==200||body.ok!==true||typeof body.access_token!=='string'||!body.access_token||typeof body.team?.id!=='string'||typeof body.team?.name!=='string'||typeof body.scope!=='string'||scopes.some(scope=>!body.scope.split(',').includes(scope)))throw new AuthorityError('provider_unavailable','Slack OAuth did not grant the required bot scopes. Start installation again.',503)
  const sealed=await settings.sealBot({token:body.access_token,scopes:body.scope.split(',')})
  const saved=await db.prepare(`UPDATE slack_app_installation SET bot_sealed_json=?,team_id=?,team_name=?,version=version+1,updated_at=? WHERE id='installation' AND version=? AND (${own.guard.sql}) AND (${guard.sql})`).bind(sealed,body.team.id,body.team.name,ctx.now,installation.version,...own.guard.values,...guard.values).run()
  if(!saved.meta.changes)throw new AuthorityError('version_conflict','Slack configuration changed during OAuth; install again.',409)
  return {returnTo:origin+'/app/settings/connections'}
 },async channels(){
  const {bot}=await settings.resolve(true),channels:{id:string;name:string}[]=[],seen=new Set<string>();let cursor=''
  do{
   const result=await api('conversations.list',bot!.token,new URLSearchParams({types:'public_channel,private_channel',exclude_archived:'true',limit:'200',...(cursor?{cursor}:{})}),false,true)
   if(result.status!==200||result.value.ok!==true||!Array.isArray(result.value.channels))throw new AuthorityError('provider_unavailable','Slack channels could not be read. Check the bot scopes and channel membership.',503)
   for(const channel of result.value.channels)if(channel.is_member===true&&typeof channel.id==='string'&&typeof channel.name==='string')channels.push({id:channel.id,name:channel.name})
   const next=result.value.response_metadata?.next_cursor??''
   if(typeof next!=='string'||next&&seen.has(next))throw new AuthorityError('provider_unavailable','Slack channel pagination did not complete.',503)
   cursor=next;if(cursor)seen.add(cursor)
  }while(cursor)
  return {channels}
 },
}}
