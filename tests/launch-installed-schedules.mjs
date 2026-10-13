import './helpers/typescript-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
// Existing emitted build required. Run from repo with its TS loader and --test-concurrency=1.
// Fixtures and setting changes use public commands; D1 is a read-only observation door.
const repo=path.resolve(process.env.CRADLE_REPO??process.cwd())
const fromRepo=file=>import(pathToFileURL(path.join(repo,file)).href)
const {recordsImportBrowserRuntime}=await fromRepo('tests/helpers/records-import-browser-runtime.mjs')
const {freePort}=await fromRepo('tests/helpers/free-port.mjs')
const {createUlid}=await fromRepo('src/core/shared/ids.ts')
const {LAUNCH_APP_ID,launchEntities}=await fromRepo('src/apps/launch/contracts.ts')
const monday='2026-10-19'
assert.equal(new Date(monday+'T00:00:00Z').getUTCDay(),1)

await test('emitted scheduled handler supplies readiness, weekly digest and overdue decision effects',async t=>{
 let outbound=0
 const h=await recordsImportBrowserRuntime(await freePort(),{outbound(){outbound++;throw Error('Scheduled probe prohibits outbound network')}})
 try{
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
  const settings=(await h.db.prepare('SELECT version FROM workspace_settings LIMIT 1').first())
  await command('settings.update',{version:settings.version,changes:{timezone:'UTC'}})
  const readiness=await h.db.prepare("SELECT * FROM automations WHERE shipped_key='launch-readiness'").first()
  assert.ok(readiness,'Native setup must install the readiness definition')
  await command('launch.automation.enable',{id:readiness.id},expected('automation',readiness))
  const config=JSON.parse(readiness.trigger_config_json)
  const campaign=await command('launch.campaign.create',{fields:{code:'SCHEDULED',name:'Scheduled held-out campaign',ownerId:owner,startDate:monday,launchDate:monday,objective:'Exercise emitted scheduler',statusSummary:'Ready',phase:'Planning',status:'On track',health:70,budgetMinor:100,spendMinor:0,tags:[],customFields:{}}})
  const milestone=await command('launch.milestone.create',{fields:{campaignId:campaign.id,title:'Scheduled held-out launch',ownerId:owner,type:'Launch',status:'Not started',startDate:monday,endDate:null,conflictReason:null}})
  const worker=await h.runtime.getWorker()
  const tick=at=>worker.scheduled({scheduledTime:Date.parse(at),cron:'* * * * *'})
  const count=async(sql,...params)=>Number((await h.db.prepare(sql).bind(...params).first()).n)
  async function snapshot(){return{
   readiness:await count("SELECT COUNT(*) n FROM launch_readiness WHERE milestone_id=? AND state='Outstanding'",milestone.id),
   digest:await count("SELECT COUNT(*) n FROM channel_deliveries WHERE kind='weekly-digest' AND operator_id=?",owner),
   overdue:await count("SELECT COUNT(*) n FROM channel_deliveries WHERE kind='decision-overdue' AND operator_id=?",owner),
   mailOutbox:await count('SELECT COUNT(*) n FROM rer_mail_development_outbox'),
   admissionOutbox:await count('SELECT COUNT(*) n FROM admission_outbox'),
  }}
  await t.test('MILE-004 AUTO-011: configured local readiness schedule creates one request and mail',async st=>{
   const before=await snapshot(),at=monday+'T'+String(config.hour).padStart(2,'0')+':05:00.000Z'
   await tick(at)
   const first=await snapshot();st.diagnostic(JSON.stringify({at,before,first}))
   assert.equal(first.readiness,before.readiness+1,'emitted scheduled handler produced no readiness request')
   assert.equal(first.mailOutbox,before.mailOutbox+1,'readiness has no development-mail outbox counterpart')
   await tick(at)
   const duplicate=await snapshot();assert.equal(duplicate.readiness,first.readiness);assert.equal(duplicate.mailOutbox,first.mailOutbox)
  })
  await t.test('NOTIFY-004: enabled Monday digest creates one notification/delivery and mail',async st=>{
   const automation=await h.db.prepare("SELECT * FROM automations WHERE shipped_key='weekly-digest'").first()
   assert.ok(automation,'Native setup must install the digest definition')
   await command('launch.automation.enable',{id:automation.id},expected('automation',automation))
   const digestSettings=await h.db.prepare("SELECT version FROM channel_digest_settings WHERE id='digest'").first()
   await command('digest.update',{version:digestSettings.version,recipientIds:[owner]})
   const before=await snapshot(),at=monday+'T09:05:00.000Z'
   await tick(at)
   const first=await snapshot();st.diagnostic(JSON.stringify({at,before,first}))
   assert.equal(first.digest,before.digest+1,'emitted scheduled handler produced no weekly digest delivery')
   assert.equal(first.mailOutbox,before.mailOutbox+1,'digest has no development-mail outbox counterpart')
   await tick(at);await tick(monday+'T09:15:00.000Z')
   const duplicate=await snapshot();assert.equal(duplicate.digest,first.digest);assert.equal(duplicate.mailOutbox,first.mailOutbox)
  })
  await t.test('NOTIFY-008: unresolved decision due plus fifteen minutes notifies once and re-arms',async st=>{
   const dueAt=monday+'T09:50:00.000Z'
   const decision=await command('launch.decision.create',{fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Scheduled held-out decision',requesterId:owner,assigneeId:null,priority:'High',dueAt,recommendation:'Review before launch',impact:'Launch readiness'}})
   const before=await snapshot()
   await tick(monday+'T10:04:59.000Z')
   assert.equal((await snapshot()).overdue,before.overdue)
   await tick(monday+'T10:05:00.000Z')
   const first=await snapshot();st.diagnostic(JSON.stringify({before,first}))
   assert.equal(first.overdue,before.overdue+1,'emitted scheduled handler produced no overdue decision delivery')
   assert.equal(first.mailOutbox,before.mailOutbox+1,'overdue decision has no development-mail outbox counterpart')
   await tick(monday+'T10:05:00.000Z');assert.equal((await snapshot()).overdue,first.overdue)
   await command('launch.decision.patch',{id:decision.id,changes:{dueAt:monday+'T11:50:00.000Z'}},expected('decision',decision))
   await tick(monday+'T12:05:00.000Z')
   const rearmed=await snapshot();st.diagnostic(JSON.stringify({rearmed}))
   assert.equal(rearmed.overdue,first.overdue+1);assert.equal(rearmed.mailOutbox,first.mailOutbox+1)
  })
  assert.equal(outbound,0,'The scheduled sentinel must remain offline')
 }finally{await h.close()}
})
