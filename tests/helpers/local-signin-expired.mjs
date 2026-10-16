import assert from 'node:assert/strict'
import path from 'node:path'
import {bindings} from './rer-data-fixture.mjs'
import {accessibilityCaptureOnly,accessibilityEvidence,auditAccessibility} from './accessibility-evidence.mjs'

/** Expire the actual issued dev session, then recover through the current dev identity door. */
export async function verifyExpiredSession({context,page,viewport,origin,evidence,copy}){
 const prior=await context.request.get(origin+'/api/session');assert.equal(prior.status(),200)
 const owner=(await prior.json()).operator.id
 const cookie=(await context.cookies(origin)).map(cookie=>cookie.name+'='+cookie.value).join('; ')
 await bindings(copy.source,async({DB})=>{
  const result=await DB.prepare("UPDATE oa_sessions SET expires_at=0 WHERE kind='dev' AND revoked_at IS NULL").run()
  assert.ok(result.meta.changes>0,'The current local session was expired')
 })
 assert.equal((await context.request.get(origin+'/auth/session')).status(),401,'The actual expired session no longer authenticates')
 const denied=await context.request.get(origin+'/app',{maxRedirects:0})
 assert.equal(denied.status(),303);assert.equal(new URL(denied.headers().location,origin).pathname,'/signin')
 await page.goto(origin+'/app');await page.waitForURL(origin+'/signin')
 await page.getByRole('heading',{name:'Sign-in email is not configured',exact:true}).waitFor()
 if(accessibilityEvidence){
  const audit=await auditAccessibility(page,{screen:'session-expired',width:viewport.width,output:evidence})
  const severe=[...audit.axe.wcag22aa,...audit.axe.targetSize].filter(violation=>['serious','critical'].includes(violation.impact))
  if(!accessibilityCaptureOnly)assert.deepEqual(severe.map(violation=>violation.id),[],`expired session WCAG 2.2 AA serious/critical accessibility`)
 }else await page.screenshot({path:path.join(evidence,`session-expired-${viewport.width}.png`),fullPage:true})
 // This GET uses the existing real HttpOnly checkout gate and receives a new
 // native cookie through the same owner action offered by the dev badge.
 await page.goto(origin+'/auth/dev/enter?as=owner');await page.waitForURL(origin+'/app')
 await page.getByRole('link',{name:'Open records',exact:true}).waitFor()
 const recovered=await context.request.get(origin+'/api/session');assert.equal(recovered.status(),200)
 assert.equal((await recovered.json()).operator.id,owner,'Recovery returns to the persisted owner')
 const replay=await fetch(origin+'/auth/session',{headers:{cookie}})
 assert.equal(replay.status,401,'Issuing a fresh session never revives the expired session')
}
