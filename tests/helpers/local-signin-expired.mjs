import {assertNoBrowserSession} from './session-cookies.mjs'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,rename,rm} from 'node:fs/promises'
import path from 'node:path'
import {freshLocalCopy} from './local-signin-copy.mjs'
import {localInstallerJourney} from './local-installer-journey.mjs'
import {accessibilityAction,accessibilityCaptureOnly,accessibilityContextOptions,accessibilityEvidence,auditAccessibility} from './accessibility-evidence.mjs'
import {gateCookie} from './dev-gate.mjs'

/** Expiry has its own installation so lifecycle requests retain real rate limits. */
export async function verifyExpiredLink({browser,viewport,evidence}){
 const copy=await freshLocalCopy();let installation,context,failed=false
 try{
  await mkdir(evidence,{recursive:true})
  installation=await localInstallerJourney(copy,browser)
  const {origin}=installation
  context=await browser.newContext(accessibilityContextOptions({viewport,javaScriptEnabled:false}))
  const gate=await gateCookie(origin,installation.key)
  await context.addCookies([gate])
  const page=await context.newPage()
  const sent=await context.request.post(origin+'/auth/request',{headers:{origin},data:{email:'local-owner@example.test',returnTo:'/app'}})
  assert.equal(sent.status(),200);assert.deepEqual(await sent.json(),{status:'accepted'})
  await page.goto(origin+'/__dev/outbox');await accessibilityAction(page,page.getByRole('link',{name:'Read message',exact:true}).first())
  const target=await page.getByRole('link',{name:'Open this link',exact:true}).getAttribute('href')
  // Prove this actual captured token was valid before changing only its expiry.
  assert.equal((await fetch(target)).status,200)
  await copy.command(['exec','wrangler','d1','execute','cradle','--local','--persist-to','.wrangler/state','--config','dist/server/wrangler.json','--command','UPDATE oa_tokens SET expires_at=0 WHERE consumed_at IS NULL'])
  const response=await page.goto(target)
  assert.equal(response.status(),400)
  await page.getByRole('heading',{name:'This link is invalid or expired',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Confirm',exact:true}).count(),0)
  assert.equal(await page.getByRole('link',{name:'Request a new link',exact:true}).getAttribute('href'),'/signin')
  await assertNoBrowserSession(context,origin,[gate.name])
  if(accessibilityEvidence){
   const audit=await auditAccessibility(page,{screen:'confirm-expired',width:viewport.width,output:evidence})
   const severe=[...audit.axe.wcag22aa,...audit.axe.targetSize].filter(violation=>['serious','critical'].includes(violation.impact))
   if(!accessibilityCaptureOnly)assert.deepEqual(severe.map(violation=>violation.id),[],`expired confirmation WCAG 2.2 AA serious/critical accessibility`)
  }else await page.screenshot({path:path.join(evidence,`confirm-expired-${viewport.width}.png`),fullPage:true})
 }catch(error){failed=true;throw error}
 finally{
  await context?.close();await installation?.close();await copy.log.close()
  if(failed){await mkdir(evidence,{recursive:true});const retained=await mkdtemp(path.join(evidence,`failed-expiry-${viewport.width}-`));await rename(copy.root,path.join(retained,'installation'));console.log('Stopped expiry fixture retained privately at '+retained)}
  else await rm(copy.root,{recursive:true,force:true})
 }
}
