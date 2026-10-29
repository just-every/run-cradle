import type {Ref} from '../../../contracts/primitives';
import type {RequestContext} from '../../authority/ports';
import {trustedPredicate} from '../../admission/sql.server';
import {effects,removeRows,updateRows} from '../../lifecycle/changes.server';
/** A record erasure retires every private notification copy of that record. */
export async function eraseWatchSubject(db:D1Database,ctx:RequestContext,ref:Ref){
 const result=effects();if(!await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='record_watch_events'").first())return result;
 const values=[ref.appId,ref.entityId,ref.recordId],where='app_id=? AND entity_id=? AND record_id=?';
 const absent=trustedPredicate("NOT EXISTS(SELECT 1 FROM record_watch_events WHERE app_id=? AND entity_id=? AND record_id=?) AND NOT EXISTS(SELECT 1 FROM record_watches WHERE app_id=? AND entity_id=? AND target_kind='record' AND target_id=?)",[...values,...values]);
 if(await db.prepare(`SELECT 1 WHERE ${absent.sql}`).bind(...absent.values).first()){result.guards.push(absent);return result;}
 const notices=(await db.prepare('SELECT DISTINCT notification_id FROM record_watch_events WHERE '+where+' AND notification_id IS NOT NULL').bind(...values).all<{notification_id:string}>()).results.map(row=>row.notification_id),ids=JSON.stringify(notices);
 await updateRows(db,result,'channel_deliveries',{state:'cancelled',updated_at:Date.parse(ctx.now)},"notification_id IN (SELECT value FROM json_each(?)) AND state IN ('held','queued','muted')",[ids]);
 await updateRows(db,result,'record_watch_chat_deliveries',{state:'cancelled',updated_at:Date.parse(ctx.now)},"notification_id IN (SELECT value FROM json_each(?)) AND state='queued'",[ids]);
 await updateRows(db,result,'notifications',{title:'Notification unavailable',body:'',unavailable:1,updated_at:Date.parse(ctx.now)},'id IN (SELECT value FROM json_each(?))',[ids]);
 await removeRows(db,result,'record_watch_events',where,values);
 await updateRows(db,result,'record_watches',{enabled:0,updated_at:Date.parse(ctx.now)},"app_id=? AND entity_id=? AND target_kind='record' AND target_id=?",values);
 return result;
}
