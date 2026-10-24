import type {PlatformBindings} from '../../core/platform/bindings'
import type {PolicyPort,PolicyScope,RequestContext} from '../authority/ports'
import type {RecordAutomationAction} from '../automations/contracts'
import type {AutomationRun,AutomationActionRun} from '../automations/run-store.server'
import type {createRecordReader} from '../records/query.server'
import type {DescriptorRegistry} from '../records/descriptors.server'
import type {RecordRow} from '../records/contracts'
import {runSnapshot} from '../automations/run-store.server'
import {smsSettings} from './settings.server'
import {messagesUrl,normalizePhone,twilioRequest} from './twilio.server'
import {AuthorityError} from '../authority/errors'
import {sha256} from '../../adapters/crypto.server'
import {canonical} from '../admission/canonical'
export function smsInput(action:Extract<RecordAutomationAction,{kind:'sms'}>,record:RecordRow,scope:PolicyScope,descriptors:DescriptorRegistry){
 const descriptor=descriptors.get(record.ref.appId,record.ref.entityId),field=descriptor.schema.fields.find(field=>field.id===action.fieldId)
 if(!field||!(field.type==='text'||field.type==='computed'&&field.resultElementType==='text')||!scope.readableFieldIds.includes(action.fieldId))throw new AuthorityError('forbidden','SMS requires a readable text phone field.')
 const cell=record.fields[action.fieldId]
 let to:string
 try{to=normalizePhone(cell?.state==='value'?cell.value:null)}catch{throw new AuthorityError('validation',`SMS phone field ${field.label} (${field.id}) is blank or invalid on record ${record.id}.`,400)}
 const body=action.text.replace(/\{\{([^{}]+)\}\}/g,(_token,id:string)=>{
  const value=record.fields[id]
  if(!scope.readableFieldIds.includes(id)||!value||value.state!=='value')throw new AuthorityError('forbidden',`SMS inserted field ${id} is unreadable or unavailable on record ${record.id}.`)
  if(value.value===null)return ''
  if(typeof value.value==='object')throw new AuthorityError('validation','SMS inserted values must be text, numbers or booleans.',400)
  return String(value.value)
 })
 if(!body.trim()||body.length>4000)throw new AuthorityError('validation','SMS text must contain 1–4000 characters after inserting values.',400)
 return {to,body}
}
export function smsDispatch(env:PlatformBindings,origin:string,reader:ReturnType<typeof createRecordReader>,descriptors:DescriptorRegistry,policy:PolicyPort){
 const db=env.DB,settings=smsSettings(env,origin)
 return async(ctx:RequestContext,run:AutomationRun,step:AutomationActionRun,action:Extract<RecordAutomationAction,{kind:'sms'}>,scope:PolicyScope,authorize:()=>Promise<void>)=>{
  const saved=runSnapshot(run),ref=saved.event.ref
  scope=await policy.scope(ctx,{...ref,purpose:'export'})
  const raw=await reader.raw(ctx,scope,ref)
  if(!raw)throw new AuthorityError('not_found','The SMS triggering record is unavailable.',404)
  const record=await reader.render(ctx,scope,descriptors.get(ref.appId,ref.entityId),raw,undefined,new Set(),'export'),{to,body}=smsInput(action,record,scope,descriptors)
  const {row,credentials}=await settings.resolve(),recipientHash=await sha256(to)
  await authorize();await reader.assertScope(ctx,scope)
  if(await db.prepare('SELECT 1 FROM sms_suppressions WHERE recipient_hash=?').bind(recipientHash).first())return {state:'Complete' as const,result:{deliveryId:step.id,smsStatus:'suppressed',skipped:true}}
  const prior=await db.prepare('SELECT status,provider_sid FROM sms_messages WHERE id=?').bind(step.id).first<{status:string;provider_sid:string|null}>()
  if(prior)return {state:prior.status==='unknown'?'Unknown' as const:'Complete' as const,result:{deliveryId:step.id,smsStatus:prior.status,providerMessageId:prior.provider_sid},...(prior.status==='unknown'?{errorCode:'sms_acknowledgement_unknown'}:{})}
  const now=Date.now(),commandId=saved.event.commandId??run.id
  const claimed=await db.prepare(`INSERT INTO sms_messages(id,run_id,command_id,actor_id,app_id,entity_id,record_id,field_id,recipient,sender,provider_sid,status,created_at,updated_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,NULL,'unknown',?,? WHERE EXISTS(SELECT 1 FROM sms_installation WHERE id='installation' AND version=?) AND NOT EXISTS(SELECT 1 FROM sms_suppressions WHERE recipient_hash=?) ON CONFLICT(id) DO NOTHING`)
   .bind(step.id,run.id,commandId,ctx.principal.id,ref.appId,ref.entityId,ref.recordId,action.fieldId,to,credentials.from,now,now,row.version,recipientHash).run()
  if(!claimed.meta.changes)throw new AuthorityError('version_conflict','SMS configuration or suppression changed before dispatch.',409)
  const callback=new URL(origin+'/webhooks/twilio/status');callback.searchParams.set('delivery',step.id);callback.searchParams.set('expires',String(now+86400000))
  const form=new URLSearchParams({To:to,Body:body,StatusCallback:callback.href,[credentials.from.startsWith('MG')?'MessagingServiceSid':'From']:credentials.from})
  await authorize();await reader.assertScope(ctx,scope)
  // The durable unknown claim precedes the only network attempt. No ambiguous
  // response, interrupted process, queue replay or manual retry can resend it.
  const response=await twilioRequest(env,credentials,messagesUrl(credentials)+'.json',form,step.id)
  let parsed:{sid?:string;status?:string;from?:string|null}={};try{parsed=JSON.parse(response.body)}catch{/* An unparseable acknowledgement remains unknown. */}
  const accepted=response.status===201&&typeof parsed.sid==='string',rejected=response.status>=400&&response.status<500&&response.status!==408&&response.status!==429
  const status=accepted&&['queued','sent','delivered','undelivered','failed'].includes(parsed.status??'')?parsed.status!:accepted?'queued':rejected?'failed':'unknown'
  let sender=credentials.from
  if(accepted&&parsed.from)try{sender=normalizePhone(parsed.from)}catch{/* Messaging Service may not have allocated its sender yet. */}
  await db.prepare("UPDATE sms_messages SET provider_sid=coalesce(provider_sid,?),sender=?,status=CASE WHEN status='unknown' THEN ? ELSE status END,updated_at=? WHERE id=?").bind(accepted?parsed.sid!:null,sender,status,Date.now(),step.id).run()
  if(accepted)await db.prepare(`INSERT INTO admission_audit(id,command_id,actor_id,actor_kind,app_id,action,subject_json,changes_json,source_ids_json,personal_refs_json,created_at) VALUES(?,?,?,'automation',?,'sms.queued',?,'[]','[]','[]',?) ON CONFLICT(id) DO NOTHING`).bind(step.id,commandId,ctx.principal.id,ref.appId,canonical(ref),new Date().toISOString()).run()
  return {state:accepted?'Complete' as const:rejected?'Failed' as const:'Unknown' as const,result:{deliveryId:step.id,smsStatus:status,providerMessageId:accepted?parsed.sid:null},...(accepted?{}:{errorCode:rejected?'sms_rejected':'sms_acknowledgement_unknown'})}
 }
}
