import assert from 'node:assert/strict'
import {slackAppBrowser} from './slack-app-browser.mjs'
import {slackAppNetworkEdge} from './slack-app-network-edge.mjs'
import {teamsAppNetworkEdge} from './teams-app-network-edge.mjs'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {browserCookies} from './session-cookies.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
/** Same Settings/link/channel/action journey, with a provider-specific network
 * edge; no extra registration and no production provider calls. */
export async function chatProviderBrowser(browser,output){
 const receipts=[]
 for(const provider of ['teams','nook']){
  let edge,h
  try{
   edge=provider==='teams'?await teamsAppNetworkEdge():await slackAppNetworkEdge({provider})
   h=await userAutomationRuntime(0,{bindings:edge.bindings,outbound:request=>edge.outbound(request)});edge.setOrigin(h.origin)
   for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:width===390?844:900}})
    try{
     await context.addCookies(browserCookies(h.cookie,h.origin))
     const page=await context.newPage(),journey=recordsJourney(page,h.origin,output,width),consoleErrors=[]
     page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
     await slackAppBrowser(page,h,journey,width,edge)
     assert.deepEqual(consoleErrors,[])
     receipts.push({provider,width,checkpoints:journey.checkpoints,consoleErrors})
     console.log('CHAT_PROVIDER_BROWSER_PASS '+provider+' '+width)
    }finally{await context.close()}
   }
  }finally{await h?.close();await edge?.close()}
 }
 return receipts
}
