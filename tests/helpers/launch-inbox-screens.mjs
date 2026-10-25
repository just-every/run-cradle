import assert from 'node:assert/strict'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

export async function verifyInboxScreens({h,page,command,capture}){
 const width=page.viewportSize().width,other=await h.addPerson({legacy:true,name:`Jonah Reviewer ${width}`})
 const create=async(action,input,expected=[])=>(await command(action,input,expected)).data.value
 const ref=row=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:row.id},version:row.version}]
 let campaign=await create('campaign.create',{fields:{code:`INBOX-${width}`,name:'Supplier readiness review',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-01-01',objective:'Review the supplier evidence',statusSummary:'Waiting for review',phase:'Planning',status:'On track',health:60,budgetMinor:10000,spendMinor:2500,tags:[],customFields:{}}})
 const actorCommand=async(action,input,expected=[])=>{
  const response=await h.request(other.session,`/api/v1/commands/launch.${action}`,{method:'POST',body:JSON.stringify({commandId:createUlid(),input,expected})})
  assert.equal(response.status,200,await response.clone().text());return(await response.json()).data.value
 }
 const read=async(session=h.ownerSession)=>{const response=await h.request(session,'/api/notifications');assert.equal(response.status,200);return response.json()}
 const automation=await create('automation.save',{definition:{name:`Supplier inbox update ${width}`,enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'notify-operator',input:{operatorId:h.owner,subjectId:campaign.id,title:'Supplier update recorded',body:'Review the current supplier readiness'}}]}})
 campaign=await actorCommand('campaign.patch',{id:campaign.id,changes:{statusSummary:'Supplier update ready'}},ref(campaign))
 await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()})
 const automated=(await read()).notifications.find(item=>item.title==='Supplier update recorded')
 assert.ok(automated,'NOTIFY-005 actual automation notice exists')
 assert.equal(automated.subject.available,true)
 assert.equal(automated.subject.href,`/app/campaigns/${campaign.id}`,'NOTIFY-005 automation notice opens its current campaign')
 const definition=await h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(automation.id).first()
 await create('automation.disable',{id:definition.id},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:definition.id},version:definition.version}])
 const notices=[]
 for(const body of ['Supplier evidence is ready','Please review the latest delivery date']){
  const comment=await actorCommand('comment.create',{campaignId:campaign.id,body,mentions:[h.owner]},ref(campaign))
  notices.push({comment,notice:(await read()).notifications.find(item=>item.subject.id===comment.id)})
 }
 const otherComment=await create('comment.create',{campaignId:campaign.id,body:'Please confirm the supplier evidence',mentions:[other.id]},ref(campaign))
 const otherBefore=await read(other.session)
 assert.ok(otherBefore.notifications.some(item=>item.subject.id===otherComment.id&&!item.readAt))
 const inbox=await read(),ids=inbox.notifications.map(item=>item.id)
 assert.ok(ids.indexOf(notices[1].notice.id)<ids.indexOf(notices[0].notice.id),'NOTIFY-005 newest notification comes first')
 for(let index=1;index<inbox.notifications.length;index++){
  const previous=inbox.notifications[index-1],current=inbox.notifications[index]
  assert.ok(previous.createdAt>current.createdAt||previous.createdAt===current.createdAt&&previous.id>current.id,'NOTIFY-005 newest first with stable ID ordering')
 }
 await page.goto(`${h.origin}/app/notifications`)
 await page.locator('#notifications-title').waitFor()
 await page.getByText(`${inbox.unreadCount} unread notifications.`,{exact:true}).waitFor()
 assert.equal(await page.locator('.operator-mobile-bell').getAttribute('aria-label'),`${inbox.unreadCount} unread notifications`,'NOTIFY-005 navigation unread count')
 await capture('clause-inbox-unread')
 await page.locator(`#notification-${notices[1].notice.id}`).getByRole('link',{name:'Related record',exact:true}).click()
 await page.getByRole('heading',{name:campaign.name,exact:true}).waitFor()
 assert.ok((await read()).notifications.find(item=>item.id===notices[1].notice.id).readAt,'NOTIFY-005 opening a notification marks only it read')
 assert.equal((await read()).notifications.find(item=>item.id===notices[0].notice.id).readAt,null)
 const otherOpened=await read(other.session)
 assert.equal(otherOpened.unreadCount,otherBefore.unreadCount)
 assert.deepEqual(otherOpened.notifications.map(item=>({id:item.id,readAt:item.readAt})),otherBefore.notifications.map(item=>({id:item.id,readAt:item.readAt})),'NOTIFY-005 opening never changes another operator read state')
 await page.goto(`${h.origin}/app/notifications`)
 const markedResponse=page.waitForResponse(response=>response.url().endsWith('/read')&&response.request().method()==='POST')
 await page.locator(`#notification-${notices[0].notice.id}`).getByRole('button',{name:'Mark read',exact:true}).click()
 const marked=await markedResponse;assert.equal(marked.status(),204,await marked.text())
 assert.ok((await read()).notifications.find(item=>item.id===notices[0].notice.id).readAt,'NOTIFY-005 mark-one HTTP write commits')
 await page.getByText(`${inbox.unreadCount-2} unread ${inbox.unreadCount-2===1?'notification':'notifications'}.`,{exact:true}).waitFor()
 const deleted=await actorCommand('comment.create',{campaignId:campaign.id,body:'Withdrawn supplier note',mentions:[h.owner]},ref(campaign))
 const deletedNotice=(await read()).notifications.find(item=>item.subject.id===deleted.id)
 await actorCommand('comment.delete',{id:deleted.id,version:deleted.version},ref(campaign))
 assert.equal((await read()).notifications.find(item=>item.id===deletedNotice.id).subject.available,false,'NOTIFY-005 deleted comment has no missing-record link')
 await create('campaign.archive',{id:campaign.id},ref(campaign))
 const archived=await read()
 for(const {notice}of notices)assert.equal(archived.notifications.find(item=>item.id===notice.id).subject.available,false,'NOTIFY-005 archived subject is unavailable')
 await page.reload();await page.getByText('Related record is unavailable',{exact:false}).first().waitFor()
 await capture('clause-inbox-unavailable')
 await page.getByRole('button',{name:'Mark all read',exact:true}).click()
 await page.getByText('0 unread notifications.',{exact:true}).waitFor()
 assert.equal((await read()).unreadCount,0,'NOTIFY-005 mark all read')
 assert.equal(await page.locator('.operator-mobile-bell').getAttribute('aria-label'),'No unread notifications','NOTIFY-005 shell count refresh preserves the current inbox')
 const otherAfter=await read(other.session)
 assert.deepEqual(otherAfter.notifications.map(item=>({id:item.id,readAt:item.readAt})),otherBefore.notifications.map(item=>({id:item.id,readAt:item.readAt})),'NOTIFY-005 mark all changes only its operator read state')
 assert.equal(otherAfter.unreadCount,otherBefore.unreadCount)
 await capture('clause-inbox-all-read')
 const erasing=await actorCommand('campaign.create',{fields:{code:`synthetic-cradle-erasure-${width}`,name:'Erased campaign private name',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-01-01',objective:'Erased campaign objective',statusSummary:'Erased campaign summary',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const targets=[]
 for(const person of [{id:h.owner,session:h.ownerSession},other]){
  const sender=person.id===h.owner?actorCommand:create
  const comment=await sender('comment.create',{campaignId:erasing.id,body:'Erased confidential comment',mentions:[person.id]},ref(erasing))
  const decision=await sender('decision.create',{fields:{campaignId:erasing.id,riskId:null,supersedesId:null,title:'Erased confidential decision',requesterId:person.id===h.owner?other.id:h.owner,assigneeId:null,priority:'High',dueAt:'2099-01-01T12:00:00.000Z',recommendation:'Erased recommendation',impact:'Erased impact'}})
  await sender('decision.assign',{id:decision.id,assigneeId:person.id},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.decision,recordId:decision.id},version:decision.version}])
  const before=await read(person.session),notices=before.notifications.filter(n=>[comment.id,decision.id].includes(n.subject.id))
  assert.equal(notices.length,2,'NOTIFY-005 two generated deleted-campaign notices per recipient')
  const mark=await h.request(person.session,`/api/notifications/${notices[0].id}/read`,{method:'POST'})
  assert.equal(mark.status,204)
  targets.push({...person,before:await read(person.session),ids:notices.map(n=>n.id)})
 }
 await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()})
 const sent=(await h.db.prepare("SELECT id,state,provider_id,receipt_id FROM channel_deliveries WHERE campaign_id=? AND state IN ('accepted','delivered') ORDER BY id").bind(erasing.id).all()).results
 assert.ok(sent.length>=2,'NOTIFY-005 sent assignment mail has durable receipts before erasure')
 const sentGroups=(await h.db.prepare("SELECT group_id FROM channel_deliveries WHERE campaign_id=? AND state IN ('accepted','delivered')").bind(erasing.id).all()).results.map(d=>d.group_id)
 const sentMail=async()=>(await h.mailMessages()).filter(m=>sentGroups.includes(m.custom_args?.rer_delivery_id))
 const mailBefore=(await sentMail()).length
 const current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(erasing.id).first()
 await actorCommand('campaign.delete',{id:erasing.id,confirmationCode:erasing.code},ref(current))
 const sentAfter=(await h.db.prepare(`SELECT id,state,provider_id,receipt_id FROM channel_deliveries WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id`).bind(JSON.stringify(sent.map(d=>d.id))).all()).results
 assert.deepEqual(sentAfter,sent,'NOTIFY-005 erasure retains sent-mail delivery records')
 assert.equal((await h.db.prepare("SELECT count(*) n FROM channel_deliveries WHERE notification_id IN (SELECT value FROM json_each(?)) AND state IN ('held','queued','dispatching')").bind(JSON.stringify(targets.flatMap(p=>p.ids))).first()).n,0)
 await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()+86400000})
 assert.equal((await sentMail()).length,mailBefore,'NOTIFY-005 deleted notice never sends later')
 for(const person of targets){
  const retained=await read(person.session)
  assert.equal(retained.unreadCount,person.before.unreadCount,'NOTIFY-005 deletion preserves each recipient unread count')
  for(const id of person.ids){
   const notice=retained.notifications.find(item=>item.id===id),before=person.before.notifications.find(item=>item.id===id)
   assert.ok(notice,'NOTIFY-005 deleted campaign retains each recipient notice')
   assert.equal(notice.subject.available,false)
   assert.equal(notice.subject.href,undefined)
   assert.equal(notice.readAt,before.readAt,'NOTIFY-005 deletion preserves individual read state')
   const stored=await h.db.prepare('SELECT * FROM notifications WHERE id=?').bind(id).first()
   assert.equal(stored.title,'Notification unavailable','NOTIFY-005 erased notification title is neutral')
   assert.equal(stored.body,'','NOTIFY-005 erased notification body is empty')
   assert.equal(stored.subject_id,null)
   await page.context().clearCookies()
   await page.context().addCookies([{name:person.session.cookie.split('=')[0],value:person.session.cookie.slice(person.session.cookie.indexOf('=')+1),url:h.origin}])
   await page.goto(`${h.origin}/app/notifications`)
   const row=page.locator(`#notification-${id}`)
   await row.getByText('Related record is unavailable',{exact:false}).waitFor()
   assert.equal(await row.getByRole('link',{name:'Related record',exact:true}).count(),0)
  }
  await capture(`clause-inbox-deleted-${person.id===h.owner?'owner':'other'}`)
 }
 await page.context().clearCookies()
 await page.context().addCookies([{name:h.ownerSession.cookie.split('=')[0],value:h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1),url:h.origin}])
}
