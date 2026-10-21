import assert from 'node:assert/strict'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

// AUTO-006 on Automation Monitor: an owner automation finishes one run through the emitted
// queue, then the screen states its success rate and the trailing 30-day window it covers.
export async function verifyAutomationMonitorScreens({h,page,command,capture}){
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
 // Later journeys update campaigns; disabling keeps this definition from acting on them, and
 // its fixture campaign leaves the portfolio as the walkthrough's own campaign does.
 await create('automation.disable',{id:automation.id},ref(launchEntities.automation,await h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(automation.id).first()))
 await h.db.prepare('DELETE FROM campaigns WHERE id=?').bind(campaign.id).run()
}
