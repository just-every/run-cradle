import assert from 'node:assert/strict'
import {LAUNCH_APP_ID} from '../../src/apps/launch/contracts.ts'
export async function retainedLaunch(page,j,h,width){
 await page.goto(h.origin+'/app/campaigns');await j.action(page.getByRole('button',{name:'New campaign',exact:true}))
 for(const [label,value]of Object.entries({'Campaign name':`Retained launch ${width}`,'Campaign code':`KEEP-${width}`,'Start date':'2026-10-01','Launch date':'2026-12-01','Phase':'Planning','Status':'On track','Manually reported health (%)':'75','Budget (AUD)':'100','Spend so far (AUD)':'0','Objective':'Keep this campaign intact'}))await (['Phase','Status'].includes(label) ? page.getByLabel(label,{exact:true}).selectOption(value) : page.getByLabel(label,{exact:true}).fill(value))
 await page.getByLabel('Owner',{exact:true}).selectOption({label:'Records Owner'});await j.command(page.getByRole('button',{name:'Create campaign',exact:true}),'launch.campaign.create');await page.getByRole('button',{name:'New campaign',exact:true}).waitFor()
 const baseline=await h.db.prepare('SELECT * FROM campaigns WHERE code=?').bind(`KEEP-${width}`).first();assert.ok(baseline)
 const membership=(await h.db.prepare('SELECT * FROM authority_memberships WHERE principal_id=? AND app_id=?').bind('00000000000000000000000981',LAUNCH_APP_ID).all()).results
 assert.equal(membership.length,1)
 return async()=>{assert.deepEqual(await h.db.prepare('SELECT * FROM campaigns WHERE code=?').bind(`KEEP-${width}`).first(),baseline);assert.deepEqual((await h.db.prepare('SELECT * FROM authority_memberships WHERE principal_id=? AND app_id=?').bind('00000000000000000000000981',LAUNCH_APP_ID).all()).results,membership);await page.goto(h.origin+'/app/campaigns');await page.locator('.portfolio-grid-results').getByText(`Retained launch ${width}`,{exact:true}).filter({visible:true}).first().waitFor();await page.goto(h.origin+'/app/overview');await page.locator('h1').waitFor();await j.capture('retained-launch')}
}
