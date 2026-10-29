import type {PlatformBindings} from '../../../core/platform/bindings';
import type {ServerFoundation} from '../../../core/app/foundation.server';
import {slackSettings,type ChatProvider} from '../../slack-app/settings.server';
import {slackTransport} from '../../slack-app/transport.server';
import {and,trustedPredicate} from '../../admission/sql.server';
import {notificationContext} from '../../channels/notification-authority.server';
import {watchNotificationGuards} from './delivery-authority.server';
import {slackTextBlocks} from '../../slack-app/blocks.server';
import {sha256} from '../../../adapters/crypto.server';
import {unavailable} from './notices.server';
/** Recipient-linked direct messages use the existing installed chat boundary. */
export function createWatchChatDelivery(env:PlatformBindings,foundation:ServerFoundation,origin:string){const db=env.DB;return {async scheduled(now=Date.now()){
 const due=await db.prepare("SELECT d.id,d.notification_id,d.operator_id,d.provider,n.title,n.body FROM record_watch_chat_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.state='queued' AND n.unavailable=0 ORDER BY d.created_at,d.id LIMIT 100").all<{id:string;notification_id:string;operator_id:string;provider:ChatProvider;title:string;body:string}>();
 for(const delivery of due.results){try{
  const ctx=await notificationContext(db,delivery.id,'schedule',now),settings=slackSettings(env,foundation,origin,delivery.provider),api=slackTransport(env,settings),resolved=await settings.resolve(true),recipient=await db.prepare(`SELECT l.slack_user_id,l.principal_id FROM slack_app_links l JOIN authority_principals p ON p.id=l.principal_id AND p.state='active' AND p.authentication_epoch=l.authentication_epoch JOIN cradle_base_operators m ON m.principal_id=p.id AND m.base_id=l.base_operator_id JOIN oa_operators o ON o.id=m.base_id AND o.status='active' AND o.version=l.base_operator_version WHERE l.team_id=? AND p.human_id=?`).bind(resolved.installation.team_id,delivery.operator_id).first<{slack_user_id:string;principal_id:string}>();
  if(!recipient){await db.prepare("UPDATE record_watch_chat_deliveries SET state='unavailable',updated_at=? WHERE id=? AND state='queued'").bind(now,delivery.id).run();continue;}
  const access=await watchNotificationGuards(db,foundation.entities,ctx,delivery.notification_id,delivery.operator_id),link=trustedPredicate('EXISTS(SELECT 1 FROM slack_app_links WHERE team_id=? AND principal_id=? AND slack_user_id=?)',[resolved.installation.team_id,recipient.principal_id,recipient.slack_user_id]),current=and(resolved.guard,link,...access);
  // Claim before outbound work; an uncertain provider outcome never auto-replays.
  const claimed=await db.prepare(`UPDATE record_watch_chat_deliveries SET state='unknown',updated_at=? WHERE id=? AND state='queued' AND (${current.sql}) RETURNING id`).bind(now,delivery.id,...current.values).first();if(!claimed)continue;
  const hash=await sha256(delivery.id),clientId=hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
  if(!await db.prepare(`SELECT 1 WHERE ${current.sql}`).bind(...current.values).first())continue;
  const response=await api(delivery.provider==='teams'?'chat.postDirectMessage':'chat.postMessage',resolved.bot!.token,{channel:recipient.slack_user_id,userId:recipient.slack_user_id,text:delivery.title+'\n'+delivery.body,blocks:slackTextBlocks(delivery.title+'\n'+delivery.body),client_msg_id:clientId,unfurl_links:false,unfurl_media:false}),accepted=response.status===200&&response.value.ok===true&&typeof response.value.ts==='string';
  await db.prepare('UPDATE record_watch_chat_deliveries SET state=?,provider_receipt=?,updated_at=? WHERE id=?').bind(accepted?'sent':response.status===200&&response.value.ok===false?'failed':'unknown',accepted?response.value.ts:null,now,delivery.id).run();
 }catch(error){if(unavailable(error)||error instanceof Error&&'code'in error&&error.code==='unconfigured'){await db.prepare("UPDATE record_watch_chat_deliveries SET state='unavailable',updated_at=? WHERE id=? AND state='queued'").bind(now,delivery.id).run();continue;}throw error;}}
 return {checked:due.results.length};
 }};}
