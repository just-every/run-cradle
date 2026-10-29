import type {RequestContext} from '../../authority/ports';
import type {WatchDependencies} from './service.server';
import type {WatchEvent,WatchEffects} from './contracts';
import {watchEvents} from './tables.server';
import {watchRecipient} from './recipient.server';
import {trustedPredicate} from '../../admission/sql.server';
import {notificationContext,notificationPrincipalGuard} from '../../channels/notification-authority.server';
import {canonicalHash} from '../../admission/canonical';
import {createUlid} from '../../../core/shared/ids';
import {unavailable} from './notices.server';
export function createWatchDigest(d:WatchDependencies,emit:(ctx:RequestContext,event:WatchEvent,guards:WatchEffects['guards'])=>Promise<WatchEffects>){return async(now=Date.now())=>{
 const due=await d.db.prepare('SELECT * FROM record_watch_events WHERE mode=\'daily\' AND completed_at IS NULL AND due_at<=? ORDER BY due_at,id LIMIT 1000').bind(now).all<WatchEvent>(),groups=new Map<string,WatchEvent[]>();
 for(const event of due.results){const key=[event.operator_id,event.due_at,event.channels_json].join(':');groups.set(key,[...(groups.get(key)??[]),event]);}
 for(const events of groups.values()){
  const commandId=createUlid(),ctx=await notificationContext(d.db,commandId,'schedule',now),guards:WatchEffects['guards']=[],valid:WatchEvent[]=[];
  for(const event of events){let readable=false;try{const recipient=await watchRecipient(d.db,d.entities,ctx,{appId:event.app_id,entityId:event.entity_id,recordId:event.record_id,operatorId:event.operator_id});const enabled=event.watch_id?await d.db.prepare('SELECT version FROM record_watches WHERE id=? AND enabled=1').bind(event.watch_id).first<{version:number}>():null;if((!event.watch_id||enabled)&&(JSON.parse(event.required_fields_json) as string[]).every(field=>recipient.readableFields.includes(field))){guards.push(recipient.guard);if(enabled)guards.push(trustedPredicate('EXISTS(SELECT 1 FROM record_watches WHERE id=? AND enabled=1 AND version=?)',[event.watch_id,enabled.version]));readable=true;}}catch(error){if(!unavailable(error))throw error;}if(readable)valid.push(event);}
  const effects:WatchEffects={guards,mutations:[]};
  if(valid.length){const first=valid[0]!,digest:WatchEvent={...first,id:commandId,event_id:'watch-digest:'+commandId,title:'Daily watched changes',body:valid.map(event=>`${event.title}\n${event.body}`).join('\n\n'),created_at:now,due_at:now,completed_at:now,notification_id:null};const sent=await emit(ctx,digest,guards);effects.guards.push(...sent.guards);effects.mutations.push(...sent.mutations);for(const event of valid)event.notification_id=digest.notification_id;}
  for(const event of events){effects.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM record_watch_events WHERE id=? AND completed_at IS NULL)',[event.id]));effects.mutations.push({kind:'update',table:watchEvents,set:{completed_at:now,notification_id:event.notification_id},where:trustedPredicate('id=? AND completed_at IS NULL',[event.id]),expectedRows:1});}
  const action='record.watch.digest',system=notificationPrincipalGuard(ctx.principal.authenticationEpoch);
  await d.admission.commit(ctx,{commandId,appId:events[0]!.app_id,action,canonicalInputHash:await canonicalHash({ids:events.map(e=>e.id)}),permit:{actor:{id:ctx.principal.id,kind:'system'},action,appId:events[0]!.app_id,grantId:null,grantVersion:null,policyVersion:1,validUntil:ctx.principal.expiresAt,guards:[system],reservationMutations:[],reservationIds:[]},guards:effects.guards,mutations:effects.mutations,audit:[],events:[],outbox:[],committedResult:{delivered:valid.length}});
 }
 return {digests:groups.size};
};}
