import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {contract} from './contract.mjs'
import {admissionRuntime} from './helpers/admission-runtime.mjs'
import {managementEditorEdge} from './helpers/management-editor-edge.mjs'
import {recordsJourney} from './helpers/records-browser-journey.mjs'

contract('ADMISSION-EDITOR-UI-001','the native owner editor negotiates through allowed frames at desktop and phone widths and removes access after native revocation',async()=>{
 const output=path.resolve(process.env.CRADLE_EDITOR_OUTPUT??'.private/admission-editor')
 await mkdir(output,{recursive:true})
 let edge,h,browser
 const receipts=[]
 try{
  const origin='http://127.0.0.1:18959'
  edge=await managementEditorEdge(origin,'cradle-admission-test')
  h=await admissionRuntime(18959,{managementOrigin:edge.origin})
  const cookie=await h.claim(),member=await h.member(cookie)
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:width===390?844:900}})
   try{
    await context.addCookies([{name:'operator_session_local',value:cookie.slice('operator_session_local='.length),url:origin}])
    const page=await context.newPage(),journey=recordsJourney(page,origin,output,width)
    const embedded=page.waitForResponse(response=>response.url().startsWith(edge.origin+'/editor?'))
    const document=await page.goto(origin+'/app');assert.equal(document.status(),200)
    const csp=document.headers()['content-security-policy']
    assert.ok(csp.includes(edge.origin),'The exact management origin is allowed in frame-src')
    assert.ok(!csp.includes('*'),'No wildcard frame authority')
    await page.getByRole('button',{name:'Open Run Edit Run',exact:true}).waitFor()
    await journey.capture('editor-launcher')
    await page.getByRole('button',{name:'Open Run Edit Run',exact:true}).click()
    const frameResponse=await embedded
    assert.equal(frameResponse.headers()['content-security-policy'].split('frame-ancestors ')[1],origin)
    await page.frameLocator('iframe[title="Run Edit Run editor"]').getByText('Connected',{exact:true}).waitFor()
    const draft=page.frameLocator('iframe[title="Run Edit Run editor"]').getByRole('textbox',{name:'Draft',exact:true})
    await draft.click()
    await draft.fill('An unsent owner edit')
    const framesBeforeRenewal=edge.requests.filter(request=>request.path==='/editor').length
    const renewal=page.waitForResponse(response=>response.url()===origin+'/api/editor/config')
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
    assert.equal((await renewal).status(),200)
    await page.waitForLoadState('networkidle')
    assert.equal(edge.requests.filter(request=>request.path==='/editor').length,framesBeforeRenewal,'Renewal preserves the negotiated iframe')
    assert.equal(await draft.inputValue(),'An unsent owner edit','Renewal preserves the unsent draft')
    await journey.capture('editor-connected')
    await page.getByRole('button',{name:'Close Run Edit Run',exact:true}).click()
    if(width===390)await page.getByRole('button',{name:'Open navigation',exact:true}).click()
    const navigation=width===390?page.getByRole('dialog',{name:'Navigation',exact:true}):page
    await navigation.getByRole('link',{name:'Settings',exact:true}).first().click()
    await page.waitForURL(origin+'/app/settings')
    await page.getByRole('button',{name:'Open Run Edit Run',exact:true}).waitFor()
    await journey.capture('editor-after-navigation')
    // A mismatched installation cannot grant browser framing, regardless of parentOrigin.
    const deny=await fetch(edge.origin+'/editor?installation=another&parentOrigin='+encodeURIComponent(origin))
    assert.ok(deny.headers.get('content-security-policy').includes("frame-ancestors 'none'"))
    const deniedResponse=page.waitForResponse(response=>response.url().startsWith(edge.origin+'/editor?installation=another'))
    const refusedFrame=page.waitForEvent('console',{predicate:message=>message.type()==='error'&&message.text().includes('frame-ancestors')&&message.text().includes("'none'")})
    await page.evaluate(manager=>{
     const iframe=document.createElement('iframe');iframe.id='denied-management-edge';
     iframe.src=manager+'/editor?installation=another&parentOrigin='+encodeURIComponent(location.origin);
     document.body.appendChild(iframe)
    },edge.origin)
    const deniedHeader=(await deniedResponse).headers()['content-security-policy']
    assert.ok(deniedHeader.includes("frame-ancestors 'none'"))
    await refusedFrame
    const deniedFrame=page.frames().find(frame=>frame.url().startsWith(edge.origin+'/editor?installation=another'))
    assert.ok(!deniedFrame||!(await deniedFrame.locator('#connection').count()),'The browser refuses the unregistered frame')
    await page.evaluate(()=>document.querySelector('#denied-management-edge')?.remove())
    receipts.push({width,checkpoints:journey.checkpoints,negotiated:true,registeredFrameAllowed:true,unregisteredFrameDenied:true})
   }finally{await context.close()}
  }
  const anonymous=await browser.newContext()
  try{
   const page=await anonymous.newPage();await page.goto(origin+'/signin');await page.waitForLoadState('networkidle')
   assert.equal(await page.locator('[data-rer-editor]').count(),0)
   assert.equal((await page.request.get(origin+'/api/editor/config')).status(),403)
   await anonymous.addCookies([{name:'operator_session_local',value:member.slice('operator_session_local='.length),url:origin}])
   assert.equal((await page.request.get(origin+'/api/editor/config')).status(),403,'Native non-owners cannot obtain a grant')
  }finally{await anonymous.close()}
  const owner=await browser.newContext({viewport:{width:390,height:844}})
  try{
   await owner.addCookies([{name:'operator_session_local',value:cookie.slice('operator_session_local='.length),url:origin}])
   const page=await owner.newPage();await page.goto(origin+'/app')
   await page.getByRole('button',{name:'Open Run Edit Run',exact:true}).waitFor()
   const csrf=await h.request('/auth/csrf',{cookie});const {csrfToken}=await csrf.json()
   const revoked=await h.request('/auth/sign-out',{method:'POST',cookie,body:{},headers:{'x-csrf-token':csrfToken}})
   assert.equal(revoked.status,200)
   assert.equal((await h.request('/api/editor/config',{cookie})).status,403)
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
   await page.locator('[data-rer-editor]').waitFor({state:'detached'})
   assert.equal(await page.locator('iframe[title="Run Edit Run editor"]').count(),0)
   assert.equal(await page.getByRole('alert').count(),1,'A failed authorization refresh is visible')
   receipts.push({revoked:true,privateOverlayRemoved:true})
  }finally{await owner.close()}
  await writeFile(path.join(output,'results.json'),JSON.stringify(receipts,null,2))
 }finally{await browser?.close();await h?.close();await edge?.close()}
})
