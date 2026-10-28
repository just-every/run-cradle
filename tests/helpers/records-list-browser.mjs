import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsBrowserWidths} from './records-browser-widths.mjs'
import {displayAction} from './records-table-tools.mjs'
import {listFixture,listPolicy,listHttp} from './records-list-fixture.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function listBrowserJourney(){
 const output=path.resolve('.private/records-list');await mkdir(output,{recursive:true})
 let h,browser,capturedCreate,f
 try{
  h=await recordsBrowserRuntime(0);console.log('List journey: native runtime ready');const call=listHttp(h)
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  for(const width of recordsBrowserWidths()){
   f=await listFixture(call);await listPolicy(h,f);console.log(`List journey ${width}: five linked tables and saved views ready`)
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage()
   await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
   const row=(id,level)=>page.locator(`[data-list-record-id="${id}"][data-list-level="${level}"]`)
   async function snap(name){
    await page.evaluate(()=>scrollTo(0,0))
    if(name==='parent-link-hierarchy')await page.locator('.cr-list-scroll').evaluateAll(elements=>elements.forEach(element=>{element.scrollLeft=0}))
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'The list screen stays within the viewport')
    const small=await page.locator('.cr-record-list, .cr-list-settings').evaluateAll(roots=>roots.flatMap(root=>[...root.querySelectorAll('*')].filter(el=>el.getClientRects().length&&[...el.childNodes].some(node=>node.nodeType===3&&node.textContent.trim())&&parseFloat(getComputedStyle(el).fontSize)<13).map(el=>el.tagName+': '+getComputedStyle(el).fontSize)))
    assert.deepEqual(small,[],'List controls and values remain readable')
    await page.screenshot({path:path.join(output,`${width}-${name}.png`),fullPage:true})}
   async function command(action,name='record.patch',status=200){const pending=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/commands/'+name));await action();const response=await pending;if(name==='record.create'&&status===200)capturedCreate=response.request().postDataJSON();assert.equal(response.status(),status,await response.text());return (await response.json()).data}
   const read=async(id,index=1)=>(await call(`/api/v1/apps/${f.appId}/entities/${f.tables[index].id}/records/${id}`)).record
   try{
    await page.goto(`${h.origin}/app/records/${f.appId}/${f.tables[0].id}`);await displayAction(page,f.view.name)
    await row(f.project.id,0).waitFor()
    const expand= row(f.project.id,0).getByRole('button',{name:'Expand Harbour renewal',exact:true})
    await page.keyboard.press('Tab');await expand.focus();await page.getByRole('tooltip',{name:'Expand Harbour renewal',exact:true}).waitFor();await page.keyboard.press('Escape')
    await expand.click()
    await row(f.taskA.id,1).waitFor();await row(f.taskB.id,1).waitFor()
    assert.equal(await page.locator('[data-list-level="1"]').count(),2)
    assert.equal(await row(f.project.id,0).getByLabel('2 matching children',{exact:true}).innerText(),'2')
    assert.equal(await page.locator(`[data-list-record-id="${f.hidden.id}"]`).count(),0)
    assert.equal(await page.locator(`[data-list-record-id="${f.filtered.id}"]`).count(),0)
    const tasks=await page.locator('[data-list-level="1"]').allTextContents();assert.match(tasks[0],/Alpha task/);assert.match(tasks[1],/Beta task/)
    assert.equal(await row(f.taskA.id,1).getByText('Priority',{exact:true}).count(),0)
    for(const [record,level,label]of [[f.taskA,1,'Alpha task'],[f.sub,2,'Site survey'],[f.step,3,'Inspect foundations']])await row(record.id,level).getByRole('button',{name:`Expand ${label}`,exact:true}).click()
    await row(f.check.id,4).waitFor();assert.match(await row(f.check.id,4).innerText(),/Confirm dimensions/)
    await snap('five-level-outline');console.log(`List journey ${width}: five-level outline and policy counts passed`)
    await page.reload();await displayAction(page,f.view.name);await row(f.check.id,4).waitFor()
    await row(f.taskA.id,1).getByRole('button',{name:'Collapse Alpha task',exact:true}).click()
    await page.reload();await displayAction(page,f.view.name);await row(f.taskA.id,1).waitFor()
    assert.equal(await page.locator(`[data-list-record-id="${f.check.id}"]`).count(),0,'Collapsed branches remain collapsed after reload')
    await row(f.taskA.id,1).getByRole('button',{name:'Expand Alpha task',exact:true}).click();await row(f.check.id,4).waitFor()
    const task=row(f.taskA.id,1)
    await task.getByRole('button',{name:'Edit Notes',exact:true}).click()
    await task.getByLabel('Notes',{exact:true}).fill(`Survey confirmed ${width}`)
    await snap('inline-edit')
    await command(()=>task.getByRole('button',{name:'Save cell',exact:true}).click())
    assert.equal((await read(f.taskA.id)).fields[f.tables[1].note.id].value,`Survey confirmed ${width}`)
    await row(f.project.id,0).getByRole('button',{name:'Add child',exact:true}).click()
    const form=page.locator('form').filter({has:page.getByRole('heading',{name:'New child in Tasks',exact:true})})
    await form.getByLabel('Title',{exact:true}).fill(`New survey ${width}`)
    await snap('new-linked-child')
    const created=await command(()=>form.getByRole('button',{name:'Save child',exact:true}).click(),'record.create')
    const child=created.value;assert.deepEqual(child.fields[f.tables[1].parent.id].value,f.project.ref)
    assert.equal((await read(child.id)).fields[f.tables[1].title.id].value,`New survey ${width}`)
    await snap('edited-and-created')
    // A saved definition is edited through its ordinary Settings form and reloaded.
    await page.getByRole('button',{name:'Edit view',exact:true}).click()
    await page.getByText('List settings',{exact:true}).click()
    const level2=page.getByRole('group',{name:'Level 2',exact:true})
    await level2.getByText('Visible fields · 2',{exact:true}).click()
    await level2.getByLabel('Notes',{exact:true}).uncheck()
    await snap('per-level-settings')
    await command(()=>page.locator('form').filter({has:page.getByRole('heading',{name:'Edit this view',exact:true})}).getByRole('button',{name:'Save view',exact:true}).click(),'view.save')
    await displayAction(page,f.view.name);await row(f.taskA.id,1).waitFor()
    assert.equal(await row(f.taskA.id,1).getByRole('button',{name:'Edit Notes',exact:true}).count(),0)
    // Restore the level definition for the other width.
    const liveViews=await call(`/api/v1/apps/${f.appId}/views`),live=liveViews.items.find(view=>view.id===f.view.id)
    const {id:ignoredId,version:ignoredVersion,createdAt:ignoredCreatedAt,updatedAt:ignoredUpdatedAt,...definition}=live
    await call('/api/v1/commands/view.save',{commandId:createUlid(),expected:[{ref:{appId:f.appId,entityId:'00000000000000000000000002',recordId:live.id},version:live.version}],input:{id:live.id,view:{...definition,listLevels:f.view.listLevels}}})
    await page.goto(`${h.origin}/app/records/${f.appId}/${f.tables[1].id}`);await displayAction(page,f.selfView.name)
    await row(f.taskA.id,0).waitFor();await row(f.taskB.id,0).waitFor()
    await command(()=>row(f.taskB.id,0).getByRole('button',{name:'Indent Beta task',exact:true}).click())
    assert.deepEqual((await read(f.taskB.id)).fields[f.tables[1].self.id].value,f.taskA.ref)
    await row(f.taskB.id,1).waitFor()
    await command(()=>row(f.taskB.id,1).getByRole('button',{name:'Outdent Beta task',exact:true}).click())
    assert.equal((await read(f.taskB.id)).fields[f.tables[1].self.id].value,null)
    if(width===1440){
     await row(f.taskB.id,0).waitFor();await command(()=>row(f.taskB.id,0).dragTo(row(f.taskA.id,0)))
     assert.deepEqual((await read(f.taskB.id)).fields[f.tables[1].self.id].value,f.taskA.ref)
     await row(f.taskB.id,1).waitFor();await command(()=>row(f.taskB.id,1).getByRole('button',{name:'Outdent Beta task',exact:true}).click())
    }
    await row(f.taskB.id,0).waitFor()
    await snap('parent-link-hierarchy');console.log(`List journey ${width}: edits, child creation, settings and parent moves passed`)
   }catch(error){await page.screenshot({path:path.join(output,`${width}-failure.png`),fullPage:true});throw error}finally{await context.close()}
  }
  // Captured commands and query reads recheck current policy, without changing the data.
  await listPolicy(h,f,{readOnly:true,hideField:true})
  const task=(await call(`/api/v1/apps/${f.appId}/entities/${f.tables[1].id}/records/${f.taskA.id}`)).record
  const move={commandId:createUlid(),expected:[{ref:task.ref,version:task.version}],input:{ref:task.ref,changes:{[f.tables[1].self.id]:f.taskB.ref}}}
  await call('/api/v1/commands/record.patch',move,403)
  await call('/api/v1/commands/record.create',capturedCreate,403)
  assert.equal((await call(`/api/v1/apps/${f.appId}/entities/${f.tables[1].id}/records/${f.taskA.id}`)).record.fields[f.tables[1].self.id].value,null)
  for(const width of recordsBrowserWidths()){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage()
  try{
   await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}]);await page.goto(`${h.origin}/app/records/${f.appId}/${f.tables[0].id}`);await displayAction(page,f.view.name)
   const project=page.locator(`[data-list-record-id="${f.project.id}"][data-list-level="0"]`)
   await project.getByRole('button',{name:'Expand Harbour renewal',exact:true}).click()
   const readonly=page.locator(`[data-list-record-id="${f.taskA.id}"][data-list-level="1"]`);await readonly.waitFor()
   assert.equal(await readonly.getByRole('button',{name:/^Edit /}).count(),0);assert.equal(await readonly.getAttribute('draggable'),'false')
   assert.doesNotMatch(await readonly.innerText(),/Survey confirmed/)
   assert.doesNotMatch(await page.locator('.cr-record-list').innerText(),/Confidential task/)
   await page.screenshot({path:path.join(output,`${width}-policy-restricted.png`),fullPage:true})
  }finally{await context.close()}
  }
  const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
  await h.db.prepare('UPDATE authority_sessions SET revoked_at=?').bind(Date.now()).run()
  assert.equal((await fetch(h.origin+`/api/v1/views/${f.view.id}`,{headers:{cookie:h.cookie}})).status,401)
  assert.equal((await fetch(h.origin+'/api/v1/commands/record.create',{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(capturedCreate)})).status,401)
  console.log(`List outline journey passed: five levels, settings, inline edit, atomic child, parent moves, remembered expansion and policy at ${recordsBrowserWidths().join(' and ')}`)
 }finally{await browser?.close();await h?.close()}
}

if (process.argv[1] === import.meta.filename) await listBrowserJourney()
