import {recordsBrowserWidths} from './records-browser-widths.mjs'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {freePort} from './free-port.mjs'
import {browserCall,liveCommand,liveFixture} from './records-live-fixture.mjs'

/** VIEW-015: editor and bulk actions share a session stack across record and view navigation. */
export async function historyBrowserJourney(){
 const output='.private/record-history';await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await recordsBrowserRuntime(await freePort());browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  for(const width of recordsBrowserWidths()){
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   let peerContext
   try{
    page.setDefaultTimeout(15000)
    await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}]);await page.goto(h.origin+'/app/records')
    const f=await liveFixture(page,h,width),schema=await browserCall(page,`/api/v1/apps/${f.appId}/entities/${f.entityId}`)
    const second=(await browserCall(page,'/api/v1/commands/record.create',liveCommand({appId:f.appId,entityId:f.entityId,values:{[f.title.id]:'PO-1043',[f.notes.id]:'Check labels',[f.due.id]:'2026-11-02'}},[{ref:{appId:f.appId,entityId:'00000000000000000000000001',recordId:f.entityId},version:schema.version}]))).value
    const query=async()=> (await browserCall(page,`/api/v1/apps/${f.appId}/entities/${f.entityId}/query`,{})).items
    const note=async id=>(await query()).find(row=>row.id===id).fields[f.notes.id].value
    const toolbar=()=>page.getByRole('group',{name:'Record editing',exact:true})
    await page.goto(f.path);await page.getByRole('link',{name:'PO-1042',exact:true}).click();await page.getByRole('button',{name:'Edit record',exact:true}).click()
    await page.getByLabel('Notes',{exact:true}).fill('Owner confirmed carrier');await j.capture('history-record-editor')
    await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch')
    await page.getByRole('button',{name:'Edit record',exact:true}).waitFor();await toolbar().getByRole('button',{name:'Undo',exact:true}).waitFor();await page.reload();await toolbar().getByRole('button',{name:'Undo',exact:true}).waitFor();await page.getByRole('link',{name:'← Back to records',exact:true}).focus()
    let response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/commands/record.patch'));await page.keyboard.press(`${process.platform==='darwin'?'Meta':'Control'}+z`);assert.equal((await response).status(),200)
    assert.equal(await note(f.row.id),'Awaiting carrier');await j.capture('history-detail-undo')
    await j.command(toolbar().getByRole('button',{name:'Redo',exact:true}),'record.patch');assert.equal(await note(f.row.id),'Owner confirmed carrier')
    await page.getByRole('link',{name:'← Back to records',exact:true}).click()
    for(const title of ['PO-1042','PO-1043'])await page.getByRole('checkbox',{name:`Select ${title}`,exact:true}).check()
    await page.getByRole('button',{name:'Edit 2 selected',exact:true}).click()
    const bulk=page.locator('section.cr-card').filter({has:page.getByRole('heading',{name:'Change 2 selected records',exact:true})})
    await bulk.getByLabel('Field to change',{exact:true}).selectOption(f.notes.id);await bulk.getByLabel('Notes',{exact:true}).fill('Warehouse handoff complete')
    await j.command(bulk.getByRole('button',{name:'Preview changes',exact:true}),'record.bulk-preview');await j.capture('history-bulk-preview')
    await j.command(bulk.getByRole('button',{name:'Confirm 2 changes',exact:true}),'record.bulk-commit');await bulk.getByRole('button',{name:'Close',exact:true}).click()
    await j.command(page.locator('.cr-grid-actions').getByRole('button',{name:'Undo',exact:true}),'record.patch')
    assert.equal(await note(f.row.id),'Owner confirmed carrier');assert.equal(await note(second.id),'Check labels');await j.capture('history-bulk-undo')
    const saved=page.getByRole('navigation',{name:'Saved views',exact:true})
    await saved.getByRole('button',{name:'Dispatch calendar',exact:true}).click();await j.command(toolbar().getByRole('button',{name:'Redo',exact:true}),'record.patch')
    assert.equal(await note(f.row.id),'Warehouse handoff complete');assert.equal(await note(second.id),'Warehouse handoff complete');await j.capture('history-calendar-redo')
    peerContext=await browser.newContext({viewport:{width,height:900}});await peerContext.addCookies([{name:f.peerCookie.split('=')[0],value:f.peerCookie.slice(f.peerCookie.indexOf('=')+1),url:h.origin}]);const peer=await peerContext.newPage();await peer.goto(f.path)
    async function peerEdit(changes){const row=(await browserCall(peer,`/api/v1/apps/${f.appId}/entities/${f.entityId}/records/${f.row.id}`)).record;await browserCall(peer,'/api/v1/commands/record.patch',liveCommand({ref:row.ref,changes},[{ref:row.ref,version:row.version}]))}
    await peerEdit({[f.due.id]:'2026-11-03'})
    await saved.getByRole('button',{name:'Dispatch cards',exact:true}).click();await j.command(toolbar().getByRole('button',{name:'Undo',exact:true}),'record.patch')
    assert.equal(await note(f.row.id),'Owner confirmed carrier');assert.equal((await query()).find(row=>row.id===f.row.id).fields[f.due.id].value,'2026-11-03');await j.capture('history-unrelated-edit-preserved')
    await peerEdit({[f.notes.id]:'Avery booking update'})
    response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/commands/record.patch'));await toolbar().getByRole('button',{name:'Redo',exact:true}).click();const refused=await response;assert.equal(refused.status(),409);const failure=(await refused.json()).error
    assert.equal(failure.issues.length,1);assert.equal(failure.issues[0].fieldId,f.notes.id);assert.equal(await note(second.id),'Check labels');await j.capture('history-cell-conflict')
    await peerEdit({[f.notes.id]:'Owner confirmed carrier'})
    response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/commands/record.patch'));await toolbar().getByRole('button',{name:'Redo',exact:true}).click();const changedBack=await response;assert.equal(changedBack.status(),409);assert.equal((await changedBack.json()).error.issues[0].fieldId,f.notes.id);assert.equal(await note(second.id),'Check labels');await page.getByRole('article').filter({has:page.getByRole('heading',{name:'PO-1042',exact:true})}).getByText('Owner confirmed carrier',{exact:true}).waitFor();await j.capture('history-changed-back-conflict')
    const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=? AND id<>?').bind(f.appId,f.policyId).first(),rules=JSON.parse(policy.rules_json)
    for(const rule of rules)if(rule.entityId===f.entityId)rule.writableFields=[]
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
    response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/commands/record.patch'));await toolbar().getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await response).status(),403);assert.equal(await note(f.row.id),'Owner confirmed carrier');await j.capture('history-authority-refused')
   }catch(error){await page.screenshot({path:`${output}/failure-${width}.png`,fullPage:true});throw error}finally{await peerContext?.close();await context.close()}
  }
 }finally{await browser?.close();await h?.close()}
}
