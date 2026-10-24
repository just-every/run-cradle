import assert from 'node:assert/strict'
/** Imported seeds are inert; one reviewed bulk edit then exercises real per-minute fan-out. */
export async function recordCalendarBulk({h,worker,provider,body,call,command,deliver,drain,definitionId,appId,entityId,title,start,end}){
 const preview=await call('/api/v1/records/import-preview',{appId,entityId,csv:'Calendar title,Calendar date,Calendar end\r\n'+Array.from({length:12},(_,i)=>`synthetic-cradle-paced-${i},2026-12-01,2026-12-02`).join('\r\n')+'\r\n',mapping:[{column:'Calendar title',fieldId:title},{column:'Calendar date',fieldId:start},{column:'Calendar end',fieldId:end}],mergeFieldId:title})
 assert.equal(preview.creates,12);const ids=new Set(preview.rows.map(row=>row.id));assert.equal(ids.size,12)
 await command('records.import-commit',{previewId:preview.id})
 const bulk=(await command('record.bulk-preview',{appId,entityId,selection:{ids:[...ids]},change:{fieldId:title,value:'synthetic-cradle-paced-event'}})).value
 const committed=await command('record.bulk-commit',{previewId:bulk.id,token:bulk.token},bulk.expected)
 assert.equal(committed.state,'committed')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM record_calendar_changes WHERE command_id=? AND definition_id=?').bind(committed.commandId,definitionId).first()).n,12,'Bulk capture has exactly one pending change per selected record')
 const changes=async()=> (await h.db.prepare("SELECT count(*) n FROM record_calendar_changes WHERE command_id=? AND definition_id=? AND state='pending'").bind(committed.commandId,definitionId).first()).n
 const writes=()=>provider.writes.filter(w=>w.method==='POST'&&ids.has(body(w)?.extendedProperties?.private.cradleRecord))
 const recent=(await h.db.prepare("SELECT count(*) n FROM execution_attempts WHERE action='record.calendar.sync' AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds')").first()).n,budget=Math.max(0,10-recent)
 assert.ok(budget<12)
 for(let i=0;i<4;i++){await deliver({kind:'cradle.records.automations.v1',commandId:committed.commandId});await drain()}
 assert.equal(writes().length,budget,'Only the remaining ten-per-minute capacity starts calendar effects')
 assert.ok(await changes()>0,'The rest of the bulk edit remains durably pending')
 const last=(await h.db.prepare("SELECT MAX(created_at) created_at FROM execution_attempts WHERE action='record.calendar.sync'").first()).created_at
 const delay=Math.max(0,Date.parse(last)+60100-Date.now());assert.ok(delay<=61000)
 console.log('CALENDAR_BULK_PACING waiting for the next real minute window')
 await new Promise(resolve=>setTimeout(resolve,delay))
 for(let i=0;i<4&&await changes();i++){assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()})).outcome,'ok');await drain()}
 assert.equal(await changes(),0);assert.equal(writes().length,12)
 assert.equal(new Set(writes().map(w=>body(w).extendedProperties.private.cradleRecord)).size,12,'Every selected record has one event, with no duplicate generation')
 const count=provider.writes.length;await deliver({kind:'cradle.records.automations.v1',commandId:committed.commandId});await drain();assert.equal(provider.writes.length,count,'Duplicate bulk delivery starts no duplicate effect')
}
