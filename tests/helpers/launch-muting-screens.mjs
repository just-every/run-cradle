import assert from 'node:assert/strict'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'
import {notificationKinds} from '../../src/domains/channels/ports.ts'

export async function verifyMutingScreens({h,page,command,capture}){
 const width=page.viewportSize().width
 const reviewer=await h.addPerson({legacy:true,name:`Lena Reviewer ${width}`}),actor=await h.addPerson({legacy:true,name:`Jonah Sender ${width}`})
 const read=async(session,path)=>{const response=await h.request(session,path);assert.equal(response.status,200,await response.clone().text());return response.json()}
 const create=async(action,input,expected=[])=>(await command(action,input,expected)).data.value
 const ref=row=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:row.id},version:row.version}]
 const campaign=await create('campaign.create',{fields:{code:`MUTING-${width}`,name:'Supplier notification review',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-01-01',objective:'Review notification delivery',statusSummary:'Ready for review',phase:'Planning',status:'On track',health:60,budgetMinor:10000,spendMinor:2500,tags:[],customFields:{}}})
 const settings=(await read(h.ownerSession,'/api/v1/settings')).data
 const settingsResponse=await h.request(h.ownerSession,'/api/v1/commands/settings.update',{method:'POST',body:JSON.stringify({commandId:createUlid(),expected:[],input:{version:settings.version,changes:{quietHoursStart:'00:00',quietHoursEnd:'00:00'}}})})
 assert.equal(settingsResponse.status,200,await settingsResponse.clone().text())
 const otherPreferences=(await read(reviewer.session,'/api/v1/preferences')).data
 await page.goto(`${h.origin}/app/settings`)
 await page.locator('summary').filter({hasText:/^Your notifications$/}).click()
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Your notifications',exact:true})})
 for(const kind of notificationKinds)await form.getByLabel(`Mute ${kind.replaceAll('-',' ')} email`,{exact:true}).waitFor()
 await form.getByLabel('Mute comment mentioned email',{exact:true}).check()
 const saving=page.waitForResponse(response=>response.url().endsWith('/api/v1/commands/preferences.update')&&response.request().method()==='POST')
 await form.getByRole('button',{name:'Save my preferences',exact:true}).click()
 const saved=await saving;assert.equal(saved.status(),200,await saved.text());assert.equal((await saved.json()).data.state,'committed')
 await page.reload();await page.locator('summary').filter({hasText:/^Your notifications$/}).click();await form.getByLabel('Mute comment mentioned email',{exact:true}).waitFor()
 assert.equal(await form.getByLabel('Mute comment mentioned email',{exact:true}).isChecked(),true,'NOTIFY-007 saved mute survives reopening settings')
 await capture('clause-muting-preferences')
 assert.deepEqual((await read(reviewer.session,'/api/v1/preferences')).data,otherPreferences,'NOTIFY-007 personal muting leaves another operator preferences unchanged')
 const actorCommand=async(action,input,expected=[])=>{const response=await h.request(actor.session,`/api/v1/commands/launch.${action}`,{method:'POST',body:JSON.stringify({commandId:createUlid(),expected,input})});assert.equal(response.status,200,await response.clone().text());return(await response.json()).data.value}
 const comment=await actorCommand('comment.create',{campaignId:campaign.id,body:'Please review the supplier delivery evidence',mentions:[h.owner,reviewer.id]},ref(campaign))
 const worker=await h.runtime.getWorker();await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()})
 const deliveries=(await h.db.prepare('SELECT d.operator_id,d.state,d.group_id FROM channel_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.subject_id=? ORDER BY d.operator_id').bind(comment.id).all()).results
 assert.equal(deliveries.length,2)
 assert.equal(deliveries.find(row=>row.operator_id===h.owner).state,'muted','NOTIFY-007 A email is muted')
 const delivered=deliveries.find(row=>row.operator_id===reviewer.id)
 assert.equal(delivered.state,'accepted','NOTIFY-007 B still receives email')
 for(const session of [h.ownerSession,reviewer.session])assert.ok((await read(session,'/api/notifications')).notifications.some(item=>item.subject.id===comment.id),'NOTIFY-007 both recipients retain the in-app event')
 const email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(reviewer.id).first()).email
 const captured=(await h.mailMessages()).filter(message=>message.custom_args.rer_delivery_id===delivered.group_id)
 assert.equal(captured.length,1)
 assert.deepEqual(captured[0].personalizations.flatMap(group=>group.to.map(to=>to.email)),[email],'NOTIFY-007 provider request contains only B')
 // A different kind remains deliverable to the muted operator.
 const decision=await actorCommand('decision.create',{fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Review alternate supplier',requesterId:actor.id,assigneeId:h.owner,priority:'High',dueAt:'2027-01-01T12:00:00.000Z',recommendation:'Review the evidence',impact:'Supplier readiness'}})
 await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()})
 assert.equal((await h.db.prepare('SELECT d.state FROM channel_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.subject_id=? AND d.operator_id=?').bind(decision.id,h.owner).first()).state,'accepted','NOTIFY-007 muting one kind leaves other kinds deliverable')
 await page.goto(`${h.origin}/app/notifications`);await page.locator('#notifications-title').waitFor()
 await page.getByRole('heading',{name:'You were mentioned in a comment',exact:true}).waitFor()
 await capture('clause-muting-inbox')
 const preferences=(await read(h.ownerSession,'/api/v1/preferences')).data
 const unmute=await h.request(h.ownerSession,'/api/v1/commands/preferences.update',{method:'POST',body:JSON.stringify({commandId:createUlid(),expected:[],input:{version:preferences.version,preferences:{timezone:preferences.timezone,mutedKinds:[],digestEnabled:preferences.digestEnabled,progressEnabled:preferences.progressEnabled}}})})
 assert.equal(unmute.status,200,await unmute.clone().text())
 const currentSettings=(await read(h.ownerSession,'/api/v1/settings')).data
 const restored=await h.request(h.ownerSession,'/api/v1/commands/settings.update',{method:'POST',body:JSON.stringify({commandId:createUlid(),expected:[],input:{version:currentSettings.version,changes:{quietHoursStart:settings.quietHours.start,quietHoursEnd:settings.quietHours.end}}})})
 assert.equal(restored.status,200,await restored.clone().text())
 const current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(campaign.id).first()
 await create('campaign.delete',{id:campaign.id,confirmationCode:campaign.code},ref(current))
}
