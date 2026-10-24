import {slackAppBrowser} from './helpers/slack-app-browser.mjs'
import {slackAppNetworkEdge} from './helpers/slack-app-network-edge.mjs'
import {warehouseBrowser} from './helpers/warehouse-browser.mjs'
import {smsBrowser} from './helpers/sms-browser.mjs'
import {twilioEdge} from './helpers/sms-journey.mjs'
import {automationTriggerBrowser} from './helpers/automation-trigger-browser.mjs'
import {automationControlBrowser} from './helpers/automation-control-browser.mjs'
import {automationFailureBrowser} from './helpers/automation-failure-browser.mjs'
import {userInfo} from 'node:os'
import {execFileSync} from 'node:child_process'
import {browserCookies} from './helpers/session-cookies.mjs'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {contract} from './contract.mjs'
import {userAutomationRuntime} from './helpers/user-automation-runtime.mjs'
import {recordsJourney} from './helpers/records-browser-journey.mjs'
import {userKeyBrowser} from './helpers/user-key-browser.mjs'
import {userAutomationBrowser} from './helpers/user-automation-browser.mjs'

contract('AUTOMATIONS-USER-UI-001','[AUTO-USER-005] [AUTO-USER-006] [AUTO-USER-004] [AUTO-USER-002] owners issue and revoke keys, edit record automations and inspect real completed runs on desktop and phone',async()=>{
 const output=path.resolve(process.env.CRADLE_AUTOMATIONS_OUTPUT??'.private/user-automation-browser')
 await mkdir(output,{recursive:true});let h,browser,smsEdge,slackEdge
 const receipts=[]
 try {
  slackEdge=await slackAppNetworkEdge()
  smsEdge=await twilioEdge({relayUrl:slackEdge.bindings.EGRESS_RELAY_URL,secret:slackEdge.bindings.EGRESS_RELAY_SECRET})
  h=await userAutomationRuntime(0,{bindings:slackEdge.bindings,outbound:async request=>{assert.equal(request.url,slackEdge.bindings.EGRESS_RELAY_URL);const wire=await request.clone().json();if(new URL(wire.url).hostname==='slack.com')return slackEdge.outbound(request);if(['api.twilio.com','messaging.twilio.com'].includes(new URL(wire.url).hostname))return smsEdge.outbound(request);return wire.url.endsWith('/unknown')?new Response(null,{status:503}):Response.json({status:wire.url.endsWith('/safe')?429:400,headers:{},body:''})}})
  slackEdge.setOrigin(h.origin)
  assert.equal(process.env.HOME,userInfo().homedir)
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  console.log('OWNED_BROWSER_PIDS '+execFileSync('ps',['-axo','pid,ppid,comm'],{encoding:'utf8'}).split('\n').filter(line=>line.trim().split(/\s+/)[1]===String(process.pid)).join(' | '))
  for(const width of [1440,390]) {
   const context=await browser.newContext({viewport:{width,height:width===390?844:900}})
   try {
    await context.addCookies(browserCookies(h.cookie,h.origin))
    const page=await context.newPage(),journey=recordsJourney(page,h.origin,output,width)
    let consoleErrors=0;page.on('console',message=>{if(message.type()==='error')consoleErrors++})
    await slackAppBrowser(page,h,journey,width,slackEdge)
    await warehouseBrowser(page,h,journey,width)
    await smsBrowser(page,h,journey,width)
    await userKeyBrowser(page,h,journey,width)
    await userAutomationBrowser(page,h,journey,width)
    await automationFailureBrowser(page,h,journey,width,output)
    await automationControlBrowser(page,h,journey,width,output)
    await automationTriggerBrowser(page,h,journey,width,output)
    assert.equal(consoleErrors,0,'No browser console errors')
    receipts.push({width,checkpoints:journey.checkpoints,consoleErrors})
   }finally{await context.close()}
  }
  await writeFile(path.join(output,'results.json'),JSON.stringify(receipts,null,2))
 }finally{await browser?.close();await h?.close();await smsEdge?.close();await slackEdge?.close()}
})
