import assert from 'node:assert/strict'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

export async function verifyNotificationEmailPolicy({h,page,capture,actor,other}){
 const width=page.viewportSize().width
 const request=async(session,action,input,expected=[])=>{const r=await h.request(session,'/api/v1/commands/'+action,{method:'POST',body:JSON.stringify({commandId:createUlid(),input,expected})});assert.equal(r.status,200,`${action}: ${await r.clone().text()}`);const data=(await r.json()).data;assert.equal(data.state,'committed');return data.value}
 const command=(action,input,expected=[])=>request(actor.session,'launch.'+action,input,expected)
 const ref=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]
 const settings=async()=>(await(await h.request(h.ownerSession,'/api/v1/settings')).json()).data
 const original=await settings(),prefs=async session=>(await(await h.request(session,'/api/v1/preferences')).json()).data,otherBefore=await prefs(other.session)
 assert.deepEqual(original.quietHours,{start:'18:00',end:'08:00'},'NOTIFY-002 default workspace quiet hours')
 const setPrefs=async(session,timezone)=>{const p=await prefs(session);await request(session,'preferences.update',{version:p.version,preferences:{timezone,mutedKinds:[],digestEnabled:true,progressEnabled:p.progressEnabled}})}
 const configure=async changes=>{const s=await settings();await request(h.ownerSession,'settings.update',{version:s.version,changes})}
 const tick=async at=>(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at})
 // Drain prior journeys' held mail through the real settings/schedule doors
 // before measuring this policy's own closed-window events.
 await configure({quietHoursStart:'00:00',quietHoursEnd:'00:00'});await tick(Date.now())
 // Choose an IANA workspace timezone whose actual local hour is 22. The product
 // clock stays real for HTTP events; only the emitted schedule supplies later ticks.
 let offset=(22-new Date().getUTCHours()+24)%24;if(offset>14)offset-=24
 const timezone=offset===0?'UTC':`Etc/GMT${offset>0?'-':'+'}${Math.abs(offset)}`
 await configure({timezone,quietHoursStart:'18:00',quietHoursEnd:'08:00'})
 assert.deepEqual((await settings()).quietHours,{start:'18:00',end:'08:00'},'NOTIFY-002 default quiet-hour interval persisted')
 await setPrefs(h.ownerSession,null);await setPrefs(other.session,null)
 const c=await command('campaign.create',{fields:{code:`synthetic-cradle-notify002-${width}`,name:'Quiet-hour notification policy',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-12-01',objective:'Prove urgent and grouped mail',statusSummary:'Ready',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const start=(await h.mailMessages()).length,now=Date.now()
 const d=await command('decision.create',{fields:{campaignId:c.id,riskId:null,supersedesId:null,title:'Urgent quiet-hour assignment',requesterId:actor.id,assigneeId:h.owner,priority:'High',dueAt:'2099-01-01T12:00:00.000Z',recommendation:'Review',impact:'Urgent mail'}})
 const risk=await command('risk.create',{fields:{campaignId:c.id,title:'Urgent quiet-hour risk',ownerId:actor.id,severity:'Critical',dueDate:null,signal:'Synthetic risk',mitigation:'Review'}})
 await command('risk.escalate',{id:risk.id,reason:'Urgent quiet-hour delivery'},ref('risk',risk))
 const rows=async subjects=>(await h.db.prepare('SELECT d.*,n.subject_id,n.title FROM channel_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.subject_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(subjects)).all()).results
 const urgent=await rows([d.id,risk.id]);assert.equal(urgent.length,2);assert.ok(urgent.every(r=>r.state==='queued'&&r.due_at-r.created_at<=60000),'NOTIFY-002 assignment and Critical escalation are immediately due inside quiet hours')
 await tick(now+59000)
 assert.ok((await rows([d.id,risk.id])).every(r=>r.state==='accepted'),'NOTIFY-002 urgent mail accepted within the 60-second emitted tick')
 const urgentMail=(await h.mailMessages()).slice(start);assert.deepEqual(urgentMail.map(m=>m.subject).sort(),['A critical risk was escalated','A decision was assigned to you'].sort(),'NOTIFY-002 exactly two urgent provider requests')
 const ordinary=[]
 for(const body of ['synthetic-cradle-201 held event','synthetic-cradle-202 held event'])ordinary.push(await command('comment.create',{campaignId:c.id,body,mentions:[h.owner,other.id]},ref('campaign',c)))
 const held=await rows(ordinary.map(c=>c.id));assert.equal(held.length,4);assert.ok(held.every(r=>r.state==='held'),'NOTIFY-002 two ordinary events per operator are held')
 const end=held[0].due_at;assert.ok(held.every(r=>r.due_at===end));assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(end),'08:00','NOTIFY-002 release is at workspace-local quiet-hours end')
 assert.equal((await h.mailMessages()).length,start+2,'NOTIFY-002 held events produce zero provider mail')
 await page.goto(h.origin+'/app/notifications');await page.locator(`#notification-${held.find(r=>r.operator_id===h.owner).notification_id}`).waitFor();await capture('notify002-held-in-app')
 await tick(end-1);assert.equal((await h.mailMessages()).length,start+2,'NOTIFY-002 no mail before quiet hours end')
 await tick(end+59000)
 const grouped=(await h.mailMessages()).slice(start+2);assert.equal(grouped.length,2,'NOTIFY-002 exactly one grouped provider message per operator within 60 seconds')
 const accepted=await rows(ordinary.map(c=>c.id));assert.ok(accepted.every(r=>r.state==='accepted'))
 for(const id of [h.owner,other.id]){const deliveries=accepted.filter(r=>r.operator_id===id);assert.equal(new Set(deliveries.map(r=>r.group_id)).size,1);const email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(id).first()).email;const mails=grouped.filter(m=>m.personalizations.flatMap(p=>p.to).some(to=>to.email===email));assert.equal(mails.length,1);assert.equal(mails[0].content.find(part=>part.type==='text/plain').value.split('You were mentioned in a comment').length-1,2,'NOTIFY-002 grouped mail contains both notification entries')}
 const authBefore=(await h.mailMessages()).length,email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(h.owner).first()).email
 const auth=await h.request(h.ownerSession,'/auth/magic-link',{method:'POST',body:JSON.stringify({email,returnTo:'/app'})});assert.equal(auth.status,202);assert.equal((await h.mailMessages()).length,authBefore+1,'NOTIFY-002 authentication mail bypasses quiet hours without a schedule tick')
 const digest=await h.db.prepare("SELECT * FROM channel_digest_settings WHERE id='digest'").first(),automation=await h.db.prepare("SELECT id,version,enabled FROM automations WHERE shipped_key='weekly-digest'").first()
 await configure({timezone:'UTC'});await setPrefs(h.ownerSession,'Etc/GMT+8');await setPrefs(other.session,'Etc/GMT+8')
 if(!automation.enabled)await command('automation.enable',{id:automation.id},ref('automation',automation))
 await request(h.ownerSession,'digest.update',{version:digest.version,recipientIds:[h.owner,other.id]})
 const monday=new Date(Date.now()+(140+(width===390?14:0))*86400000);monday.setUTCDate(monday.getUTCDate()+(8-monday.getUTCDay())%7);monday.setUTCHours(9,0,0,0)
 const digestBefore=(await h.mailMessages()).length;await tick(+monday)
 assert.equal((await h.mailMessages()).length,digestBefore+2,'NOTIFY-002 digest sends both recipients immediately while personal local time is 01:00 inside quiet hours')
 const digestMail=(await h.mailMessages()).slice(digestBefore);assert.ok(digestMail.every(m=>m.subject==='Weekly portfolio digest'))
 await tick(+monday+59000);assert.equal((await h.mailMessages()).length,digestBefore+2,'NOTIFY-002 digest is never held or replayed')
 // Future schedule fixtures must be read explicitly: a later real-time read-all
 // cutoff cannot include a notification created on this emitted Monday.
 for(const notice of (await h.db.prepare("SELECT id,operator_id FROM notifications WHERE kind='weekly-digest' AND created_at=? AND operator_id IN (?,?)").bind(+monday,h.owner,other.id).all()).results)await request(notice.operator_id===h.owner?h.ownerSession:other.session,'notification.read',{notificationId:notice.id})
 await request(h.ownerSession,'digest.update',{version:(await h.db.prepare("SELECT version FROM channel_digest_settings WHERE id='digest'").first()).version,recipientIds:JSON.parse(digest.recipients_json)})
 if(!automation.enabled){const a=await h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(automation.id).first();await command('automation.disable',{id:a.id},ref('automation',a))}
 for(const [session,p]of [[h.ownerSession,original.preferences],[other.session,otherBefore]])await request(session,'preferences.update',{version:(await prefs(session)).version,preferences:{timezone:p.timezone,mutedKinds:p.mutedKinds,digestEnabled:p.digestEnabled,progressEnabled:p.progressEnabled}})
 await configure({timezone:original.timezone,quietHoursStart:original.quietHours.start,quietHoursEnd:original.quietHours.end})
 const current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(c.id).first();await command('campaign.archive',{id:c.id},ref('campaign',current));await command('campaign.delete',{id:c.id,confirmationCode:c.code},ref('campaign',await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(c.id).first()))
 console.log(`NOTIFY-002 ${width}: urgent 60-second tick, held grouping, authentication and digest exceptions; in-app-only counterparts remain a Gap`)
}
