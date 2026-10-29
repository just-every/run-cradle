import type {Ref} from '../../../contracts/primitives';
import type {RequestContext} from '../../authority/ports';
import type {SqlScalar} from '../../admission/ports';
import type {RecordRow,View} from '../contracts';
import type {WatchDependencies} from './service.server';
import type {Assignment,WatchEffects,WatchEvent,WatchRow,WatchChannel} from './contracts';
import {watchEvents,chatDeliveries} from './tables.server';
import {watchRecipient} from './recipient.server';
import {createChannelsIntegration} from '../../channels/integration.server';
import {trustedPredicate} from '../../admission/sql.server';
import {createUlid} from '../../../core/shared/ids';
import {localParts} from '../../channels/clock';
import {matchesFilter} from '../evaluated-query';
import {filterFields} from '../filter.server';
import {notificationContext,notificationPrincipalGuard} from '../../channels/notification-authority.server';
import {canonicalHash} from '../../admission/canonical';
import {createWatchDigest} from './digest.server';
const empty=():WatchEffects=>({guards:[],mutations:[]});
export const unavailable=(error:unknown)=>error instanceof Error&&'code'in error&&['forbidden','not_found','grant_expired','grant_revoked'].includes(String(error.code));
export function createWatchNotices(d:WatchDependencies){
 const {db}=d;
 async function nextDaily(now:number,operatorId:string){const prefs=await db.prepare('SELECT timezone FROM channel_preferences WHERE operator_id=?').bind(operatorId).first<{timezone:string|null}>(),settings=await db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first<{timezone:string}>(),zone=prefs?.timezone??settings?.timezone??'UTC',date=localParts(now,zone).date;let next=Math.floor(now/60000)*60000+60000;for(let i=0;i<3000;i++,next+=60000)if(localParts(next,zone).date!==date)return next;throw new Error('Daily digest has no next local date.');}
 async function emit(ctx:RequestContext,event:WatchEvent,guards:WatchEffects['guards']):Promise<WatchEffects>{
  const effects=empty(),channels=JSON.parse(event.channels_json) as WatchChannel[],notice=await createChannelsIntegration(db,async()=>({guards,title:event.title,body:event.body})).notification(ctx,{kind:event.kind,operatorId:event.operator_id,campaignId:null,appId:event.app_id,subjectType:event.entity_id,subjectId:event.record_id,eventId:event.event_id,actorId:null,delivery:channels.includes('email')?'email':'in-app'});
  effects.guards.push(...notice.guards);effects.mutations.push(...notice.mutations);
  if(!notice.notificationId)return effects;
  event.notification_id=notice.notificationId;
  const retained=await db.prepare('SELECT 1 FROM notifications WHERE id=?').bind(notice.notificationId).first();
  for(const provider of retained?[]:channels.filter(c=>['slack','teams','nook'].includes(c)))effects.mutations.push({kind:'insert',table:chatDeliveries,row:{id:createUlid(),notification_id:notice.notificationId,operator_id:event.operator_id,provider,state:'queued',created_at:Date.parse(ctx.now),updated_at:Date.parse(ctx.now),provider_receipt:null}});
  return effects;
 }
 async function add(ctx:RequestContext,input:Assignment&{watch?:WatchRow;kind:'field-assigned'|'record-watch';channels?:WatchChannel[];body?:string;title?:string}):Promise<WatchEffects>{
  const effects=empty();if(input.operatorId===(ctx.principal.humanId??ctx.principal.id))return effects;
  if(await db.prepare('SELECT 1 FROM record_watch_events WHERE event_id=? AND operator_id=?').bind(input.eventId,input.operatorId).first())return effects;
  let recipient;try{recipient=await watchRecipient(db,d.entities,ctx,{...input.ref,operatorId:input.operatorId,proposedRow:input.proposedRow});}catch(error){if(unavailable(error))return effects;throw error;}
  if(input.kind==='field-assigned'&&!recipient.readableFields.includes(input.fieldId))return effects;
  const descriptor=d.descriptors.get(input.ref.appId,input.ref.entityId),primary=descriptor.schema.primaryFieldId??descriptor.schema.fields.find(f=>f.type==='text')?.id,label=primary&&recipient.readableFields.includes(primary)?input.recordLabel:'a record',href=new URL(`/app/records/${input.ref.appId}/${input.ref.entityId}/${input.ref.recordId}`,d.appOrigin).href;
  const channels=input.channels??(input.watch?JSON.parse(input.watch.channels_json) as WatchChannel[]:['in-app','email']),mode=input.kind==='field-assigned'?'immediate':input.watch?.mode??'immediate',now=Date.parse(ctx.now);
  const event:WatchEvent={id:createUlid(),event_id:input.eventId,operator_id:input.operatorId,app_id:input.ref.appId,entity_id:input.ref.entityId,record_id:input.ref.recordId,watch_id:input.watch?.id??null,assignment_field_id:input.kind==='field-assigned'?input.fieldId:null,actor_id:ctx.principal.humanId??ctx.principal.id,kind:input.kind,mode,channels_json:JSON.stringify(channels),title:input.title??(input.kind==='field-assigned'?'You were added to a user field':'A watched record changed'),body:input.body??(input.kind==='field-assigned'?`${input.actorLabel} added you to ${input.fieldLabel} on ${label}. Open record: ${href}`:`${label} changed. Open record: ${href}`),required_fields_json:JSON.stringify([...(primary&&recipient.readableFields.includes(primary)?[primary]:[]),...(input.kind==='field-assigned'?[input.fieldId]:[])]),notification_id:null,created_at:now,due_at:mode==='daily'?await nextDaily(now,input.operatorId):now,completed_at:mode==='daily'?null:now};
  const guards=[recipient.guard];if(input.watch)guards.push(trustedPredicate('EXISTS(SELECT 1 FROM record_watches WHERE id=? AND version=? AND enabled=1)',[input.watch.id,input.watch.version]));
  effects.guards.push(...guards,trustedPredicate('NOT EXISTS(SELECT 1 FROM record_watch_events WHERE event_id=? AND operator_id=?)',[input.eventId,input.operatorId]));
  if(mode==='immediate'){const result=await emit(ctx,event,guards);effects.guards.push(...result.guards);effects.mutations.push(...result.mutations);}
  effects.mutations.push({kind:'insert',table:watchEvents,row:event});return effects;
 }
 async function prepareAssignment(ctx:RequestContext,input:Assignment){const own=await db.prepare("SELECT channels_json FROM record_watches WHERE operator_id=? AND app_id=? AND entity_id=? AND source='manual' AND enabled=1 ORDER BY CASE target_kind WHEN 'record' THEN 0 WHEN 'view' THEN 1 ELSE 2 END LIMIT 1").bind(input.operatorId,input.ref.appId,input.ref.entityId).first<{channels_json:string}>();const channels:WatchChannel[]=own?JSON.parse(own.channels_json):['in-app','email'];return add(ctx,{...input,kind:'field-assigned',channels:[...new Set<WatchChannel>([...(['in-app','email'] as WatchChannel[]),...channels.filter(c=>['slack','teams','nook'].includes(c))])]});}
 async function prepareChange(ctx:RequestContext,input:{ref:Ref;eventId:string;recordLabel:string;kind:'change'|'comment';record?:RecordRow;proposedRow?:Record<string,SqlScalar>;excludeOperatorIds?:string[]}):Promise<WatchEffects>{
  const effects=empty(),rows=await db.prepare(`SELECT * FROM record_watches WHERE app_id=? AND entity_id=? AND enabled=1 AND (target_kind='table' OR target_kind='view' OR (target_kind='record' AND target_id=?)) ORDER BY CASE source WHEN 'manual' THEN 0 ELSE 1 END,CASE target_kind WHEN 'record' THEN 0 WHEN 'view' THEN 1 ELSE 2 END,id`).bind(input.ref.appId,input.ref.entityId,input.ref.recordId).all<WatchRow>(),seen=new Set<string>();
  for(const watch of rows.results){if(seen.has(watch.operator_id)||input.excludeOperatorIds?.includes(watch.operator_id))continue;
   if(watch.source.startsWith('field:')&&(input.kind==='change'||d.descriptors.get(input.ref.appId,input.ref.entityId).fields.get(watch.source.slice(6))?.field.notifyOnAdd===false))continue;
   if(watch.target_kind==='view'){const row=await db.prepare("SELECT definition_json,owner_id,visibility FROM record_views WHERE id=? AND app_id=? AND entity_id=? AND visibility<>'deleted'").bind(watch.target_id,input.ref.appId,input.ref.entityId).first<{definition_json:string;owner_id:string;visibility:string}>();if(!row||row.visibility==='private'&&row.owner_id!==watch.principal_id||!input.record)continue;const view=JSON.parse(row.definition_json) as View;let recipient;try{recipient=await watchRecipient(db,d.entities,ctx,{...input.ref,operatorId:watch.operator_id,proposedRow:input.proposedRow});}catch(error){if(unavailable(error))continue;throw error;}if(filterFields(view.filter).some(id=>!recipient.readableFields.includes(id)))continue;if(!matchesFilter(input.record,view.filter,new Set(d.descriptors.get(input.ref.appId,input.ref.entityId).schema.fields.filter(f=>f.type==='number').map(f=>f.id)),ctx.now))continue;}
   seen.add(watch.operator_id);const descriptor=d.descriptors.get(input.ref.appId,input.ref.entityId),primary=descriptor.schema.primaryFieldId??descriptor.schema.fields.find(f=>f.type==='text')?.id;
   const result=await add(ctx,{ref:input.ref,fieldId:primary??'',fieldLabel:'',actorLabel:'',operatorId:watch.operator_id,eventId:'watch:'+input.eventId,recordLabel:input.recordLabel,proposedRow:input.proposedRow,watch,kind:'record-watch',title:input.kind==='comment'?'A watched record has a new comment':undefined});effects.guards.push(...result.guards);effects.mutations.push(...result.mutations);
  }return effects;
 }
 async function prepareComment(ctx:RequestContext,ref:Ref,eventId:string,excludeOperatorIds:string[]=[]){const scope=await d.policy.scope(ctx,{appId:ref.appId,entityId:ref.entityId,purpose:'read'}),record=(await d.reader.get(ctx,scope,ref)).record,descriptor=d.descriptors.get(ref.appId,ref.entityId),primary=descriptor.schema.primaryFieldId??descriptor.schema.fields.find(f=>f.type==='text')?.id,cell=primary?record.fields[primary]:undefined;return prepareChange(ctx,{ref,eventId,kind:'comment',record,recordLabel:cell?.state==='value'?String(cell.value??'Untitled record'):'a record',excludeOperatorIds});}
 return {prepareAssignment,prepareChange,prepareComment,scheduled:createWatchDigest(d,emit)};
}
