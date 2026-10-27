import {closeTablePanel,displayAction,sortAndGroup} from './records-table-tools.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'
import {browserCall,liveCommand,liveFixture} from './records-live-fixture.mjs'

export async function liveBrowserJourney(page,j,h,browser,width,output){
 await page.goto(h.origin+'/app/records')
 const f=await liveFixture(page,h,width),context=await browser.newContext({viewport:{width,height:900}}),peer=await context.newPage()
 peer.setDefaultTimeout(8000)
 await context.addCookies([{name:f.peerCookie.split('=')[0],value:f.peerCookie.slice(f.peerCookie.indexOf('=')+1),url:h.origin}])
 const cell=(p,field)=>p.locator(`td[data-record-id="${f.row.id}"][data-field-id="${field.id}"]`)
 const response=p=>p.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/commands/record.patch'))
 async function edit(p,value,status=200){
  await cell(p,f.notes).dblclick();await p.getByLabel('Edit Notes',{exact:true}).fill(value)
  const done=response(p);await p.getByRole('button',{name:'Save cell',exact:true}).click();assert.equal((await done).status(),status)
 }
 async function patch(changes){
  const detail=await browserCall(peer,`/api/v1/apps/${f.appId}/entities/${f.entityId}/records/${f.row.id}`)
  return browserCall(peer,'/api/v1/commands/record.patch',liveCommand({ref:f.row.ref,changes},[{ref:f.row.ref,version:detail.record.version}]))
 }
 try{
  await page.goto(f.path);await peer.goto(f.path)
  await page.getByLabel(`Viewing: ${f.peerName}`,{exact:true}).waitFor()
  await peer.getByLabel('Viewing: Records Owner',{exact:true}).waitFor()
  await edit(peer,'Carrier booked')
  await cell(page,f.notes).getByText('Carrier booked',{exact:true}).waitFor({timeout:2000})
  await peer.getByRole('button',{name:'New record',exact:true}).click()
  await peer.getByLabel('Order',{exact:true}).fill('PO-1043');await peer.getByLabel('Notes',{exact:true}).fill('Pickup at 4 PM')
  const created=peer.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/commands/record.create'))
  await peer.getByRole('button',{name:'Save record',exact:true}).click();assert.equal((await created).status(),200)
  await page.getByRole('link',{name:'PO-1043',exact:true}).waitFor({timeout:2000})
  await j.capture('live-presence',{viewport:true})
  await page.getByRole('link',{name:'PO-1043',exact:true}).scrollIntoViewIfNeeded()
  await j.capture('live-new-record',{viewport:true})

  await sortAndGroup(page);await page.getByLabel('Sort',{exact:true}).selectOption(f.title.id);await closeTablePanel(page,'Sort and group')
  await cell(page,f.notes).dblclick();await page.getByLabel('Edit Notes',{exact:true}).fill('Owner draft: call carrier')
  await patch({[f.notes.id]:'Gate moved to Bay 4',[f.title.id]:'ZZ-1042'})
  await page.getByRole('link',{name:'ZZ-1042',exact:true}).waitFor({timeout:2000})
  assert.equal(await page.getByLabel('Edit Notes',{exact:true}).inputValue(),'Owner draft: call carrier')
  const refused=response(page);await page.getByRole('button',{name:'Save cell',exact:true}).click();assert.equal((await refused).status(),409)
  await page.getByRole('alert').filter({hasText:/Notes:.*current value is.*Gate moved to Bay 4/}).waitFor()
  assert.equal(await page.getByLabel('Edit Notes',{exact:true}).inputValue(),'Owner draft: call carrier')
  const unchanged=await browserCall(peer,`/api/v1/apps/${f.appId}/entities/${f.entityId}/records/${f.row.id}`)
  assert.equal(unchanged.record.fields[f.notes.id].value,'Gate moved to Bay 4')
  await j.capture('live-conflict')
  await page.getByRole('button',{name:'Cancel',exact:true}).click()
  assert.equal(await page.getByRole('alert').count(),0)

  for(const view of f.views){
   for(const p of [page,peer])await displayAction(p,view.name)
   await page.getByLabel(`Viewing: ${f.peerName}`,{exact:true}).waitFor()
   await patch({[f.notes.id]:`Carrier confirmed · ${view.display}`})
   await page.locator('.cr-saved-view-result').getByText(`Carrier confirmed · ${view.display}`,{exact:true}).waitFor({timeout:2000})
   await page.locator('.cr-saved-view-result').getByText(`Carrier confirmed · ${view.display}`,{exact:true}).scrollIntoViewIfNeeded()
   await j.capture(`live-${view.display}`,{viewport:true})
  }
  for(const p of [page,peer])await p.getByRole('link',{name:'ZZ-1042',exact:true}).click()
  await page.getByRole('heading',{name:'ZZ-1042',exact:true}).waitFor()
  await peer.getByRole('button',{name:'Edit record',exact:true}).click()
  await peer.getByLabel('Notes',{exact:true}).fill('Carrier arrived at Bay 4')
  const detailSaved=response(peer);await peer.getByRole('button',{name:'Save record',exact:true}).click();assert.equal((await detailSaved).status(),200)
  await page.getByText('Carrier arrived at Bay 4',{exact:true}).waitFor({timeout:2000})
  await j.capture('live-record-detail',{viewport:true})
  for(const p of [page,peer]){await p.goto(f.path);await displayAction(p,'Dispatch agenda')}
  await page.getByLabel(`Viewing: ${f.peerName}`,{exact:true}).waitFor()
  await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=? AND app_id=?").bind(f.peer,f.appId).run()
  await page.getByLabel(`Viewing: ${f.peerName}`,{exact:true}).waitFor({state:'hidden',timeout:2000})
  await peer.locator('.cr-state').waitFor({timeout:2000})
  assert.equal(await peer.getByText('Carrier arrived at Bay 4',{exact:true}).count(),0,'Revoked viewers retain no record values')
  await peer.screenshot({path:path.join(output,`live-revoked-${width}.png`),fullPage:false})
  return {appId:f.appId,recordId:f.row.id,liveDisplays:f.views.map(view=>view.display)}
 }finally{await context.close()}
}
