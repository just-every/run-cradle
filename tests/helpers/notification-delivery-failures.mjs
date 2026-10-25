import assert from 'node:assert/strict'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

export async function verifyNotificationDeliveryFailures({h,page,capture,actor,setNotificationMailStatus}){
 const width=page.viewportSize().width
 const request=async(session,action,input,expected=[])=>{const r=await h.request(session,'/api/v1/commands/'+action,{method:'POST',body:JSON.stringify({commandId:createUlid(),input,expected})});assert.equal(r.status,200,`${action}: ${await r.clone().text()}`);const data=(await r.json()).data;assert.equal(data.state,'committed');return data.value}
 const command=(action,input,expected=[])=>request(actor.session,'launch.'+action,input,expected)
 const ref=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]
 const row=(table,id)=>h.db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first()
 const tick=async at=>(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at??Date.now()})
 const settings=async()=>(await(await h.request(h.ownerSession,'/api/v1/settings')).json()).data,original=await settings()
 await request(h.ownerSession,'settings.update',{version:original.version,changes:{quietHoursStart:'00:00',quietHoursEnd:'00:00'}})
 const pref=original.preferences
 await request(h.ownerSession,'preferences.update',{version:pref.version,preferences:{timezone:pref.timezone,mutedKinds:[],digestEnabled:pref.digestEnabled,progressEnabled:pref.progressEnabled}})
 await tick()
 const c=await command('campaign.create',{fields:{code:`synthetic-cradle-notify003-${width}`,name:'Visible notification delivery outcomes',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-12-01',objective:'Prove retained notices and delivery outcomes',statusSummary:'Ready',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const cases=[],start=(await h.mailMessages()).length
 try{
  for(const [status,state]of [[400,'failed'],[502,'unknown']]){
   setNotificationMailStatus(status)
   const comment=await command('comment.create',{campaignId:c.id,body:`synthetic-cradle-303 ${state} delivery`,mentions:[h.owner]},ref('campaign',c));await tick()
   const deliveries=(await h.db.prepare('SELECT d.* FROM channel_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.subject_id=?').bind(comment.id).all()).results
   assert.equal(deliveries.length,1,'NOTIFY-003 one durable delivery linked to the notification')
   const delivery=deliveries[0];assert.equal(delivery.state,state);assert.equal(delivery.attempts,1);assert.equal(delivery.receipt_id,null)
   const inbox=(await(await h.request(h.ownerSession,'/api/notifications')).json()).notifications,notice=inbox.find(n=>n.id===delivery.notification_id)
   assert.ok(notice,'NOTIFY-003 the in-app notice stays available');assert.equal(notice.subject.available,true);assert.equal(notice.deliveryState,state,'NOTIFY-003 notification exposes its actual delivery outcome')
   const listed=(await(await h.request(h.ownerSession,'/api/v1/deliveries')).json()).data.items.find(d=>d.id===delivery.id);assert.equal(listed.notificationId,notice.id);assert.equal(listed.state,state)
   assert.equal((await h.mailMessages()).filter(m=>m.custom_args?.rer_delivery_id===delivery.group_id).length,1,'NOTIFY-003 one provider-edge submission for this exact delivery')
   cases.push({state,delivery,notice})
  }
 }finally{setNotificationMailStatus(202)}
 const unknown=cases.find(c=>c.state==='unknown'),before=(await h.mailMessages()).length,at=Date.now()
 for(const minute of [1,5,15,30,60]){await tick(at+minute*60000);assert.equal((await h.mailMessages()).length,before,'NOTIFY-003 Unknown submission is never automatically resent');assert.equal((await row('channel_deliveries',unknown.delivery.id)).state,'unknown')}
 const refused=await h.request(h.ownerSession,'/api/v1/commands/delivery.retry',{method:'POST',body:JSON.stringify({commandId:createUlid(),expected:[],input:{deliveryId:unknown.delivery.id,version:(await row('channel_deliveries',unknown.delivery.id)).version}})})
 assert.equal(refused.status,409);assert.equal((await refused.json()).error.code,'invalid_transition');assert.equal((await h.mailMessages()).length,before,'NOTIFY-003 manual retry cannot resend Unknown')
 const failure=await command('automation.save',{definition:{name:`Delivery run link ${width}`,enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'request-ai-analysis',input:{campaignId:c.id}}]}})
 await command('campaign.patch',{id:c.id,changes:{statusSummary:'Create an actual failed automation notice'}},ref('campaign',c));await tick()
 const run=await h.db.prepare("SELECT * FROM automation_runs WHERE automation_id=? AND state='Failed'").bind(failure.id).first();assert.ok(run)
 const linked=await h.db.prepare('SELECT d.* FROM channel_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.subject_id=?').bind(run.id).first();assert.ok(linked);assert.equal(linked.automation_run_id,run.id,'NOTIFY-003 automation-generated email links to its actual run');assert.equal(linked.state,'accepted','NOTIFY-003 provider acceptance remains distinct from mailbox delivery');assert.notEqual(linked.state,'delivered')
 assert.equal((await h.mailMessages()).length,start+3,'NOTIFY-003 exact provider count: rejected, uncertain and accepted run notice')
 await command('automation.disable',{id:failure.id},ref('automation',await row('automations',failure.id)))
 const legacy=(await(await h.request(h.ownerSession,'/api/settings')).json()).settings.email.deliveries.items
 for(const item of cases)assert.equal(legacy.find(d=>d.id===item.delivery.id).state,item.state,'NOTIFY-003 Settings readback retains failed and Unknown records')
 await page.goto(h.origin+'/app/notifications');await page.locator(`#notification-${unknown.notice.id}`).waitFor();await capture('notify003-in-app-retained')
 await page.goto(h.origin+'/app/settings');const status=page.getByRole('heading',{name:'Delivery status',exact:true}).locator('..');await status.waitFor();await capture('notify003-delivery-status')
 for(const item of cases)assert.equal(await status.locator(`[data-delivery-id="${item.delivery.id}"]`).getByText(item.state==='unknown'?'Unknown':'Failed',{exact:true}).count(),1,`NOTIFY-003 Settings visibly identifies ${item.state} delivery`)
 const current=await settings();await request(h.ownerSession,'settings.update',{version:current.version,changes:{quietHoursStart:original.quietHours.start,quietHoursEnd:original.quietHours.end}})
 await request(h.ownerSession,'preferences.update',{version:(await settings()).preferences.version,preferences:{timezone:pref.timezone,mutedKinds:pref.mutedKinds,digestEnabled:pref.digestEnabled,progressEnabled:pref.progressEnabled}})
 await command('campaign.archive',{id:c.id},ref('campaign',await row('campaigns',c.id)));await command('campaign.delete',{id:c.id,confirmationCode:c.code},ref('campaign',await row('campaigns',c.id)))
 console.log(`NOTIFY-003 ${width}: notification/run links, failed/Unknown readback, no unsafe resend, acceptance is not delivery; bounce and safe-retry schedule remain Gaps`)
}
