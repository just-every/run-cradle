import type {RequestContext} from '../authority/ports';
import type {EntityRegistry} from '../authority/scope.server';
import {automationRecipient} from '../automations/recipients.server';
import {and,trustedPredicate} from '../admission/sql.server';
import {AdmissionError} from '../admission/errors';
import type {SqlPredicate} from '../admission/ports';

/** Revalidate a durable comment event immediately before notification delivery. */
export async function commentRecipientGuards(db:D1Database,entities:EntityRegistry|undefined,ctx:RequestContext,input:{notificationId:string;appId:string;entityId:string;recordId:string;operatorId:string}):Promise<SqlPredicate[]>{
 if(!entities)throw new AdmissionError('unconfigured','Comment notification delivery needs the current record registry.');
 const recipient=await automationRecipient(db,entities,ctx,{appId:input.appId,entityId:input.entityId,recordId:input.recordId,operatorId:input.operatorId});
 const event=trustedPredicate(`EXISTS(SELECT 1 FROM channel_events event JOIN evidence_comments comment ON comment.id=event.event_id WHERE event.notification_id=? AND event.operator_id=? AND comment.app_id=? AND comment.entity_id=? AND comment.record_id=? AND comment.deleted_at IS NULL AND EXISTS(SELECT 1 FROM json_each(comment.mentions_json) mention WHERE mention.value=?))`,[input.notificationId,input.operatorId,input.appId,input.entityId,input.recordId,input.operatorId]);
 const guard=and(recipient.guard,event);
 if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new AdmissionError('forbidden','The comment mention is no longer available to its recipient.');
 return [guard];
}
