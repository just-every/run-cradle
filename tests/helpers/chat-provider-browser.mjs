import {recordsBrowserWidths} from './records-browser-widths.mjs'
import assert from 'node:assert/strict'
import {slackAppBrowser} from './slack-app-browser.mjs'
import {parallelChatRuntime,installChat} from './parallel-chat-journey.mjs'
import {browserCookies} from './session-cookies.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
/** Same Settings/link/channel/action journey with all three apps installed. */
export async function chatProviderBrowser(browser,output){
 const receipts=[],runtime=await parallelChatRuntime(),{h,edges}=runtime
 try{
  for(const edge of Object.values(edges))await installChat(h,edge)
  for(const width of recordsBrowserWidths()){
   const context=await browser.newContext({viewport:{width,height:width<=390?844:900}})
   try{
    await context.addCookies(browserCookies(h.cookie,h.origin))
    const page=await context.newPage(),journey=recordsJourney(page,h.origin,output,width),consoleErrors=[]
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
    for(const provider of ['slack','teams','nook']){
     await slackAppBrowser(page,h,journey,width,edges[provider])
     receipts.push({provider,width,checkpoints:journey.checkpoints,consoleErrors})
    }
    await page.goto(h.origin+'/app/settings')
    await page.getByText('Chat app',{exact:true}).first().click()
    const states=page.getByLabel('Connected chat providers',{exact:true})
    for(const label of ['Slack','Teams','Nook'])await states.getByText(new RegExp('^'+label+': Connected to ')).waitFor()
    await journey.capture('chat-app-all-three-connected')
    assert.deepEqual(consoleErrors,[])
    console.log('CHAT_PROVIDER_BROWSER_PASS all-three '+width)
   }finally{await context.close()}
  }
 }finally{await runtime.close()}
 return receipts
}
