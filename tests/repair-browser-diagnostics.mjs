import {writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
/** Failure evidence contains rendered test UI, never cookies, credentials or document bootstrap data. */
export async function captureRepairFailure(browser,output,error,label){
 await mkdir(output,{recursive:true})
 const pages=browser.contexts().flatMap(context=>context.pages()),states=[]
 for(const [index,page] of pages.entries()){
  if(page.isClosed())continue
  try{
   const prefix=`failure-${label}-${index}`
   states.push({path:new URL(page.url()).pathname,online:await page.evaluate(()=>navigator.onLine),viewport:page.viewportSize(),body:await page.locator('body').innerText(),accessibility:await page.locator('body').ariaSnapshot()})
   await page.screenshot({path:path.join(output,prefix+'.png'),fullPage:true})
  }catch(cause){states.push({captureError:String(cause)})}
 }
 await writeFile(path.join(output,`failure-${label}.json`),JSON.stringify({error:String(error),states},null,2))
}
