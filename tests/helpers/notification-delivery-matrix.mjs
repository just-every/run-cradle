import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {execFileSync} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {notificationKinds,notificationKindsWithoutProducer} from '../../src/domains/channels/ports.ts'
import {launchAuthorityRuntime,createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

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
// Literal public progress wording, never read back from the notice under test.
const progressText={
 import:{completed:{title:'Import completed',body:'The import you started has finished. Open Settings to review it.'},failed:{title:'Import needs attention',body:'The import you started did not finish. Open Settings to review it.'}},
 export:{completed:{title:'Export completed',body:'The export you started has finished. Open Settings to review it.'},failed:{title:'Export needs attention',body:'The export you started did not finish. Open Settings to review it.'},stopped:{title:'Export needs attention',body:'Automatic recovery of the export you started stopped after repeated unsuccessful attempts. It tries again at its next scheduled time.'}},
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
 const tick=async at=>{const result=await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at});assert.equal(result.outcome,'ok',JSON.stringify(result));return result}
 const row=async(table,id)=>h.db.prepare(`SELECT id,version FROM ${table} WHERE id=?`).bind(id).first()
 const digestBefore=await h.db.prepare("SELECT recipients_json FROM channel_digest_settings WHERE id='digest'").first()
 const digestAutomation=await h.db.prepare("SELECT id,enabled FROM automations WHERE shipped_key='weekly-digest'").first()
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
   const session=sessionOf(n.operator_id)
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
 const sessionOf=id=>{const session=id===h.owner?h.ownerSession:id===other.id?other.session:id===progress.starter.id?progress.starter.session:null;assert.ok(session,`No matrix session for recipient ${id}`);return session}
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
  // Owner selection: a connection authored by a second current owner notifies
  // only its author; a legacy connection without owner_id (created before
  // 9044_file_store_connections.sql) notifies every active installation Base owner.
  const starter=progress.starter
  // The second current owner joins this base through its public collaborators door.
  await raw(`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:starter.id,role:'owner',destructive:false,version:0})
  const asStarter=async(path,input,status=200)=>{const response=await h.request(starter.session,path,{method:'POST',body:JSON.stringify(input)});assert.equal(response.status,status,await response.clone().text());return response.json()}
  for(const [label,session,legacy,recipients]of [['second-owner',starter.session,false,[starter.id]],['legacy-null-owner',h.ownerSession,true,[h.owner,starter.id]]]){
   const id=(await request(session,'connection.configure',{appId,adapterId:'google-calendar',name:`synthetic-cradle-${label}-${width}-${phase}`,accountId:provider.ownedCalendarId,scopes:[{resource:provider.ownedCalendarId,readFields:[],actions:['connection.sync']}],ownership:[],credentialRef:null})).connectionId
   const probe=async()=>{await request(session,'connection.check',{connectionId:id});await tick(Date.now());await tick(Date.now());return(await raw(`/api/v1/connections/${id}`)).data}
   const begin=await request(session,'connection.begin-consent',{connectionId:id,returnTo:'/app/settings'})
   const back=await h.request(session,'/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-1',state:new URL(begin.authorizationUrl).searchParams.get('state')}),{redirect:'manual'})
   assert.equal(back.status,303,await back.clone().text())
   assert.equal((await probe()).state,'connected')
   const author=(await h.db.prepare('SELECT owner_id FROM provider_connections WHERE id=?').bind(id).first()).owner_id
   assert.equal(author,legacy?h.owner:starter.id,`NOTIFY-009 ${label}: connection.configure records its authoring owner`)
   if(legacy)await h.db.prepare('UPDATE provider_connections SET owner_id=NULL WHERE id=?').bind(id).run()
   const mailStart=(await h.mailMessages()).length
   provider.deny(provider.ownedCalendarId);assert.equal((await probe()).state,'unavailable')
   const selected=(await read('outage')).filter(n=>n.subject_id===id)
   assert.deepEqual(selected.map(n=>n.operator_id).sort(),[...recipients].sort(),`NOTIFY-009 ${label}: exact outage recipient set`)
   await assertRows('outage',selected,muted,(await h.mailMessages()).slice(mailStart),recipients)
   provider.allow(provider.ownedCalendarId)
   rows.push(...selected)
  }
  // Connections and record automations each have exactly one author/owner. The
  // other recipient stays unmuted, but has no ownership and receives nothing.
  const expires=Date.now()+8000
  const saved=(await raw('/api/user-automations',{commandId:createUlid(),expiresAt:new Date(expires).toISOString(),definition:{name:`synthetic-cradle-stop-${width}-${phase}`,appId,entityId,event:'created',enabled:true,actions:[{kind:'update',fieldId:statusId,value:'must not run'}]}},201)).data.result.value
  // The second owner's automation expires in the same approval window.
  const authored=(await asStarter('/api/user-automations',{commandId:createUlid(),expiresAt:new Date(expires).toISOString(),definition:{name:`synthetic-cradle-second-owner-stop-${width}-${phase}`,appId,entityId,event:'created',enabled:true,actions:[{kind:'update',fieldId:statusId,value:'must not run'}]}},201)).data.result.value
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
  const authoredRun=await h.db.prepare("SELECT id,state FROM automation_runs WHERE automation_id=?").bind(authored.id).first()
  assert.equal(authoredRun?.state,'Cancelled','NOTIFY-009 the second owner\'s expired approval is fenced before any new effect')
  const authoredStop=(await read('outage')).filter(n=>n.subject_id===authoredRun.id)
  assert.deepEqual(authoredStop.map(n=>n.operator_id),[starter.id],'NOTIFY-009 an automation stop notifies exactly its author, never the installation owner')
  await assertRows('outage',authoredStop,muted,(await h.mailMessages()).slice(stopMail),[starter.id])
  const stopInbox=(await raw('/api/notifications')).notifications.find(n=>n.id===stopped[0].id)
  assert.equal(stopInbox.subject.available,true);assert.ok(stopInbox.subject.href.includes(run.id))
  assert.ok((await raw(`/api/user-automations/${saved.id}/runs`)).data.runs.some(r=>r.id===run.id),'NOTIFY-009 current owner can open the stopped run')
  rows.push(...stopped,...authoredStop)
  await tick(Date.now());assert.deepEqual(await eventRows('automation-stop'),stopped,'NOTIFY-009 repeated automation stop observation emits nothing new')
  assert.deepEqual((await read('outage')).filter(n=>n.subject_id===authoredRun.id),authoredStop,'NOTIFY-009 repeated observation never repeats the second owner\'s stop')
  // The installation owner's stop mails only when unmuted; the second owner is never muted.
  assert.equal((await h.mailMessages()).slice(stopMail).filter(m=>m.subject===titles.outage).length,muted?1:2)
  const current=(await raw(`/api/v1/apps/${appId}/entities/${entityId}/records/${created.ref.recordId}`)).data.record
  assert.equal(current.fields[statusId]?.value??null,null,'NOTIFY-009 stopped automation has no new effect')
  await raw(`/api/user-automations/${saved.id}/disable`,{commandId:createUlid(),version:saved.version})
  await asStarter(`/api/user-automations/${authored.id}/disable`,{commandId:createUlid(),version:authored.version})
  const voluntary=(await raw('/api/user-automations',{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-owner-stop',appId,entityId,event:'created',enabled:true,actions:[{kind:'update',fieldId:statusId,value:'must not run'}]}},201)).data.result.value
  await request(h.ownerSession,'record.create',{appId,entityId,values:{[nameId]:'synthetic-cradle-voluntary-stop'}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}])
  await raw(`/api/user-automations/${voluntary.id}/disable`,{commandId:createUlid(),version:voluntary.version})
  const beforeVoluntary=await read('outage');await tick(Date.now())
  assert.deepEqual(await read('outage'),beforeVoluntary,'NOTIFY-006 owner-requested stop creates no outage')
  const fresh=(await read('outage')).filter(n=>!initial.some(old=>old.id===n.id))
  assert.deepEqual(fresh.map(n=>n.id).sort(),rows.map(n=>n.id).sort(),'NOTIFY-009 no non-owner outage recipients')
  assert.equal((await preferences(other.session)).mutedKinds.includes('outage'),false)
  if(muted)retained.push({kind:'outage',ids:rows.filter(n=>n.operator_id===h.owner).map(n=>n.id)})
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
 // The matrix owns its digest configuration. Leaving it enabled lets later
 // Unknown-delivery ticks legitimately send two unrelated Monday digests.
 const digestNow=await h.db.prepare("SELECT version FROM channel_digest_settings WHERE id='digest'").first()
 await request(h.ownerSession,'digest.update',{version:digestNow.version,recipientIds:JSON.parse(digestBefore.recipients_json)})
 const digestCurrent=await h.db.prepare('SELECT id,version,enabled FROM automations WHERE id=?').bind(digestAutomation.id).first()
 if(digestCurrent.enabled!==digestAutomation.enabled)await request(h.ownerSession,`launch.automation.${digestAutomation.enabled?'enable':'disable'}`,{id:digestCurrent.id},ref('automation',digestCurrent))
 assert.equal((await h.db.prepare("SELECT recipients_json FROM channel_digest_settings WHERE id='digest'").first()).recipients_json,digestBefore.recipients_json,'NOTIFY-007 restores the original digest recipients after all matrix assertions')
 assert.equal((await h.db.prepare('SELECT enabled FROM automations WHERE id=?').bind(digestAutomation.id).first()).enabled,digestAutomation.enabled,'NOTIFY-007 restores the original digest schedule after all matrix assertions')
 const now=await settings();await request(h.ownerSession,'settings.update',{version:now.version,changes:{timezone:original.timezone,quietHoursStart:original.quietHours.start,quietHoursEnd:original.quietHours.end}})
 for(const [session,p]of [[h.ownerSession,original.preferences],[other.session,originalOther]]){const current=await preferences(session);await request(session,'preferences.update',{version:current.version,preferences:{timezone:p.timezone,mutedKinds:p.mutedKinds,digestEnabled:p.digestEnabled,progressEnabled:p.progressEnabled}})}
 await progress.close()
 // The handover case owns a separate installation and runs after the surrounding
 // matrix has restored its settings, preferences and operational ownership.
 await verifyImportStarterHandover(width)
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
 const rows=async subject=>(await h.db.prepare('SELECT n.id,n.operator_id,n.subject_id,n.title,n.body,n.version,n.updated_at,d.id AS delivery_id,d.state,d.group_id FROM notifications n LEFT JOIN channel_deliveries d ON d.notification_id=n.id WHERE n.kind=? AND n.subject_id=?').bind('progress',subject).all()).results
 const check=async(subject,person,muted,mailStart,[source,outcome],enabled=true)=>{
  const expected=progressText[source][outcome],notices=await rows(subject),p=await preferences(person.session)
  assert.equal(p.progressEnabled,enabled,'NOTIFY-009 starter completion preference read back')
  assert.equal(p.mutedKinds.includes('progress'),muted,'NOTIFY-007 progress email preference read back for this recipient')
  assert.deepEqual(notices.map(n=>n.operator_id),[person.id],'NOTIFY-009 progress reaches exactly its retained starter')
  const [notice]=notices;assert.ok(notice.delivery_id);assert.equal(notice.state,muted?'muted':'accepted')
  assert.deepEqual({title:notice.title,body:notice.body},expected,`NOTIFY-009 ${source} ${outcome} notice states its outcome`)
  const mail=(await h.mailMessages()).slice(mailStart)
  const email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(person.id).first()).email
  // Mail is selected by the expected wording and by its durable receipt, never by the notice's own title.
  assert.deepEqual(mail.filter(m=>m.subject===expected.title).flatMap(m=>m.personalizations.flatMap(p=>p.to.map(r=>r.email))),muted?[]:[email],'NOTIFY-007 progress exact provider-edge recipient mail')
  const receipts=mail.filter(m=>notice.group_id&&m.custom_args?.rer_delivery_id===notice.group_id).map(m=>({to:m.personalizations.flatMap(p=>p.to.map(r=>r.email)),subject:m.subject,text:(m.content??[]).map(c=>c.value).join('\n')}))
  assert.equal(receipts.length,muted?0:1,'NOTIFY-007 progress exact durable receipt mail count')
  for(const receipt of receipts){assert.deepEqual(receipt.to,[email],'NOTIFY-009 progress receipt recipient');assert.equal(receipt.subject,expected.title,`NOTIFY-009 ${source} ${outcome} provider-edge subject`);assert.ok(receipt.text.includes(`${expected.title}\n${expected.body}`),`NOTIFY-009 ${source} ${outcome} provider-edge body: ${receipt.text}`)}
  if(muted)assert.equal(mail.filter(m=>m.personalizations.some(p=>p.to.some(r=>r.email===email))).length,0,'NOTIFY-007 muted starter receives no provider-edge mail')
  const inbox=await h.request(person.session,'/api/notifications');assert.equal(inbox.status,200)
  const item=(await inbox.json()).notifications.find(n=>n.id===notice.id);assert.ok(item);assert.equal(item.subject.available,true);assert.equal(item.subject.href,'/app/settings')
  assert.deepEqual({title:item.title,body:item.body},expected,`NOTIFY-009 ${source} ${outcome} public inbox wording`)
  if(muted)retained.push({kind:'progress',ids:[notice.id]})
  return notice
 }
 const saveExport=async(person,bases=[LAUNCH_APP_ID])=>{
  const id=createUlid(),at=new Date(),localRule=`daily ${at.toISOString().slice(11,16)}`
  await request(person.session,'warehouse.save',{id,name:`synthetic-cradle-${width+1000}`,bases,mode:'full',format:'csv',destination:edge.destination,access:edge.access,localRule,timezone:'UTC',version:0})
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
 await check(failed,starter,false,defaultMail,['export','failed'],false)
 await removeExport(starter,failed)
 await prefs(starter,[],true)
 const successMail=(await h.mailMessages()).length,success=await saveExport(starter);await tick(Date.now());await tick(Date.now())
 await check(success,starter,false,successMail,['export','completed'])
 const unchanged=await rows(success);await tick(Date.now());assert.deepEqual(await rows(success),unchanged,'NOTIFY-009 repeated scheduled observation never repeats progress')
 await removeExport(starter,success)
 console.log(`NOTIFY-009 ${width}: failed export default on, success opt-in, starter only`)

 // A committed export never loses its owed notice. Only this synthetic D1 makes
 // the retained in-app notification principal unavailable while the real Worker
 // commits; recovery ticks at +1 min, +5 min and +1 h then owe exactly one notice.
 const system='00000000000000000000000001'
 await prefs(starter,['progress'],true)
 const owedMail=(await h.mailMessages()).length,owed=await saveExport(starter),committedAt=Date.now()
 await h.db.prepare("UPDATE authority_principals SET state='removed' WHERE id=? AND kind='system'").bind(system).run()
 let failing
 try{failing=await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:committedAt})}
 finally{await h.db.prepare("UPDATE authority_principals SET state='active' WHERE id=? AND kind='system'").bind(system).run()}
 assert.equal(failing.outcome,'exception','NOTIFY-009 the tick whose completion notice cannot be published still reports its exception')
 assert.ok((await h.db.prepare('SELECT last_slot FROM warehouse_exports WHERE id=?').bind(owed).first()).last_slot,'NOTIFY-009 the export committed before its notice publication failed')
 assert.deepEqual(await rows(owed),[],'NOTIFY-009 no notice exists while the notification principal is unavailable')
 await tick(committedAt+60000)
 assert.equal((await rows(owed)).length,1,'NOTIFY-009 exactly one starter notice for the committed export after recovery')
 const recovered=await check(owed,starter,true,owedMail,['export','completed'])
 for(const offset of [300000,3600000]){
  await tick(committedAt+offset)
  assert.deepEqual(await rows(owed),[recovered],'NOTIFY-009 further ticks never repeat the owed export notice')
 }
 const starterEmail=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(starter.id).first()).email
 assert.equal((await h.mailMessages()).slice(owedMail).filter(m=>m.personalizations.some(p=>p.to.some(r=>r.email===starterEmail))).length,0,'NOTIFY-009 the owed export notice sends zero provider-edge mail while progress email is muted')
 await removeExport(starter,owed)
 await prefs(starter,[],true)
 console.log(`NOTIFY-009 ${width}: committed export owed its notice through an unavailable notification principal; one notice after recovery`)

 // Restart an actual claimed execution at its emitted after-claim boundary.
 // The inspector locates application code; it neither replaces that code nor
 // supplies a production hook. Only the fixture's own workerd PID is stopped.
 const stopExport=async(id,invocation,release,onStopped=()=>{})=>{
   const processes=execFileSync('ps',['-axo','pid,ppid,stat,comm'],{encoding:'utf8'}).trim().split('\n').slice(1).map(line=>{const [pid,ppid,stat,...name]=line.trim().split(/\s+/);return {pid:Number(pid),ppid:Number(ppid),stat,name:name.join(' ')}})
   const owned=new Set([process.pid]);let changed=true
   while(changed){changed=false;for(const child of processes)if(owned.has(child.ppid)&&!owned.has(child.pid)){owned.add(child.pid);changed=true}}
   // An earlier stopped workerd that is not yet reaped has exited; it is not a candidate.
   const workers=processes.filter(child=>owned.has(child.pid)&&!child.stat.startsWith('Z')&&/workerd$/.test(child.name))
   assert.equal(workers.length,1,`NOTIFY-009 this fixture owns exactly one workerd to interrupt: ${JSON.stringify(workers)}`)
   console.log(`NOTIFY-009 ${width}: stop owned workerd PID ${workers[0].pid} after its export claim`)
   process.kill(workers[0].pid,'SIGKILL');onStopped()
   release()
   await invocation
   await h.restart()
   const claim=await h.db.prepare('SELECT running_id,running_started_at,running_slot,version,last_slot FROM warehouse_exports WHERE id=?').bind(id).first()
   assert.ok(claim.running_id,'NOTIFY-009 a runtime interruption retains the real export claim')
   assert.equal(claim.last_slot,null,'NOTIFY-009 the interrupted execution has not committed')
   const eventId=`warehouse-export:${id}:${claim.version}:${claim.running_slot}:failed`
   const attempt=await h.db.prepare('SELECT token,live_until FROM channel_progress_attempts WHERE event_id=?').bind(eventId).first()
   assert.equal(attempt.token,claim.running_id,'NOTIFY-009 the retained attempt belongs to the interrupted execution')
   return {id,eventId,claim}
 }
 const interruptedExport=async(retainedId,boundary='SELECT object_key FROM warehouse_objects WHERE export_id=? AND run_id=? ORDER BY object_key')=>{
  const id=retainedId??await saveExport(starter),inspector=new URL(await h.runtime.getInspectorURL())
  const state=async()=>({export:await h.db.prepare('SELECT state,running_id,running_failures,running_stalls,running_stopped_slot,last_slot FROM warehouse_exports WHERE id=?').bind(id).first(),objects:(await h.db.prepare('SELECT count(*) n FROM warehouse_objects WHERE export_id=?').bind(id).first()).n})
  const saved=await state(),matches=[],pauses=[],resolutions=[]
  inspector.protocol='http:';inspector.pathname='/json'
  const targets=await(await fetch(inspector)).json(),target=targets.find(t=>String(t.id).startsWith('core:user:'))
  assert.ok(target,'NOTIFY-009 the owned emitted Worker exposes its inspector target')
  const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),scripts=[]
  const breakpoints=new Set(),bindings=new Map()
  let serial=0,hit,stopped=false
  const paused=new Promise(resolve=>hit=resolve)
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
  const command=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++serial;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}))})
  socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data)
   if(message.id&&pending.has(message.id)){const waiter=pending.get(message.id);pending.delete(message.id);message.error?waiter.reject(new Error(message.error.message)):waiter.resolve(message.result)}
   if(message.method==='Debugger.scriptParsed')scripts.push(message.params)
   if(message.method==='Debugger.breakpointResolved')resolutions.push(message.params)
   if(message.method==='Debugger.paused'){pauses.push({reason:message.params.reason,hitBreakpoints:message.params.hitBreakpoints,location:message.params.callFrames?.[0]?.location});if(message.params.hitBreakpoints?.some(id=>breakpoints.has(id)))hit()}
  })
  try{
   await command('Debugger.enable')
   const needle=boundary
   const sources=await Promise.all(scripts.map(async script=>({...script,...await command('Debugger.getScriptSource',{scriptId:script.scriptId})})))
   for(const script of sources){
    const {scriptSource}=script,offset=scriptSource.indexOf(needle)
    if(offset<0)continue
    assert.equal(scriptSource.indexOf(needle,offset+1),-1,'NOTIFY-009 the emitted after-claim boundary is unambiguous')
    const before=scriptSource.slice(0,offset),location={scriptId:script.scriptId,lineNumber:before.split('\n').length-1,columnNumber:offset-before.lastIndexOf('\n')-1}
    const match={scriptId:script.scriptId,url:script.url,executionContextId:script.executionContextId,requested:location}
    matches.push(match)
    assert.ok(script.url,'NOTIFY-009 the emitted boundary has a module URL')
    const binding=JSON.stringify([script.url,location.lineNumber,location.columnNumber])
    // The module URL binds current and later parsed instances of this boundary.
    if(!bindings.has(binding)){
     const resolved=await command('Debugger.setBreakpointByUrl',{url:script.url,lineNumber:location.lineNumber,columnNumber:location.columnNumber})
     assert.ok(resolved.locations.length,'NOTIFY-009 the interruption boundary resolves in the emitted module')
     bindings.set(binding,resolved);breakpoints.add(resolved.breakpointId)
    }
    match.locations=bindings.get(binding).locations
   }
   assert.ok(breakpoints.size,'NOTIFY-009 the after-claim boundary is present in the emitted Worker')
   const before=await state()
   const invocation=(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()}).then(result=>({result}),error=>({error}))
   // An execution that ends before its boundary is a failure with its outcome,
   // never a wait for a pause that cannot come.
   const ended=await Promise.race([paused.then(()=>null),invocation])
   if(ended){
    assert.fail(`NOTIFY-009 the breakpoint did not pause before the scheduled execution ended: ${JSON.stringify({outcome:ended.result?.outcome??String(ended.error),targets:targets.map(({id,title,url})=>({id,title,url})),matches,saved,before,pauses,resolutions,after:await state()})}`)
   }
   return await stopExport(id,invocation,()=>socket.close(),()=>{stopped=true})
  }finally{
   // A failure before the stop resumes the paused Worker, so the runtime closes and
   // the failure is reported instead of holding the shard until its cap.
   if(breakpoints.size&&!stopped)await command('Debugger.resume').catch(()=>{})
   socket.close()
  }
 }
 for(const muted of [false,true]){
  await prefs(starter,muted?['progress']:[],true)
  const matchingMail=(await h.mailMessages()).length,matching=await interruptedExport(),heldAt=Date.now()
  // Advance only the notification lease, not the current execution ownership.
  await h.db.prepare("UPDATE channel_progress_attempts SET live_until='2000-01-01T00:00:00.000Z' WHERE event_id=?").bind(matching.eventId).run()
  await tick(heldAt+60000)
  assert.deepEqual(await rows(matching.id),[],'NOTIFY-009 an expired notification lease does not publish failure while the matching active execution claim remains')
  assert.equal((await h.mailMessages()).length,matchingMail,'NOTIFY-009 a matching active claim suppresses every premature failure mail')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE event_id=? AND outcome=?').bind(matching.eventId,'failed').first()).n,1,'NOTIFY-009 matching-claim protection preserves its write-ahead failed debt')
  // The synthetic crash clock makes the old execution credential expire before
  // the real scheduled door reclaims and completes the same retained run.
  await h.db.prepare('UPDATE warehouse_exports SET running_started_at=? WHERE id=?').bind(new Date(Date.now()-400000).toISOString(),matching.id).run()
  await tick(heldAt+120000);await tick(heldAt+180000)
  await check(matching.id,starter,muted,matchingMail,['export','completed'])
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_events WHERE event_id=?').bind(matching.eventId).first()).n,0,'NOTIFY-009 successful protected resume never creates a false failure event')
  assert.equal((await h.mailMessages()).slice(matchingMail).filter(message=>message.subject===progressText.export.failed.title).length,0,'NOTIFY-009 successful protected resume never sends failure mail')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(matching.id).first()).n,0,'NOTIFY-009 successful protected resume leaves no notification debt')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_attempts WHERE event_id=?').bind(matching.eventId).first()).n,0,'NOTIFY-009 successful protected resume leaves no attempt')
  await removeExport(starter,matching.id)

  const controlMail=(await h.mailMessages()).length,control=await interruptedExport(),controlAt=Date.now()
  // Crash fixture: the debt names a different execution from the retained
  // active claim. Matching merely the export id would suppress it incorrectly.
  await h.db.prepare("UPDATE channel_progress_attempts SET token='synthetic-cradle-1501',live_until='2000-01-01T00:00:00.000Z' WHERE event_id=?").bind(control.eventId).run()
  await tick(controlAt+60000);await tick(controlAt+120000)
  const published=await check(control.id,starter,muted,controlMail,['export','failed'])
  await tick(controlAt+180000)
  assert.deepEqual(await rows(control.id),[published],'NOTIFY-009 an unrelated claim does not hold or repeat another execution outcome')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(control.id).first()).n,0,'NOTIFY-009 the nonmatching execution outcome leaves no debt')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_attempts WHERE event_id=?').bind(control.eventId).first()).n,0,'NOTIFY-009 the nonmatching execution outcome leaves no attempt')
  await h.db.prepare('UPDATE warehouse_exports SET running_started_at=? WHERE id=?').bind(new Date(Date.now()-400000).toISOString(),control.id).run()
  const retiredControl=await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:controlAt+240000})
  assert.equal(retiredControl.outcome,'exception','NOTIFY-009 the nonmatching control cannot commit across its published outcome admission')
  assert.equal((await h.db.prepare('SELECT running_id FROM warehouse_exports WHERE id=?').bind(control.id).first()).running_id,null,'NOTIFY-009 the refused control resume releases its execution claim')
  await removeExport(starter,control.id)
 }
 // Keep the actual interrupted claim and token. Only the retained event's
 // version or slot is obsolete: either identity component must independently
 // release an expired notification attempt through the same scheduled door.
 const obsoleteFailures=[]
 for(const muted of [false,true])for(const obsolete of ['version','slot']){
  await prefs(starter,muted?['progress']:[],true)
  const id=await saveExport(starter),saved=(await json(starter,'/api/v1/warehouse-exports')).exports.find(e=>e.id===id)
  // Retain a real positive previous version for the obsolete-version fixture.
  await request(starter.session,'warehouse.save',{id,name:saved.name,bases:saved.bases,mode:saved.mode,format:saved.format,destination:saved.destination,localRule:saved.localRule,timezone:saved.timezone,version:saved.version})
  const mailStart=(await h.mailMessages()).length,control=await interruptedExport(id),at=Date.now()
  const label=`NOTIFY-009 ${width} obsolete-${obsolete} muted=${muted}`
  const eventId=`warehouse-export:${control.id}:${obsolete==='version'?control.claim.version-1:control.claim.version}:${obsolete==='slot'?'2000-01-01':control.claim.running_slot}:failed`
  try{
   await h.db.batch([
    h.db.prepare('UPDATE channel_progress_owed SET event_id=? WHERE event_id=?').bind(eventId,control.eventId),
    h.db.prepare("UPDATE channel_progress_attempts SET event_id=?,live_until='2000-01-01T00:00:00.000Z' WHERE event_id=?").bind(eventId,control.eventId),
   ])
   const claim=await h.db.prepare('SELECT state,running_id,running_started_at,running_slot,version,running_stopped_slot,owner_id FROM warehouse_exports WHERE id=?').bind(control.id).first()
   assert.deepEqual(claim,{state:'active',running_id:control.claim.running_id,running_started_at:control.claim.running_started_at,running_slot:control.claim.running_slot,version:control.claim.version,running_stopped_slot:null,owner_id:starter.id},`${label}: the active claim and retained starter are unchanged`)
   const attempt=await h.db.prepare('SELECT token,live_until FROM channel_progress_attempts WHERE event_id=?').bind(eventId).first()
   assert.equal(attempt.token,claim.running_id,`${label}: the expired attempt still matches the active claim token`)
   assert.ok(attempt.live_until<new Date(at).toISOString(),`${label}: the notification attempt has expired`)
   assert.notEqual(eventId,control.eventId,`${label}: only the retained event identity is obsolete`)
   await tick(at+60000);await tick(at+120000)
   assert.deepEqual((await rows(control.id)).map(n=>n.operator_id),[starter.id],`${label}: obsolete event publishes exactly one notice to its retained starter`)
   const published=await check(control.id,starter,muted,mailStart,['export','failed'])
   assert.deepEqual((await h.db.prepare('SELECT event_id,operator_id,notification_id FROM channel_events WHERE event_id=?').bind(eventId).all()).results,[{event_id:eventId,operator_id:starter.id,notification_id:published.id}],`${label}: the obsolete event has exactly its starter notice`)
   assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(control.id).first()).n,0,`${label}: publication clears the debt`)
   assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_attempts WHERE event_id=? OR event_id=?').bind(eventId,control.eventId).first()).n,0,`${label}: publication clears the expired attempt`)
   const deliveredMail=(await h.mailMessages()).slice(mailStart)
   await tick(at+180000)
   assert.deepEqual(await rows(control.id),[published],`${label}: later observation cannot repeat or update the notice`)
   assert.deepEqual((await h.mailMessages()).slice(mailStart),deliveredMail,`${label}: later observation sends no additional provider mail`)
   console.log(`${label}: PASS exact starter, notice, durable delivery, provider-edge mail and debt/attempt cleanup`)
  }catch(error){
   // Finish each independent fixture so a guard-removal run identifies both
   // identity controls, in both preference states, before failing this journey.
   console.error(`${label}: FAIL ${error.message}`)
   obsoleteFailures.push(error)
  }finally{
   // Let the current run release its claim before public removal. Publication
   // may have fenced its retained records snapshot, as in the token control.
   await h.db.prepare('UPDATE warehouse_exports SET running_started_at=? WHERE id=?').bind(new Date(Date.now()-400000).toISOString(),control.id).run()
   await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at+240000})
   assert.equal((await h.db.prepare('SELECT running_id FROM warehouse_exports WHERE id=?').bind(control.id).first()).running_id,null,`${label}: fixture resume releases its claim`)
   await tick(at+300000)
   await removeExport(starter,control.id)
  }
 }
 if(obsoleteFailures.length)throw new AggregateError(obsoleteFailures,`NOTIFY-009 ${width}: obsolete event identity controls failed`)
 await prefs(starter,[],true)
 console.log(`NOTIFY-009 ${width}: expired notification lease discriminates matching and unrelated active claims; protected resume completes once with no false failure or debt`)

 // Repeated interrupted resumptions follow the finite recovery policy: no report
 // while recovery continues, exactly one needs-attention outcome once it stops,
 // the resumable claim kept, and the next scheduled time reporting its own outcome.
 const aged=id=>h.db.prepare('UPDATE warehouse_exports SET running_started_at=? WHERE id=?').bind(new Date(Date.now()-400000).toISOString(),id).run()
 const recoveryState=id=>h.db.prepare('SELECT running_id,running_started_at,running_failures,running_stopped_slot,last_slot FROM warehouse_exports WHERE id=?').bind(id).first()
 for(const muted of [false,true]){
  await prefs(starter,muted?['progress']:[],true)
  const mail=(await h.mailMessages()).length,run=await interruptedExport(),at=Date.now()
  // The synthetic crash clock ages each lease; the real scheduled door resumes.
  await aged(run.id);await interruptedExport(run.id)
  await tick(at+60000)
  assert.deepEqual(await rows(run.id),[],'NOTIFY-009 automatic recovery continues within its finite policy without a report')
  // Past the stopped execution's lease on the scheduled clock: recovery stops here.
  await aged(run.id);await tick(at+420000)
  const stopped=await check(run.id,starter,muted,mail,['export','stopped'])
  const kept=await recoveryState(run.id)
  assert.equal(kept.running_id,run.claim.running_id,'NOTIFY-009 stopping automatic recovery keeps the resumable claim')
  assert.ok(kept.running_stopped_slot,'NOTIFY-009 the stop is durable')
  for(const offset of [480000,3600000,23*3600000]){
   await tick(at+offset)
   assert.deepEqual(await rows(run.id),[stopped],'NOTIFY-009 a stopped recovery is reported exactly once')
  }
  assert.equal((await h.mailMessages()).slice(mail).length,muted?0:1,'NOTIFY-009 a stopped recovery sends its starter at most one mail, none when muted')
  // The stated next step: the export tries again at its next scheduled time. The
  // starter has read the report, so the later outcome is its own row (NOTIFY-006).
  assert.equal((await h.request(starter.session,`/api/notifications/${stopped.id}/read`,{method:'POST',body:'{}'})).status,204)
  const nextMail=(await h.mailMessages()).length
  await aged(run.id)
  const retired=await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at+86400000+60000})
  assert.equal(retired.outcome,'exception','NOTIFY-009 the next scheduled time retires the stale retained transfer under the records-changed rule')
  await tick(at+86400000+120000)
  const outcomes=await rows(run.id),later=outcomes.find(n=>n.id!==stopped.id)
  assert.deepEqual(outcomes.map(n=>n.title).sort(),[progressText.export.completed.title,progressText.export.stopped.title].sort(),'NOTIFY-009 the next scheduled time reports exactly one completion and no second failure')
  assert.deepEqual({to:later.operator_id,title:later.title,body:later.body,state:later.state},{to:starter.id,...progressText.export.completed,state:muted?'muted':'accepted'})
  const email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(starter.id).first()).email,completedMail=(await h.mailMessages()).slice(nextMail)
  assert.deepEqual(completedMail.filter(m=>later.group_id&&m.custom_args?.rer_delivery_id===later.group_id).map(m=>({to:m.personalizations.flatMap(p=>p.to.map(r=>r.email)),subject:m.subject})),muted?[]:[{to:[email],subject:progressText.export.completed.title}],'NOTIFY-009 the later completion mails exactly its starter per preference')
  assert.equal(completedMail.length,muted?0:1)
  assert.equal((await recoveryState(run.id)).running_id,null)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(run.id).first()).n,0,'NOTIFY-009 the later completion leaves no debt')
  assert.equal((await h.db.prepare("SELECT count(*) n FROM channel_progress_attempts WHERE event_id LIKE 'warehouse-export:'||?||':%'").bind(run.id).first()).n,0,'NOTIFY-009 the later completion leaves no attempt')
  await removeExport(starter,run.id)
 }
 const preClaimStarted=performance.now()
 // Destination authority can fail before the resumed claim batch. The durable
 // recovery count must advance even though no new attempt lease can be written.
 for(const muted of [false,true]){
  await prefs(starter,muted?['progress']:[],true)
  const mail=(await h.mailMessages()).length,run=await interruptedExport(),at=Date.now()
  const sealed=(await h.db.prepare('SELECT sealed_json FROM warehouse_exports WHERE id=?').bind(run.id).first()).sealed_json
  const attempt=await h.db.prepare('SELECT * FROM channel_progress_attempts WHERE event_id=?').bind(run.eventId).first()
  await h.db.prepare('UPDATE warehouse_exports SET sealed_json=NULL WHERE id=?').bind(run.id).run()
  try{
   await aged(run.id)
   assert.equal((await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at+60000})).outcome,'exception','NOTIFY-009 pre-claim resume fails without destination authority')
   const counted=await recoveryState(run.id)
   assert.equal(counted.running_failures,1,'NOTIFY-009 pre-claim resume failure is counted durably')
   assert.equal(counted.running_id,run.claim.running_id,'NOTIFY-009 pre-claim failure retains safe claim custody')
   assert.deepEqual(await h.db.prepare('SELECT * FROM channel_progress_attempts WHERE event_id=?').bind(run.eventId).first(),attempt,'NOTIFY-009 pre-claim failure never reaches the attempt claim batch')
   assert.deepEqual(await rows(run.id),[],'NOTIFY-009 pre-claim failure is not reported before the finite bound')
   await aged(run.id);await tick(at+420000)
   const stopped=await check(run.id,starter,muted,mail,['export','stopped'])
   assert.equal((await recoveryState(run.id)).running_id,run.claim.running_id)
   assert.ok((await recoveryState(run.id)).running_stopped_slot)
   await tick(at+480000);await tick(at+3600000)
   assert.deepEqual(await rows(run.id),[stopped],'NOTIFY-009 pre-claim recovery stop is published once')
   assert.equal((await h.mailMessages()).slice(mail).length,muted?0:1,'NOTIFY-009 pre-claim recovery stop mails only the unmuted starter once')
   assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(run.id).first()).n,0)
   assert.equal((await h.request(starter.session,`/api/notifications/${stopped.id}/read`,{method:'POST',body:'{}'})).status,204)
  }finally{await h.db.prepare('UPDATE warehouse_exports SET sealed_json=? WHERE id=?').bind(sealed,run.id).run()}
  await aged(run.id)
  assert.equal((await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at+86400000+60000})).outcome,'exception')
  await tick(at+86400000+120000)
  assert.deepEqual((await rows(run.id)).map(n=>n.title).sort(),[progressText.export.stopped.title,progressText.export.completed.title].sort(),'NOTIFY-009 pre-claim recovery preserves the later distinct completion')
  assert.equal((await recoveryState(run.id)).running_id,null)
  await removeExport(starter,run.id)
 }
 console.log(`NOTIFICATION_SCENARIO width=${width} journey=pre-claim-resume seconds=${((performance.now()-preClaimStarted)/1000).toFixed(3)}`)
 console.log(`NOTIFY-009 ${width}: pre-claim resume failure is counted, bounded and reported once with safe custody and later completion`)

 const staleWorkerStarted=performance.now()
 // Let an old real execution continue after another scheduled invocation has
 // re-claimed its run. Each request waits only at its own provider edge.
 for(const muted of [false,true]){
  await prefs(starter,muted?['progress']:[],true)
  const mail=(await h.mailMessages()).length,id=await saveExport(starter),at=Date.now(),oldHold=edge.holdNextPut()
  const old=(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at})
  let replacementHold,replacement
  try{
   assert.equal(await Promise.race([oldHold.reached.then(()=>null),old]),null,'NOTIFY-009 original execution reaches the provider before re-claim')
   const original=await recoveryState(id);assert.ok(original.running_id)
   await aged(id)
   replacementHold=edge.holdNextPut()
   replacement=(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at+60000})
   const ended=await Promise.race([replacementHold.reached.then(()=>null),replacement])
   assert.equal(ended,null,'NOTIFY-009 replacement reaches the provider while the stale execution is still live')
   const current=await recoveryState(id)
   assert.equal(current.running_id,original.running_id)
   assert.notEqual(current.running_started_at,original.running_started_at,'NOTIFY-009 re-claim replaces execution ownership')
   const custody=async()=>({objects:(await h.db.prepare('SELECT * FROM warehouse_objects WHERE export_id=? ORDER BY object_key').bind(id).all()).results,attempts:(await h.db.prepare("SELECT * FROM channel_progress_attempts WHERE event_id LIKE 'warehouse-export:'||?||':%' ORDER BY event_id").bind(id).all()).results,owed:(await h.db.prepare('SELECT * FROM channel_progress_owed WHERE subject_id=? ORDER BY event_id').bind(id).all()).results,writes:(await h.db.prepare('SELECT * FROM lifecycle_file_writes WHERE object_key=? AND started_at=?').bind('warehouse:'+id,current.running_started_at).all()).results})
   const before=await custody(),deletes=edge.calls.filter(c=>c.method==='DELETE').length
   assert.ok(before.objects.length&&before.attempts.length&&before.owed.length&&before.writes.length,'NOTIFY-009 replacement positively holds object, attempt, debt and file-write custody')
   oldHold.release()
   assert.equal((await old).outcome,'exception','NOTIFY-009 stale execution is refused after re-claim')
   assert.deepEqual(await recoveryState(id),current,'NOTIFY-009 stale execution cannot commit or release the replacement claim')
   assert.deepEqual(await custody(),before,'NOTIFY-009 stale execution cannot clean up objects, settle the replacement attempt or retire its debt')
   assert.equal(edge.calls.filter(c=>c.method==='DELETE').length,deletes,'NOTIFY-009 stale execution performs no provider cleanup')
   assert.deepEqual(await rows(id),[],'NOTIFY-009 stale execution cannot report over a live replacement')
   assert.equal((await h.mailMessages()).length,mail,'NOTIFY-009 no false failure mail while replacement remains live')
   replacementHold.release()
   assert.equal((await replacement).outcome,'ok','NOTIFY-009 the concurrently valid replacement completes')
   await tick(at+120000)
   await check(id,starter,muted,mail,['export','completed'])
   assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(id).first()).n,0)
   assert.equal((await h.db.prepare("SELECT count(*) n FROM channel_progress_attempts WHERE event_id LIKE 'warehouse-export:'||?||':%'").bind(id).first()).n,0)
  }finally{oldHold.release();replacementHold?.release();await old;await replacement}
  await removeExport(starter,id)
 }
 console.log(`NOTIFICATION_SCENARIO width=${width} journey=stale-worker seconds=${((performance.now()-staleWorkerStarted)/1000).toFixed(3)}`)
 console.log(`NOTIFY-009 ${width}: stale execution after re-claim cannot commit, clean up, settle or publish over its live replacement`)

 // An execution that adds retained objects before it stops made useful progress:
 // it extends recovery, but never past four unsuccessful executions in total.
 {
  await prefs(starter,[],true)
  const appId=createUlid(),tables=Array.from({length:4},(_,index)=>{const id=createUlid(),field=createUlid();return {id,label:`Recovery table ${index+1}`,primaryFieldId:field,fields:[{id:field,label:'Name',type:'text',required:true,unique:false}]}})
  const preview=await json(owner,'/api/v1/records/schema-preview',{appId,name:'Synthetic recovery export',tables})
  await request(owner.session,'release.adopt',{kind:'manual_schema',previewId:preview.id})
  await json(owner,`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:starter.id,role:'owner',destructive:false,version:0})
  const advancingExport=async retainedId=>{
   const id=retainedId??await saveExport(starter,[LAUNCH_APP_ID,appId])
   const before=(await h.db.prepare('SELECT object_key FROM warehouse_objects WHERE export_id=?').bind(id).all()).results
   const paths=new Set(before.map(row=>`/${edge.destination.bucket}/${edge.destination.prefix}/${row.object_key}`)),initial=paths.size
   const held=edge.holdNextPut(path=>{const key=decodeURIComponent(path);if(!key.includes('/'+id+'/')||paths.has(key))return false;paths.add(key);return paths.size-initial===2})
   const invocation=(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()}).then(result=>({result}),error=>({error}))
   try{
    const ended=await Promise.race([held.reached.then(()=>null),invocation])
    assert.equal(ended,null,'NOTIFY-009 the scheduled execution reaches its retained-object boundary')
    const count=(await h.db.prepare('SELECT count(*) n FROM warehouse_objects WHERE export_id=?').bind(id).first()).n
    assert.equal(count,initial+2,'NOTIFY-009 the real execution retains two new objects before its worker process is stopped')
    console.log(`NOTIFY-009 ${width}: provider edge held with retained objects ${initial} then ${count}`)
    return await stopExport(id,invocation,held.release)
   }finally{held.release()}
  }
  const mail=(await h.mailMessages()).length,run=await advancingExport(),at=Date.now(),retainedObjects=async()=>(await h.db.prepare('SELECT count(*) n FROM warehouse_objects WHERE export_id=?').bind(run.id).first()).n,counts=[await retainedObjects()]
  for(let n=1;n<4;n++){
   await aged(run.id);await advancingExport(run.id);counts.push(await retainedObjects())
   assert.deepEqual(await rows(run.id),[],'NOTIFY-009 an advancing run is not reported before its total bound')
  }
  assert.ok(counts.every((count,index)=>count>(counts[index-1]??0)),'NOTIFY-009 each interrupted execution added retained objects')
  await aged(run.id);await tick(at+420000)
  await check(run.id,starter,false,mail,['export','stopped'])
  assert.equal((await recoveryState(run.id)).running_id,run.claim.running_id)
  await aged(run.id)
  assert.equal((await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at+86400000+60000})).outcome,'exception')
  await tick(at+86400000+120000)
  await removeExport(starter,run.id)
 }
 // A live worker held at the provider edge inside its lease is never counted.
 for(const muted of [false,true]){
  await prefs(starter,muted?['progress']:[],true)
  const mail=(await h.mailMessages()).length,id=await saveExport(starter),at=Date.now(),held=edge.holdNextPut()
  const slow=(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at})
  await held.reached
  const live=await recoveryState(id);assert.ok(live.running_id)
  for(const offset of [60000,120000,180000])await tick(at+offset)
  assert.deepEqual(await recoveryState(id),live,'NOTIFY-009 a live slow worker is never counted or re-claimed')
  assert.deepEqual(await rows(id),[],'NOTIFY-009 a live slow worker is never reported as failed')
  held.release()
  assert.equal((await slow).outcome,'ok')
  await tick(at+240000)
  await check(id,starter,muted,mail,['export','completed'])
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(id).first()).n,0)
  await removeExport(starter,id)
 }
 await prefs(starter,[],true)
 console.log(`NOTIFY-009 ${width}: repeated interrupted resumptions stop automatic recovery with one report and a kept claim; the next scheduled time completes once; a live slow worker is never counted`)

 // Completion describes the current job only: removal or a saved new version
 // must retire an unpublished old completion without creating mail.
 for(const operation of ['removed','edited']){
  const id=await saveExport(starter),mailBefore=(await h.mailMessages()).length
  await h.db.prepare("UPDATE authority_principals SET state='removed' WHERE id=? AND kind='system'").bind(system).run()
  let blocked
  try{blocked=await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()})}
  finally{await h.db.prepare("UPDATE authority_principals SET state='active' WHERE id=? AND kind='system'").bind(system).run()}
  assert.equal(blocked.outcome,'exception')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(id).first()).n,1,'NOTIFY-009 completion was owed before the export changed')
  if(operation==='removed')await removeExport(starter,id)
  else await parkExport(starter,id)
  await tick(Date.now()+60000)
  assert.deepEqual(await rows(id),[],`NOTIFY-009 ${operation} export completion is not delivered`)
  assert.equal((await h.mailMessages()).length,mailBefore,`NOTIFY-009 ${operation} export completion creates no provider-edge mail`)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(id).first()).n,0,`NOTIFY-009 ${operation} export completion debt is retired`)
  if(operation==='edited')await removeExport(starter,id)
 }

 const importJob=async(person,fail,owed=false,beforeFailure)=>{
  const filename='synthetic-cradle-1.csv',csv='Name\n'+Array.from({length:25},(_,i)=>`synthetic-cradle-${fail&&i===24?1:i+1}`).join('\n')+'\n',options={name:`synthetic-cradle-${width+1100}`,tables:{[filename]:{columns:{'column-1':{type:'text'}}}}},prefix='/api/v1/records/base-import'
  const upload=async(route,preview)=>{const body=new FormData();body.append('files',new Blob([csv],{type:'text/csv'}),filename);body.set('options',JSON.stringify(options));if(preview){body.set('identities',JSON.stringify(preview.identities));body.set('fingerprint',preview.fingerprint);body.set('acceptLoss','true')}const r=await fetch(h.origin+prefix+route,{method:'POST',headers:{cookie:person.session.cookie,origin:h.origin,'x-csrf-token':person.session.csrf},body});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value.data}
  const preview=await upload('/preview'),review=await upload('/review',preview),job=await json(person,prefix+'/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true})
  const first=await json(person,`${prefix}/jobs/${job.id}/resume`,{});assert.equal(first.state,'applying','NOTIFY-009 import spans multiple admitted batches')
  if(fail){
   const draft=await json(person,`/api/v1/records/bases/${preview.identities.appId}`),table=preview.identities.tables[filename]
   draft.tables.find(t=>t.id===table.entityId).fields.find(f=>f.id===table.fields['column-1']).unique=true
   const changed=await json(person,'/api/v1/records/schema-preview',draft)
   await request(person.session,'release.adopt',{kind:'manual_schema',previewId:changed.id})
   if(beforeFailure)await beforeFailure()
   const refusal=await h.request(person.session,`${prefix}/jobs/${job.id}/resume`,{method:'POST',body:'{}'})
   assert.equal(refusal.status,500,'NOTIFY-009 current native constraint rejects the pending duplicate import row')
   assert.equal((await refusal.json()).error.code,'internal')
  }else if(owed){
   // The import kit commits completion before its notice publishes; only this
   // synthetic D1 makes the retained notification principal unavailable meanwhile.
   await h.db.prepare("UPDATE authority_principals SET state='removed' WHERE id=? AND kind='system'").bind(system).run()
   let refused
   try{for(let n=0;n<6&&!refused;n++){const r=await h.request(person.session,`${prefix}/jobs/${job.id}/resume`,{method:'POST',body:'{}'});if(r.status!==200)refused=r}}
   finally{await h.db.prepare("UPDATE authority_principals SET state='active' WHERE id=? AND kind='system'").bind(system).run()}
   assert.equal(refused?.status,500,'NOTIFY-009 the request whose import completion notice cannot be published still reports its exception')
  }else{let next=first;for(let n=0;n<5&&next.state!=='completed';n++)next=await json(person,`${prefix}/jobs/${job.id}/resume`,{});assert.equal(next.state,'completed')}
  const status=await json(person,`${prefix}/jobs/${job.id}`)
  if(owed){assert.equal(status.job.state,'completed','NOTIFY-009 the import committed before its notice publication failed');return job.id}
  if(fail)assert.ok(status.progress.appliedRecords>0&&status.progress.appliedRecords<status.progress.plannedRecords,'NOTIFY-009 failure retains a publicly reported partial import')
  if(beforeFailure)return job.id
  const before=await rows(job.id),repeated=await h.request(person.session,`${prefix}/jobs/${job.id}/resume`,{method:'POST',body:'{}'})
  assert.equal(repeated.status,fail?500:200)
  assert.deepEqual(await rows(job.id),before,'NOTIFY-009 repeated import observation never repeats progress')
  return job.id
 }
 // Native import completion has the same commit-then-publish shape and owes its
 // notice in the kit's completing batch; recovery ticks deliver exactly one.
 await prefs(owner,[...notificationKinds],true)
 const importMail=(await h.mailMessages()).length,imported=await importJob(owner,false,true),importedAt=Date.now()
 assert.deepEqual(await rows(imported),[],'NOTIFY-009 no import notice exists while the notification principal is unavailable')
 await tick(importedAt+60000)
 assert.equal((await rows(imported)).length,1,'NOTIFY-009 exactly one starter notice for the committed import after recovery')
 const importNotice=await check(imported,owner,true,importMail,['import','completed'])
 for(const offset of [300000,3600000]){
  await tick(importedAt+offset)
  assert.deepEqual(await rows(imported),[importNotice],'NOTIFY-009 further ticks never repeat the owed import notice')
 }
 console.log(`NOTIFY-009 ${width}: committed import owed its notice through an unavailable notification principal; one notice after recovery`)

 // Public undo reverses a completed import before its publication can recover.
 const undoneMail=(await h.mailMessages()).length,undoneImport=await importJob(owner,false,true)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(undoneImport).first()).n,1)
 let undo
 for(let n=0;n<8;n++){undo=await json(owner,`/api/v1/records/base-import/jobs/${undoneImport}/undo`,{});if(undo.state==='undone')break}
 assert.equal(undo.state,'undone','NOTIFY-009 public import undo completes before publication')
 await tick(Date.now()+60000)
 assert.deepEqual(await rows(undoneImport),[],'NOTIFY-009 undone import completion is not delivered')
 assert.equal((await h.mailMessages()).length,undoneMail,'NOTIFY-009 undone import completion creates no provider-edge mail')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(undoneImport).first()).n,0,'NOTIFY-009 undone import completion debt is retired')

 // Losing the imported base's membership removes both API and rendered links.
 // This newly created base is isolated from every later matrix event.
 const inaccessibleImport=await importJob(owner,false,true)
 const destination=(await h.db.prepare('SELECT destination FROM ik_jobs WHERE id=?').bind(inaccessibleImport).first()).destination
 const membership=await h.db.prepare("SELECT state FROM authority_memberships WHERE principal_id=? AND app_id=?").bind(owner.id,destination).first()
 assert.equal(membership.state,'active')
 await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=? AND app_id=?").bind(owner.id,destination).run()
 try{
  const denied=await h.request(owner.session,`/api/v1/records/bases/${destination}`)
  assert.equal(denied.status,403,'NOTIFY-009 the starter has lost current base access')
  await tick(Date.now()+60000)
  const [notice]=await rows(inaccessibleImport);assert.ok(notice)
  const inbox=await h.request(owner.session,'/api/notifications');assert.equal(inbox.status,200)
  const item=(await inbox.json()).notifications.find(n=>n.id===notice.id);assert.ok(item)
  assert.equal(item.subject.available,false,'NOTIFY-005 inaccessible progress subject is unavailable')
  assert.equal(item.subject.href,undefined,'NOTIFY-005 inaccessible progress subject has no link')
  assert.equal(item.title,'Notification unavailable');assert.equal(item.body,'')
  assert.equal(item.outcome.title,notice.title,'NOTIFY-005 the retained starter keeps the outcome title beside the unavailable subject')
  assert.ok(item.outcome.body,'NOTIFY-005 the retained starter reads a generic outcome')
  assert.notEqual(item.outcome.body,notice.body,'NOTIFY-005 an unavailable subject gets its own outcome description')
  let browser,context
  try{
   browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
   context=await browser.newContext({viewport:{width,height:width===390?844:900}})
   await context.addCookies([{name:owner.session.cookie.split('=')[0],value:owner.session.cookie.slice(owner.session.cookie.indexOf('=')+1),url:h.origin}])
   const page=await context.newPage(),errors=[]
   page.on('pageerror',error=>errors.push(error.message))
   await page.goto(h.origin+'/app/notifications')
   const rendered=page.locator(`#notification-${notice.id}`)
   await rendered.getByRole('heading',{name:item.outcome.title,exact:true}).waitFor()
   assert.equal(await rendered.getByRole('link',{name:'Related record',exact:true}).count(),0,'NOTIFY-005 inaccessible progress row renders no Related record link')
   assert.equal(await rendered.locator('p').first().textContent(),item.outcome.body,'NOTIFY-005 the row renders the API outcome body')
   assert.ok((await rendered.textContent()).includes('Related record is unavailable'))
   await rendered.scrollIntoViewIfNeeded()
   const output=path.resolve(process.env.CRADLE_LAUNCH_NOTIFICATIONS_EVIDENCE??'../evidence/de-launch-notifications')
   await mkdir(output,{recursive:true})
   await page.screenshot({path:path.join(output,`inaccessible-progress-${width}.png`)})
   assert.deepEqual(errors,[])
  }finally{try{await context?.close()}finally{await browser?.close()}}
 }finally{await h.db.prepare("UPDATE authority_memberships SET state='active',version=version+1 WHERE principal_id=? AND app_id=?").bind(owner.id,destination).run()}

 // A single failed persistence write cannot lose a real failure outcome. The
 // fixture faults c41's post-failure INSERT, or the journal design's settlement
 // DELETE; the latter must leave its write-ahead fact held until the lease ends.
 const failurePreferences=await preferences(owner.session)
 await prefs(owner,[],true)
 const journal=await h.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='channel_progress_attempts'").first()
 const faultFailure=()=>h.db.prepare(journal
  ?"CREATE TRIGGER synthetic_cradle_abort_failure_settlement BEFORE DELETE ON channel_progress_attempts BEGIN SELECT RAISE(ABORT,'synthetic-cradle-1401'); END"
  :"CREATE TRIGGER synthetic_cradle_abort_failure_settlement BEFORE INSERT ON channel_progress_owed WHEN NEW.outcome='failed' BEGIN SELECT RAISE(ABORT,'synthetic-cradle-1401'); END").run()
 const clearFailure=()=>h.db.prepare('DROP TRIGGER IF EXISTS synthetic_cradle_abort_failure_settlement').run()
 const failureMail=(await h.mailMessages()).length
 let lostExport,lostImport
 await faultFailure()
 try{lostExport=await failedExport(starter)}finally{await clearFailure()}
 await removeExport(starter,lostExport)
 try{lostImport=await importJob(owner,true,false,faultFailure)}finally{await clearFailure()}
 assert.deepEqual(await rows(lostExport),[],'NOTIFY-009 an unsettled export failure is not published while its attempt is live')
 assert.deepEqual(await rows(lostImport),[],'NOTIFY-009 an unsettled import failure is not published while its attempt is live')
 const failureAt=Date.now()
 await tick(failureAt+60000)
 assert.deepEqual(await rows(lostExport),[],'NOTIFY-009 a live export attempt holds its write-ahead failure')
 assert.deepEqual(await rows(lostImport),[],'NOTIFY-009 a live import attempt holds its write-ahead failure')
 await tick(failureAt+300000)
 const exportFailure=await rows(lostExport),importFailure=await rows(lostImport)
 assert.equal(exportFailure.length,1,'NOTIFY-009 failed export recovers exactly one failure notice after its settlement write failed and its schedule was removed')
 assert.equal(importFailure.length,1,'NOTIFY-009 failed import recovers exactly one failure notice after its settlement write failed without another resume')
 assert.deepEqual(exportFailure.map(n=>n.operator_id),[starter.id],'NOTIFY-009 removed export failure reaches exactly its starter')
 assert.deepEqual({title:exportFailure[0].title,body:exportFailure[0].body},progressText.export.failed)
 assert.equal(exportFailure[0].state,'accepted')
 const failureMessages=(await h.mailMessages()).slice(failureMail)
 assert.deepEqual(failureMessages.filter(m=>m.subject===progressText.export.failed.title).flatMap(m=>m.personalizations.flatMap(p=>p.to.map(r=>r.email))),[starterEmail],'NOTIFY-009 recovered export failure mails exactly its starter')
 const exportReceipt=failureMessages.filter(m=>exportFailure[0].group_id&&m.custom_args?.rer_delivery_id===exportFailure[0].group_id)
 assert.equal(exportReceipt.length,1);assert.equal(exportReceipt[0].subject,progressText.export.failed.title)
 assert.ok(exportReceipt[0].content.map(c=>c.value).join('\n').includes(`${progressText.export.failed.title}\n${progressText.export.failed.body}`),'NOTIFY-009 recovered export failure provider-edge body states failure')
 const exportInbox=await h.request(starter.session,'/api/notifications');assert.equal(exportInbox.status,200)
 const removedSubject=(await exportInbox.json()).notifications.find(n=>n.id===exportFailure[0].id);assert.ok(removedSubject)
 assert.equal(removedSubject.subject.available,false);assert.equal(removedSubject.subject.href,undefined)
 assert.equal(removedSubject.title,'Notification unavailable');assert.equal(removedSubject.body,'')
 assert.equal(removedSubject.outcome.title,exportFailure[0].title,'NOTIFY-005 the removed export keeps its outcome title')
 assert.ok(removedSubject.outcome.body,'NOTIFY-005 the removed export starter reads a generic outcome')
 assert.notEqual(removedSubject.outcome.body,exportFailure[0].body,'NOTIFY-005 the removed export gets its own outcome description')
 await check(lostImport,owner,false,failureMail,['import','failed'])
 for(const offset of [3600000,86400000]){
  await tick(failureAt+offset)
  assert.deepEqual(await rows(lostExport),exportFailure,'NOTIFY-009 later ticks never repeat the recovered export failure')
  assert.deepEqual(await rows(lostImport),importFailure,'NOTIFY-009 later ticks never repeat the recovered import failure')
  const messages=(await h.mailMessages()).slice(failureMail)
  for(const [notice,expected]of [[exportFailure[0],progressText.export.failed],[importFailure[0],progressText.import.failed]])assert.equal(messages.filter(m=>m.subject===expected.title&&m.custom_args?.rer_delivery_id===notice.group_id).length,1,'NOTIFY-009 later ticks never repeat recovered failure mail')
 }
 for(const id of [lostExport,lostImport])assert.equal((await h.db.prepare('SELECT count(*) n FROM channel_progress_owed WHERE subject_id=?').bind(id).first()).n,0,'NOTIFY-009 recovered failure leaves no owed row')
 await prefs(owner,failurePreferences.mutedKinds,failurePreferences.progressEnabled)
 console.log(`NOTIFY-009 ${width}: failed export and import survive a failed ${journal?'journal settlement':'post-failure debt'} write, no import resume, removed export schedule, exactly one notice and mail each`)

 // A starter who muted progress mail still reads a removed failed export's
 // generic outcome beside its neutral subject; nobody else sees it.
 await prefs(starter,['progress'],true)
 const mutedMail=(await h.mailMessages()).length,mutedFailure=await failedExport(starter)
 await removeExport(starter,mutedFailure)
 const [mutedNotice]=await rows(mutedFailure)
 assert.deepEqual({to:mutedNotice.operator_id,title:mutedNotice.title,body:mutedNotice.body,state:mutedNotice.state},{to:starter.id,...progressText.export.failed,state:'muted'})
 const mutedItem=(await(await h.request(starter.session,'/api/notifications')).json()).notifications.find(n=>n.id===mutedNotice.id)
 assert.deepEqual({title:mutedItem.title,body:mutedItem.body,available:mutedItem.subject.available,label:mutedItem.subject.label,href:mutedItem.subject.href},{title:'Notification unavailable',body:'',available:false,label:'Unavailable',href:undefined},'NOTIFY-005 the removed export subject stays neutral')
 assert.equal(mutedItem.outcome.title,mutedNotice.title,'NOTIFY-005 the muted retained starter keeps the needs-attention outcome title')
 assert.ok(mutedItem.outcome.body,'NOTIFY-005 muting preserves the retained starter outcome')
 assert.notEqual(mutedItem.outcome.body,mutedNotice.body,'NOTIFY-005 the removed export gets its own outcome description')
 assert.equal((await h.mailMessages()).slice(mutedMail).length,0,'NOTIFY-007 muting suppresses only mail')
 assert.deepEqual((await(await h.request(owner.session,'/api/notifications')).json()).notifications.filter(n=>n.id===mutedNotice.id||n.subject.id===mutedFailure),[],'NOTIFY-005 another operator never sees this outcome')
 let outcomeBrowser,outcomeContext
 try{
  outcomeBrowser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  outcomeContext=await outcomeBrowser.newContext({viewport:{width,height:width===390?844:900}})
  await outcomeContext.addCookies([{name:starter.session.cookie.split('=')[0],value:starter.session.cookie.slice(starter.session.cookie.indexOf('=')+1),url:h.origin}])
  const page=await outcomeContext.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(h.origin+'/app/notifications')
  const rendered=page.locator(`#notification-${mutedNotice.id}`)
  await rendered.getByRole('heading',{name:mutedItem.outcome.title,exact:true}).waitFor()
  assert.equal(await rendered.locator('a').count(),0,'NOTIFY-005 the removed export row renders no link')
  assert.equal(await rendered.locator('p').first().textContent(),mutedItem.outcome.body,'NOTIFY-005 the row renders the API outcome body')
  assert.deepEqual(errors,[])
 }finally{try{await outcomeContext?.close()}finally{await outcomeBrowser?.close()}}
 await prefs(starter,[],true)
 console.log(`NOTIFY-005 ${width}: a muted starter reads a removed failed export's generic outcome beside its neutral subject, with no link, mail or disclosure`)

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
   await check(id,person,muted&&person.id===h.owner,mailStart,[source,failed?'failed':'completed'])
   if(source==='export')await removeExport(person,id)
  }
  assert.equal((await preferences(starter.session)).mutedKinds.includes('progress'),false,'NOTIFY-007 unaffected starter remains unmuted')
  console.log(`NOTIFY-009 ${width} ${phase}: import/export completion/failure, exact starters and provider mail; muted=${muted}`)
 },starter,async close(){await role('member')}}
}

