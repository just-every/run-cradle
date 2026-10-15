import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {LAUNCH_APP_ID,launchEntities} from '../../src/apps/launch/contracts.ts'

/** Create in the browser, fire the real cron, then inspect the rendered saved run. */
export async function userScheduleBrowser(page,h,journey,width) {
 const campaignName=`Scheduled campaign ${width}`,automationName=`Browser schedule ${width}`
 const campaign=(await h.request('/api/v1/commands/launch.campaign.create',{method:'POST',body:{commandId:createUlid(),expected:[],input:{fields:{
  code:`UI-${width}`,name:campaignName,ownerId:h.operator,startDate:'2026-01-01',launchDate:'2027-01-01',
  objective:'Exercise scheduled campaign activity',statusSummary:'Ready',phase:'Planning',status:'On track',health:50,
  budgetMinor:0,spendMinor:0,tags:[],customFields:{},
 }}}})).data.value
 const settings=(await h.request('/api/v1/settings')).data
 const at=new Date(Date.now()+120000),local=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:settings.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
 }).formatToParts(at).map(part=>[part.type,part.value]))
 await page.goto(h.origin+'/app/automations')
 await page.getByRole('button',{name:'New scheduled automation',exact:true}).click()
 const form=page.getByRole('form',{name:'Scheduled automation definition'})
 await form.getByLabel('Scheduled automation name',{exact:true}).fill(automationName)
 if(width===390){
  await form.getByLabel('Repeat',{exact:true}).selectOption('weekly')
  const weekday=new Date(`${local.year}-${local.month}-${local.day}T12:00:00Z`).getUTCDay()
  await form.getByLabel('Day',{exact:true}).selectOption(String(weekday))
 }
 await form.getByLabel(/^Time ·/).fill(`${local.hour}:${local.minute}`)
 await form.getByLabel('Launch campaign',{exact:true}).selectOption({label:campaignName})
 await form.getByLabel('Message',{exact:true}).fill(`Activity from ${automationName}`)
 const saved=await journey.command(form.getByRole('button',{name:'Save scheduled automation',exact:true}),'launch.automation.save')
 await page.getByRole('heading',{name:automationName,exact:true}).waitFor()
 await journey.capture('user-schedule-saved')
 const worker=await h.runtime.getWorker();await worker.scheduled({scheduledTime:at.getTime(),cron:'* * * * *'})
 await page.goto(h.origin+'/app/automations')
 const monitor=page.getByRole('article').filter({has:page.getByRole('heading',{name:automationName,exact:true})})
 await monitor.getByText('Succeeded',{exact:true}).waitFor()
 const runs=(await h.db.prepare('SELECT id,state FROM automation_runs WHERE automation_id=?').bind(saved.id).all()).results
 assert.equal(runs.length,1);assert.equal(runs[0].state,'Succeeded')
 const activity=await h.db.prepare('SELECT campaign_id,message FROM activity_entries WHERE automation_run_id=?').bind(runs[0].id).first()
 assert.equal(activity.campaign_id,campaign.id);assert.equal(activity.message,`Activity from ${automationName}`)
 await journey.capture('user-schedule-complete')
 await h.request('/api/v1/commands/launch.automation.disable',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:saved.id},version:saved.version}],input:{id:saved.id}}})
}
