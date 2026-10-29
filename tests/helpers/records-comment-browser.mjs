import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {recordsBrowserWidths} from './records-browser-widths.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {launchWalkthroughRuntime} from './launch-walkthrough-runtime.mjs'
import {verifyCommentScreens} from './launch-comment-screens.mjs'

/** Retain the native comment, mention and deletion journey at both phone widths. */
export async function recordCommentsBrowser(){
 const output=process.env.CRADLE_COMMENTS_OUTPUT??'.private/record-comments'
 await mkdir(output,{recursive:true})
 const {h,command,close}=await launchWalkthroughRuntime(),receipts=[]
 let browser
 try{
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of recordsBrowserWidths()){
   const context=await browser.newContext({viewport:{width,height:width<=390?844:1000}})
   try{
    await context.addCookies([{name:h.ownerSession.cookie.split('=')[0],value:h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1),url:h.origin}])
    const page=await context.newPage(),journey=recordsJourney(page,h.origin,output,width)
    await verifyCommentScreens({h,page,command,capture:journey.capture})
    receipts.push({width,checkpoints:journey.checkpoints})
   }finally{await context.close()}
  }
  await writeFile(`${output}/results.json`,JSON.stringify(receipts,null,2))
 }finally{await browser?.close();await close()}
}
