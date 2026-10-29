import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium,expect} from '@playwright/test'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {recordsBrowserWidths} from './records-browser-widths.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {baseAction} from './records-base-menu.mjs'
import {tableAction,sortAndGroup} from './records-table-tools.mjs'
import {pickerScaleFixture,pickerCommand,enumeratePicker} from './records-picker-fixture.mjs'

/** Native emailed owner, built controls and 5,000 real persisted vendors. */
export async function pickerBrowserJourney(){
 const output=path.resolve(process.env.CRADLE_PICKER_OUTPUT??'.private/picker-browser');await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await userAutomationRuntime(0)
  const call=async(route,body,status=200)=>{const response=await h.request(route,{method:body===undefined?'GET':'POST',body,status});return status===200?response.data:response.error}
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic','--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of recordsBrowserWidths()){
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   page.setDefaultTimeout(20000)
   try{
    await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
    const f=await pickerScaleFixture(h,call,h.descriptors),url=`${h.origin}/app/records/${f.appId}/${f.ordersId}`
    await page.goto(`${h.origin}/app/records/${f.appId}/${f.vendorsId}`)
    await page.getByRole('button',{name:'Filter',exact:true}).click();await page.getByRole('button',{name:'Add condition',exact:true}).click()
    const filter=page.locator('.cr-filter-group')
    await filter.getByLabel('Field',{exact:true}).selectOption(f.active.id);await filter.getByLabel('Active',{exact:true}).check()
    await page.getByRole('button',{name:'Apply filters',exact:true}).click()
    await sortAndGroup(page);await page.getByLabel('Sort',{exact:true}).selectOption(f.name.id);await page.getByLabel('Direction',{exact:true}).selectOption('asc')
    await tableAction(page,'Visible columns');await page.getByRole('group',{name:'Visible columns',exact:true}).getByLabel('Private context',{exact:true}).uncheck()
    await tableAction(page,'Save view')
    const viewEditor=page.locator('form').filter({has:page.getByRole('heading',{name:'Save this work view',exact:true})})
    await viewEditor.getByLabel('Name',{exact:true}).fill('Active vendors');await viewEditor.getByLabel('Who can use this view',{exact:true}).selectOption('app')
    await j.capture('picker-shared-view-builder')
    let view=await j.command(viewEditor.getByRole('button',{name:'Save view',exact:true}),'view.save')
    assert.deepEqual(view.filter,{kind:'all',conditions:[f.viewDefinition.filter]})
    await page.goto(url);await baseAction(page,'Edit fields')
    await page.getByRole('navigation',{name:'Schema tables',exact:true}).getByRole('button',{name:'Orders',exact:true}).click()
    const link=page.getByRole('group',{name:'Vendor link',exact:true})
    await link.getByText('Linked-record picker settings',{exact:true}).click()
    await link.getByLabel('Customize linked-record picker',{exact:true}).check()
    await link.getByRole('group',{name:'Search fields',exact:true}).getByLabel('City',{exact:true}).check()
    await link.getByRole('group',{name:'Search fields',exact:true}).getByLabel('Private context',{exact:true}).check()
    await link.getByRole('group',{name:'Display and context fields',exact:true}).getByLabel('Private context',{exact:true}).check()
    await link.getByLabel('Limit to shared view',{exact:true}).selectOption(view.id)
    await j.capture('picker-city-search-builder')
    await page.getByRole('button',{name:'Preview schema changes',exact:true}).click()
    await page.getByRole('heading',{name:'Review schema changes',exact:true}).waitFor()
    await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    await j.command(page.getByRole('button',{name:'Adopt schema',exact:true}),'release.adopt')
    await page.getByRole('heading',{name:'Base ready',exact:true}).waitFor()
    const schema=await call(`/api/v1/apps/${f.appId}/entities/${f.ordersId}`),settings=schema.fields.find(field=>field.id===f.vendor.id).linkPicker
    assert.equal(settings.viewId,view.id);assert.ok(settings.searchFieldIds.includes(f.city.id))
    const form=(await call('/api/v1/commands/form.save',pickerCommand({form:{appId:f.appId,entityId:f.ordersId,title:'New purchasing order',fields:[f.order,f.vendor].map(field=>({fieldId:field.id,label:field.label,help:'',required:false})),submitAction:'record.create',authenticated:true}},[{ref:{appId:f.appId,entityId:'00000000000000000000000001',recordId:f.ordersId},version:schema.version}]))).value
    await f.seed();await f.policy()
    const inventory=await enumeratePicker(f)
    const picker=page.locator('.cr-relationship-picker'),search=picker.getByRole('searchbox'),radios=picker.getByRole('radio')
    async function pageNames(expected){
     await expect.poll(()=>radios.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')))).toEqual(expected.map(row=>row.name))
     assert.doesNotMatch(await picker.innerText(),/Private context/)
    }
    async function searchFor(value,expected){
     const pending=page.waitForResponse(response=>response.url().endsWith('/link-candidates')&&response.request().postDataJSON()?.search===value)
     await search.fill(value);const response=await pending;assert.equal(response.status(),200)
     if(expected.length)await pageNames(expected)
     else{await picker.getByText('No matching permitted linked records.',{exact:true}).waitFor();assert.equal(await radios.count(),0)}
    }
    await page.goto(url);await page.getByRole('button',{name:'New record',exact:true}).click()
    await page.getByLabel('Order',{exact:true}).fill('PO grid picker')
    await pageNames(f.expected.slice(0,50))
    await picker.getByRole('button',{name:'Next records',exact:true}).click();await pageNames(f.expected.slice(50,100))
    await searchFor(f.rows[0].name,[]);await searchFor(f.rows[11].name,[]);await searchFor('Private context',[])
    const distant=f.rows[4879]
    await searchFor('Distant city',[distant]);await radios.check();await j.capture('picker-grid-city-selection')
    const created=await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.create')
    const ref=row=>({appId:f.appId,entityId:f.vendorsId,recordId:row.id})
    assert.deepEqual(created.fields[f.vendor.id].value,ref(distant))
    const recordPath=`/api/v1/apps/${f.appId}/entities/${f.ordersId}/records/${created.id}`
    assert.deepEqual((await call(recordPath)).record.fields[f.vendor.id].value,ref(distant))
    await page.goto(`${url}/${created.id}`);await page.getByRole('button',{name:'Edit record',exact:true}).click()
    await pageNames(f.expected.slice(0,50))
    const replacement=f.rows[4999];await searchFor(replacement.name,[replacement]);await radios.check();await j.capture('picker-record-editor')
    await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch')
    assert.deepEqual((await call(recordPath)).record.fields[f.vendor.id].value,ref(replacement))
    await page.goto(`${h.origin}/app/forms/${form.id}`);await page.getByLabel('Order',{exact:true}).fill('PO authenticated form')
    await pageNames(f.expected.slice(0,50));await picker.getByRole('button',{name:'Next records',exact:true}).click();await pageNames(f.expected.slice(50,100))
    await searchFor(f.rows[11].name,[]);await searchFor(f.rows[0].name,[]);await searchFor('Private context',[])
    await searchFor('Distant city',[distant]);await radios.check();await j.capture('picker-authenticated-form')
    const submitted=await j.command(page.getByRole('button',{name:'Submit',exact:true}),'form.submit')
    assert.deepEqual(submitted.fields[f.vendor.id].value,ref(distant))
    assert.deepEqual((await call(`/api/v1/apps/${f.appId}/entities/${f.ordersId}/records/${submitted.id}`)).record.fields[f.vendor.id].value,ref(distant))
    await page.goto(`${url}/${created.id}`);await page.getByRole('button',{name:'Edit record',exact:true}).click();await pageNames(f.expected.slice(0,50))
    const {id,version,createdAt,updatedAt,...definition}=view
    view=(await call('/api/v1/commands/view.save',pickerCommand({id,view:{...definition,filter:{kind:'all',conditions:[definition.filter,{kind:'condition',fieldId:f.city.id,op:'eq',value:'City 17'}]}}},[{ref:{appId:f.appId,entityId:'00000000000000000000000002',recordId:id},version}]))).value
    async function staleThenRefresh(expected){
     const pending=page.waitForResponse(response=>response.url().endsWith('/link-candidates')&&!!response.request().postDataJSON()?.cursor)
     await picker.getByRole('button',{name:'Next records',exact:true}).click();assert.equal((await pending).status(),409)
     await picker.getByRole('alert').waitFor();assert.equal(await radios.count(),0,'No stale candidates remain visible')
     await picker.getByRole('button',{name:'Refresh picker',exact:true}).click();await pageNames(expected.slice(0,50))
    }
    const cityRows=f.expected.filter(row=>row.city==='City 17')
    await staleThenRefresh(cityRows);await j.capture('picker-current-view')
    const narrower=structuredClone(f.rules)
    narrower.find(rule=>rule.entityId===f.vendorsId).rows={kind:'all',conditions:[narrower.find(rule=>rule.entityId===f.vendorsId).rows,{kind:'condition',fieldId:f.name.id,op:'contains',value:'synthetic-cradle-04'}]}
    await f.policy(narrower);await staleThenRefresh(cityRows.filter(row=>row.name.startsWith('synthetic-cradle-04')));await j.capture('picker-current-policy')
    assert.deepEqual((await call(recordPath)).record.fields[f.vendor.id].value,null,'Current row policy hides the previously linked vendor')
    await writeFile(path.join(output,`picker-${width}.json`),JSON.stringify({width,fixture:5000,...inventory,created:created.id,submitted:submitted.id,checkpoints:j.checkpoints},null,2))
   }catch(error){await page.screenshot({path:path.join(output,`failure-${width}.png`),fullPage:true});await writeFile(path.join(output,`failure-${width}.html`),await page.content());throw error}
   finally{await context.close()}
  }
 }finally{await browser?.close();await h?.close()}
}
