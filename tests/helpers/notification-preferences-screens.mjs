import assert from 'node:assert/strict'
import {expect} from '@playwright/test'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'
import {notificationKinds as kinds} from '../../src/domains/channels/ports.ts'
import {verifyNotificationDeliveryMatrix} from './notification-delivery-matrix.mjs'
export async function verifyNotificationPreferencesScreens({h,page,command,capture}){
 const width=page.viewportSize().width,actor=await h.addPerson({legacy:true,name:`Notification actor ${width}`,change:rules=>rules.map(rule=>rule.effect==='allow'?{...rule,rows:{kind:'all',conditions:[]}}:rule)}),other=await h.addPerson({legacy:true,name:`Notification recipient ${width}`})
 const preferences=async session=>{const response=await h.request(session,'/api/v1/settings');assert.equal(response.status,200);return(await response.json()).data.preferences}
 const otherBefore=await preferences(other.session)
 const actorCommand=async(action,input,expected=[])=>{const response=await h.request(actor.session,`/api/v1/commands/launch.${action}`,{method:'POST',body:JSON.stringify({commandId:createUlid(),input,expected})});assert.equal(response.status,200,await response.clone().text());return(await response.json()).data.value}
 const campaign=(await command('campaign.create',{fields:{code:`MUTE-${width}`,name:'Personal notification preferences',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-01-01',objective:'Prove personal delivery preferences',statusSummary:'Ready',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})).data.value
 const expected=[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:campaign.id},version:campaign.version}]
 const open=async()=>{await page.goto(h.origin+'/app/settings');await page.locator('summary').filter({hasText:/^Your notifications$/}).click();await page.getByRole('button',{name:'Save my preferences',exact:true}).waitFor()}
 const save=async()=>{const committed=page.waitForResponse(r=>r.url().endsWith('/api/v1/commands/preferences.update')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save my preferences',exact:true}).click();const response=await committed;assert.equal(response.status(),200,await response.text());assert.equal((await response.json()).data.state,'committed');await expect(page.getByRole('button',{name:'Save my preferences',exact:true})).toBeEnabled()}
 await open()
 const muted=[]
 for(const kind of kinds){await page.getByRole('checkbox',{name:`Mute ${kind}`,exact:true}).check();muted.push(kind);await save();assert.deepEqual([...(await preferences(h.ownerSession)).mutedKinds].sort(),[...muted].sort(),`NOTIFY-007 ${kind} is independently mutable in Settings`)}
 assert.deepEqual(await preferences(other.session),otherBefore,'NOTIFY-007 Settings changes affect only their operator')
 await capture('notification-kinds-muted')
 const worker=await h.runtime.getWorker(),flush=()=>worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()})
 const deliveries=async subject=>(await h.db.prepare('SELECT d.*,n.subject_id FROM channel_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.subject_id=?').bind(subject).all()).results
 const notices=async subject=>(await h.db.prepare('SELECT * FROM notifications WHERE subject_id=?').bind(subject).all()).results
 const assertDelivery=async(subject,ownerState)=>{
  const rows=await deliveries(subject),inApp=await notices(subject),messages=await h.mailMessages()
  assert.deepEqual(inApp.map(n=>n.operator_id).sort(),[h.owner,other.id].sort(),'NOTIFY-007 both operators retain their in-app notification')
  for(const [operator,state]of [[h.owner,ownerState],[other.id,'accepted']]){const own=rows.filter(r=>r.operator_id===operator);assert.equal(own.length,1);assert.equal(own[0].state,state);assert.equal(messages.filter(m=>m.custom_args?.rer_delivery_id===own[0].group_id).length,state==='muted'?0:1,'NOTIFY-007 network-edge mail count matches the durable delivery')}
 }
 const first=await actorCommand('comment.create',{campaignId:campaign.id,body:'A muted notification remains in the inbox',mentions:[h.owner,other.id]},expected)
 await flush();await assertDelivery(first.id,'muted')
 for(const kind of kinds){await page.getByRole('checkbox',{name:`Mute ${kind}`,exact:true}).uncheck();muted.splice(muted.indexOf(kind),1);await save();assert.deepEqual([...(await preferences(h.ownerSession)).mutedKinds].sort(),[...muted].sort(),`NOTIFY-007 ${kind} can be unmuted`)}
 await capture('notification-kinds-unmuted')
 const second=await actorCommand('comment.create',{campaignId:campaign.id,body:'Unmuting restores the next email',mentions:[h.owner,other.id]},expected)
 await flush();await assertDelivery(second.id,'accepted');await assertDelivery(first.id,'muted')
 assert.deepEqual(await preferences(other.session),otherBefore,'NOTIFY-007 mute and unmute never change another operator preferences')
 await verifyNotificationDeliveryMatrix({h,actor,other,width})
 const current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(campaign.id).first()
 await command('campaign.archive',{id:campaign.id},[{ref:expected[0].ref,version:current.version}])
 const archived=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(campaign.id).first()
 await command('campaign.delete',{id:campaign.id,confirmationCode:campaign.code},[{ref:expected[0].ref,version:archived.version}])
}
