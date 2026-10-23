import {randomBytes} from 'node:crypto'
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

contract('AUTOMATIONS-USER-UI-001','[AUTO-USER-005] [AUTO-USER-006] owners issue and revoke keys, edit record automations and inspect real completed runs on desktop and phone',async()=>{
 const output=path.resolve(process.env.CRADLE_AUTOMATIONS_OUTPUT??'.private/user-automation-browser')
 await mkdir(output,{recursive:true});let h,browser
 const receipts=[]
 try {
  h=await userAutomationRuntime(18957,{bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EGRESS_RELAY_URL:'https://relay.example.com/v1/deliver',EGRESS_RELAY_SECRET:'synthetic-cradle-81-relay-secret-0000000000'},outbound:async request=>{assert.equal(request.url,'https://relay.example.com/v1/deliver');const wire=await request.json();return wire.url.endsWith('/unknown')?new Response(null,{status:503}):Response.json({status:wire.url.endsWith('/safe')?429:400,headers:{},body:''})}})
  assert.equal(process.env.HOME,userInfo().homedir)
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  console.log('OWNED_BROWSER_PIDS '+execFileSync('ps',['-axo','pid,ppid,comm'],{encoding:'utf8'}).split('\n').filter(line=>line.trim().split(/\s+/)[1]===String(process.pid)).join(' | '))
  for(const width of [1440,390]) {
   const context=await browser.newContext({viewport:{width,height:width===390?844:900}})
   try {
    await context.addCookies(browserCookies(h.cookie,h.origin))
    const page=await context.newPage(),journey=recordsJourney(page,h.origin,output,width)
    let consoleErrors=0;page.on('console',message=>{if(message.type()==='error')consoleErrors++})
    await userKeyBrowser(page,h,journey,width)
    await userAutomationBrowser(page,h,journey,width)
    await automationFailureBrowser(page,h,journey,width,output)
    assert.equal(consoleErrors,0,'No browser console errors')
    receipts.push({width,checkpoints:journey.checkpoints,consoleErrors})
   }finally{await context.close()}
  }
  await writeFile(path.join(output,'results.json'),JSON.stringify(receipts,null,2))
 }finally{await browser?.close();await h?.close()}
})
