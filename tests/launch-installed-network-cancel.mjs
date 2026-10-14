import test from 'node:test'
import assert from 'node:assert/strict'
import {setup,value,campaign,expected} from './helpers/launch-installed.mjs'
const {launchEntities}=await import('../src/apps/launch/contracts.ts')

test('[AUTO-003/004] disabling an automation distinguishes a started external effect from cancellable queued work',async()=>{
 let release,seen,calls=0
 const held=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{seen=resolve})
 const h=await setup({automaticQueues:false,configuration:{MAIL_PROVIDER:'sendgrid',MAIL_FROM:'sender@example.test',MAIL_PROVIDER_API_KEY:'network-edge-only'},providerFetch:async request=>{assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send');calls++;seen();await held;return new Response(null,{status:202,headers:{'x-message-id':'controlled-mail'}})}})
 let dispatch
 try{
  const c=await campaign(h,'INFLIGHT'),owner=(await h.db.prepare('SELECT owner_id FROM campaigns WHERE id=?').bind(c.id).first()).owner_id
  const definition=value(await h.command('launch.automation.save',{definition:{name:'Started mail',enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'send-email',input:{operatorId:owner,subjectId:c.id,title:'Started mail effect',body:'The original effect finishes once'}}]}}))
  const change=await h.command('launch.campaign.patch',{id:c.id,changes:{statusSummary:'Start mail'}},expected(launchEntities.campaign,c)),worker=await h.runtime.getWorker()
  await worker.queue('cradle-work',[{id:'admit-mail',timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:change.data.commandId}}])
  const run=await h.db.prepare('SELECT id FROM automation_runs WHERE automation_id=?').bind(definition.id).first(),entry=await h.db.prepare("SELECT id FROM admission_outbox WHERE action='launch.automation.execute' AND json_extract(input_json,'$.runId')=?").bind(run.id).first()
  const message=id=>[{id,timestamp:Date.now(),attempts:1,body:{kind:'cradle.outbox.v1',outboxId:entry.id}}]
  dispatch=worker.queue('cradle-work',message('send-original'))
  await Promise.race([started,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Mail edge never started')),8000);started.finally(()=>clearTimeout(timer))})])
  const beforeDisable=(await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(run.id).first()).state
  await h.command('launch.automation.disable',{id:definition.id},expected(launchEntities.automation,definition))
  const afterDisable=(await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(run.id).first()).state
  release();await dispatch;await h.tick();await worker.queue('cradle-work',message('send-replay'))
  const after=(await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(run.id).first()).state
  console.log(JSON.stringify({beforeDisable,afterDisable,after,providerCalls:calls}))
  assert.equal(beforeDisable,'Running');assert.equal(afterDisable,'Running');assert.equal(after,'Succeeded');assert.equal(calls,1)
  assert.equal((await h.db.prepare('SELECT state FROM launch_automation_actions WHERE run_id=?').bind(run.id).first()).state,'Complete')
 }finally{release();await dispatch?.catch(()=>{});await h.close()}
})
