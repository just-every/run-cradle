import './helpers/typescript-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
// Fixtures and setting changes use public commands; D1 is a read-only observation door.
const repo=path.resolve(process.env.CRADLE_REPO??process.cwd())
const fromRepo=file=>import(pathToFileURL(path.join(repo,file)).href)
const {recordsImportBrowserRuntime}=await fromRepo('tests/helpers/records-import-browser-runtime.mjs')
const {createUlid}=await fromRepo('src/core/shared/ids.ts')
const {LAUNCH_APP_ID,launchEntities}=await fromRepo('src/apps/launch/contracts.ts')
// The held-out Monday is always ahead of the wall clock, so its scheduled ticks are never stale.
const addDays=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)
const monday=addDays(new Date().toISOString().slice(0,10),7-(new Date().getUTCDay()+6)%7)
assert.equal(new Date(monday+'T00:00:00Z').getUTCDay(),1)

await test('emitted scheduled handler supplies readiness, weekly digest and overdue decision effects',async t=>{
 let outbound=0
 const h=await recordsImportBrowserRuntime(0,{outbound(){outbound++;throw Error('Scheduled probe prohibits outbound network')}})
 try{
  // Keep the configured Base sender: only its provider request is captured at
  // the test network edge. Exclude the initial sign-in mail from schedule counts.
  const initialMailCount=(await h.mailMessages()).length
  const scheduledMail=async()=>(await h.mailMessages()).slice(initialMailCount)
  const csrfResponse=await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})
  assert.equal(csrfResponse.status,200)
  const {csrfToken}=await csrfResponse.json()
  async function command(action,input,expected=[]){
   const response=await fetch(h.origin+'/api/v1/commands/'+action,{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({commandId:createUlid(),expected,input})})
   const result=await response.json()
   assert.equal(response.status,200,`${action} fixture failed: ${JSON.stringify(result)}`)
   assert.equal(result.data.state,'committed',`${action} fixture did not commit`)
   return result.data.value
  }
  const expected=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]
  const owner=(await h.db.prepare("SELECT id FROM operators WHERE email='import-owner@example.test'").first()).id
  const address=(await h.db.prepare('SELECT email FROM operators WHERE id=?').bind(owner).first()).email.trim().toLowerCase()
  const settings=(await h.db.prepare('SELECT version FROM workspace_settings LIMIT 1').first()),readinessBefore=await h.db.prepare("SELECT version FROM automations WHERE shipped_key='launch-readiness'").first()
  await command('settings.update',{version:settings.version,changes:{readinessVersion:readinessBefore.version,timezone:'Asia/Kathmandu',readinessHour:8,readinessLeadDays:3}})
  const readiness=await h.db.prepare("SELECT * FROM automations WHERE shipped_key='launch-readiness'").first()
  assert.ok(readiness,'Native setup must install the readiness definition')
  await command('launch.automation.enable',{id:readiness.id},expected('automation',readiness))
  const config=JSON.parse(readiness.trigger_config_json)
  const campaign=await command('launch.campaign.create',{fields:{code:'SCHEDULED',name:'Scheduled held-out campaign',ownerId:owner,startDate:monday,launchDate:monday,objective:'Exercise emitted scheduler',statusSummary:'Ready',phase:'Planning',status:'On track',health:70,budgetMinor:100,spendMinor:0,tags:[],customFields:{}}})
  const milestone=await command('launch.milestone.create',{fields:{campaignId:campaign.id,title:'Scheduled held-out launch',ownerId:owner,type:'Launch',status:'Not started',startDate:monday,endDate:null,conflictReason:null}})
  const later=await command('launch.milestone.create',{fields:{campaignId:campaign.id,title:'Beyond configured lead days',ownerId:owner,type:'Launch',status:'Not started',startDate:addDays(monday,4),endDate:null,conflictReason:null}})
  const worker=await h.runtime.getWorker()
  const tick=at=>worker.scheduled({scheduledTime:Date.parse(at)-345*60000,cron:'* * * * *'})
  const count=async(sql,...params)=>Number((await h.db.prepare(sql).bind(...params).first()).n)
  async function assertAccepted(kind){
   const rows=(await h.db.prepare('SELECT state,attempts,receipt_id,group_id FROM channel_deliveries WHERE kind=? AND operator_id=?').bind(kind,owner).all()).results
   assert.ok(rows.length,`${kind} has no durable delivery`)
   const messages=await scheduledMail()
   for(const row of rows){
    assert.equal(row.state,'accepted',`${kind} provider acceptance was not persisted`)
    assert.equal(row.attempts,1,`${kind} must dispatch once`)
    assert.ok(row.receipt_id,`${kind} has no provider receipt`)
    const captured=messages.filter(message=>message.custom_args.rer_delivery_id===row.group_id)
    assert.equal(captured.length,1,`${kind} must have one provider request for its durable dispatch`)
    assert.deepEqual(captured[0].personalizations.flatMap(group=>group.to.map(recipient=>recipient.email.trim().toLowerCase())),[address])
   }
  }
  async function snapshot(){return{
   readiness:await count("SELECT COUNT(*) n FROM launch_readiness WHERE milestone_id=? AND state='Outstanding'",milestone.id),
   digest:await count("SELECT COUNT(*) n FROM channel_deliveries WHERE kind='weekly-digest' AND operator_id=?",owner),
   overdue:await count("SELECT COUNT(*) n FROM channel_deliveries WHERE kind='decision-overdue' AND operator_id=?",owner),
   mail:(await scheduledMail()).length,
   admissionOutbox:await count('SELECT COUNT(*) n FROM admission_outbox'),
  }}
  await t.test('MILE-004 AUTO-011: configured local readiness schedule creates one request and mail',async st=>{
   const before=await snapshot(),at=monday+'T'+String(config.hour).padStart(2,'0')+':05:00.000Z'
   await tick(monday+'T07:59:59.000Z');assert.deepEqual(await snapshot(),before)
   await tick(at)
   assert.equal(await count('SELECT count(*) n FROM launch_readiness WHERE milestone_id=?',later.id),0)
   const first=await snapshot();st.diagnostic(JSON.stringify({at,before,first}))
   assert.equal(first.readiness,before.readiness+1,'emitted scheduled handler produced no readiness request')
   assert.equal(first.mail,before.mail+1,'readiness must send one provider request')
   await tick(at)
   const duplicate=await snapshot();assert.equal(duplicate.readiness,first.readiness);assert.equal(duplicate.mail,first.mail)
   const settingsNow=await h.db.prepare('SELECT version FROM workspace_settings').first();await command('settings.update',{version:settingsNow.version,changes:{readinessVersion:(await h.db.prepare("SELECT version FROM automations WHERE shipped_key='launch-readiness'").first()).version,readinessLeadDays:4}});await tick(at);assert.equal(await count('SELECT count(*) n FROM launch_readiness WHERE milestone_id=?',later.id),0,'Changing settings cannot duplicate the same local day evaluation')
   await tick(addDays(monday,1)+'T08:00:00.000Z');assert.equal(await count('SELECT count(*) n FROM launch_readiness WHERE milestone_id=?',later.id),1)
   await assertAccepted('readiness')
  })
  await t.test('NOTIFY-004: enabled Monday digest creates one notification/delivery and mail',async st=>{
   const automation=await h.db.prepare("SELECT * FROM automations WHERE shipped_key='weekly-digest'").first()
   assert.ok(automation,'Native setup must install the digest definition')
   await command('launch.automation.enable',{id:automation.id},expected('automation',automation))
   const digestSettings=await h.db.prepare("SELECT version FROM channel_digest_settings WHERE id='digest'").first()
   await command('digest.update',{version:digestSettings.version,recipientIds:[owner]})
   const cutoffCampaign=async(code,name,launchDate)=>command('launch.campaign.create',{fields:{code,name,ownerId:owner,startDate:monday,launchDate,objective:'Digest cutoff',statusSummary:'Ready',phase:'Planning',status:'On track',health:50,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
   await cutoffCampaign('DAY30','Included at thirty days',addDays(monday,30));await cutoffCampaign('DAY31','Outside thirty days',addDays(monday,31))
   const archived=await cutoffCampaign('ARCHIVED','Archived launch excluded',monday);await command('launch.campaign.archive',{id:archived.id},expected('campaign',archived))
   const quiet=await h.db.prepare('SELECT version FROM workspace_settings').first();await command('settings.update',{version:quiet.version,changes:{quietHoursStart:'09:00',quietHoursEnd:'10:00'}})
   const before=await snapshot(),at=monday+'T09:00:00.000Z'
   await tick(monday+'T08:59:59.000Z');assert.equal((await snapshot()).digest,before.digest)
   await tick(at)
   const first=await snapshot();st.diagnostic(JSON.stringify({at,before,first}))
   assert.equal(first.digest,before.digest+1,'emitted scheduled handler produced no weekly digest delivery')
   assert.equal(first.mail,before.mail+1,'digest must send one provider request')
   await tick(at);await tick(monday+'T09:14:59.000Z');await tick(monday+'T09:15:00.000Z')
   const duplicate=await snapshot();assert.equal(duplicate.digest,first.digest);assert.equal(duplicate.mail,first.mail)
   await tick(addDays(monday,7)+'T09:15:00.000Z');assert.equal((await snapshot()).digest,first.digest,'Outside window must not create next week digest')
   assert.equal(await count('SELECT count(*) n FROM channel_events WHERE event_id=?','digest:'+monday+':'+address),1)
   const mail=(await scheduledMail()).findLast(message=>message.subject==='Weekly portfolio digest')
   assert.ok(mail,'The provider request must contain the weekly digest')
   const text=mail.content.find(part=>part.type==='text/plain').value
   assert.ok(text.includes('Scheduled held-out campaign'));assert.ok(!text.includes('Archived launch excluded'));const launches=text.split('Launches in the next 30 days')[1].split('Open High and Critical risks')[0];assert.ok(launches.includes('Included at thirty days'));assert.ok(!launches.includes('Outside thirty days'))
   await assertAccepted('weekly-digest')
  })
  await t.test('NOTIFY-008: unresolved decision due plus fifteen minutes notifies once and re-arms',async st=>{
   const dueAt=new Date(monday+'T09:50:00.000+05:45').toISOString()
   const decision=await command('launch.decision.create',{fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Scheduled held-out decision',requesterId:owner,assigneeId:null,priority:'High',dueAt,recommendation:'Review before launch',impact:'Launch readiness'}})
   const before=await snapshot()
   await tick(monday+'T10:04:59.000Z')
   assert.equal((await snapshot()).overdue,before.overdue)
   await tick(monday+'T10:05:00.000Z')
   const first=await snapshot();st.diagnostic(JSON.stringify({before,first}))
   assert.equal(first.overdue,before.overdue+1,'emitted scheduled handler produced no overdue decision delivery')
   assert.equal(first.mail,before.mail+1,'overdue decision must send one provider request')
   await tick(monday+'T10:05:00.000Z');const duplicate=await snapshot();assert.equal(duplicate.overdue,first.overdue);assert.equal(duplicate.mail,first.mail)
   await command('launch.decision.patch',{id:decision.id,changes:{dueAt:new Date(monday+'T11:50:00.000+05:45').toISOString()}},expected('decision',decision))
   await tick(monday+'T12:05:00.000Z')
   const rearmed=await snapshot();st.diagnostic(JSON.stringify({rearmed}))
   assert.equal(rearmed.overdue,first.overdue+1);assert.equal(rearmed.mail,first.mail+1)
   await assertAccepted('decision-overdue')
  })
  // Owner-authored schedules use the same public save command and emitted cron as shipped definitions.
  // Keep these within the existing schedule journey instead of adding registration-only tests.
  const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kathmandu',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000))
  const weekday=new Date(localDate+'T12:00:00Z').getUTCDay()
  for(const fixture of [
   {name:'Daily campaign note',rule:'daily 09:57',at:localDate+'T09:57:00.000Z',after:localDate+'T10:02:00.000Z',message:'Daily owner-authored schedule fired'},
   {name:'Weekly campaign note',rule:`weekly ${weekday} 23:55`,at:localDate+'T23:55:00.000Z',after:new Date(Date.parse(localDate+'T23:55:00Z')+10*60000).toISOString(),message:'Weekly owner-authored schedule fired'},
  ]) {
   const saved=await command('launch.automation.save',{definition:{name:fixture.name,enabled:true,
    trigger:{kind:'schedule',localRule:fixture.rule,timezone:'Asia/Kathmandu'},actions:[{command:'add-activity',input:{campaignId:campaign.id,message:fixture.message}}]}})
   const countEffects=()=>count('SELECT count(*) n FROM activity_entries WHERE automation_run_id IN (SELECT id FROM automation_runs WHERE automation_id=?)',saved.id)
   const notDue=new Date(Date.parse(fixture.at)-1000).toISOString()
   await tick(notDue);assert.equal(await countEffects(),0)
   await tick(fixture.after)
   if(!await countEffects())t.diagnostic(JSON.stringify({schedule:fixture.name,saved,definition:await h.db.prepare('SELECT id,enabled,trigger_type,trigger_config_json FROM automations WHERE id=?').bind(saved.id).first(),at:fixture.after,runs:(await h.db.prepare('SELECT state,error_code,error_message,trigger_key FROM automation_runs WHERE automation_id=?').bind(saved.id).all()).results,actions:(await h.db.prepare('SELECT state,error_code,error_message FROM launch_automation_actions WHERE run_id IN (SELECT id FROM automation_runs WHERE automation_id=?)').bind(saved.id).all()).results}))
   assert.equal(await countEffects(),1,'Created schedule must fire across an hour or midnight boundary')
   await tick(fixture.after);assert.equal(await countEffects(),1,'Repeated cron must preserve one effect per schedule occurrence')
   // These runs execute on the scheduler clock a day ahead; read the success window ending there.
   const monitor=await fetch(h.origin+'/api/automations?windowEnd='+encodeURIComponent(fixture.after),{headers:{cookie:h.cookie}})
   assert.equal(monitor.status,200)
   const visible=(await monitor.json()).automations.find(item=>item.id===saved.id)
   assert.ok(visible);assert.equal(visible.runCount30Days,1);assert.equal(visible.lastRunStatus,'Succeeded')
   await command('launch.automation.disable',{id:saved.id},expected('automation',saved))
  }
  const invalid=await fetch(h.origin+'/api/v1/commands/launch.automation.save',{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({commandId:createUlid(),expected:[],input:{definition:{name:'Missing trigger',enabled:true,actions:[{command:'add-activity',input:{campaignId:campaign.id,message:'Must never run'}}]}}})})
  assert.equal(invalid.status,400,'An enabled automation without a trigger must be rejected before saving')
  assert.equal(outbound,0,'The scheduled sentinel must remain offline')
 }finally{await h.close()}
})
