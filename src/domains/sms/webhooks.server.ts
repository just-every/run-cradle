import type {PlatformBindings} from '../../core/platform/bindings'
import {smsSettings} from './settings.server'
import {messagesUrl,normalizePhone,twilioRequest,verifyTwilio} from './twilio.server'
import {sha256} from '../../adapters/crypto.server'
import {canonical} from '../admission/canonical'
type Message={id:string;run_id:string;command_id:string;actor_id:string;app_id:string;entity_id:string;record_id:string;recipient:string;sender:string;provider_sid:string|null;status:string}
const statuses=['queued','sent','delivered','undelivered','failed']
const stops=new Set(['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','REVOKE','OPTOUT'])
const starts=new Set(['START','YES','UNSTOP'])
/** Twilio has no timestamp in its inbound signature. Resolve the signed message
 * at Twilio before accepting its date, sender and content; receipt IDs fence replay. */
export function smsWebhooks(env:PlatformBindings,origin:string){
 const db=env.DB,settings=smsSettings(env,origin)
 return async(request:Request,kind:'status'|'inbound')=>{
  const size=Number(request.headers.get('content-length')??'0')
  if(size>32768||!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return new Response(null,{status:400})
  const reader=request.body?.getReader(),parts:Uint8Array[]=[];let length=0
  if(reader)for(;;){const result=await reader.read();if(result.done)break;length+=result.value.length;if(length>32768){await reader.cancel();return new Response(null,{status:413})}parts.push(result.value)}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
  const params=new URLSearchParams(new TextDecoder().decode(bytes)),{credentials}=await settings.resolve()
  if(!await verifyTwilio(request,origin,params,credentials.authToken)||params.get('AccountSid')!==credentials.accountSid)return new Response(null,{status:401})
  const url=new URL(request.url),sid=params.get('MessageSid')
  if(!sid||!/^[A-Za-z0-9_-]{1,100}$/.test(sid))return new Response(null,{status:400})
  let message:Message|null,event:string,receipt:string,statements:D1PreparedStatement[]=[]
  const now=Date.now()
  if(kind==='status'){
   const expiry=Number(url.searchParams.get('expires')),id=url.searchParams.get('delivery'),status=params.get('MessageStatus')
   if(!Number.isFinite(expiry)||expiry<now||expiry>now+86400000||!status||!statuses.includes(status))return new Response(null,{status:401})
   message=await db.prepare('SELECT * FROM sms_messages WHERE id=? AND (provider_sid=? OR provider_sid IS NULL)').bind(id,sid).first<Message>()
   if(!message||params.get('To')!==message.recipient)return new Response(null,{status:401})
   // Terminal delivery outcomes never regress to a delayed queued/sent event.
   if(['delivered','undelivered','failed'].includes(message.status)&&message.status!==status)return new Response(null,{status:409})
   let sender=message.sender
   if(params.get('From'))try{sender=normalizePhone(params.get('From'))}catch{return new Response(null,{status:400})}
   event=status;receipt='status:'+sid+':'+status
   statements.push(db.prepare('UPDATE sms_messages SET provider_sid=?,sender=?,status=?,updated_at=? WHERE id=?').bind(sid,sender,status,now,message.id),
    db.prepare("UPDATE launch_automation_actions SET result_json=json_set(coalesce(result_json,'{}'),'$.smsStatus',?) WHERE id=?").bind(status,message.id))
  }else{
   const response=await twilioRequest(env,credentials,messagesUrl(credentials)+'/'+encodeURIComponent(sid)+'.json')
   if(response.status!==200)return new Response(null,{status:401})
   let inbound:{sid?:string;date_created?:string;from?:string;to?:string;body?:string;direction?:string;account_sid?:string}
   try{inbound=JSON.parse(response.body)}catch{return new Response(null,{status:401})}
   const created=Date.parse(inbound.date_created??'')
   if(inbound.sid!==sid||inbound.account_sid!==credentials.accountSid||inbound.direction!=='inbound'||!Number.isFinite(created)||Math.abs(now-created)>300000||inbound.from!==params.get('From')||inbound.to!==params.get('To')||inbound.body!==params.get('Body'))return new Response(null,{status:401})
   let from:string,to:string
   try{from=normalizePhone(inbound.from);to=normalizePhone(inbound.to)}catch{return new Response(null,{status:400})}
   const distinct=await db.prepare("SELECT count(*) AS records FROM (SELECT DISTINCT app_id,entity_id,record_id FROM sms_messages WHERE recipient=? AND sender=?)").bind(from,to).first<{records:number}>()
   // Native SMS supplies no reply-to message ID. Attribute only when this
   // number pair has one distinct record; ambiguous consent still takes effect.
   message=distinct?.records===1?await db.prepare('SELECT * FROM sms_messages WHERE recipient=? AND sender=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(from,to).first<Message>():null
   const keyword=(inbound.body??'').trim().toUpperCase(),hash=await sha256(from)
   event=stops.has(keyword)?'stop':starts.has(keyword)?'start':['HELP','INFO'].includes(keyword)?'help':'inbound'
   receipt='inbound:'+sid
   statements.push(db.prepare('INSERT INTO sms_inbound_events(receipt_id,recipient_hash,event,created_at,sender_mask,body,unattributed) VALUES(?,?,?,?,?,?,?)').bind(receipt,hash,event,now,message?null:'••• '+from.slice(-4),message?null:inbound.body??'',message?0:1))
   if(event==='stop')statements.push(db.prepare('INSERT INTO sms_suppressions(recipient_hash,updated_at) VALUES(?,?) ON CONFLICT(recipient_hash) DO UPDATE SET updated_at=excluded.updated_at').bind(hash,now))
   if(event==='start')statements.push(db.prepare('DELETE FROM sms_suppressions WHERE recipient_hash=?').bind(hash))
  }
  if(await db.prepare('SELECT 1 FROM sms_webhook_receipts WHERE id=?').bind(receipt).first())return new Response(null,{status:401})
  if(message){
   const auditId=await sha256(receipt),ref={appId:message.app_id,entityId:message.entity_id,recordId:message.record_id}
   statements.push(db.prepare(`INSERT INTO admission_audit(id,command_id,actor_id,actor_kind,app_id,action,subject_json,changes_json,source_ids_json,personal_refs_json,created_at) VALUES(?,?,?,'automation',?, ?,?,'[]','[]','[]',?)`)
    .bind(auditId,message.command_id,message.actor_id,message.app_id,'sms.'+event,canonical(ref),new Date(now).toISOString()))
  }
  // One transaction commits replay receipt, suppression/delivery and record history.
  try{await db.batch([db.prepare('INSERT INTO sms_webhook_receipts(id,received_at) VALUES(?,?)').bind(receipt,now),...statements])}catch(error){if(await db.prepare('SELECT 1 FROM sms_webhook_receipts WHERE id=?').bind(receipt).first())return new Response(null,{status:401});throw error}
  return new Response('<Response/>',{status:200,headers:{'content-type':'text/xml'}})
 }
}
