import './helpers/typescript-loader.mjs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {recordWatchFixture} from './helpers/record-watch-fixture.mjs'
import {assignmentNotificationDoors} from './helpers/assignment-notification-doors.mjs'
import {recordWatchDeliveryJourney} from './helpers/record-watch-delivery.mjs'
import {recordWatchBrowser} from './helpers/record-watch-browser.mjs'
import {createUlid} from '../src/core/shared/ids.ts'

test('Assignment and watch journeys notify recipients once, preserve silence and enforce current read authority',async()=>{
 const h=await recordWatchFixture()
 try{
  const assigned=await h.create({[h.title.id]:'Assigned native work',[h.person.id]:h.assignee})
  const inbox=()=>h.call('/api/v1/notifications',undefined,h.reader),notices=()=>h.db.prepare("SELECT n.*,c.event_kind FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.operator_id=? AND c.app_id=? ORDER BY n.created_at,n.id").bind(h.assignee,h.appId).all()
  let rows=(await notices()).results;assert.equal(rows.length,1);assert.match(rows[0].body,/Assigned native work/);assert.match(rows[0].body,/Assignee/);assert.match(rows[0].body,/Records Owner/)
  let shown=await inbox();assert.equal(shown.items.length,1);assert.equal(shown.items[0].subject.available,true);assert.equal((await fetch(h.origin+shown.items[0].subject.href,{headers:{cookie:h.reader}})).status,200)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_deliveries WHERE notification_id=?').bind(rows[0].id).first()).n,1)
  await h.patch(assigned,{[h.person.id]:h.assignee});assert.equal((await notices()).results.length,1)
  const bulk=await h.command('record.bulk-preview',{appId:h.appId,entityId:h.entityId,selection:{ids:[assigned.id]},change:{fieldId:h.person.id,value:h.assignee}})
  await h.command('record.bulk-commit',{previewId:bulk.previewId??bulk.id,token:bulk.token});assert.equal((await notices()).results.length,1)
  await h.create({[h.title.id]:'Self assigned work',[h.person.id]:h.owner});assert.equal((await h.db.prepare("SELECT count(*) n FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.operator_id=? AND c.event_kind='field-assigned' AND c.app_id=?").bind(h.owner,h.appId).first()).n,0)
  await h.comment(assigned,'A comment for the assigned reader');rows=(await notices()).results;assert.equal(rows.length,2);assert.equal(rows[1].event_kind,'record-watch')
  const target={appId:h.appId,entityId:h.entityId,recordId:assigned.id}
  await h.call('/api/v1/watches',{...target,enabled:true,mode:'immediate',channels:['in-app','email']},h.reader,'PUT')
  await h.command('notification.read-all',{through:new Date().toISOString()},[],h.reader)
  await h.patch(assigned,{[h.person.id]:null});await h.command('notification.read-all',{through:new Date().toISOString()},[],h.reader);await h.comment(assigned,'Separate manual watch remains');assert.equal((await notices()).results.length,4)
  await h.call('/api/v1/watches',{...target,enabled:false,mode:'immediate',channels:['in-app','email']},h.reader,'PUT')
  await h.comment(assigned,'Explicitly unwatched');assert.equal((await notices()).results.length,4)
  await h.patch(assigned,{[h.person.id]:h.assignee});await h.call('/api/v1/watches',{...target,enabled:false,mode:'immediate',channels:['in-app','email']},h.reader,'PUT');const mutedCount=(await notices()).results.length
  await h.comment(assigned,'Explicit unwatch overrides automatic watching');assert.equal((await notices()).results.length,mutedCount)
  const view=await h.command('view.save',{view:{appId:h.appId,entityId:h.entityId,name:'Assigned work',display:'grid',fields:h.schema.fields.map(f=>f.id),filter:{kind:'condition',fieldId:h.person.id,op:'eq',value:h.assignee},sort:[],groupBy:[],layout:{titleFieldId:h.title.id},visibility:'app',shipped:false}})
  await h.call('/api/v1/watches',{appId:h.appId,entityId:h.entityId,viewId:view.id,enabled:true,mode:'immediate',channels:['in-app','email']},h.reader,'PUT')
  await h.command('notification.read-all',{through:new Date().toISOString()},[],h.reader)
  await h.patch(assigned,{[h.note.id]:'A watched view change'});assert.equal((await notices()).results.length,mutedCount+1)
  const unrelated=await h.create({[h.title.id]:'Outside saved view'});await h.patch(unrelated,{[h.note.id]:'Must not reach filtered watcher'});assert.equal((await notices()).results.length,mutedCount+1)
  await h.call('/api/v1/watches',{appId:h.appId,entityId:h.entityId,enabled:true,mode:'immediate',channels:['in-app','email']},h.reader,'PUT')
  await h.patch(unrelated,{[h.note.id]:'A table watch change'});assert.equal((await notices()).results.length,mutedCount+2)
  const sameEventCount=(await notices()).results.length;await h.patch(unrelated,{[h.note.id]:'Another ordinary table change'});assert.equal((await notices()).results.length,sameEventCount,'Unread repeat events coalesce within the hour')
  await h.patch(unrelated,{[h.note.id]:'My own change'},h.reader);assert.equal((await notices()).results.length,mutedCount+2)
  const csv='Work item,Assignee\nSilent import,'+h.assignee,preview=await h.call('/api/v1/records/import-preview',{appId:h.appId,entityId:h.entityId,csv,mapping:[{column:'Work item',fieldId:h.title.id},{column:'Assignee',fieldId:h.person.id}],mergeFieldId:h.title.id})
  await h.call('/api/v1/commands/records.import-commit',{commandId:createUlid(),expected:[],input:{previewId:preview.id}});assert.equal((await notices()).results.length,mutedCount+2)
  const chosen=await h.call('/api/v1/records/import-preview',{appId:h.appId,entityId:h.entityId,csv:csv.replace('Silent import','Chosen import'),mapping:[{column:'Work item',fieldId:h.title.id},{column:'Assignee',fieldId:h.person.id}],mergeFieldId:h.title.id,notifications:true})
  await h.call('/api/v1/commands/records.import-commit',{commandId:createUlid(),expected:[],input:{previewId:chosen.id}});assert.equal((await notices()).results.filter(n=>n.event_kind==='field-assigned').length,3)
  await recordWatchBrowser(h,assigned)
  await assignmentNotificationDoors(h)
  const removal=await h.create({[h.title.id]:'Removed assignee work',[h.person.id]:h.other});await h.patch(removal,{[h.person.id]:null});const otherEvents=async()=>(await h.db.prepare('SELECT count(*) n FROM record_watch_events WHERE operator_id=? AND record_id=?').bind(h.other,removal.id).first()).n;const removedCount=await otherEvents();await h.comment(removal,'Removed assignee is not watching');assert.equal(await otherEvents(),removedCount)
  const optionOff=await h.create({[h.title.id]:'Disabled notices work',[h.person.id]:h.other}),offBefore=(await h.db.prepare('SELECT count(*) n FROM record_watch_events WHERE operator_id=?').bind(h.other).first()).n
  const configuration=await h.call(`/api/v1/records/bases/${h.appId}`);configuration.tables[0].fields.find(field=>field.id===h.person.id).notifyOnAdd=false;const offPreview=await h.call('/api/v1/records/schema-preview',configuration);await h.command('release.adopt',{kind:'manual_schema',previewId:offPreview.id})
  await h.comment(optionOff,'Field option off stops comment watching');await h.create({[h.title.id]:'No new assignment notice',[h.person.id]:h.other});assert.equal((await h.db.prepare('SELECT count(*) n FROM record_watch_events WHERE operator_id=?').bind(h.other).first()).n,offBefore)
  const beforeRevocation=(await notices()).results.length
  await h.db.prepare("UPDATE authority_memberships SET state='revoked',version=version+1 WHERE app_id=? AND principal_id=?").bind(h.appId,h.assignee).run()
  await h.comment(assigned,'After reader revocation');await h.patch(unrelated,{[h.note.id]:'Revoked reader stops',[h.person.id]:h.assignee});assert.equal((await notices()).results.length,beforeRevocation)
  shown=await inbox();assert.ok(shown.items.every(n=>!n.subject.available));assert.ok(shown.items.every(n=>!n.body.includes('Assigned native work')))
  const memberVersion=async()=>(await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(h.assignee).first()).version
  await h.command('member.remove',{memberId:h.assignee,reason:'Synthetic privacy request'},[{ref:{appId:h.appId,entityId:'00000000000000000000000101',recordId:h.assignee},version:await memberVersion()}])
  await h.command('member.erase',{memberId:h.assignee,reason:'Synthetic privacy request'},[{ref:{appId:h.appId,entityId:'00000000000000000000000101',recordId:h.assignee},version:await memberVersion()}])
  for(const table of ['record_watches','record_watch_events','record_watch_chat_deliveries'])assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${table} WHERE operator_id=?`).bind(h.assignee).first()).n,0,'Erasure removes private watch custody')
  const replay=await h.request('/api/v1/watches',{...target,enabled:true,mode:'immediate',channels:['in-app']},h.reader,'PUT');assert.ok([401,403].includes(replay.status))
 }finally{await h.close()}
 await recordWatchDeliveryJourney()
})
