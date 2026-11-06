
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium,expect} from '/home/agent/rer-consolidation/work/sd-cradle-c-f206/repo/node_modules/@playwright/test/index.mjs'
import {launchWalkthroughRuntime} from '/home/agent/rer-consolidation/work/sd-cradle-c-f206/repo/tests/helpers/launch-walkthrough-runtime.mjs'
import {launchWalkthroughCapture} from '/home/agent/rer-consolidation/work/sd-cradle-c-f206/repo/tests/helpers/launch-walkthrough-capture.mjs'
import {verifyPublicCampaignLifecycle} from '/home/agent/rer-consolidation/work/sd-cradle-c-f206/repo/tests/helpers/launch-campaign-lifecycle-clauses.mjs'
import {accessibilityAction} from '/home/agent/rer-consolidation/work/sd-cradle-c-f206/repo/tests/helpers/accessibility-evidence.mjs'
import {stringifySafeEvidence} from '/home/agent/rer-consolidation/work/sd-cradle-c-f206/repo/tests/helpers/accessibility-redaction.mjs'
const output=path.resolve('../packet/browser')
await mkdir(output,{recursive:true})
const {h,workspaceName,close}=await launchWalkthroughRuntime()
const receipt={head:process.env.CANDIDATE_HEAD,screens:[],campaignLifecycle:[],errors:[]}
let browser
try {
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 for(const width of [1440,390]) {
  const viewport={width,height:width===390?844:900}
  const context=await browser.newContext({viewport})
  const page=await context.newPage()
  page.on('pageerror',error=>receipt.errors.push(error.message))
  await context.addCookies([{name:h.ownerSession.cookie.split('=')[0],value:h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1),url:h.origin}])
  const action=target=>accessibilityAction(page,target)
  const capture=launchWalkthroughCapture({page,receipt,viewport,output,workspaceName})
  try {
   const proof = await verifyPublicCampaignLifecycle(h, {
    show: async ({stage,campaign,subjects,operator}) => {
     await context.addCookies([{name:operator.session.cookie.split('=')[0],value:operator.session.cookie.slice(operator.session.cookie.indexOf('=')+1),url:h.origin}])
     await page.goto(`${h.origin}/app/campaigns/${campaign.id}`)
     await expect(page.getByRole('heading',{name:'Retained launch campaign',exact:true})).toBeVisible()
     for(const [selector,title,state] of [
      ['.portfolio-deliverable-list','Retained launch kit',null],
      ['.portfolio-priority-milestones ol','Retained supplier review','Not started'],
      ['.portfolio-risk-list','Retained supplier risk','Watching'],
      ['.portfolio-priority-decisions ol','Retained supplier decision','High'],
     ]) {
      const row=page.locator(selector).getByRole('listitem').filter({has:page.getByText(title,{exact:true})})
      await expect(row).toBeVisible()
      if(state)await expect(row.getByText(state,{exact:true})).toBeVisible()
     }
     await expect(page.locator('.portfolio-deliverable-list').getByRole('checkbox')).not.toBeChecked()
     const actions=page.getByText('More campaign actions',{exact:true})
     if(!(await actions.evaluate(el=>el.parentElement.open)))await action(actions)
     await expect(page.getByRole('button',{name:stage==='archived'?'Restore':'Archive',exact:true})).toBeVisible()
     await capture(`campaign-lifecycle-${stage}-detail`,{operatorName:'Lifecycle operator'})
     await page.goto(`${h.origin}/app/campaigns`)
     await page.getByRole('heading',{name:'Campaign Grid',exact:true}).waitFor()
     const links=page.locator(`a[href="/app/campaigns/${campaign.id}"]`).filter({visible:true})
     if(stage==='archived')await expect(links).toHaveCount(0)
     else await expect(links.first()).toBeVisible()
     await capture(`campaign-lifecycle-${stage}-grid`,{operatorName:'Lifecycle operator'})
    },
    transition: async ({action:verb,campaign}) => {
     await page.goto(`${h.origin}/app/campaigns/${campaign.id}`)
     const actions=page.getByText('More campaign actions',{exact:true})
     if(!(await actions.evaluate(el=>el.parentElement.open)))await action(actions)
     await action(page.getByRole('button',{name:verb==='archive'?'Archive':'Restore',exact:true}))
     const submitted=page.waitForResponse(response=>response.url().endsWith(`/api/v1/commands/launch.campaign.${verb}`)&&response.request().method()==='POST')
     await action(page.getByRole('button',{name:verb==='archive'?'Archive campaign':'Restore campaign',exact:true}))
     const response=await submitted,body=await response.json()
     assert.equal(response.status(),200,JSON.stringify(body))
     assert.equal(body.data.state,'committed')
     assert.equal(response.request().postDataJSON().expected[0].version,campaign.version,'Shipped control submits the freshly loaded campaign revision')
     await page.getByRole('link',{name:'Return to campaigns',exact:true}).waitFor()
    },
   })
   receipt.campaignLifecycle??=[]
   receipt.campaignLifecycle.push({width:viewport.width,proof})
  } finally {
   await context.addCookies([{name:h.ownerSession.cookie.split('=')[0],value:h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1),url:h.origin}])
  }

  await context.close()
 }
 assert.deepEqual(receipt.errors,[])
 receipt.result='passed'
}finally{
 if(browser)await browser.close()
 await close()
 await writeFile(path.join(output,'receipt.json'),stringifySafeEvidence(receipt))
}
console.log('CAMP-009 retained lifecycle browser proof passed: '+receipt.screens.length+' screens at 1440 and 390')
