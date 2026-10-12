import type { RequestContext } from '../authority/ports';
import { NOTIFICATION_APP,NOTIFICATION_PRINCIPAL,createNotificationMailAuthority } from '../channels/mail-authority.server';
/** Internal notification replay remains bound to the original delivery, even for receipt commands. */
export function createNotificationReplay(db:D1Database){const authority=createNotificationMailAuthority(db);return async(ctx:RequestContext,command:{commandId:string})=>{
 if(ctx.principal.id!==NOTIFICATION_PRINCIPAL||ctx.principal.kind!=='system'||!ctx.principal.credentialId)throw new Error('Notification replay is not authorized');
 const stored=await db.prepare('SELECT result_json FROM command_admissions WHERE command_id=? AND actor_id=? AND app_id=?').bind(command.commandId,NOTIFICATION_PRINCIPAL,NOTIFICATION_APP).first<{result_json:string}>();if(!stored)throw new Error('Notification command not found');const result=JSON.parse(stored.result_json)?.value??{};let runId:unknown=result.runId;
 if(!runId&&typeof result.attemptId==='string')runId=(await db.prepare('SELECT run_id FROM execution_attempts WHERE id=?').bind(result.attemptId).first<{run_id:string}>())?.run_id;
 if(!runId&&typeof result.receiptId==='string')runId=(await db.prepare('SELECT a.run_id FROM execution_receipts r JOIN execution_attempts a ON a.id=r.attempt_id WHERE r.id=?').bind(result.receiptId).first<{run_id:string}>())?.run_id;
 if(!runId&&typeof result.outboxId==='string'){const row=await db.prepare('SELECT input_json FROM admission_outbox WHERE id=?').bind(result.outboxId).first<{input_json:string}>();runId=row?JSON.parse(row.input_json).runId:null;}
 const run=typeof runId==='string'?await db.prepare('SELECT request_json FROM execution_runs WHERE id=? AND app_id=?').bind(runId,NOTIFICATION_APP).first<{request_json:string}>():null;const request=run?JSON.parse(run.request_json):null;
 if(request?.action!=='notification.email.send'||request.trigger!==`notification:${ctx.principal.credentialId}`)throw new Error('Notification replay belongs to another delivery');await authority.authorize(ctx,request,'read');
};}
