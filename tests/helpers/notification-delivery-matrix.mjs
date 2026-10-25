import assert from 'node:assert/strict'
import {notificationKinds} from '../../src/domains/channels/ports.ts'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

// Entries with a gap deliberately earn no delivery claim. Importing the product
// inventory makes a newly offered kind fail until its real producer is reviewed.
const paths={
 'decision-assigned':'decision.create',
 'critical-risk-escalated':'risk.escalate',
 readiness:'emitted readiness schedule',
 'comment-mentioned':'comment.create',
 'automation-failed':null,
 'decision-overdue':'emitted overdue schedule',
 outage:null,
 progress:null,
 'weekly-digest':'emitted Monday digest',
 'record-automation':null,
}
export async function verifyNotificationDeliveryMatrix({h,actor,other,width}){
 assert.deepEqual(Object.keys(paths).sort(),[...notificationKinds].sort(),'NOTIFY-007 matrix accounts for exactly the production kind list')
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
 const worker=await h.runtime.getWorker(),tick=at=>worker.scheduled({cron:'* * * * *',scheduledTime:at})
 const row=async(table,id)=>h.db.prepare(`SELECT id,version FROM ${table} WHERE id=?`).bind(id).first()
 const campaigns=[]
 const campaign=async(operator,code)=>{
  const c=await launch('campaign.create',{fields:{code,name:code,ownerId:operator,startDate:'2026-01-01',launchDate:'2027-12-01',objective:'Synthetic notification delivery',statusSummary:'Ready',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}});campaigns.push(c);return c
 }
 const read=async kind=>(await h.db.prepare('SELECT n.id,n.operator_id,n.subject_id,d.id AS delivery_id,d.state,d.group_id FROM notifications n LEFT JOIN channel_deliveries d ON d.notification_id=n.id WHERE n.kind=?').bind(kind).all()).results
 const assertRows=async(kind,rows,muted)=>{
  assert.deepEqual(rows.map(r=>r.operator_id).sort(),[h.owner,other.id].sort(),`NOTIFY-007 ${kind}: both recipients retain exactly one notice`)
  const messages=await h.mailMessages()
  for(const n of rows){
   const state=n.operator_id===h.owner&&muted?'muted':'accepted'
   assert.ok(n.delivery_id,`NOTIFY-007 ${kind}: a durable delivery accompanies the notice`)
   assert.equal(n.state,state,`NOTIFY-007 ${kind}: recipient delivery state`)
   const mail=messages.filter(m=>n.group_id&&m.custom_args?.rer_delivery_id===n.group_id)
   assert.equal(mail.length,state==='muted'?0:1,`NOTIFY-007 ${kind}: exact provider-edge email count`)
   if(mail.length){const email=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(n.operator_id).first()).email;assert.deepEqual(mail[0].personalizations.flatMap(p=>p.to.map(r=>r.email)),[email],`NOTIFY-007 ${kind}: provider recipient`)}
  }
 }
 const monday=new Date();monday.setUTCHours(0,0,0,0);monday.setUTCDate(monday.getUTCDate()+7-(monday.getUTCDay()+6)%7+(width===390?14:0))
 const retained=[]
 for(const [phase,muted]of [[0,true],[1,false]]){
  await setPrefs(h.ownerSession,muted?[...notificationKinds]:[])
  const date=new Date(+monday+phase*7*86400000).toISOString().slice(0,10),at=Date.parse(date+'T08:00:00Z')
  for(const [kind,path]of Object.entries(paths)){
   if(!path)continue
   // Drain unrelated prior work before measuring this real event path.
   await tick(Date.now())
   const before=await read(kind),old=new Set(before.map(n=>n.id)),subjects=[]
   if(kind==='weekly-digest'){
    const a=await h.db.prepare("SELECT id,version,enabled FROM automations WHERE shipped_key='weekly-digest'").first()
    if(!a.enabled)await request(h.ownerSession,'launch.automation.enable',{id:a.id},ref('automation',a))
    const digest=await h.db.prepare("SELECT version FROM channel_digest_settings WHERE id='digest'").first()
    await request(h.ownerSession,'digest.update',{version:digest.version,recipientIds:[h.owner,other.id]})
    await tick(Date.parse(date+'T09:00:00Z'))
   }else{
    for(const [index,operator]of [h.owner,other.id].entries()){
     const c=await campaign(operator,`synthetic-cradle-${phase*20+Object.keys(paths).indexOf(kind)*2+index}`)
     if(kind==='comment-mentioned')await launch('comment.create',{campaignId:c.id,body:'Synthetic muted delivery event',mentions:[operator]},ref('campaign',c))
     if(kind==='decision-assigned'||kind==='decision-overdue')subjects.push((await launch('decision.create',{fields:{campaignId:c.id,riskId:null,supersedesId:null,title:'Synthetic delivery decision',requesterId:operator,assigneeId:operator,priority:'High',dueAt:new Date(kind==='decision-overdue'?at-20*60000:Date.parse('2099-01-01T12:00:00Z')).toISOString(),recommendation:'Review',impact:'Delivery matrix'}})).id)
     if(kind==='critical-risk-escalated'){
      const risk=await launch('risk.create',{fields:{campaignId:c.id,title:'Synthetic Critical risk',ownerId:operator,severity:'Critical',dueDate:null,signal:'Delivery probe',mitigation:'Review'}})
      await launch('risk.escalate',{id:risk.id,reason:'Synthetic delivery matrix'},ref('risk',risk))
     }
     if(kind==='readiness')await launch('milestone.create',{fields:{campaignId:c.id,title:'Synthetic launch readiness',ownerId:operator,type:'Launch',status:'Not started',startDate:date,endDate:null,conflictReason:null}})
    }
    await tick(kind==='readiness'||kind==='decision-overdue'?at:Date.now())
   }
   const fresh=(await read(kind)).filter(n=>!old.has(n.id)&&(!subjects.length||subjects.includes(n.subject_id)))
   await assertRows(kind,fresh,muted)
   if(muted)retained.push({kind,ids:fresh.filter(n=>n.operator_id===h.owner).map(n=>n.id)})
   // Unmuting must never replay a prior muted event, even after later ticks.
   for(const previous of retained)await assertOld(previous)
   console.log(`NOTIFY-007 matrix ${kind} ${muted?'muted':'restored'}: two notices, exact recipient mail counts`)
  }
 }
 async function assertOld(previous){
  const rows=(await read(previous.kind)).filter(n=>previous.ids.includes(n.id));assert.equal(rows.length,previous.ids.length)
  for(const n of rows){assert.equal(n.state,'muted',`NOTIFY-007 ${previous.kind}: no old-mail replay`);assert.equal((await h.mailMessages()).filter(m=>n.group_id&&m.custom_args?.rer_delivery_id===n.group_id).length,0,`NOTIFY-007 ${previous.kind}: no old provider mail`)}
 }
 // Leave later walkthrough screens on their original configuration.
 for(const c of campaigns){const current=await row('campaigns',c.id);await request(h.ownerSession,'launch.campaign.archive',{id:c.id},ref('campaign',current));await request(h.ownerSession,'launch.campaign.delete',{id:c.id,confirmationCode:c.code},ref('campaign',await row('campaigns',c.id)))}
 const now=await settings();await request(h.ownerSession,'settings.update',{version:now.version,changes:{timezone:original.timezone,quietHoursStart:original.quietHours.start,quietHoursEnd:original.quietHours.end}})
 for(const [session,p]of [[h.ownerSession,original.preferences],[other.session,originalOther]]){const current=await preferences(session);await request(session,'preferences.update',{version:current.version,preferences:{timezone:p.timezone,mutedKinds:p.mutedKinds,digestEnabled:p.digestEnabled,progressEnabled:p.progressEnabled}})}
 console.log('NOTIFY-007 unproved: automation-failed; outage/progress have no event producer; record-automation requests in-app-only delivery')
}