/** Handover revokes both sessions, so this public-door case owns a separate
 * installation rather than invalidating the surrounding browser's session. */
async function verifyImportStarterHandover(width){
 const listener=createServer()
 await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve)})
 const port=listener.address().port
 await new Promise((resolve,reject)=>listener.close(error=>error?reject(error):resolve()))
 const previousPort=process.env.CRADLE_AUTHORITY_PORT
 let h
 try{process.env.CRADLE_AUTHORITY_PORT=String(port);h=await launchAuthorityRuntime({}, {installedLaunchDefinitions:true,installationOwner:true})}
 finally{if(previousPort===undefined)delete process.env.CRADLE_AUTHORITY_PORT;else process.env.CRADLE_AUTHORITY_PORT=previousPort}
 try{
  const owner={id:h.owner,session:h.ownerSession},successor=await h.addPerson({legacy:true,name:`synthetic-cradle-${width+1200}`}),system='00000000000000000000000001'
  const json=async(person,path,body,status=200)=>{const response=await h.request(person.session,path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value.data}
  const command=async(person,action,input,expected=[])=>{const data=await json(person,'/api/v1/commands/'+action,{commandId:createUlid(),input,expected});assert.equal(data.state,'committed');return data.value}
  const settings=await json(owner,'/api/v1/settings')
  await command(owner,'settings.update',{version:settings.version,changes:{timezone:'UTC',quietHoursStart:'00:00',quietHoursEnd:'00:00'}})
  for(const person of [owner,successor]){const p=(await json(person,'/api/v1/settings')).preferences;await command(person,'preferences.update',{version:p.version,preferences:{timezone:'UTC',mutedKinds:[],digestEnabled:false,progressEnabled:true}})}
  for(const a of (await h.db.prepare('SELECT id,version FROM automations WHERE enabled=1').all()).results)await command(owner,'launch.automation.disable',{id:a.id},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:a.id},version:a.version}])
  const notices=async id=>(await h.db.prepare("SELECT n.id,n.operator_id,n.title,n.body,d.state,d.group_id FROM notifications n LEFT JOIN channel_deliveries d ON d.notification_id=n.id WHERE n.kind='progress' AND n.subject_id=?").bind(id).all()).results
  const importing=async failed=>{
   const filename=`synthetic-cradle-${failed?2:1}.csv`,text='Name\n'+Array.from({length:25},(_,i)=>`synthetic-cradle-${failed&&i===24?1:i+1}`).join('\n')+'\n',options={name:`synthetic-cradle-${width+1300+(failed?1:0)}`,tables:{[filename]:{columns:{'column-1':{type:'text'}}}}},prefix='/api/v1/records/base-import'
   const upload=async(route,preview)=>{const body=new FormData();body.append('files',new Blob([text],{type:'text/csv'}),filename);body.set('options',JSON.stringify(options));if(preview){body.set('identities',JSON.stringify(preview.identities));body.set('fingerprint',preview.fingerprint);body.set('acceptLoss','true')}const r=await fetch(h.origin+prefix+route,{method:'POST',headers:{cookie:owner.session.cookie,origin:h.origin,'x-csrf-token':owner.session.csrf},body});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value.data}
   const preview=await upload('/preview'),review=await upload('/review',preview),job=await json(owner,prefix+'/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true})
   assert.equal((await json(owner,`${prefix}/jobs/${job.id}/resume`,{})).state,'applying','NOTIFY-009 handover import spans multiple real batches')
   if(failed){const draft=await json(owner,`/api/v1/records/bases/${preview.identities.appId}`),table=preview.identities.tables[filename];draft.tables.find(t=>t.id===table.entityId).fields.find(f=>f.id===table.fields['column-1']).unique=true;const changed=await json(owner,'/api/v1/records/schema-preview',draft);await command(owner,'release.adopt',{kind:'manual_schema',previewId:changed.id})}
   await h.db.prepare("UPDATE authority_principals SET state='removed' WHERE id=? AND kind='system'").bind(system).run()
   let refused
   try{for(let n=0;n<6&&!refused;n++){const response=await h.request(owner.session,`${prefix}/jobs/${job.id}/resume`,{method:'POST',body:'{}'});if(response.status!==200)refused=response}}
   finally{await h.db.prepare("UPDATE authority_principals SET state='active' WHERE id=? AND kind='system'").bind(system).run()}
   assert.equal(refused?.status,500,'NOTIFY-009 import outcome reports its error while publication is held')
   const status=await json(owner,`${prefix}/jobs/${job.id}`)
   if(failed)assert.ok(status.progress.appliedRecords>0&&status.progress.appliedRecords<status.progress.plannedRecords,'NOTIFY-009 handover failure retains a real partial import')
   else assert.equal(status.job.state,'completed','NOTIFY-009 handover completion is committed')
   assert.deepEqual(await notices(job.id),[],'NOTIFY-009 handover precedes publication of each real outcome')
   return job.id
  }
  // Handover moves manual base ownership, so the former owner cannot resume an
  // unfinished import. Commit each outcome with publication held, then change
  // initial_owner through the public door before the independent scheduled tick.
  const completed=await importing(false),failed=await importing(true)
  const handover=async(from,to)=>{
   const previous=(await h.mailMessages()).length,asked=await h.request(from.session,'/auth/step-up',{method:'POST',body:JSON.stringify({action:'owner:transfer',returnTo:'/app/settings'})})
   assert.equal(asked.status,202,await asked.text())
   const links=(await h.mailMessages()).slice(previous).flatMap(message=>[...message.content.find(part=>part.type==='text/plain').value.matchAll(/https?:\/\/\S+/g)].map(match=>new URL(match[0]))).filter(url=>url.pathname==='/auth/confirm')
   assert.equal(links.length,1,'NOTIFY-009 ownership handover uses a fresh public email-link confirmation')
   const confirmed=await h.request(from.session,'/auth/confirm',{method:'POST',body:JSON.stringify({token:links[0].searchParams.get('token')}),redirect:'manual'});assert.equal(confirmed.status,303)
   const member=(await json(from,`/api/v1/members?appId=${LAUNCH_APP_ID}`)).items.find(item=>item.id===to.id);assert.ok(member)
   await command(from,'member.transfer-ownership',{memberId:to.id},[{ref:{appId:LAUNCH_APP_ID,entityId:'00000000000000000000000101',recordId:to.id},version:member.version}])
   owner.session=await h.signIn(owner.id);successor.session=await h.signIn(successor.id)
   assert.equal((await h.db.prepare('SELECT id FROM authority_principals WHERE initial_owner=1').first()).id,to.id,'NOTIFY-009 public ownership handover selects its target')
  }
  await handover(owner,successor)
  try{
   const mailStart=(await h.mailMessages()).length
   const publishedAt=Date.now(),worker=await h.runtime.getWorker()
   assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:publishedAt})).outcome,'ok')
   // Publication uses the real request clock. Advance the next scheduled door
   // past that fresh delivery's due instant before asserting provider acceptance.
   assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:publishedAt+60000})).outcome,'ok')
   const inbox=(await json(owner,'/api/v1/notifications')).items,otherInbox=(await json(successor,'/api/v1/notifications')).items
   for(const [id,outcome]of [[completed,'completed'],[failed,'failed']]){
    const expected=progressText.import[outcome],rows=await notices(id)
    assert.equal((await h.db.prepare('SELECT principal_id FROM ik_jobs WHERE id=?').bind(id).first()).principal_id,owner.id,'NOTIFY-009 handover preserves the import starter')
    assert.deepEqual(rows.map(n=>n.operator_id),[owner.id],'NOTIFY-009 import outcome reaches exactly its starter after ownership handover')
    const [notice]=rows;assert.equal(notice.state,'accepted');assert.deepEqual({title:notice.title,body:notice.body},expected)
    const item=inbox.find(n=>n.id===notice.id);assert.ok(item);assert.deepEqual({title:item.title,body:item.body},expected,'NOTIFY-009 former owner reads the literal import outcome through their own inbox')
    assert.deepEqual(otherInbox.filter(n=>n.id===notice.id||n.subject.id===id),[],'NOTIFY-009 the new installation owner receives no import outcome')
    const mail=(await h.mailMessages()).slice(mailStart),email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(owner.id).first()).email
    assert.deepEqual(mail.filter(m=>m.subject===expected.title).flatMap(m=>m.personalizations.flatMap(p=>p.to.map(r=>r.email))),[email],'NOTIFY-009 import outcome mail reaches exactly its starter, never the new installation owner')
    const receipt=mail.filter(m=>notice.group_id&&m.custom_args?.rer_delivery_id===notice.group_id);assert.equal(receipt.length,1);assert.equal(receipt[0].subject,expected.title);assert.ok(receipt[0].content.map(c=>c.value).join('\n').includes(`${expected.title}\n${expected.body}`),'NOTIFY-009 handover import provider-edge body states its outcome')
   }
  }finally{await handover(successor,owner)}
  console.log(`NOTIFY-009 ${width}: import completion and failure reach their starter after public installation ownership handover, never the new installation owner`)
 }finally{await h.close()}
}
