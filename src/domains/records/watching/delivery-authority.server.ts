import type {RequestContext} from '../../authority/ports';
import type {EntityRegistry} from '../../authority/scope.server';
import {watchRecipient} from './recipient.server';
import {trustedPredicate} from '../../admission/sql.server';
import {AdmissionError} from '../../admission/errors';
import type {SqlPredicate} from '../../admission/ports';
import type {WatchEvent} from './contracts';
/** Every retained item in a digest remains readable at the moment it is sent. */
export async function watchNotificationGuards(db:D1Database,entities:EntityRegistry|undefined,ctx:RequestContext,notificationId:string,operatorId:string):Promise<SqlPredicate[]>{
 if(!entities)throw new AdmissionError('unconfigured','Watch notifications require the current record registry.');
 const rows=await db.prepare('SELECT * FROM record_watch_events WHERE notification_id=? AND operator_id=? ORDER BY created_at,id').bind(notificationId,operatorId).all<WatchEvent>();
 if(!rows.results.length)throw new AdmissionError('forbidden','Watch notification no longer has its source event.');
 const guards:SqlPredicate[]=[];
 for(const event of rows.results){if(event.assignment_field_id){const enabled=fieldNoticeGuard(event.app_id,event.entity_id,event.assignment_field_id);if(!await db.prepare(`SELECT 1 WHERE ${enabled.sql}`).bind(...enabled.values).first())throw new AdmissionError('forbidden','Assignment notifications are disabled for this field.');guards.push(enabled);}
 const recipient=await watchRecipient(db,entities,ctx,{appId:event.app_id,entityId:event.entity_id,recordId:event.record_id,operatorId});if((JSON.parse(event.required_fields_json) as string[]).some(field=>!recipient.readableFields.includes(field)))throw new AdmissionError('forbidden','Notification fields are no longer readable.');guards.push(recipient.guard,trustedPredicate('EXISTS(SELECT 1 FROM record_watch_events WHERE id=? AND notification_id=? AND operator_id=?)',[event.id,notificationId,operatorId]));if(event.watch_id){const source=await db.prepare('SELECT source FROM record_watches WHERE id=?').bind(event.watch_id).first<{source:string}>();if(source?.source.startsWith('field:')){const active=fieldNoticeGuard(event.app_id,event.entity_id,source.source.slice(6));if(!await db.prepare(`SELECT 1 WHERE ${active.sql}`).bind(...active.values).first())throw new AdmissionError('forbidden','Assignment comment watching is disabled for this field.');guards.push(active);}
 const enabled=trustedPredicate('EXISTS(SELECT 1 FROM record_watches WHERE id=? AND enabled=1)',[event.watch_id]);if(!await db.prepare(`SELECT 1 WHERE ${enabled.sql}`).bind(...enabled.values).first())throw new AdmissionError('forbidden','Record is no longer watched.');guards.push(enabled);}}
 return guards;
}

export const fieldNoticeGuard=(appId:string,entityId:string,fieldId:string)=>trustedPredicate("EXISTS(SELECT 1 FROM record_schemas s,json_each(s.schema_json,'$.fields') f WHERE s.app_id=? AND s.id=? AND json_extract(f.value,'$.id')=? AND json_extract(f.value,'$.type')='person' AND COALESCE(json_extract(f.value,'$.notifyOnAdd'),1)=1)",[appId,entityId,fieldId]);
