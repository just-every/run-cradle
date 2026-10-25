import assert from 'node:assert/strict'
import {notificationKinds,notificationKindsWithoutProducer} from '../../src/domains/channels/ports.ts'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

// Entries with a gap deliberately earn no delivery claim. Importing the product
// inventory makes a newly offered kind fail until its real producer is reviewed.
const paths={
 'decision-assigned':'decision.create',
 'critical-risk-escalated':'risk.escalate',
 readiness:'emitted readiness schedule',
 'comment-mentioned':'comment.create',
 'automation-failed':'saved automation with disabled AI',
 'decision-overdue':'emitted overdue schedule',
 outage:'connection.check and expired user automation approval',
 progress:'resumable base imports and scheduled warehouse exports',
 'weekly-digest':'emitted Monday digest',
 'record-automation':'saved notify-operator action (in-app-only)',
}
const titles={outage:'An operational outage needs attention','decision-assigned':'A decision was assigned to you','critical-risk-escalated':'A critical risk was escalated',readiness:'Launch readiness requested','comment-mentioned':'You were mentioned in a comment','automation-failed':'An automation failed','decision-overdue':'A decision is overdue','weekly-digest':'Weekly portfolio digest','record-automation':'Synthetic in-app-only notice'}
export async function verifyNotificationDeliveryMatrix({h,actor,other,width}){
 assert.deepEqual(Object.keys(paths).sort(),[...notificationKinds].sort(),'NOTIFY-007 matrix accounts for exactly the production kind list')
 assert.deepEqual(Object.entries(paths).filter(([,path])=>path===null).map(([kind])=>kind).sort(),[...notificationKindsWithoutProducer].sort(),'NOTIFY-007 missing-producer paths match the Settings disclosure list')
 const request=async(session,action,input,expected=[])=>{
  const response=await h.request(session,`/api/v1/commands/${action}`,{method:'POST',body:JSON.stringify({commandId:createUlid(),input,expected})})
  assert.equal(response.status,200,`${action}: ${await response.clone().text()}`)
  const data=(await response.json()).data;assert.equal(data.state,'committed');return data.value
 }
 const launch=(action,input,expected=[])=>request(actor.session,'launch.'+action,input,expected)
 const ref=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]
 const settings=async()=>{const response=await h.request(h.ownerSession,'/api/v1/settings');assert.equal(response.status,200);return(await response.json()).data}
 const original=await settings(),preferences=async(session)=>{const response=await h.request(session,'/api/v1/settings');assert.equal(response.status,200);return(await response.json()).data.preferences}
 const originalOther=await preferences(other.session)
 const setPrefs=async(session,mutedKinds)=>{const p=await preferences(session);await request(session,'preferences.update',{version:p.version,preferences:{timezone:'UTC',mutedKinds,digestEnabled:true,progressEnabled:true}})}
 await request(h.ownerSession,'settings.update',{version:original.version,changes:{timezone:'UTC',quietHoursStart:'00:00',quietHoursEnd:'00:00'}})
 await setPrefs(other.session,[])
 const worker=await h.runtime.getWorker(),tick=async at=>{const result=await worker.scheduled({cron:'* * * * *',scheduledTime:at});assert.equal(result.outcome,'ok',JSON.stringify(result));return result}
 const row=async(table,id)=>h.db.prepare(`SELECT id,version FROM ${table} WHERE id=?`).bind(id).first()
 const readinessAutomation=await h.db.prepare("SELECT id,version,enabled,trigger_config_json FROM automations WHERE shipped_key='launch-readiness'").first()
 // The preceding concurrency journey deliberately leaves readiness disabled.
 if(!readinessAutomation.enabled)await request(h.ownerSession,'launch.automation.enable',{id:readinessAutomation.id},ref('automation',readinessAutomation))
 const readinessHour=JSON.parse(readinessAutomation.trigger_config_json).hour
 const campaigns=[]
 const campaign=async(operator,code)=>{
  const c=await launch('campaign.create',{fields:{code,name:code,ownerId:operator,startDate:'2026-01-01',launchDate:'2027-12-01',objective:'Synthetic notification delivery',statusSummary:'Ready',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}});campaigns.push(c);return c
 }
 const read=async kind=>(await h.db.prepare('SELECT n.id,n.version,n.created_at,n.updated_at,n.operator_id,n.subject_id,d.id AS delivery_id,d.state,d.group_id,d.error_code,d.error_message FROM notifications n LEFT JOIN channel_deliveries d ON d.notification_id=n.id WHERE n.kind=?').bind(kind).all()).results
 const assertRows=async(kind,rows,muted,edgeMessages,recipients=[h.owner,other.id])=>{
  assert.deepEqual(rows.map(r=>r.operator_id).sort(),[...recipients].sort(),`NOTIFY-007 ${kind}: exactly the event owners retain one notice each`)
  const messages=await h.mailMessages()
  for(const n of rows){
   const session=n.operator_id===h.owner?h.ownerSession:other.session
   assert.equal((await preferences(session)).mutedKinds.includes(kind),n.operator_id===h.owner&&muted,`NOTIFY-007 ${kind}: recipient email preference read back`)
   const state=n.operator_id===h.owner&&muted?'muted':'accepted'
   const email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(n.operator_id).first()).email
   assert.equal(edgeMessages.filter(m=>m.subject===titles[kind]).flatMap(m=>m.personalizations.flatMap(p=>p.to)).filter(r=>r.email===email).length,state==='muted'?0:1,`NOTIFY-007 ${kind}: exact recipient mail count includes every provider request`)
   assert.ok(n.delivery_id,`NOTIFY-007 ${kind}: a durable delivery accompanies the notice`)
   assert.equal(n.state,state,`NOTIFY-007 ${kind}: recipient delivery state ${JSON.stringify(n)}`)
   const mail=messages.filter(m=>n.group_id&&m.custom_args?.rer_delivery_id===n.group_id)
   assert.equal(mail.length,state==='muted'?0:1,`NOTIFY-007 ${kind}: exact provider-edge email count`)
   if(mail.length){const email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(n.operator_id).first()).email;assert.deepEqual(mail[0].personalizations.flatMap(p=>p.to.map(r=>r.email)),[email],`NOTIFY-007 ${kind}: provider recipient`)}
  }
 }
 const raw=async(path,input,status=200)=>{const response=await h.request(h.ownerSession,path,input?{method:'POST',body:JSON.stringify(input)}:{});assert.equal(response.status,status,await response.clone().text());return response.json()}
 const operational=async(muted,phase)=>{
  const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),statusId=createUlid()
  const preview=(await raw('/api/v1/records/schema-preview',{appId,name:`synthetic-cradle-outage-${width}-${phase}`,tables:[{id:entityId,label:'Items',primaryFieldId:nameId,fields:[{id:nameId,label:'Name',type:'text',required:true,unique:false},{id:statusId,label:'Status',type:'text',required:false,unique:false}]}]})).data
  await request(h.ownerSession,'release.adopt',{kind:'manual_schema',previewId:preview.id})
  const provider=h.notificationOutageProvider
  assert.ok(provider,'NOTIFY-009 real capability checks require the network-edge provider')
  const connection=(await request(h.ownerSession,'connection.configure',{appId,adapterId:'google-calendar',name:`synthetic-cradle-${width}-${phase}`,accountId:provider.ownedCalendarId,scopes:[{resource:provider.ownedCalendarId,readFields:[],actions:['connection.sync']}],ownership:[],credentialRef:null})).connectionId
  const check=async()=>{await request(h.ownerSession,'connection.check',{connectionId:connection});await tick(Date.now());await tick(Date.now());const r=await raw(`/api/v1/connections/${connection}`);return r.data}
  const eventRows=async(type)=>(await read('outage')).filter(n=>n.subject_id===(type==='connection'?connection:stoppedRun))
  const initial=await read('outage')
  await check()
  assert.equal((await read('outage')).length,initial.length,'NOTIFY-009 a never-successful connection emits no outage')
  const consent=await request(h.ownerSession,'connection.begin-consent',{connectionId:connection,returnTo:'/app/settings'}),url=new URL(consent.authorizationUrl)
  const callback=await h.request(h.ownerSession,'/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-1',state:url.searchParams.get('state')}),{redirect:'manual'})
  assert.equal(callback.status,303,await callback.clone().text())
  provider.allow(provider.ownedCalendarId)
  assert.equal((await check()).state,'connected')
  const connectionMail=(await h.mailMessages()).length
  provider.deny(provider.ownedCalendarId)
  assert.equal((await check()).state,'unavailable')
  let rows=await eventRows('connection')
  const connectionEvents=async()=>(await h.db.prepare('SELECT e.event_id FROM channel_events e JOIN notifications n ON n.id=e.notification_id WHERE n.subject_id=? ORDER BY e.event_id').bind(connection).all()).results
  const firstEvents=await connectionEvents();assert.equal(firstEvents.length,1,'NOTIFY-009 one transition creates one event')
  await assertRows('outage',rows,muted,(await h.mailMessages()).slice(connectionMail),[h.owner])
  assert.equal((await check()).state,'unavailable')
  assert.deepEqual(await eventRows('connection'),rows,'NOTIFY-009 repeat unavailable check emits no second notice or update')
  assert.deepEqual(await connectionEvents(),firstEvents,'NOTIFY-009 repeat unavailable check creates no second event')
  assert.equal((await h.mailMessages()).slice(connectionMail).filter(m=>m.subject===titles.outage).length,muted?0:1)
  const inbox=(await raw('/api/notifications')).notifications.find(n=>n.id===rows[0].id)
  assert.equal(inbox.subject.available,true);assert.equal(inbox.subject.href,'/app/settings')
  await request(h.ownerSession,'notification.read',{notificationId:rows[0].id})
  provider.allow(provider.ownedCalendarId);assert.equal((await check()).state,'connected')
  const recoveryMail=(await h.mailMessages()).length
  provider.deny(provider.ownedCalendarId);assert.equal((await check()).state,'unavailable')
  const later=(await eventRows('connection')).filter(n=>!rows.some(old=>old.id===n.id))
  await assertRows('outage',later,muted,(await h.mailMessages()).slice(recoveryMail),[h.owner])
  rows.push(...later);provider.allow(provider.ownedCalendarId)
  // Connections and record automations each have exactly one author/owner. The
  // other recipient stays unmuted, but has no ownership and receives nothing.
  const expires=Date.now()+8000
  const saved=(await raw('/api/user-automations',{commandId:createUlid(),expiresAt:new Date(expires).toISOString(),definition:{name:`synthetic-cradle-stop-${width}-${phase}`,appId,entityId,event:'created',enabled:true,actions:[{kind:'update',fieldId:statusId,value:'must not run'}]}},201)).data.result.value
  const schema=(await raw(`/api/v1/apps/${appId}/entities/${entityId}`)).data
  const created=await request(h.ownerSession,'record.create',{appId,entityId,values:{[nameId]:'synthetic-cradle-private-stop'}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}])
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,expires-Date.now()+25)))
  const stopMail=(await h.mailMessages()).length
  await tick(Date.now());await tick(Date.now())
  const run=await h.db.prepare("SELECT id,state FROM automation_runs WHERE automation_id=?").bind(saved.id).first()
  assert.ok(run);assert.equal(run.state,'Cancelled','NOTIFY-009 product fences expired approval before any new effect')
  let stoppedRun=run.id
  const stopped=await eventRows('automation-stop')
  assert.equal(stopped.length,1,JSON.stringify({run:await h.db.prepare('SELECT id,state,error_code FROM automation_runs WHERE id=?').bind(run.id).first(),events:(await h.db.prepare('SELECT * FROM channel_events WHERE event_id=?').bind('automation-stop:'+run.id).all()).results}))
  await assertRows('outage',stopped,muted,(await h.mailMessages()).slice(stopMail),[h.owner])
  const stopInbox=(await raw('/api/notifications')).notifications.find(n=>n.id===stopped[0].id)
  assert.equal(stopInbox.subject.available,true);assert.ok(stopInbox.subject.href.includes(run.id))
  assert.ok((await raw(`/api/user-automations/${saved.id}/runs`)).data.runs.some(r=>r.id===run.id),'NOTIFY-009 current owner can open the stopped run')
  rows.push(...stopped)
  await tick(Date.now());assert.deepEqual(await eventRows('automation-stop'),stopped,'NOTIFY-009 repeated automation stop observation emits nothing new')
  assert.equal((await h.mailMessages()).slice(stopMail).filter(m=>m.subject===titles.outage).length,muted?0:1)
  const current=(await raw(`/api/v1/apps/${appId}/entities/${entityId}/records/${created.ref.recordId}`)).data.record
  assert.equal(current.fields[statusId]?.value??null,null,'NOTIFY-009 stopped automation has no new effect')
  await raw(`/api/user-automations/${saved.id}/disable`,{commandId:createUlid(),version:saved.version})
  const voluntary=(await raw('/api/user-automations',{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-owner-stop',appId,entityId,event:'created',enabled:true,actions:[{kind:'update',fieldId:statusId,value:'must not run'}]}},201)).data.result.value
  await request(h.ownerSession,'record.create',{appId,entityId,values:{[nameId]:'synthetic-cradle-voluntary-stop'}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}])
  await raw(`/api/user-automations/${voluntary.id}/disable`,{commandId:createUlid(),version:voluntary.version})
  const beforeVoluntary=await read('outage');await tick(Date.now())
  assert.deepEqual(await read('outage'),beforeVoluntary,'NOTIFY-006 owner-requested stop creates no outage')
  const fresh=(await read('outage')).filter(n=>!initial.some(old=>old.id===n.id))
  assert.deepEqual(fresh.map(n=>n.id).sort(),rows.map(n=>n.id).sort(),'NOTIFY-009 no non-owner outage recipients')
  assert.equal((await preferences(other.session)).mutedKinds.includes('outage'),false)
  if(muted)retained.push({kind:'outage',ids:rows.map(n=>n.id)})
  console.log(`NOTIFY-009 ${width} ${phase}: connection outage/repeat/recovery and product-fenced automation stop, owner only; muted=${muted}`)
 }
 const monday=new Date();monday.setUTCHours(0,0,0,0);monday.setUTCDate(monday.getUTCDate()+7-(monday.getUTCDay()+6)%7+(width===390?14:0))
 const retained=[],futureNotices=[],inAppOnly=[]
 const progress=await progressMatrix({h,width,request,preferences,tick,retained})
 for(const [phase,muted]of [[0,true],[1,false]]){
  await setPrefs(h.ownerSession,muted?[...notificationKinds]:[])
  const date=new Date(+monday+phase*7*86400000).toISOString().slice(0,10),at=Date.parse(date+'T08:00:00Z')
  for(const [kind,path]of Object.entries(paths)){
   if(!path)continue
   if(kind==='outage'){await operational(muted,phase);continue}
   if(kind==='progress'){await progress.events(muted,phase);continue}
   // Drain unrelated prior work before measuring this real event path.
   await tick(Date.now())
   const before=await read(kind),old=new Set(before.map(n=>n.id)),subjects=[],mailStart=(await h.mailMessages()).length
   const failure=kind==='automation-failed'?await launch('automation.save',{definition:{name:`Synthetic failed delivery ${phase}`,enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'request-ai-analysis',input:{campaignId:campaigns[0].id}}]}}):null
   if(kind==='record-automation'){
    for(const [index,operatorId]of [h.owner,other.id].entries()){
     const c=await campaign(operatorId,`synthetic-cradle-in-app-${width}-${phase}-${index}`)
     const definition=await launch('automation.save',{definition:{name:`Synthetic in-app-only ${width} ${phase} ${index}`,enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'notify-operator',input:{operatorId,subjectId:c.id,title:titles[kind],body:'Retained without requesting email'}}]}})
     await launch('campaign.patch',{id:c.id,changes:{statusSummary:'Trigger the in-app-only recipient'}},ref('campaign',c))
     await tick(Date.now())
     await launch('automation.disable',{id:definition.id},ref('automation',await row('automations',definition.id)))
    }
   }else if(kind==='weekly-digest'){
    const a=await h.db.prepare("SELECT id,version,enabled FROM automations WHERE shipped_key='weekly-digest'").first()
    if(!a.enabled)await request(h.ownerSession,'launch.automation.enable',{id:a.id},ref('automation',a))
    const digest=await h.db.prepare("SELECT version FROM channel_digest_settings WHERE id='digest'").first()
    await request(h.ownerSession,'digest.update',{version:digest.version,recipientIds:[h.owner,other.id]})
    await tick(Date.parse(date+'T09:00:00Z'))
   }else{
    for(const [index,operator]of [h.owner,other.id].entries()){
     const c=await campaign(operator,`synthetic-cradle-${phase*20+Object.keys(paths).indexOf(kind)*2+index}`)
     if(failure)await launch('campaign.patch',{id:c.id,changes:{statusSummary:'Trigger the disabled-AI action'}},ref('campaign',c))
     if(kind==='comment-mentioned')await launch('comment.create',{campaignId:c.id,body:'Synthetic muted delivery event',mentions:[operator]},ref('campaign',c))
     if(kind==='decision-assigned'||kind==='decision-overdue')subjects.push((await launch('decision.create',{fields:{campaignId:c.id,riskId:null,supersedesId:null,title:'Synthetic delivery decision',requesterId:operator,assigneeId:operator,priority:'High',dueAt:new Date(kind==='decision-overdue'?at-20*60000:Date.parse('2099-01-01T12:00:00Z')).toISOString(),recommendation:'Review',impact:'Delivery matrix'}})).id)
     if(kind==='critical-risk-escalated'){
      const risk=await launch('risk.create',{fields:{campaignId:c.id,title:'Synthetic Critical risk',ownerId:operator,severity:'Critical',dueDate:null,signal:'Delivery probe',mitigation:'Review'}})
      await launch('risk.escalate',{id:risk.id,reason:'Synthetic delivery matrix'},ref('risk',risk))
     }
     if(kind==='readiness')await launch('milestone.create',{fields:{campaignId:c.id,title:'Synthetic launch readiness',ownerId:operator,type:'Launch',status:'Not started',startDate:date,endDate:null,conflictReason:null}})
    }
    await tick(kind==='readiness'?Date.parse(date+`T${String(readinessHour).padStart(2,'0')}:00:00Z`):kind==='decision-overdue'?at:Date.now())
   }
   if(failure)await launch('automation.disable',{id:failure.id},ref('automation',await row('automations',failure.id)))
   const fresh=(await read(kind)).filter(n=>!old.has(n.id)&&(!subjects.length||subjects.includes(n.subject_id)))
   if(kind==='record-automation'){
    const edgeMessages=(await h.mailMessages()).slice(mailStart)
    for(const [operatorId,session,isMuted]of [[h.owner,h.ownerSession,phase===0],[other.id,other.session,false]]){
     const state=isMuted?'muted':'on',label=`NOTIFY-007 in-app-only ${state}`
     const persisted=await preferences(session)
     assert.equal(persisted.mutedKinds.includes(kind),isMuted,`${label}: recipient preference read back through their own Settings session`)
     const notices=fresh.filter(n=>n.operator_id===operatorId)
     assert.equal(notices.length,1,`${label}: exactly one fresh in-app notice for this recipient`)
     assert.equal(notices[0].delivery_id,null,`${label}: zero mail delivery rows for this notice`)
     const email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(operatorId).first()).email
     assert.equal(edgeMessages.flatMap(m=>m.personalizations.flatMap(p=>p.to)).filter(r=>r.email===email).length,0,`${label}: zero provider-edge email addressed to this recipient`)
    }
    assert.equal(fresh.length,2,'NOTIFY-007 in-app-only: no extra recipient notices')
    inAppOnly.push(...fresh)
   }else await assertRows(kind,fresh,muted,(await h.mailMessages()).slice(mailStart))
   futureNotices.push(...fresh.filter(n=>n.created_at>Date.now()))
   if(muted&&kind!=='record-automation')retained.push({kind,ids:fresh.filter(n=>n.operator_id===h.owner).map(n=>n.id)})
   // Unmuting must never replay a prior muted event, even after later ticks.
   for(const previous of retained)await assertOld(previous)
   const kept=(await read('record-automation')).filter(n=>inAppOnly.some(old=>old.id===n.id))
   assert.equal(kept.length,inAppOnly.length,'NOTIFY-007 in-app-only: all notices retained after unmute and later ticks')
   assert.ok(kept.every(n=>n.delivery_id===null),'NOTIFY-007 in-app-only: no delivery replay after unmute')
   assert.equal((await h.mailMessages()).filter(m=>m.subject===titles['record-automation']).length,0,'NOTIFY-007 in-app-only: no old-mail replay')
   console.log(`NOTIFY-007 matrix ${kind} ${muted?'muted':'unmuted'}: two notices, ${kind==='record-automation'?'in-app-only, zero delivery rows and mail':'exact recipient mail counts'}`)
  }
 }
 async function assertOld(previous){
  const rows=(await read(previous.kind)).filter(n=>previous.ids.includes(n.id));assert.equal(rows.length,previous.ids.length)
  for(const n of rows){assert.equal(n.state,'muted',`NOTIFY-007 ${previous.kind}: no old-mail replay`);assert.equal((await h.mailMessages()).filter(m=>n.group_id&&m.custom_args?.rer_delivery_id===n.group_id).length,0,`NOTIFY-007 ${previous.kind}: no old provider mail`)}
 }
 // Scheduled readiness, overdue and digest fixtures can be future-dated. After
 // every delivery assertion, read exactly those fixture notices through each
 // recipient’s public door; deletion now correctly retains them. The inbox
 // journey must still prove its unchanged real-time read-all cutoff.
 const collateral=(await h.db.prepare('SELECT n.id,n.operator_id FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE c.campaign_id IN (SELECT value FROM json_each(?)) AND n.created_at>?').bind(JSON.stringify(campaigns.map(c=>c.id)),Date.now()).all()).results
 for(const notice of new Map([...futureNotices,...collateral].map(n=>[n.id,n])).values())await request(notice.operator_id===h.owner?h.ownerSession:other.session,'notification.read',{notificationId:notice.id})
 // Leave later walkthrough screens on their original configuration.
 for(const c of campaigns){const current=await row('campaigns',c.id);await request(h.ownerSession,'launch.campaign.archive',{id:c.id},ref('campaign',current));await request(h.ownerSession,'launch.campaign.delete',{id:c.id,confirmationCode:c.code},ref('campaign',await row('campaigns',c.id)))}
 if(!readinessAutomation.enabled)await request(h.ownerSession,'launch.automation.disable',{id:readinessAutomation.id},ref('automation',await row('automations',readinessAutomation.id)))
 const now=await settings();await request(h.ownerSession,'settings.update',{version:now.version,changes:{timezone:original.timezone,quietHoursStart:original.quietHours.start,quietHoursEnd:original.quietHours.end}})
 for(const [session,p]of [[h.ownerSession,original.preferences],[other.session,originalOther]]){const current=await preferences(session);await request(session,'preferences.update',{version:current.version,preferences:{timezone:p.timezone,mutedKinds:p.mutedKinds,digestEnabled:p.digestEnabled,progressEnabled:p.progressEnabled}})}
 await progress.close()
 console.log('NOTIFY-007 all offered kinds have generated-event delivery rows')
}

