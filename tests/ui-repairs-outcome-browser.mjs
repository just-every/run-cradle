import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {chromium} from '@playwright/test'
import {repairOutcomeFixture} from './repair-outcome-fixture.mjs'
import {repairFlow} from './repair-outcome-flow.mjs'
import {captureRepairFailure} from './repair-browser-diagnostics.mjs'
import {browserRepairJourney} from './repair-outcome-browser-journey.mjs'
import {auditAccessibility} from './helpers/accessibility-evidence.mjs'
const output=process.env.CRADLE_UI_EVIDENCE??path.join(tmpdir(),'cradle-repair-outcome-evidence')
await mkdir(output,{recursive:true})
const h=await repairOutcomeFixture(),flow=repairFlow(h),browser=await chromium.launch({headless:true})
const results=[],observations=[]
try{
 const {grant}=await h.issuedGrant()
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'en-AU',timezoneId:'Australia/Brisbane'})
 await context.addCookies([{name:h.ownerSession.cookie.split('=')[0],value:h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1),url:h.origin}])
 const page=await context.newPage(),mutations=[],acceptanceRequests=[]
 page.on('response',async response=>{const pathname=new URL(response.url()).pathname;if(!pathname.startsWith('/api/v1/commands/'))return;let body;try{body=await response.json()}catch{}observations.push({path:pathname,status:response.status(),state:body?.data?.state,acceptance:body?.data?.result?.storeAcceptance,error:body?.error?.message})})
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/commands/'))mutations.push(r.url());if(r.method()==='POST'&&r.url().endsWith('/commands/repair.store-acceptance'))acceptanceRequests.push(r.postDataJSON().commandId)})
 async function audit(name){for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:900});await page.waitForLoadState('networkidle');await writeFile(path.join(output,`repair-layout-${name}-${width}.json`),JSON.stringify(await page.evaluate(()=>{const link=document.querySelector('a[href^="/app/cases/"]');const nodes=[link,link?.parentElement,link?.parentElement?.nextElementSibling,link?.parentElement?.nextElementSibling?.querySelector('h2')];return {fonts:document.fonts.status,nodes:nodes.filter(Boolean).map(node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return {tag:node.tagName,className:node.className,text:node.textContent.slice(0,80),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},display:style.display,lineHeight:style.lineHeight,fontFamily:style.fontFamily,fontSize:style.fontSize,marginTop:style.marginTop,marginBottom:style.marginBottom,minHeight:style.minHeight}})}}),null,2));const result=await auditAccessibility(page,{screen:name,width,output});assert.equal(result.layout.pageOverflow,false);assert.deepEqual([...result.axe.wcag22aa,...result.axe.targetSize].map(v=>v.id),[]);results.push({screen:name,width,overflow:result.layout.pageOverflow})}}
 // Device-only photo intake still uses the actual emitted document and R2 upload path.
 await page.goto(h.origin+'/app/repairs/new');await page.getByLabel('Describe the problem',{exact:true}).waitFor()
 await context.setOffline(true)
 await page.getByLabel('Describe the problem',{exact:true}).fill('Disconnected cooling fault')
 await page.getByLabel('Photo (optional)',{exact:true}).setInputFiles({name:'fault.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlYQAAAAASUVORK5CYII=','base64')})
 await page.getByText(/Local draft — not submitted/).waitFor();assert.equal(mutations.length,0)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_intakes').first()).n,0)
 await context.setOffline(false);await page.getByText(/Current details have been checked/).waitFor();assert.equal(mutations.length,0)
 await page.getByRole('button',{name:'Submit problem',exact:true}).click();await page.getByRole('heading',{name:'Problem reported',exact:true}).waitFor()
 assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_intakes').first()).n,1)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM evidence_files').first()).n,1)
 // Actual mounted actions prepare a claim; the store's physical decision is a separate UI act.
 const q=await flow.quoted();await flow.approve(q);await flow.agreement(q)
 const booking=await flow.book(q);assert.equal((await h.waitAttempt(booking.value.attemptId)).state,'confirmed')
 await h.post('repair.reconcile-effect',{kind:'visit',id:booking.value.visitId},[await h.ref('visits',booking.value.visitId)])
 await flow.claim(q,booking.value.visitId)
 await page.goto(h.origin+`/app/repairs/${q.workId}`)
 await page.getByRole('heading',{name:'Check the physical repair'}).waitFor();await audit('repair-completion-review')
 await page.getByLabel('The repair works',{exact:true}).check();await page.getByLabel('Your observation',{exact:true}).fill('I checked physical cooling and it works.');await page.getByLabel('I checked the physical result against this completion claim.').check()
 let lostKey
 await page.route('**/api/v1/commands/repair.store-acceptance',async route=>{lostKey=route.request().postDataJSON().commandId;const response=await route.fetch();assert.equal(response.status(),200);await context.setOffline(true);await route.abort('internetdisconnected')},{times:1})
 await page.getByRole('button',{name:'Accept physical repair',exact:true}).click()
 await page.waitForFunction(()=>navigator.onLine===false)
 assert.ok(lostKey)
 await flow.claim(q,booking.value.visitId,'Revised contractor claim after prior acceptance; inspect changed seal')
 await h.db.prepare("UPDATE authority_grants SET state='revoked',version=version+1 WHERE id=?").bind(grant.id).run()
 await context.setOffline(false)
 await page.getByText(/Original submission confirmed: claim/).waitFor()
 const committed=await h.read('/api/v1/commands/'+lostKey);assert.equal(committed.state,'committed')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_acceptances WHERE work_order_id=?').bind(q.workId).first()).n,1)
 await audit('repair-accepted-receipt')
 // Alternate: no prior commit. Keep original key while authority and the claim change.
 await h.db.prepare("UPDATE authority_grants SET state='active',version=? WHERE id=?").bind(grant.version,grant.id).run()
 await page.getByRole('button',{name:'Review current completion claim',exact:true}).click()
 await page.getByRole('heading',{name:'Check the physical repair'}).waitFor()
 assert.equal(await page.getByLabel('I checked the physical result against this completion claim.').isChecked(),false)
 assert.equal(await page.getByLabel('Your observation',{exact:true}).inputValue(),'')
 assert.equal(await page.getByRole('button',{name:'Accept physical repair',exact:true}).isDisabled(),true)
 await page.screenshot({path:path.join(output,'fresh-review-after-committed-loss.png'),fullPage:true})
 const alternate=await flow.quoted('200000');await flow.agreement(alternate);const booked=await flow.book(alternate);await h.waitAttempt(booked.value.attemptId);await flow.claim(alternate,booked.value.visitId)
 await page.goto(h.origin+`/app/repairs/${alternate.workId}`);await page.getByRole('heading',{name:'Check the physical repair'}).waitFor()
 await page.getByLabel('The repair works',{exact:true}).check();await page.getByLabel('Your observation',{exact:true}).fill('Initial inspection before revised report');await page.getByLabel('I checked the physical result against this completion claim.').check()
 let uncommittedKey
 await page.route('**/api/v1/commands/repair.store-acceptance',async route=>{uncommittedKey=route.request().postDataJSON().commandId;await context.setOffline(true);await route.abort('internetdisconnected')},{times:1})
 await page.getByRole('button',{name:'Accept physical repair',exact:true}).click();await page.waitForFunction(()=>navigator.onLine===false)
 await flow.claim(alternate,booked.value.visitId,'Changed contractor completion claim; seal still requires inspection')
 await h.db.prepare("UPDATE authority_grants SET state='revoked',version=version+1 WHERE id=?").bind(grant.id).run()
 const before=mutations.filter(v=>v.endsWith('/repair.store-acceptance')).length
 await context.setOffline(false)
 await page.getByRole('button',{name:'Check status',exact:true}).last().click()
 await page.getByText(/original submission has not been found yet/).waitFor()
 assert.equal(mutations.filter(v=>v.endsWith('/repair.store-acceptance')).length,before,'Reconnect never retries acceptance')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_acceptances WHERE work_order_id=?').bind(alternate.workId).first()).n,0)
 await page.getByRole('button',{name:'Retry original request',exact:true}).click()
 await page.getByText(/record changed|Repair record changed|grant is not current/i).first().waitFor()
 assert.equal(acceptanceRequests.at(-1),uncommittedKey,'An explicit retry retains the original uncommitted acceptance identity')
 assert.equal(acceptanceRequests.filter(id=>id===lostKey).length,1,'A committed lost response is read back without another acceptance submission')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(uncommittedKey).first()).n,0)
 await h.db.prepare("UPDATE authority_grants SET state='active',version=? WHERE id=?").bind(grant.version,grant.id).run()
 await page.getByRole('button',{name:'Refresh',exact:true}).click()
 await page.getByRole('heading',{name:'Check the physical repair'}).waitFor()
 assert.equal(await page.getByLabel('I checked the physical result against this completion claim.').isChecked(),false)
 assert.equal(await page.getByRole('button',{name:'Accept physical repair',exact:true}).isDisabled(),true)
 await audit('repair-changed-claim-review')
 await context.close()
 const journeys=[];for(const width of [1440,390])journeys.push(await browserRepairJourney(browser,width,output))
 await writeFile(path.join(output,'result.json'),JSON.stringify({journeys,states:results,acceptanceKeys:{committed:lostKey,notCommitted:uncommittedKey},externalProviders:'network-edge doubles; actual adapters and credential/execution paths'},null,2))
}catch(error){await captureRepairFailure(browser,output,error,'acceptance');await writeFile(path.join(output,'failure-command-observations.json'),JSON.stringify(observations,null,2));throw error}finally{await browser.close();await h.close()}
