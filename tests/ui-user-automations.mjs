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

contract('AUTOMATIONS-USER-UI-001','owners issue and revoke keys, edit record automations and inspect real completed runs on desktop and phone',async()=>{
 const output=path.resolve(process.env.CRADLE_AUTOMATIONS_OUTPUT??'.private/user-automation-browser')
 await mkdir(output,{recursive:true});let h,browser
 const receipts=[]
 try {
  h=await userAutomationRuntime(18957)
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of [1440,390]) {
   const context=await browser.newContext({viewport:{width,height:width===390?844:900}})
   try {
    await context.addCookies(browserCookies(h.cookie,h.origin))
    const page=await context.newPage(),journey=recordsJourney(page,h.origin,output,width)
    let consoleErrors=0;page.on('console',message=>{if(message.type()==='error')consoleErrors++})
    await userKeyBrowser(page,h,journey,width)
    await userAutomationBrowser(page,h,journey,width)
    assert.equal(consoleErrors,0,'No browser console errors')
    receipts.push({width,checkpoints:journey.checkpoints,consoleErrors})
   }finally{await context.close()}
  }
  await writeFile(path.join(output,'results.json'),JSON.stringify(receipts,null,2))
 }finally{await browser?.close();await h?.close()}
})
