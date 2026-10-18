import assert from 'node:assert/strict'

const appId='00000000000000000000000700'
const revision=(entityId,row)=>[{ref:{appId,entityId,recordId:row.id},version:row.version}]

/** VIEW-006: current saves, retained stale forms, and sample review revisions at either viewport. */
export async function verifyConcurrencyScreens({h,page,command,capture,receipt}) {
 const width=page.viewportSize().width
 const read=async route=>{const response=await page.request.get(h.origin+route);assert.equal(response.status(),200,route);return response.json()}
 const settingsSection=()=>page.locator('section').filter({has:page.getByRole('heading',{name:'Launch readiness',exact:true})}).last()
 const submit=async(button,action)=>{
  const startedAt=Date.now()
  const pending=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/v1/commands/'+action))
  await button.click();const response=await pending
  assert.equal(await response.finished(),null,'The command response finishes normally')
  const finishedAt=Date.now()
  return {status:response.status(),body:await response.json(),input:response.request().postDataJSON(),url:response.url(),startedAt,finishedAt}
 }
 const verifyConflictConsole=refusal=>{
  assert.equal(refusal.status,409)
  assert.ok(Number.isInteger(refusal.body.error.currentVersion))
  const window={start:refusal.startedAt,end:Math.min(Date.now(),refusal.finishedAt+1000)}
  const matches=receipt.consoleErrors.filter(event=>event.width===width&&event.location.url===refusal.url&&event.message==='Failed to load resource: the server responded with a status of 409 (Conflict)'&&event.time>=window.start&&event.time<=window.end)
  assert.equal(matches.length,1,'Exactly one browser resource error belongs to this verified stale-version refusal')
  receipt.expectedConflictConsoleErrors.push({eventId:matches[0].id,width,reason:'Verified stale-version refusal',request:{url:refusal.url,method:'POST',body:refusal.input},response:{status:refusal.status,body:refusal.body},window})
 }
 await page.goto(h.origin+'/app/settings')
 await page.getByRole('heading',{name:'Launch readiness',exact:true}).waitFor()
 const current=(await read('/api/v1/settings')).data
 await settingsSection().getByLabel('Days before launch',{exact:true}).fill(String((current.readinessLeadDays+1)%366))
 const saved=await submit(settingsSection().getByRole('button',{name:'Save readiness schedule',exact:true}),'settings.update')
 assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.data.state,'committed')
 assert.equal(saved.input.input.changes.readinessVersion,current.readinessVersion)
 await capture('clause-concurrency-readiness-saved')

 // Another current writer changes just the automation, leaving settings.version unchanged.
 await page.reload();await page.getByRole('heading',{name:'Launch readiness',exact:true}).waitFor()
 await settingsSection().getByLabel('Days before launch',{exact:true}).waitFor()
 const readiness=await h.db.prepare("SELECT id,version FROM automations WHERE shipped_key='launch-readiness'").first()
 await command('automation.disable',{id:readiness.id},revision('00000000000000000000000707',readiness))
 const refused=await submit(settingsSection().getByRole('button',{name:'Save readiness schedule',exact:true}),'settings.update')
 assert.equal(refused.status,409,JSON.stringify(refused.body));assert.equal(refused.body.error.currentVersion,readiness.version+1)
 await settingsSection().getByText(`Readiness automation has current version ${readiness.version+1}`,{exact:true}).waitFor()
 verifyConflictConsole(refused)
 await capture('clause-concurrency-readiness-stale')

 const panel=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Sample data$/})})
 await panel.locator('summary').click()
 const installations=()=>panel.locator('.launch-settings-item').filter({hasText:'Sample data ·'})
 const installed=await submit(panel.getByRole('button',{name:'Install sample data',exact:true}),'launch.samples.install')
 assert.equal(installed.status,200,JSON.stringify(installed.body))
 await panel.getByText(/Installed \d+ sample records/).waitFor()
 const reviews=(await read('/api/v1/launch/samples')).data.items
 await page.waitForFunction(expected=>document.querySelectorAll('details .launch-settings-item').length>=expected,reviews.length)
 const reviewed=reviews.find(item=>item.id===installed.body.data.value.installationId)
 const campaign=reviewed.revisions.find(item=>item.ref.entityId==='00000000000000000000000701')
 await command('campaign.patch',{id:campaign.ref.recordId,changes:{statusSummary:'Edited after removal review'}},[campaign])
 const stale=await submit(installations().first().getByRole('button',{name:'Remove sample data',exact:true}),'launch.samples.remove')
 assert.equal(stale.status,409,JSON.stringify(stale.body));assert.equal(stale.body.error.currentVersion,campaign.version+1)
 assert.deepEqual(stale.input.expected,reviewed.revisions)
 await installations().first().getByText(`campaign has current version ${campaign.version+1}`,{exact:true}).waitFor()
 verifyConflictConsole(stale)
 await capture('clause-concurrency-samples-stale')

 const clean=await submit(panel.getByRole('button',{name:'Install sample data',exact:true}),'launch.samples.install')
 assert.equal(clean.status,200,JSON.stringify(clean.body))
 await panel.getByText(/Installed \d+ sample records/).waitFor()
 // Wait for the refreshed list to contain the new installation before selecting its first row.
 const count=(await read('/api/v1/launch/samples')).data.items.length
 await page.waitForFunction(expected=>document.querySelectorAll('details .launch-settings-item').length>=expected,count)
 const removed=await submit(installations().first().getByRole('button',{name:'Remove sample data',exact:true}),'launch.samples.remove')
 assert.equal(removed.status,200,JSON.stringify(removed.body));assert.equal(removed.body.data.state,'committed')
 assert.ok(removed.input.expected.length>0)
 await page.waitForFunction(expected=>document.querySelectorAll('details .launch-settings-item').length===expected,count-1)
 await capture('clause-concurrency-samples-removed')
}