/** Progress uses retained job starters, including default failures before any preference exists. */
async function progressMatrix({h,width,request,preferences,tick,retained}){
 const edge=h.notificationProgressProvider;assert.ok(edge)
 const starter=await h.addPerson({legacy:true,name:`synthetic-cradle-${width+900}`,change:rules=>rules.map(r=>r.effect==='allow'?{...r,rows:{kind:'all',conditions:[]}}:r)})
 const baseId=await h.db.prepare('SELECT base_id FROM cradle_base_operators WHERE principal_id=?').bind(starter.id).first('base_id')
 const role=async value=>{const r=await h.request(h.ownerSession,'/auth/operator/role',{method:'POST',body:JSON.stringify({operatorId:baseId,role:value})});assert.equal(r.status,200,await r.clone().text())}
 await role('owner');starter.session=await h.signIn(starter.id)
 const owner={id:h.owner,session:h.ownerSession},people=[owner,starter]
 const json=async(person,path,body,status=200)=>{const r=await h.request(person.session,path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value.data}
 const prefs=async(person,mutedKinds,progressEnabled)=>{const p=await preferences(person.session);await request(person.session,'preferences.update',{version:p.version,preferences:{timezone:'UTC',mutedKinds,digestEnabled:false,progressEnabled}})}
 const rows=async subject=>(await h.db.prepare('SELECT n.id,n.operator_id,n.subject_id,n.title,n.version,n.updated_at,d.id AS delivery_id,d.state,d.group_id FROM notifications n LEFT JOIN channel_deliveries d ON d.notification_id=n.id WHERE n.kind=? AND n.subject_id=?').bind('progress',subject).all()).results
 const check=async(subject,person,muted,mailStart,enabled=true)=>{
  const notices=await rows(subject),p=await preferences(person.session)
  assert.equal(p.progressEnabled,enabled,'NOTIFY-009 starter completion preference read back')
  assert.equal(p.mutedKinds.includes('progress'),muted,'NOTIFY-007 progress email preference read back for this recipient')
  assert.deepEqual(notices.map(n=>n.operator_id),[person.id],'NOTIFY-009 progress reaches exactly its retained starter')
  const [notice]=notices;assert.ok(notice.delivery_id);assert.equal(notice.state,muted?'muted':'accepted')
  const mail=(await h.mailMessages()).slice(mailStart),eventMail=mail.filter(m=>m.subject===notice.title)
  const email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(person.id).first()).email
  assert.deepEqual(eventMail.flatMap(m=>m.personalizations.flatMap(p=>p.to.map(r=>r.email))),muted?[]:[email],'NOTIFY-007 progress exact provider-edge recipient mail')
  assert.equal(mail.filter(m=>m.custom_args?.rer_delivery_id===notice.group_id).length,muted?0:1,'NOTIFY-007 progress exact durable receipt mail count')
  const inbox=await h.request(person.session,'/api/notifications');assert.equal(inbox.status,200)
  const item=(await inbox.json()).notifications.find(n=>n.id===notice.id);assert.ok(item);assert.equal(item.subject.available,true);assert.equal(item.subject.href,'/app/settings')
  if(muted)retained.push({kind:'progress',ids:[notice.id]})
  return notice
 }
 const saveExport=async person=>{
  const id=createUlid(),at=new Date(),localRule=`daily ${at.toISOString().slice(11,16)}`
  await request(person.session,'warehouse.save',{id,name:`synthetic-cradle-${width+1000}`,bases:[LAUNCH_APP_ID],mode:'full',format:'csv',destination:edge.destination,access:edge.access,localRule,timezone:'UTC',version:0})
  const saved=(await json(person,'/api/v1/warehouse-exports')).exports.find(e=>e.id===id);assert.ok(saved);assert.equal(saved.version,1)
  return id
 }
 const removeExport=async(person,id)=>{const saved=(await json(person,'/api/v1/warehouse-exports')).exports.find(e=>e.id===id);await request(person.session,'warehouse.remove',{id,version:saved.version})}
 const parkExport=async(person,id)=>{const saved=(await json(person,'/api/v1/warehouse-exports')).exports.find(e=>e.id===id),later=new Date(Date.now()+3600000);await request(person.session,'warehouse.save',{id,name:saved.name,bases:saved.bases,mode:saved.mode,format:saved.format,destination:saved.destination,localRule:`daily ${later.toISOString().slice(11,16)}`,timezone:'UTC',version:saved.version})}
 const failedExport=async person=>{
  const id=await saveExport(person),before=edge.calls.length
  edge.refusePut(true)
  try{const result=await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()});assert.equal(result.outcome,'exception','NOTIFY-009 provider refusal fails the actual scheduled export')}
  finally{edge.refusePut(false)}
  assert.ok(edge.calls.slice(before).some(c=>c.method==='PUT'),'NOTIFY-009 export reached its provider edge before failing')
  return id
 }
 // CT's one defaults assertion: no row/preferences, failed export on, success off, opt-in success on.
 assert.equal(await h.db.prepare('SELECT 1 FROM channel_preferences WHERE operator_id=?').bind(starter.id).first(),null)
 assert.equal((await preferences(starter.session)).progressEnabled,false)
 const defaultMail=(await h.mailMessages()).length,failed=await failedExport(starter)
 assert.equal((await preferences(starter.session)).progressEnabled,false)
 assert.deepEqual((await rows(failed)).map(n=>n.operator_id),[starter.id],'NOTIFY-009 failed export reaches its starter with no preference set')
 await tick(Date.now()) // The provider has recovered; this same schedule now completes.
 assert.equal((await preferences(starter.session)).progressEnabled,false)
 const completed=await h.db.prepare('SELECT version,last_slot FROM warehouse_exports WHERE id=?').bind(failed).first();assert.ok(completed.last_slot,'NOTIFY-009 export completion is durable')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_events WHERE event_id=?').bind(`warehouse-export:${failed}:${completed.version}:${completed.last_slot}:completed`).first()).n,0,'NOTIFY-009 successful export with no preference produces no notice')
 await check(failed,starter,false,defaultMail,false)
 await removeExport(starter,failed)
 await prefs(starter,[],true)
 const successMail=(await h.mailMessages()).length,success=await saveExport(starter);await tick(Date.now());await tick(Date.now())
 await check(success,starter,false,successMail)
 const unchanged=await rows(success);await tick(Date.now());assert.deepEqual(await rows(success),unchanged,'NOTIFY-009 repeated scheduled observation never repeats progress')
 await removeExport(starter,success)
 console.log(`NOTIFY-009 ${width}: failed export default on, success opt-in, starter only`)

 const importJob=async(person,fail)=>{
  const filename='synthetic-cradle-1.csv',csv='Name\n'+Array.from({length:25},(_,i)=>`synthetic-cradle-${fail&&i===24?1:i+1}`).join('\n')+'\n',options={name:`synthetic-cradle-${width+1100}`,tables:{[filename]:{columns:{'column-1':{type:'text'}}}}},prefix='/api/v1/records/base-import'
  const upload=async(route,preview)=>{const body=new FormData();body.append('files',new Blob([csv],{type:'text/csv'}),filename);body.set('options',JSON.stringify(options));if(preview){body.set('identities',JSON.stringify(preview.identities));body.set('fingerprint',preview.fingerprint);body.set('acceptLoss','true')}const r=await fetch(h.origin+prefix+route,{method:'POST',headers:{cookie:person.session.cookie,origin:h.origin,'x-csrf-token':person.session.csrf},body});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value.data}
  const preview=await upload('/preview'),review=await upload('/review',preview),job=await json(person,prefix+'/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true})
  const first=await json(person,`${prefix}/jobs/${job.id}/resume`,{});assert.equal(first.state,'applying','NOTIFY-009 import spans multiple admitted batches')
  if(fail){
   const draft=await json(person,`/api/v1/records/bases/${preview.identities.appId}`),table=preview.identities.tables[filename]
   draft.tables.find(t=>t.id===table.entityId).fields.find(f=>f.id===table.fields['column-1']).unique=true
   const changed=await json(person,'/api/v1/records/schema-preview',draft)
   await request(person.session,'release.adopt',{kind:'manual_schema',previewId:changed.id})
   const refusal=await h.request(person.session,`${prefix}/jobs/${job.id}/resume`,{method:'POST',body:'{}'})
   assert.equal(refusal.status,500,'NOTIFY-009 current native constraint rejects the pending duplicate import row')
   assert.equal((await refusal.json()).error.code,'internal')
  }else{let next=first;for(let n=0;n<5&&next.state!=='completed';n++)next=await json(person,`${prefix}/jobs/${job.id}/resume`,{});assert.equal(next.state,'completed')}
  const status=await json(person,`${prefix}/jobs/${job.id}`)
  if(fail)assert.ok(status.progress.appliedRecords>0&&status.progress.appliedRecords<status.progress.plannedRecords,'NOTIFY-009 failure retains a publicly reported partial import')
  const before=await rows(job.id),repeated=await h.request(person.session,`${prefix}/jobs/${job.id}/resume`,{method:'POST',body:'{}'})
  assert.equal(repeated.status,fail?500:200)
  assert.deepEqual(await rows(job.id),before,'NOTIFY-009 repeated import observation never repeats progress')
  return job.id
 }
 return {async events(muted,phase){
  for(const person of people)for(const source of ['import','export'])for(const failed of [false,true]){
   // New-base imports require the installation owner; export schedules accept either current owner.
   if(source==='import'&&person!==owner)continue
   await tick(Date.now())
   const mailStart=(await h.mailMessages()).length
   let id
   if(source==='import'){id=await importJob(person,failed);await tick(Date.now())}
   else if(failed){id=await failedExport(person);await parkExport(person,id);await tick(Date.now())}
   else{id=await saveExport(person);await tick(Date.now());await tick(Date.now())}
   await check(id,person,muted&&person.id===h.owner,mailStart)
   if(source==='export')await removeExport(person,id)
  }
  assert.equal((await preferences(starter.session)).mutedKinds.includes('progress'),false,'NOTIFY-007 unaffected starter remains unmuted')
  console.log(`NOTIFY-009 ${width} ${phase}: import/export completion/failure, exact starters and provider mail; muted=${muted}`)
 },async close(){await role('member')}}
}
