import type {PlatformBindings} from '../../core/platform/bindings';
import type {AdmissionPlan,AdmissionPort} from '../admission/ports';
import type {EntityRegistry} from '../authority/scope.server';
import type {RequestContext,AuthorityPermit} from '../authority/ports';
import {createMailSender,MailValidationError} from '../../../vendor/base/modules/mail/index.mjs';
import {hostedMailConfig,hostedMailConfigured} from '../../core/platform/hosted-mail.server';
import {createNotificationMailAuthority,NOTIFICATION_APP,NOTIFICATION_PRINCIPAL} from './mail-authority.server';
import {notificationSendGuards} from './send-guards.server';
import {deliveries} from './tables.server';
import {and,trustedPredicate} from '../admission/sql.server';
import {AdmissionError} from '../admission/errors';
import {AuthorityError} from '../authority/errors';
import {canonicalHash} from '../admission/canonical';
import {createUlid} from '../../core/shared/ids';

/** The installation's Base sender dispatches only durably claimed, authorized mail. */
export function createHostedChannelDelivery(env:PlatformBindings,admission:AdmissionPort,entities:EntityRegistry){
 const db=env.DB,authority=createNotificationMailAuthority(db,entities);
 async function dispatch(id:string,now:number){
  const ctx=await authority.context(id);ctx.now=new Date(now).toISOString();ctx.principal.expiresAt=new Date(now+60000).toISOString();
  let authorized:Awaited<ReturnType<typeof authority.authorizeLocal>>;
  try{
   if(!hostedMailConfigured(env))throw new AdmissionError('unconfigured','Configure the installation mail provider, sender and API key.');
   authorized=await authority.authorizeLocal(ctx,id,env.MAIL_FROM!);
  }catch(error){
   if(!(error instanceof AdmissionError||error instanceof AuthorityError)||!['forbidden','unconfigured','validation'].includes(error.code))throw error;
   await admission.commit(ctx,await authority.prepareFailure(ctx,id));return;
  }
  const {envelope,permit}=authorized,ids=envelope.rows.map(row=>row.id),claimId=createUlid();
  const claim:AdmissionPlan<{deliveryId:string;state:string}>={commandId:claimId,appId:NOTIFICATION_APP,action:'notification.email.send',canonicalInputHash:await canonicalHash({deliveryIds:ids,state:'dispatching'}),permit,guards:envelope.rows.map(row=>trustedPredicate("EXISTS(SELECT 1 FROM channel_deliveries WHERE id=? AND version=? AND state IN ('queued','held') AND run_id IS NULL)",[row.id,row.version])),mutations:envelope.rows.map(row=>({kind:'update',table:deliveries,set:{state:'dispatching',group_id:claimId,attempts:row.attempts+1,updated_at:now,version:row.version+1},where:trustedPredicate("id=? AND version=? AND state IN ('queued','held')",[row.id,row.version]),expectedRows:1})),audit:[],events:[],outbox:[],committedResult:{deliveryId:id,state:'dispatching'}};
  const receipt=await admission.commit(ctx,claim);if(receipt.result.state!=='committed')throw new AdmissionError('unknown_outcome','Notification mail claim did not finish.');
  let state='unknown',receiptId:string|null=null,errorCode:string|null=null,errorMessage:string|null=null;
  try{
   const input={from:env.MAIL_FROM!,to:envelope.to,subject:envelope.subject,text:envelope.text,expiresAt:null},guards=await notificationSendGuards(db,ctx,ids,envelope.operatorId,input,now,entities),current=and(...guards);
   if(!await db.prepare(`SELECT 1 WHERE ${current.sql}`).bind(...current.values).first())throw new AdmissionError('forbidden','Recipient authority changed before mail dispatch.');
   const result=await createMailSender(hostedMailConfig(env)!).send({deliveryId:claimId,from:input.from,to:[input.to],subject:input.subject,text:input.text});
   state=result.status==='accepted'?'accepted':result.status==='uncertain'?'unknown':'failed';receiptId=result.providerMessageId??null;
   if(state!=='accepted'){errorCode='mail_'+result.status;errorMessage=result.code??'Mail provider did not confirm acceptance.';}
  }catch(error){
   const known=error instanceof MailValidationError||error instanceof AdmissionError||error instanceof AuthorityError;
   state=known?'failed':'unknown';errorCode=known?error.code:'provider_acknowledgement_unknown';errorMessage=known?error.message:'The mail provider outcome is unknown; this delivery will not be resent automatically.';
  }
  // A persisted dispatch claim is never retried after a lost acknowledgement.
  const at=new Date().toISOString(),resultCtx:RequestContext={...ctx,now:at,principal:{...ctx.principal,expiresAt:new Date(Date.parse(at)+60000).toISOString()}},guard=trustedPredicate('EXISTS(SELECT 1 FROM channel_mail_authority WHERE id=? AND active=1 AND epoch=?)',[NOTIFICATION_PRINCIPAL,ctx.principal.authenticationEpoch]);
  const resultPermit:AuthorityPermit={...permit,guards:[guard],validUntil:resultCtx.principal.expiresAt};
  await admission.commit(resultCtx,{commandId:createUlid(),appId:NOTIFICATION_APP,action:'notification.email.send',canonicalInputHash:await canonicalHash({claimId,state,receiptId,errorCode}),permit:resultPermit,guards:ids.map(deliveryId=>trustedPredicate("EXISTS(SELECT 1 FROM channel_deliveries WHERE id=? AND group_id=? AND state='dispatching')",[deliveryId,claimId])),mutations:envelope.rows.map(row=>({kind:'update',table:deliveries,set:{state,receipt_id:receiptId,error_code:errorCode,error_message:errorMessage,updated_at:Date.parse(at),version:row.version+2},where:trustedPredicate("id=? AND group_id=? AND state='dispatching'",[row.id,claimId]),expectedRows:1})),audit:[],events:[],outbox:[],committedResult:{deliveryId:id,state}});
 }
 return {async scheduled(now=Date.now()){
  const interrupted=await db.prepare("SELECT id,version,group_id FROM channel_deliveries WHERE state='dispatching' AND run_id IS NULL AND updated_at<? ORDER BY updated_at,id LIMIT 100").bind(now-60000).all<{id:string;version:number;group_id:string}>();
  for(const row of interrupted.results){
   const ctx=await authority.context(row.id),guard=trustedPredicate('EXISTS(SELECT 1 FROM channel_mail_authority WHERE id=? AND epoch=? AND active=1)',[NOTIFICATION_PRINCIPAL,ctx.principal.authenticationEpoch]),permit:AuthorityPermit={actor:{id:NOTIFICATION_PRINCIPAL,kind:'system'},action:'notification.email.send',appId:NOTIFICATION_APP,grantId:null,grantVersion:null,policyVersion:1,validUntil:ctx.principal.expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]};
   await admission.commit(ctx,{commandId:createUlid(),appId:NOTIFICATION_APP,action:'notification.email.send',canonicalInputHash:await canonicalHash({deliveryId:row.id,groupId:row.group_id,state:'unknown'}),permit,guards:[],mutations:[{kind:'update',table:deliveries,set:{state:'unknown',error_code:'provider_acknowledgement_unknown',error_message:'Dispatch was interrupted; provider acceptance is unknown and the message will not be resent automatically.',updated_at:now,version:row.version+1},where:trustedPredicate("id=? AND version=? AND state='dispatching' AND run_id IS NULL",[row.id,row.version]),expectedRows:1}],audit:[],events:[],outbox:[],committedResult:{deliveryId:row.id,state:'unknown'}});
  }
  const due=await db.prepare("SELECT id FROM channel_deliveries WHERE state IN ('queued','held') AND run_id IS NULL AND due_at<=? ORDER BY due_at,id LIMIT 100").bind(now).all<{id:string}>();
  for(const row of due.results){if(await db.prepare("SELECT 1 FROM channel_deliveries WHERE id=? AND state IN ('queued','held') AND run_id IS NULL AND due_at<=?").bind(row.id,now).first())await dispatch(row.id,now);}
 }};
}
