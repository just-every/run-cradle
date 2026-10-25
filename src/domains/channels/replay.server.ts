import type {RequestContext} from '../authority/ports'
import {NOTIFICATION_APP,NOTIFICATION_PRINCIPAL} from './mail-authority.server'
import {IN_APP_NOTIFICATION_PRINCIPAL,notificationPrincipalGuard} from './notification-authority.server'
import {AdmissionError} from '../admission/errors'
/** Internal replay visibility follows server-persisted command/attempt lineage, never client result or run IDs. */
export function createNotificationReplay(db:D1Database){return async(ctx:RequestContext,command:{commandId:string;result?:unknown})=>{
 const fail=():never=>{throw new AdmissionError('forbidden','Notification command replay is outside this delivery authority')}
 if(![NOTIFICATION_PRINCIPAL,IN_APP_NOTIFICATION_PRINCIPAL].includes(ctx.principal.id)||ctx.principal.kind!=='system'||!ctx.principal.credentialId||Date.parse(ctx.principal.expiresAt)<=Date.now())return fail()
 const saved=await db.prepare('SELECT action,result_json FROM command_admissions WHERE command_id=? AND actor_id=? AND app_id=?').bind(command.commandId,ctx.principal.id,NOTIFICATION_APP).first<{action:string;result_json:string}>();if(!saved)return fail()
 if(['progress.notify','automation.stop.notify'].includes(saved.action)){
  if(ctx.principal.id!==IN_APP_NOTIFICATION_PRINCIPAL)return fail()
  const guard=notificationPrincipalGuard(ctx.principal.authenticationEpoch)
  if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())return fail()
 }else if(ctx.principal.id!==NOTIFICATION_PRINCIPAL||!await db.prepare('SELECT 1 FROM channel_mail_authority WHERE id=? AND epoch=? AND active=1').bind(NOTIFICATION_PRINCIPAL,ctx.principal.authenticationEpoch).first())return fail()
 if(saved.action==='progress.notify'){
  const value=JSON.parse(saved.result_json)?.value
  if(value?.eventId!==ctx.principal.credentialId||!['base-import','warehouse-export'].includes(value?.subjectType)||!['completed','failed'].includes(value?.outcome))return fail()
  const source=value.subjectType==='base-import'?'ik_jobs':'warehouse_exports',owner=value.subjectType==='base-import'?'principal_id':'owner_id'
  if(!await db.prepare(`SELECT 1 FROM ${source} j JOIN authority_principals p ON p.id=j.${owner} WHERE j.id=? AND p.id=? AND p.human_id=? AND p.state='active'`).bind(value.subjectId,value.starterId,value.operatorId).first())return fail()
  if(value.notificationId!==null&&!await db.prepare('SELECT 1 FROM channel_events WHERE event_id=? AND operator_id=? AND notification_id=?').bind(value.eventId,value.operatorId,value.notificationId).first())return fail()
  return
 }
 if(saved.action==='automation.stop.notify'){const value=JSON.parse(saved.result_json)?.value;if(value?.runId!==ctx.principal.credentialId||!await db.prepare("SELECT 1 FROM automation_runs r JOIN channel_events e ON e.event_id='automation-stop:'||r.id WHERE r.id=? AND r.state='Cancelled' AND r.error_code IS NOT NULL").bind(value.runId).first())return fail();return}
 if(!['notification.email.send','notification.delivery.failed','execution.dispatch','execution.reconcile','execution.cancel','execution.recover'].includes(saved.action))return fail()
 const value=JSON.parse(saved.result_json)?.value??{};let deliveryId:unknown=saved.action==='notification.delivery.failed'?value.deliveryId:undefined
 if(!deliveryId){let runId:unknown=value.runId;if(!runId&&typeof value.attemptId==='string')runId=(await db.prepare('SELECT run_id FROM execution_attempts WHERE id=?').bind(value.attemptId).first<{run_id:string}>())?.run_id;if(!runId&&typeof value.receiptId==='string')runId=(await db.prepare('SELECT a.run_id FROM execution_receipts r JOIN execution_attempts a ON a.id=r.attempt_id WHERE r.id=?').bind(value.receiptId).first<{run_id:string}>())?.run_id;if(!runId&&typeof value.outboxId==='string'){const o=await db.prepare('SELECT input_json FROM admission_outbox WHERE id=?').bind(value.outboxId).first<{input_json:string}>();runId=o?JSON.parse(o.input_json).runId:null}if(typeof runId!=='string')return fail();const run=await db.prepare('SELECT request_json FROM execution_runs WHERE id=? AND app_id=?').bind(runId,NOTIFICATION_APP).first<{request_json:string}>();const r=run?JSON.parse(run.request_json):null;if(r?.action!=='notification.email.send'||r.trigger!==`notification:${ctx.principal.credentialId}`)return fail();deliveryId=ctx.principal.credentialId}
 if(deliveryId!==ctx.principal.credentialId||!await db.prepare('SELECT 1 FROM channel_deliveries WHERE id=?').bind(deliveryId).first())return fail()
 // Read-only reconciliation must survive cancellation/removal; this grants no permission to dispatch.
}}
