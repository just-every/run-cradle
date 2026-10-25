import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {contract} from './contract.mjs'
import {launchWalkthroughRuntime} from './helpers/launch-walkthrough-runtime.mjs'
import {launchWalkthroughCapture} from './helpers/launch-walkthrough-capture.mjs'
import {recordLaunchConsole,assertNoUnexpectedLaunchConsoleErrors} from './helpers/launch-disabled-ai-console.mjs'
import {verifyNotificationPreferencesScreens} from './helpers/notification-preferences-screens.mjs'
import {verifyNotificationEventScreens} from './helpers/notification-event-screens.mjs'
import {verifyInboxScreens} from './helpers/launch-inbox-screens.mjs'
import {stringifySafeEvidence} from './helpers/accessibility-redaction.mjs'
import {accessibilityContextOptions,accessibilityWidths} from './helpers/accessibility-evidence.mjs'

contract('NOTIFY-001 NOTIFY-002 NOTIFY-003 NOTIFY-005 NOTIFY-006 NOTIFY-007 NOTIFY-009 CAMP-006','notification preferences, real delivery events and inbox retention and erasure at desktop and phone',async()=>{
 const output=path.resolve(process.env.CRADLE_LAUNCH_NOTIFICATIONS_EVIDENCE ?? '../evidence/de-launch-notifications')
 const receipt={environment:'Actual emitted Worker and native D1, synthetic test fixtures only',screens:[],viewports:[],errors:[],consoleEvents:[],consoleErrors:[],expectedConsoleErrors:[],unexpectedConsoleErrors:[],external:[],clauses:['NOTIFY-001','NOTIFY-002','NOTIFY-003','NOTIFY-005','NOTIFY-006','NOTIFY-007','NOTIFY-009','CAMP-006']}
 let browser
 try{
  await mkdir(output,{recursive:true})
  browser=await chromium.launch({headless:true,args:["--use-mock-keychain","--password-store=basic"]})
  for(const width of accessibilityWidths){
   const viewport={width,height:width===390?844:900}
   const journeys=[
    async args=>{await verifyNotificationPreferencesScreens(args);await verifyNotificationEventScreens(args)},
    verifyInboxScreens,
   ]
   for(const journey of journeys){
    const {h,command,workspaceName,setNotificationMailStatus,close}=await launchWalkthroughRuntime()
    let context
    try{
     // Inbox erasure owns a fresh Worker and provider history, so its unfiltered
     // edge baseline cannot hide newly assigned groups or unrelated scheduled sends.
     await h.db.prepare('DELETE FROM campaigns').run()
     context=await browser.newContext(accessibilityContextOptions({viewport}))
     const page=await context.newPage()
     page.on('pageerror',error=>receipt.errors.push(error.message))
     recordLaunchConsole(page,receipt,width)
     page.on('request',request=>{if(new URL(request.url()).origin!==h.origin)receipt.external.push(new URL(request.url()).origin)})
     await context.addCookies([{name:h.ownerSession.cookie.split('=')[0],value:h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1),url:h.origin}])
     const capture=launchWalkthroughCapture({page,receipt,viewport,output,workspaceName})
     await journey({h,page,command,capture,setNotificationMailStatus})
    }finally{try{await context?.close()}finally{await close()}}
   }
   receipt.viewports.push(width)
  }
  assert.deepEqual(receipt.viewports,accessibilityWidths,'Every notification assertion ran at every requested width')
  assert.deepEqual(receipt.errors,[])
  assertNoUnexpectedLaunchConsoleErrors(receipt,[])
  assert.deepEqual(receipt.external,[])
 }finally{if(browser)await browser.close();await writeFile(path.join(output,'receipt.json'),stringifySafeEvidence(receipt))}
 console.log(`Launch notification walkthrough passed ${receipt.screens.length} real-runtime screens`)
})
