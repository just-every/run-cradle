import type { RequestContext } from '../authority/ports'
import type { AdmissionPlan,AdmissionPort } from '../admission/ports'
import { trustedPredicate } from '../admission/sql.server'
import type { ChannelEffects } from './ports'
import * as t from './tables.server'
import { createUlid } from '../../core/shared/ids'
export type DeliveryRow={id:string;notification_id:string|null;operator_id:string;campaign_id:string|null;kind:string;state:string;due_at:number;created_at:number;version:number;attempts:number;run_id:string|null;attempt_id:string|null;group_id:string|null}
export type MailEnvelope={from:string;to:string;subject:string;text:string;expiresAt:null}
export type ChannelMailPort={prepare(ctx:RequestContext,commandId:string,input:{deliveryIds:string[];operatorId:string;envelope:MailEnvelope}):Promise<AdmissionPlan<{runId:string;attemptId?:string}>>;prepareFailure(ctx:RequestContext,deliveryId:string):Promise<AdmissionPlan<{deliveryId:string;state:string}>>;sender(ctx:RequestContext):Promise<string>;context(deliveryId:string):Promise<RequestContext>}
export function createChannelDelivery(db:D1Database,admission:AdmissionPort,mail:ChannelMailPort){
 async function prepare(ctx:RequestContext,id:string){const first=await db.prepare('SELECT * FROM channel_deliveries WHERE id=?').bind(id).first<DeliveryRow>();if(!first||!['queued','held'].includes(first.state)||first.due_at>Date.parse(ctx.now)||first.run_id!==null)throw new Error('Delivery is not due')
  // Held messages release as one recipient message. Urgent queued messages are not delayed for grouping.
  const rows=first.state==='held'?(await db.prepare("SELECT * FROM channel_deliveries WHERE operator_id=? AND state='held' AND run_id IS NULL AND due_at<=? ORDER BY created_at,id").bind(first.operator_id,Date.parse(ctx.now)).all<DeliveryRow>()).results:[first]
  const recipient=await db.prepare('SELECT email FROM operators WHERE id=? AND active=1').bind(first.operator_id).first<{email:string}>();if(!recipient)throw new Error('Recipient is no longer active')
  const body:string[]=[];for(const row of rows){const n=await db.prepare('SELECT title,body,unavailable FROM notifications WHERE id=?').bind(row.notification_id).first<{title:string;body:string;unavailable:number}>();if(!n||n.unavailable)throw new Error('Notification is unavailable');body.push(`${n.title}\n${n.body}`)}
  const commandId=createUlid(),plan=await mail.prepare(ctx,commandId,{deliveryIds:rows.map(r=>r.id),operatorId:first.operator_id,envelope:{from:await mail.sender(ctx),to:recipient.email,subject:rows.length===1?body[0]!.split('\n')[0]!:'Your Cradle notifications',text:body.join('\n\n'),expiresAt:null}})
  const effects:ChannelEffects={guards:[trustedPredicate('EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1 AND email=?)',[first.operator_id,recipient.email])],mutations:[]}
  for(const row of rows){effects.guards.push(trustedPredicate("EXISTS(SELECT 1 FROM channel_deliveries WHERE id=? AND version=? AND state IN ('queued','held') AND due_at<=?)",[row.id,row.version,Date.parse(ctx.now)]));if(row.campaign_id)effects.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM campaigns WHERE id=? AND archived_at IS NULL)',[row.campaign_id]));effects.mutations.push({kind:'update',table:t.deliveries,set:{state:'queued',run_id:plan.committedResult.runId,attempt_id:plan.committedResult.attemptId??null,group_id:commandId,attempts:row.attempts+1,version:row.version+1,updated_at:Date.parse(ctx.now)},where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1})}
  plan.guards=[...plan.guards,...effects.guards];plan.mutations=[...plan.mutations,...effects.mutations];return plan
 }
 async function scheduled(now=Date.now()){const due=await db.prepare("SELECT id FROM channel_deliveries WHERE state IN ('queued','held') AND run_id IS NULL AND due_at<=? ORDER BY due_at,id LIMIT 100").bind(now).all<{id:string}>(),result:{id:string;state:string;reason?:string}[]=[];for(const row of due.results){try{const ctx=await mail.context(row.id);ctx.now=new Date(now).toISOString();await admission.commit(ctx,await prepare(ctx,row.id));result.push({id:row.id,state:'admitted'})}catch(error){if(error instanceof Error&&'code'in error&&error.code==='unconfigured'){const ctx=await mail.context(row.id);ctx.now=new Date(now).toISOString();await admission.commit(ctx,await mail.prepareFailure(ctx,row.id))}result.push({id:row.id,state:'blocked',reason:error instanceof Error?error.message:'Delivery admission failed'})}}return result}
 return {prepare,scheduled}
}
/** X invokes this only after verified provider observation or durable receipt readback. */
export function createDeliveryObservations(db:D1Database){return {
 async prepare(ctx:RequestContext,input:{attemptId:string;connectionId:string;kind:'email.delivered'|'email.bounced'|'email.failed'|'accepted'|'unknown'|'refused';receiptId:string|null;message?:string;retryAt?:string|null;failureCode?:string|null}):Promise<ChannelEffects>{
  const attempt=await db.prepare('SELECT run_id,state FROM execution_attempts WHERE id=? AND connection_id=?').bind(input.attemptId,input.connectionId).first<{run_id:string;state:string}>();if(!attempt)throw new Error('Delivery observation is not bound to a provider attempt')
  const rows=await db.prepare('SELECT * FROM channel_deliveries WHERE run_id=?').bind(attempt.run_id).all<DeliveryRow>(),effects:ChannelEffects={guards:[],mutations:[]};const state=input.kind==='email.delivered'?'delivered':input.kind==='accepted'?'accepted':input.kind==='unknown'?'unknown':input.retryAt?'queued':'failed'
  for(const row of rows.results){if(row.state==='cancelled'||row.state==='delivered')continue;effects.mutations.push({kind:'update',table:t.deliveries,set:{state,attempt_id:input.attemptId,receipt_id:input.receiptId,due_at:input.retryAt?Date.parse(input.retryAt):row.due_at,error_code:state==='failed'?(input.failureCode??input.kind):null,error_message:state==='failed'?input.message??'Email delivery failed':null,version:row.version+1,updated_at:Date.parse(ctx.now)},where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1});if(row.notification_id)effects.mutations.push({kind:'update',table:t.metadata,set:{failure:state==='failed'?input.message??'Email delivery failed':null},where:trustedPredicate('notification_id=?',[row.notification_id]),expectedRows:1})}
  return effects
 }
}}
