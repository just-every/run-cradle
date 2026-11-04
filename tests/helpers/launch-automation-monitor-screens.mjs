import assert from 'node:assert/strict'
import {verifyProviderRefusalStable} from './launch-run-history.mjs'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

// AUTO-006 and AUTO-008 on Automation Monitor: real emitted executions show the success
// window and retain a definitive mail refusal without another provider attempt or effect.
export async function verifyAutomationMonitorScreens({h,page,command,capture,mail}){
 const width=page.viewportSize().width,name=`Monitor rate note ${width}`
 const create=async(action,input,expected=[])=>(await command(action,input,expected)).data.value
 const ref=(entityId,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId,recordId:row.id},version:row.version}]
 const campaign=await create('campaign.create',{fields:{code:`MONITOR-${width}`,name:'Monitor rate launch',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-01-01',objective:'Show the automation success rate',statusSummary:'Planning',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const automation=await create('automation.save',{definition:{name,enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'add-activity',input:{campaignId:campaign.id,message:'Monitor rate recorded'}}]}})
 const patched=await command('campaign.patch',{id:campaign.id,changes:{statusSummary:'Rate ready'}},ref(launchEntities.campaign,campaign))
 const worker=await h.runtime.getWorker()
 await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:patched.data.commandId}}])
 const run=await h.db.prepare('SELECT id FROM automation_runs WHERE automation_id=?').bind(automation.id).first()
 const outbox=await h.db.prepare("SELECT id FROM admission_outbox WHERE action='launch.automation.execute' AND json_extract(input_json,'$.runId')=?").bind(run.id).first()
 await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.outbox.v1',outboxId:outbox.id}}])
 assert.equal((await h.db.prepare('SELECT state FROM automation_runs WHERE id=?').bind(run.id).first()).state,'Succeeded')

 await page.goto(`${h.origin}/app/automations`)
 const header=page.locator('header').filter({has:page.getByRole('heading',{name:'Launch automations',exact:true})})
 await header.getByText('Success rate window',{exact:true}).waitFor()
 await header.getByText('Last 30 days',{exact:true}).waitFor()
 assert.match(await header.innerText(),/Each rate is succeeded runs out of the runs that finished \(Succeeded, Failed or Unknown\) in the last 30 days\. Cancelled and suppressed runs are not counted\./)
 const card=page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})})
 await card.getByText('100% succeeded in the last 30 days (1 of 1 finished runs)',{exact:true}).waitFor()
 await capture('automations')

 const settings=await (await h.request(h.ownerSession,'/api/v1/settings')).json()
 const settingsResponse=await h.request(h.ownerSession,'/api/v1/commands/settings.update',{method:'POST',body:JSON.stringify({commandId:createUlid(),expected:[],input:{version:settings.data.version,changes:{quietHoursStart:'00:00',quietHoursEnd:'00:00'}}})})
 assert.equal(settingsResponse.status,200,await settingsResponse.clone().text())
 const refusalName=`Monitor provider refusal ${width}`
 const refusedAutomation=await create('automation.save',{definition:{name:refusalName,enabled:true,trigger:{kind:'event',event:'risk.updated.v1'},actions:[
  {command:'add-activity',input:{campaignId:campaign.id,message:'Completed before provider refusal'}},
  {command:'send-email',input:{operatorId:h.owner,subjectId:campaign.id,title:'Run history mail',body:'Already permitted operator'}},
  {command:'add-activity',input:{campaignId:campaign.id,message:'Must not run after provider refusal'}},
 ]}})
 const risk=await create('risk.create',{fields:{campaignId:campaign.id,ownerId:h.owner,title:'Monitor refusal trigger',severity:'High',signal:'Initial signal',mitigation:'Owner review',dueDate:null}})
 mail.refuse=true
 const refusalEvent=await command('risk.patch',{id:risk.id,changes:{signal:'Request the permitted mail'}},ref(launchEntities.risk,risk))
 try{
  await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:refusalEvent.data.commandId}}])
  const failed=await h.db.prepare('SELECT id FROM automation_runs WHERE automation_id=?').bind(refusedAutomation.id).first()
  const execute=async()=>{
   const execution=await h.db.prepare("SELECT id FROM admission_outbox WHERE action='launch.automation.execute' AND state='pending' AND json_extract(input_json,'$.runId')=? ORDER BY created_at,id LIMIT 1").bind(failed.id).first()
   assert.ok(execution,'Each ordered action has its own emitted execution wake-up')
   await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.outbox.v1',outboxId:execution.id}}])
  }
  await execute();await execute()
  const read=async path=>{const response=await h.request(h.ownerSession,path);assert.equal(response.status,200);return response.json()}
  if(width===1440){
   await verifyProviderRefusalStable({h,read,automationId:refusedAutomation.id,runId:failed.id,mail,tick:at=>h.runtime.getWorker().then(worker=>worker.scheduled({cron:'* * * * *',scheduledTime:at})),restart:()=>h.restart()})
   assert.equal((await h.db.prepare("SELECT count(*) n FROM activity_entries WHERE automation_run_id=? AND message='Must not run after provider refusal'").bind(failed.id).first()).n,0,'Actions after refusal do not execute')
   const history=(await read(`/api/automations/${refusedAutomation.id}/runs`)).runs
   assert.deepEqual(history[0].actions.map(action=>action.state),['Complete','Failed','Pending'])
  }else await h.restart()
  await page.reload()
  const failedCard=page.locator('article').filter({has:page.getByRole('heading',{name:refusalName,exact:true})})
  await failedCard.getByText('Failed',{exact:true}).waitFor()
  await failedCard.getByText('provider_refused: Mail provider rejected',{exact:true}).waitFor()
  await failedCard.getByText('0% succeeded in the last 30 days (0 of 1 finished runs)',{exact:true}).waitFor()
  await capture('automations-provider-refusal')
 }finally{mail.refuse=false}
 await create('automation.disable',{id:refusedAutomation.id},ref(launchEntities.automation,await h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(refusedAutomation.id).first()))
 // Later journeys update campaigns; disabling keeps this definition from acting on them, and
 // its fixture campaign leaves the portfolio as the walkthrough's own campaign does.
 await create('automation.disable',{id:automation.id},ref(launchEntities.automation,await h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(automation.id).first()))
 await h.db.prepare('DELETE FROM campaigns WHERE id=?').bind(campaign.id).run()
}
