import type {WatchChannel,WatchEvent} from './contracts';
/** A daily mail or private chat contains only the items chosen for that channel. */
export async function watchChannelContent(db:D1Database,notificationId:string,operatorId:string,channel:WatchChannel){
 const notice=await db.prepare("SELECT title,body FROM notifications WHERE id=? AND operator_id=? AND unavailable=0 AND kind IN ('field-assigned','record-watch')").bind(notificationId,operatorId).first<{title:string;body:string}>();if(!notice)return null;
 const events=await db.prepare('SELECT * FROM record_watch_events WHERE notification_id=? AND operator_id=? ORDER BY created_at,id').bind(notificationId,operatorId).all<WatchEvent>();
 const selected=(notice.title==='Daily watched changes'?events.results:events.results.slice(-1)).filter(event=>(JSON.parse(event.channels_json) as string[]).includes(channel));
 if(!selected.length)return null;
 return {title:notice.title,body:notice.title==='Daily watched changes'?selected.map(event=>`${event.title}\n${event.body}`).join('\n\n'):notice.body};
}
