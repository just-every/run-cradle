import assert from 'node:assert/strict'
import {verifyNotificationInAppClauses} from './notification-in-app-clauses.mjs'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'
export async function verifyNotificationEventScreens({h,page,command,capture}){
 await verifyNotificationInAppClauses({h,page,capture})
 const width=page.viewportSize().width,actor=await h.addPerson({legacy:true,name:`Event author ${width}`,change:rules=>rules.map(rule=>rule.effect==='allow'?{...rule,rows:{kind:'all',conditions:[]}}:rule)}),other=await h.addPerson({legacy:true,name:`Event recipient ${width}`})
 const ref=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]
 const actorCommand=async(action,input,expected=[],commandId=createUlid())=>{const response=await h.request(actor.session,`/api/v1/commands/launch.${action}`,{method:'POST',body:JSON.stringify({commandId,input,expected})});assert.equal(response.status,200,await response.clone().text());return(await response.json()).data.value}
 const campaign=(await command('campaign.create',{fields:{code:`EVENT-${width}`,name:'One notification per event',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-01-01',objective:'Prove event recipient identity',statusSummary:'Ready',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})).data.value
 // The event author can read every referenced subject on replay even though the recipient holds all three decision roles.
 const eventId=createUlid(),input={fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'One person holds three decision roles',requesterId:h.owner,assigneeId:h.owner,priority:'High',dueAt:'2027-01-01T12:00:00.000Z',recommendation:'Review once',impact:'Notification identity'}}
 const decision=await actorCommand('decision.create',input,[],eventId)
 const roles=await h.db.prepare('SELECT c.owner_id,d.requester_id,d.assignee_id FROM decisions d JOIN campaigns c ON c.id=d.campaign_id WHERE d.id=?').bind(decision.id).first()
 assert.deepEqual(roles,{owner_id:h.owner,requester_id:h.owner,assignee_id:h.owner},'NOTIFY-006 one recipient holds campaign-owner, requester and assignee roles on the same event')
 const worker=await h.runtime.getWorker(),flush=()=>worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()})
 const notices=async subject=>(await h.db.prepare('SELECT n.*,c.last_event_at FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.subject_id=?').bind(subject).all()).results
 const deliveries=async subject=>(await h.db.prepare('SELECT d.* FROM channel_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.subject_id=?').bind(subject).all()).results
 const oneMail=async row=>{assert.equal(row.state,'accepted');assert.equal((await h.mailMessages()).filter(m=>m.custom_args?.rer_delivery_id===row.group_id).length,1,'NOTIFY-006 exactly one network-edge email for the event recipient')}
 await flush()
 const first=await notices(decision.id),firstDeliveries=await deliveries(decision.id)
 assert.equal(first.length,1);assert.equal(first[0].operator_id,h.owner);assert.equal(firstDeliveries.length,1);await oneMail(firstDeliveries[0])
 // Retained launch creation audits include an entity marker that is not a readable field.
 // Its replay must fail closed; this is separate from the repeated product event below.
 const replay=await h.request(actor.session,'/api/v1/commands/launch.decision.create',{method:'POST',body:JSON.stringify({commandId:eventId,input,expected:[]})})
 assert.equal(replay.status,403,'Current field-read authority refuses the retained entity audit marker')
 await flush()
 assert.deepEqual(await notices(decision.id),first,'NOTIFY-006 a refused command replay creates no second in-app notice')
 assert.deepEqual(await deliveries(decision.id),firstDeliveries,'NOTIFY-006 a refused command replay creates no second email delivery');await oneMail(firstDeliveries[0])
 await page.goto(h.origin+'/app/notifications');await page.locator(`#notification-${first[0].id}`).waitFor();await capture('notification-duplicate-roles')
 const repeatedEvent=createUlid()
 await actorCommand('decision.assign',{id:decision.id,assigneeId:h.owner},ref('decision',decision),repeatedEvent);await flush()
 const repeated=await notices(decision.id)
 assert.equal(repeated.length,1,'NOTIFY-006 a repeated event within 60 minutes retains one unread notice');assert.equal(repeated[0].id,first[0].id)
 assert.equal(repeated[0].version,first[0].version+1,'NOTIFY-006 the existing unread notice is updated')
 assert.ok(repeated[0].last_event_at>=first[0].last_event_at&&repeated[0].last_event_at-first[0].last_event_at<60*60000)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM notification_reads WHERE notification_id=?').bind(first[0].id).first()).n,0)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_events WHERE operator_id=? AND event_id IN (?,?)').bind(h.owner,eventId,repeatedEvent).first()).n,2,'NOTIFY-006 two distinct event-ledger entries share the updated notice')
 assert.deepEqual(await deliveries(decision.id),firstDeliveries,'NOTIFY-006 unread coalescing keeps the original one-email delivery');await oneMail(firstDeliveries[0])
 await page.reload();await page.locator(`#notification-${first[0].id}`).waitFor();await capture('notification-unread-coalesced')
 const beforeSelfMail=(await h.mailMessages()).length,currentCampaign=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(campaign.id).first()
 const comment=await actorCommand('comment.create',{campaignId:campaign.id,body:'Self action reaches only the other recipients',mentions:[actor.id,h.owner,other.id]},ref('campaign',currentCampaign));await flush()
 const mentioned=await notices(comment.id),mentionedDeliveries=await deliveries(comment.id)
 assert.deepEqual(mentioned.map(n=>n.operator_id).sort(),[h.owner,other.id].sort(),'NOTIFY-006 the actor receives no in-app notice while both other operators do')
 assert.deepEqual(mentionedDeliveries.map(n=>n.operator_id).sort(),[h.owner,other.id].sort(),'NOTIFY-006 the actor receives no email delivery while both other operators do')
 for(const row of mentionedDeliveries)await oneMail(row)
 const actorEmail=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(actor.id).first()).email
 assert.equal((await h.mailMessages()).slice(beforeSelfMail).flatMap(m=>m.personalizations.flatMap(p=>p.to)).filter(r=>r.email===actorEmail).length,0,'NOTIFY-006 the network edge sends the actor no email for their own action')
 await page.reload();await page.locator(`#notification-${mentioned.find(n=>n.operator_id===h.owner).id}`).waitFor();await capture('notification-self-action-suppressed')
 const currentDecision=await h.db.prepare('SELECT id,version FROM decisions WHERE id=?').bind(decision.id).first()
 await command('decision.outcome',{id:decision.id,outcome:'Cancelled',rationale:'Acceptance complete'},ref('decision',currentDecision))
 await command('campaign.archive',{id:campaign.id},ref('campaign',await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(campaign.id).first()))
 await command('campaign.delete',{id:campaign.id,confirmationCode:campaign.code},ref('campaign',await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(campaign.id).first()))
}
