import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {recordsBrowserWidths} from './records-browser-widths.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {baseAction} from './records-base-menu.mjs'
import {tableAction,sortAndGroup} from './records-table-tools.mjs'
import {vendorPickerFixture,assertPickerPage,pickerCommand} from './records-picker-fixture.mjs'

/** Native emailed owner admission, emitted Worker and actual builder, editor
 * and authenticated-form controls. No application response is substituted. */
export async function pickerBrowserJourney(){
 const output=path.resolve(process.env.CRADLE_PICKER_OUTPUT??'.private/records-picker');await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await userAutomationRuntime(0)
  const call=async(route,body,status=200)=>(await h.request(route,{method:body===undefined?'GET':'POST',body,status})).data
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',...(process.platform==='linux'?['--no-sandbox']:[])],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of recordsBrowserWidths()){
   const f=await vendorPickerFixture({db:h.db,call,descriptors:h.descriptors},`synthetic-cradle-purchasing-${width}`)
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width),receipts=[]
   const table=entity=>`${h.origin}/app/records/${f.appId}/${entity}`,picker=page.locator('.cr-relationship-picker')
   page.setDefaultTimeout(20000)
   const response=()=>{const pending=page.waitForResponse(value=>value.request().method()==='POST'&&value.url().endsWith('/records/link-candidates'));void pending.catch(()=>{});return pending}
   async function loaded(pending,status=200,options={}){
    const received=await pending,body=await received.json();assert.equal(received.status(),status,JSON.stringify(body))
    if(status!==200){await picker.getByRole('alert').waitFor();assert.equal(await picker.getByRole('radio').count(),0,'A stale page shows no retained candidates');return body.error}
    const result=body.data;assertPickerPage(result,f,options)
    const names=result.records.items.map(row=>row.fields[f.name.id].value)
    if(names.length)await picker.getByRole('radio',{name:names[0],exact:true}).waitFor();else await picker.getByText('No matching permitted linked records.',{exact:true}).waitFor()
    assert.deepEqual(await picker.getByRole('radio').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label'))),names,'Every returned choice is actually rendered')
    assert.doesNotMatch(await picker.innerText(),/synthetic-cradle-private-context|Private context/)
    return result
   }
   async function enumerate(first,surface){
    const names=[];let result=first,pages=0
    for(;;){
     assert.equal(result.records.total.value,f.expected.length,'Candidate totals exclude inactive and row-hidden vendors')
     names.push(...await picker.getByRole('radio').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label'))));pages++
     assert.ok(pages<=101,'The browser reaches the final bounded page')
     if(!result.records.nextCursor)break
     const pending=response();await picker.getByRole('button',{name:'Next records',exact:true}).click();result=await loaded(pending)
    }
    assert.deepEqual(names,f.expected.map(row=>row.name),surface+': all permitted active vendors appear exactly once')
    receipts.push({surface,fixture:5000,pages,candidates:names.length});console.log('FIELD_005_BROWSER_PAGES '+JSON.stringify({width,...receipts.at(-1)}))
   }
   async function search(value,options={}){
    const pending=page.waitForResponse(result=>result.request().method()==='POST'&&result.url().endsWith('/records/link-candidates')&&result.request().postDataJSON()?.search===value)
    void pending.catch(()=>{});await picker.getByRole('searchbox').fill(value)
    return loaded(pending,200,options)
   }
   async function begin(control){const pending=response();await control.click();return loaded(pending)}
   async function firstPage(){return begin(picker.getByRole('button',{name:'First page',exact:true}))}
   async function selectDistant(){const found=await search('Distant city');assert.deepEqual(found.records.items.map(row=>row.id),[f.rows[4997].id]);await picker.getByRole('radio',{name:f.rows[4997].name,exact:true}).check()}
   async function persisted(row){
    const read=await call(`/api/v1/apps/${f.appId}/entities/${f.orders}/records/${row.id}`)
    assert.deepEqual(read.record.fields[f.link.id].value,{appId:f.appId,entityId:f.vendors,recordId:f.rows[4997].id},'The selected distant vendor is persisted through the ordinary write door')
   }
   try{
    await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
    // Author settings before population; this proves picker scale, rather than
    // the separate populated-schema release snapshot capacity.
    await page.goto(table(f.vendors));await page.getByRole('button',{name:'Filter',exact:true}).click();await page.getByRole('button',{name:'Add condition',exact:true}).click()
    const filter=page.locator('.cr-filter-group');await filter.getByLabel('Field',{exact:true}).selectOption(f.active.id);await filter.getByRole('checkbox',{name:'Active',exact:true}).check();await page.getByRole('button',{name:'Apply filters',exact:true}).click()
    await sortAndGroup(page);await page.getByLabel('Sort',{exact:true}).selectOption(f.name.id);await page.getByLabel('Direction',{exact:true}).selectOption('asc')
    await tableAction(page,'Visible columns');const visible=page.getByRole('group',{name:'Visible columns',exact:true})
    for(const label of ['City','Active','Private context'])await visible.getByRole('checkbox',{name:label,exact:true}).uncheck()
    await tableAction(page,'Save view');const viewEditor=page.locator('form').filter({has:page.getByRole('heading',{name:'Save this work view',exact:true})})
    await viewEditor.getByLabel('Name',{exact:true}).fill('Active vendors');await viewEditor.getByLabel('Who can use this view',{exact:true}).selectOption('app')
    const view=await j.command(viewEditor.getByRole('button',{name:'Save view',exact:true}),'view.save');f.setView(view)
    assert.equal(view.visibility,'app');assert.deepEqual(view.fields,[f.name.id]);assert.deepEqual(view.sort,[{fieldId:f.name.id,direction:'asc'}])
    await j.capture('picker-active-view')
    await page.goto(table(f.orders));await baseAction(page,'Edit fields');await page.getByRole('navigation',{name:'Schema tables',exact:true}).getByRole('button',{name:'Orders',exact:true}).click()
    const tile=page.getByRole('group',{name:'Vendor link',exact:true});await tile.locator('summary').filter({hasText:'Linked-record picker settings'}).click();await tile.getByRole('checkbox',{name:'Customize linked-record picker',exact:true}).check()
    for(const label of ['City','Private context'])await tile.getByRole('group',{name:'Search fields',exact:true}).getByRole('checkbox',{name:label,exact:true}).check()
    await tile.getByLabel('Limit to shared view',{exact:true}).selectOption(view.id);await j.capture('picker-builder-settings')
    await j.adopt();await f.populate();await f.restrict()
    const orderSchema=await call(`/api/v1/apps/${f.appId}/entities/${f.orders}`)
    const form=(await call('/api/v1/commands/form.save',pickerCommand({form:{appId:f.appId,entityId:f.orders,title:'Vendor order',fields:[f.order,f.link].map(field=>({fieldId:field.id,label:field.label,help:'',required:false})),submitAction:'record.create',authenticated:true}},[{ref:{appId:f.appId,entityId:f.schemaEntity,recordId:f.orders},version:orderSchema.version}]))).value
    await page.goto(table(f.orders));await enumerate(await begin(page.getByRole('button',{name:'New record',exact:true})),'grid creation')
    await selectDistant();await j.capture('picker-grid-city-choice');await page.getByLabel('Order',{exact:true}).fill(`synthetic-cradle-order-${width}`)
    const created=await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.create');await persisted(created)
    const unlinked=(await call('/api/v1/commands/record.create',pickerCommand({appId:f.appId,entityId:f.orders,values:{[f.order.id]:`synthetic-cradle-edit-control-${width}`}},[{ref:{appId:f.appId,entityId:f.schemaEntity,recordId:f.orders},version:orderSchema.version}]))).value
    assert.equal(unlinked.fields[f.link.id].value,null)
    await page.goto(table(f.orders)+'/'+unlinked.id);await enumerate(await begin(page.getByRole('button',{name:'Edit record',exact:true})),'record editing')
    await firstPage();await f.saveView({kind:'all',conditions:[f.definition.filter,{kind:'condition',fieldId:f.city.id,op:'eq',value:'Distant city'}]})
    const staleView=response();await picker.getByRole('button',{name:'Next records',exact:true}).click();assert.equal((await loaded(staleView,409)).code,'stale_cursor')
    const current=await begin(picker.getByRole('button',{name:'Refresh picker',exact:true}));assert.deepEqual(current.records.items.map(row=>row.id),[f.rows[4997].id])
    await picker.getByRole('radio',{name:f.rows[4997].name,exact:true}).check();await page.getByLabel('Order',{exact:true}).fill(`synthetic-cradle-edited-${width}`);await j.capture('picker-current-view')
    const edited=await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch');await persisted(edited);await f.saveView()
    const opened=response();await page.goto(`${h.origin}/app/forms/${form.id}`);await enumerate(await loaded(opened),'authenticated form')
    await firstPage();await f.restrict({hideCity:true,hideAnother:true})
    const stalePolicy=response();await picker.getByRole('button',{name:'Next records',exact:true}).click();assert.equal((await loaded(stalePolicy,409)).code,'stale_cursor')
    const narrowed=response();await picker.getByRole('button',{name:'Refresh picker',exact:true}).click();const narrowedPage=await loaded(narrowed,200,{hideCity:true})
    assert.ok(!narrowedPage.records.items.some(row=>row.id===f.rows[2].id))
    assert.equal((await search('Distant city',{hideCity:true})).records.items.length,0);await j.capture('picker-narrowed-form')
    await f.restrict()
    for(const value of ['Inactive city','Hidden city','synthetic-cradle-private-context'])assert.equal((await search(value)).records.items.length,0)
    await selectDistant();await page.getByLabel('Order',{exact:true}).fill(`synthetic-cradle-form-${width}`);await j.capture('picker-authenticated-form')
    const submitted=await j.command(page.getByRole('button',{name:'Submit',exact:true}),'form.submit');await persisted(submitted)
    assert.deepEqual(j.errors,[])
    await writeFile(path.join(output,`picker-${width}.json`),JSON.stringify({width,receipts,checkpoints:j.checkpoints},null,2))
    console.log('FIELD_005_BROWSER '+JSON.stringify({width,receipts,liveView:true,policyNarrowing:true}))
   }catch(error){await page.screenshot({path:path.join(output,`failure-${width}.png`),fullPage:true});await writeFile(path.join(output,`failure-${width}.html`),await page.content());throw error}finally{await context.close()}
  }
 }finally{await browser?.close();await h?.close()}
}
