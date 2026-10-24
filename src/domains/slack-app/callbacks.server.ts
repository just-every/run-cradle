import type {PlatformBindings} from '../../core/platform/bindings'
import type {ServerFoundation} from '../../core/app/foundation.server'
import type {createRecordServices} from '../records/service.server'
import type {slackSettings} from './settings.server'
import type {slackIdentity} from './identity.server'
import type {slackTransport} from './transport.server'
import {verifySlack} from './transport.server'
import {plainValue} from './effects.server'
import {slackTextBlocks,assertSlackBlockCount} from './blocks.server'
import {externalTeam} from './settings.server'
import {teamsWebhook} from './teams-webhook.server'
import {teamsCard} from './teams-transport.server'
import {AuthorityError} from '../authority/errors'
import {and,registerTable,trustedPredicate} from '../admission/sql.server'
import {canonicalHash} from '../admission/canonical'
import {delegationCommandId} from '../authority/user-delegation.server'
import {sha256} from '../../adapters/crypto.server'
const actions=registerTable('slack_app_actions',['id','choice_state','applied_at','applied_by'])
type Choice={id:string;app_id:string;entity_id:string;record_id:string;record_version:number;field_id:string;approve_json:string;reject_json:string;team_id:string;channel_id:string;config_version:number;delivery_state:string;choice_state:string;message_ts:string|null}
export function slackCallbacks(env:PlatformBindings,foundation:ServerFoundation,records:ReturnType<typeof createRecordServices>,settings:ReturnType<typeof slackSettings>,identity:ReturnType<typeof slackIdentity>,api:ReturnType<typeof slackTransport>,origin:string){
 const db=env.DB
 async function click(payload:any){
  const selected=payload.actions?.[0],choice=selected?.action_id==='cradle_approve'?'approve':selected?.action_id==='cradle_reject'?'reject':null
  if(payload.type!=='block_actions'||payload.actions?.length!==1||!choice||typeof selected.value!=='string')throw new AuthorityError('validation','Unsupported Slack action.',400)
  const row=await db.prepare('SELECT * FROM slack_app_actions WHERE id=?').bind(selected.value).first<Choice>(),{installation,guard}=await settings.resolve(true)
  if(!row||row.team_id!==payload.team?.id||row.team_id!==installation.team_id||row.channel_id!==payload.channel?.id||row.config_version!==installation.version||payload.container?.message_ts!==row.message_ts)throw new AuthorityError('forbidden','This Slack action does not belong to the installed message.')
  if(row.choice_state!=='pending'||row.delivery_state!=='sent')throw new AuthorityError('version_conflict','This Slack decision is already applied or unavailable.',409)
  return identity.withPerson(row.team_id,String(payload.user?.id??''),row.app_id,async(ctx,linked)=>{
   const ref={appId:row.app_id,entityId:row.entity_id,recordId:row.record_id},scope=await foundation.policy.scope(ctx,{...ref,purpose:'read'})
   const currentScope={...scope,currentAuthorityGuards:[...scope.currentAuthorityGuards,linked,guard]}
   const value=JSON.parse(choice==='approve'?row.approve_json:row.reject_json),changes={[row.field_id]:value},prepared=await records.writer.prepareChange(ctx,currentScope,{ref,expectedVersion:row.record_version,changes})
   const commandId=await delegationCommandId(row.id,'slack-decision'),hash=await canonicalHash({slackActionId:row.id,choice,person:ctx.principal.id,ref,version:row.record_version,changes})
   const permit=await foundation.policy.authorize(ctx,{appId:row.app_id,action:'record.patch',expected:[{ref,version:row.record_version}],fieldIds:[row.field_id],cost:[],inputHash:hash,commandId})
   const result=await foundation.admission.commit(ctx,{commandId,action:'record.patch',appId:row.app_id,canonicalInputHash:hash,permit,guards:[...prepared.guards,linked,guard,trustedPredicate("EXISTS(SELECT 1 FROM slack_app_actions WHERE id=? AND choice_state='pending' AND delivery_state='sent' AND config_version=?)",[row.id,installation.version])],mutations:[...prepared.mutations,{kind:'update',table:actions,set:{choice_state:choice,applied_at:Date.now(),applied_by:ctx.principal.id},where:trustedPredicate("id=? AND choice_state='pending'",[row.id]),expectedRows:1}],audit:[...prepared.audit,{action:'slack.record.'+choice,subject:ref,changes:[],sourceIds:[],personalContentRefs:[ctx.principal.id]}],events:[],outbox:[],committedResult:{recordId:ref.recordId,applied:true},changed:[{ref,version:prepared.next.version}]})
   if(result.result.state!=='committed')throw new AuthorityError('version_conflict','The Slack decision has not committed.',409)
   return {response_type:'ephemeral',text:'Record '+(choice==='approve'?'approved':'rejected')+'.'}
  })
 }
 async function unfurls(payload:any){
  const {installation,bot,guard}=await settings.resolve(true),event=payload.event
  if(payload.team_id!==installation.team_id||typeof event?.user!=='string'||typeof event.channel!=='string'||typeof event.message_ts!=='string'||!Array.isArray(event.links))throw new AuthorityError('forbidden','The Slack link event is not from the installed workspace.')
  const unfurls:Record<string,unknown>={}
  for(const item of event.links){
   if(typeof item.url!=='string')continue
   let url:URL;try{url=new URL(item.url)}catch{continue}
   const match=/^\/app\/records\/([0-9A-HJKMNP-TV-Z]{26})\/([0-9A-HJKMNP-TV-Z]{26})\/([0-9A-HJKMNP-TV-Z]{26})$/.exec(url.pathname)
   if(url.origin!==origin||!match||url.search||url.hash)continue
   const ref={appId:match[1],entityId:match[2],recordId:match[3]}
   let text='Record unavailable'
   try{text=await identity.withPerson(installation.team_id!,event.user,ref.appId,async(ctx,linked)=>{
    const scope=await foundation.policy.scope(ctx,{...ref,purpose:'read'}),descriptor=foundation.descriptors.get(ref.appId,ref.entityId)
    const safe=await settings.safeFields(ref.appId,ref.entityId)
    const current={...scope,currentAuthorityGuards:[...scope.currentAuthorityGuards,linked,guard,...(safe?[safe.guard]:[])]}
    const record=await records.reader.record(ctx,current,ref),primary=descriptor.schema.primaryFieldId??descriptor.schema.fields.find(field=>field.type==='text')?.id,ids=[...new Set([...(primary?[primary]:[]),...(safe?.fieldIds??[])])]
    const lines=ids.flatMap(id=>{const cell=record.fields[id],field=descriptor.fields.get(id)?.field;return field&&current.readableFieldIds.includes(id)&&cell?.state==='value'?[field.label+': '+plainValue(cell.value)]:[]})
    const result=lines.join('\n')
    if(!result)throw new AuthorityError('unconfigured','The allowed record fields have no visible values.',503)
    assertSlackBlockCount(slackTextBlocks(result))
    await records.reader.assertScope(ctx,current)
    return result
   })}catch(error){if(!(error instanceof AuthorityError)&&!(error instanceof Error&&'code'in error&&['forbidden','not_found','grant_revoked','validation','unconfigured'].includes(String(error.code))))throw error}
   unfurls[item.url]={blocks:slackTextBlocks(text)}
  }
  if(installation.provider==='teams')return {unfurls}
  if(Object.keys(unfurls).length){const response=await api('chat.unfurl',bot!.token,{channel:event.channel,ts:event.message_ts,unfurls});if(response.status!==200||response.value.ok!==true)throw new AuthorityError('provider_unavailable','Slack did not acknowledge the record unfurl.',503)}
  return {ok:true}
 }
 return async(request:Request,kind:'link'|'actions'|'events')=>{
  if(Number(request.headers.get('content-length')??'0')>65536)return new Response(null,{status:413})
  const reader=request.body?.getReader(),parts:Uint8Array[]=[];let size=0
  if(reader)for(;;){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>65536){await reader.cancel();return new Response(null,{status:413})}parts.push(result.value)}
  const raw=new Uint8Array(size);let offset=0;for(const part of parts){raw.set(part,offset);offset+=part.length}
  const {installation,credentials}=await settings.resolve()
  if(new URL(request.url).pathname.split('/')[2]!==installation.provider)throw new AuthorityError('forbidden','This callback is not for the configured chat provider.')
  let normalized:any
  if(installation.provider==='teams'){const activity=await teamsWebhook(env,request,raw,installation,credentials);kind=activity.kind;normalized=activity.payload}
  else if(!await verifySlack(request,raw,credentials.signingSecret))return new Response(null,{status:401})
  const receipt=await sha256(raw),claimed=await db.prepare('INSERT INTO slack_app_webhook_receipts(id,received_at) VALUES(?,?) ON CONFLICT(id) DO NOTHING').bind(receipt,Date.now()).run()
  if(!claimed.meta.changes)return new Response(null,{status:409})
  const text=new TextDecoder('utf-8',{fatal:true}).decode(raw)
  if(kind==='link'){
   const form=normalized??Object.fromEntries(new URLSearchParams(text)),team=installation.provider==='teams'?form.team_id:externalTeam(installation.provider,form.team_id??''),user=form.user_id,code=form.text?.trim()
   if(!team||!user||!code||form.command!=='/cradle-link')throw new AuthorityError('validation','Use /cradle-link with the one-time code from Cradle Settings.',400)
   await identity.consume(team,user,code)
   return Response.json({response_type:'ephemeral',text:'Cradle account linked.'})
  }
  if(kind==='actions'){const payload=normalized??JSON.parse(new URLSearchParams(text).get('payload')??'null');if(installation.provider==='nook'&&typeof payload?.team?.id==='string')payload.team.id=externalTeam('nook',payload.team.id);const result=await click(payload);return Response.json(installation.provider==='teams'?{statusCode:200,type:'application/vnd.microsoft.activity.message',value:{type:'message',text:result.text}}:result)}
  const payload=normalized??JSON.parse(text)
  if(installation.provider==='nook'&&typeof payload.team_id==='string')payload.team_id=externalTeam('nook',payload.team_id)
  if(payload.type==='url_verification'&&typeof payload.challenge==='string'&&payload.challenge.length<=512)return Response.json({challenge:payload.challenge})
  if(payload.type==='event_callback'&&payload.event?.type==='link_shared'){const result=await unfurls(payload);if(installation.provider==='teams'&&'unfurls'in result&&result.unfurls)return Response.json({composeExtension:{type:'result',attachmentLayout:'list',attachments:Object.values(result.unfurls).map((value:any)=>({contentType:'application/vnd.microsoft.card.adaptive',content:teamsCard(value.blocks)}))}});return Response.json(result)}
  return Response.json({ok:true})
 }
}
