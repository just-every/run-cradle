import type {PlatformBindings} from '../../core/platform/bindings'
import type {ServerFoundation} from '../../core/app/foundation.server'
import type {RequestContext} from '../authority/ports'
import type {createRecordServices} from '../records/service.server'
import type {RecordAutomationAction} from '../automations/contracts'
import type {AutomationRun,AutomationActionRun} from '../automations/run-store.server'
import {runSnapshot} from '../automations/run-store.server'
import {AuthorityError} from '../authority/errors'
import {validateCell} from '../records/validators'
import {identifier,and,trustedPredicate} from '../admission/sql.server'
import {sha256} from '../../adapters/crypto.server'
import {slackTextBlocks,assertSlackBlockCount} from './blocks.server'
import type {slackSettings} from './settings.server'
import type {slackOAuth} from './oauth.server'
import type {slackTransport} from './transport.server'
export type SlackAppAction=Extract<RecordAutomationAction,{kind:'slack-app'}>
export function plainValue(value:unknown){return value===null?'':typeof value==='object'?JSON.stringify(value):String(value)}
export function slackAppEffects(env:PlatformBindings,foundation:ServerFoundation,records:ReturnType<typeof createRecordServices>,settings:ReturnType<typeof slackSettings>,oauth:ReturnType<typeof slackOAuth>,api:ReturnType<typeof slackTransport>,origin:string){
 const db=env.DB
 return {
  async validate(ctx:RequestContext,appId:string,entityId:string,action:SlackAppAction){
   const {installation}=await settings.resolve(true)
   if((action.provider??'slack')!==installation.provider)throw new AuthorityError('unconfigured','Install the provider named by this approval action in Settings.',503)
   const scope=await foundation.policy.scope(ctx,{appId,entityId,purpose:'read'}),descriptor=foundation.descriptors.get(appId,entityId),field=descriptor.fields.get(action.fieldId)?.field
   if(!field||field.readOnly||field.type==='computed'||!scope.writableFieldIds.includes(action.fieldId))throw new AuthorityError('forbidden','Slack approvals require a field you can currently write.')
   validateCell(field,action.approveValue);validateCell(field,action.rejectValue)
   for(const token of action.text.matchAll(/\{\{([^{}]+)\}\}/g))if(!scope.readableFieldIds.includes(token[1]))throw new AuthorityError('forbidden','Slack inserted values require currently readable fields.')
   if(!(await oauth.channels()).channels.some(channel=>channel.id===action.channelId))throw new AuthorityError('validation','Choose a channel the installed Slack bot has joined.',400)
  },
  async dispatch(ctx:RequestContext,run:AutomationRun,step:AutomationActionRun,action:SlackAppAction,authorize:()=>Promise<void>){
   const saved=runSnapshot(run),ref=saved.event.ref,scope=await foundation.policy.scope(ctx,{...ref,purpose:'export'}),descriptor=foundation.descriptors.get(ref.appId,ref.entityId)
   const raw=await records.reader.raw(ctx,scope,ref);if(!raw)throw new AuthorityError('not_found','The Slack triggering record is unavailable.',404)
   const record=await records.reader.render(ctx,scope,descriptor,raw,undefined,new Set(),'export'),{installation,bot,guard}=await settings.resolve(true)
   if((action.provider??'slack')!==installation.provider)throw new AuthorityError('unconfigured','The configured chat provider changed; review this approval action before sending.',503)
   const decisionField=descriptor.fields.get(action.fieldId)?.field
   if(!decisionField||decisionField.readOnly||decisionField.type==='computed'||!scope.readableFieldIds.includes(action.fieldId)||!scope.writableFieldIds.includes(action.fieldId))throw new AuthorityError('forbidden','The Slack decision field is no longer readable and writable under the author’s current scope.')
   validateCell(decisionField,action.approveValue);validateCell(decisionField,action.rejectValue)
   const decisionText='Approve → '+decisionField.label+': '+(action.approveValue===null?'(empty)':plainValue(action.approveValue))+'\nReject → '+decisionField.label+': '+(action.rejectValue===null?'(empty)':plainValue(action.rejectValue))
   const primary=descriptor.schema.primaryFieldId??descriptor.schema.fields.find(field=>field.type==='text')?.id,primaryCell=primary?record.fields[primary]:undefined
   if(!primary||!scope.readableFieldIds.includes(primary)||primaryCell?.state!=='value')throw new AuthorityError('forbidden','Slack record messages require a currently readable primary field.')
   const text=action.text.replace(/\{\{([^{}]+)\}\}/g,(_token,id:string)=>{
    const cell=record.fields[id];if(!scope.readableFieldIds.includes(id)||cell?.state!=='value')throw new AuthorityError('forbidden','An inserted Slack field is no longer readable.')
    return plainValue(cell.value)
   })
   if(!text.trim())throw new AuthorityError('validation','Slack text must contain a value after inserting fields.',400)
   const title=plainValue(primaryCell.value)
   const sections=[...slackTextBlocks(title||'Untitled record'),...slackTextBlocks(text),...slackTextBlocks(decisionText)]
   // Reserve one link section and one action block before claiming delivery.
   assertSlackBlockCount([...sections,null,null])
   const prior=await db.prepare('SELECT delivery_state FROM slack_app_actions WHERE id=?').bind(step.id).first<{delivery_state:string}>()
   if(prior)return {state:prior.delivery_state==='sent'?'Complete' as const:prior.delivery_state==='failed'?'Failed' as const:'Unknown' as const,result:{deliveryId:step.id,slackStatus:prior.delivery_state},...(prior.delivery_state==='sent'?{}:{errorCode:'slack_app_'+prior.delivery_state})}
   await authorize();await records.reader.assertScope(ctx,scope)
   const current=and(guard,...scope.currentAuthorityGuards,trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(descriptor.table.tableId)} WHERE ${identifier(descriptor.idColumn)}=? AND ${identifier(descriptor.versionColumn)}=?)`,[ref.recordId,record.version]))
   const claimed=await db.prepare(`INSERT INTO slack_app_actions(id,run_id,author_id,app_id,entity_id,record_id,record_version,field_id,approve_json,reject_json,team_id,channel_id,config_version,delivery_state,choice_state,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,'unknown','pending',? WHERE ${current.sql} ON CONFLICT(id) DO NOTHING`).bind(step.id,run.id,ctx.principal.id,ref.appId,ref.entityId,ref.recordId,record.version,action.fieldId,JSON.stringify(action.approveValue),JSON.stringify(action.rejectValue),installation.team_id!,action.channelId,installation.version,Date.now(),...current.values).run()
   if(!claimed.meta.changes)throw new AuthorityError('version_conflict','Slack authority or the triggering record changed before dispatch.',409)
   const digest=await sha256(step.id),clientId=digest.slice(0,8)+'-'+digest.slice(8,12)+'-4'+digest.slice(13,16)+'-a'+digest.slice(17,20)+'-'+digest.slice(20,32)
   const body={channel:action.channelId,text:'Cradle record approval',client_msg_id:clientId,unfurl_links:false,unfurl_media:false,metadata:{event_type:'cradle_record_approval',event_payload:{delivery_id:step.id}},blocks:[...sections,{type:'section',text:{type:'mrkdwn',text:'<'+origin+'/app/records/'+ref.appId+'/'+ref.entityId+'/'+ref.recordId+'|Open record>'}},{type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Approve'},action_id:'cradle_approve',value:step.id},{type:'button',text:{type:'plain_text',text:'Reject'},action_id:'cradle_reject',value:step.id}]}]}
   await authorize();await records.reader.assertScope(ctx,scope)
   const response=await api('chat.postMessage',bot!.token,body),accepted=response.status===200&&response.value.ok===true&&typeof response.value.ts==='string',definite=response.status===200&&response.value.ok===false&&['channel_not_found','not_in_channel','invalid_auth','account_inactive','token_revoked','no_permission','missing_scope','invalid_arguments','invalid_blocks'].includes(response.value.error)
   const state=accepted?'sent':definite?'failed':'unknown'
   await db.prepare('UPDATE slack_app_actions SET delivery_state=?,message_ts=? WHERE id=?').bind(state,accepted?response.value.ts:null,step.id).run()
   return {state:accepted?'Complete' as const:definite?'Failed' as const:'Unknown' as const,result:{deliveryId:step.id,slackStatus:state},...(accepted?{}:{errorCode:'slack_app_'+state})}
  },async recover(id:string){const row=await db.prepare('SELECT delivery_state FROM slack_app_actions WHERE id=?').bind(id).first<{delivery_state:string}>();return row?.delivery_state==='sent'?{state:'Complete' as const,result:{deliveryId:id,slackStatus:'sent',reconciled:true}}:row?.delivery_state==='failed'?{state:'Failed' as const,result:{deliveryId:id},errorCode:'slack_app_failed'}:{state:'Unknown' as const,result:{deliveryId:id},errorCode:'slack_app_acknowledgement_unknown'}},
 }
}
