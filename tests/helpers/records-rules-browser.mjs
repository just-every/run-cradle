import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {recordsBrowserWidths} from './records-browser-widths.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {baseAction} from './records-base-menu.mjs'
import {rulesCommand,storedRulesFixture,assertStoredRuleViolators} from './records-rules-fixture.mjs'

/** Author and adopt stored-field rules using the built builder and native session. */
export async function recordsRulesBrowser(outputDirectory=process.env.CRADLE_RULES_OUTPUT??'.private/records-rules'){
 const output=path.resolve(outputDirectory);await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await userAutomationRuntime(0)
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',...(process.platform==='linux'?['--no-sandbox']:[])],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  for(const width of recordsBrowserWidths()){
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   page.setDefaultTimeout(20000)
   try{
    await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
    const f=await storedRulesFixture(h,{violations:true,label:String(width)}),before=await f.snapshot()
    await page.goto(f.path);await baseAction(page,'Edit fields');await page.getByRole('heading',{name:'Edit base schema',exact:true}).waitFor()
    for(const [index,rule]of f.rules.entries()){
     await page.getByRole('button',{name:'Add table rule',exact:true}).click()
     const editor=page.getByRole('group',{name:'Rule '+(index+1),exact:true})
     await editor.getByLabel('Rule name',{exact:true}).fill(rule.name)
     await editor.getByLabel('When field',{exact:true}).selectOption(index===0?f.status.id:f.discount.id)
     await editor.getByLabel('When comparison',{exact:true}).selectOption(index===0?'eq':'gt')
     if(index===0)await editor.getByLabel('When value',{exact:true}).selectOption({label:'Shipped'})
     else await editor.getByLabel('When value',{exact:true}).fill('20')
     await editor.getByLabel('Require field',{exact:true}).selectOption(index===0?f.ship.id:f.approval.id)
     await editor.getByLabel('Require comparison',{exact:true}).selectOption(index===0?'not_empty':'eq')
     if(index===1)await editor.getByLabel('Require value',{exact:true}).check()
     await editor.getByLabel('Message when refused',{exact:true}).fill(rule.message)
    }
    await j.capture('rules-builder')
    async function preview(){
     const pending=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/schema-preview'))
     await page.getByRole('button',{name:'Preview schema changes',exact:true}).click()
     const response=await pending;assert.equal(response.status(),200,await response.text())
     return (await response.json()).data
    }
    const invalid=await preview();assertStoredRuleViolators(invalid,f)
    await page.getByText('Resolve 3 existing records before adopting these rules.',{exact:true}).waitFor()
    for(const [index,ids]of [[0,[f.seeds[0].id,f.seeds[2].id]],[1,[f.seeds[1].id,f.seeds[2].id]]]){
     const details=page.locator('details').filter({has:page.locator('summary').filter({hasText:f.rules[index].name+': 2 records'})})
     await details.locator('summary').click();await details.getByText(f.rules[index].message,{exact:true}).waitFor()
     assert.deepEqual((await details.locator('a').allTextContents()).sort(),ids.sort())
     for(const id of ids)assert.equal(await details.getByRole('link',{name:id,exact:true}).getAttribute('href'),`/app/records/${f.appId}/${f.entityId}/${id}`)
    }
    await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    assert.equal(await page.getByRole('button',{name:'Adopt schema',exact:true}).isDisabled(),true)
    await j.capture('rules-existing-violators')
    const refused=await h.request('/api/v1/commands/release.adopt',{method:'POST',status:400,body:rulesCommand({kind:'manual_schema',previewId:invalid.id})})
    assert.equal(refused.error.code,'validation');assert.match(refused.error.message,/Ship date|Manager approval/)
    assert.deepEqual(await f.snapshot(),before,'Even a direct adoption attempt preserves all live records and schema')
    // Correct the named existing records in an independent editor, retaining the builder.
    const repair=await context.newPage(),rj=recordsJourney(repair,h.origin,output,width)
    try{
     for(const [index,row]of f.seeds.entries()){
      await repair.goto(f.path+'/'+row.id);await repair.getByRole('button',{name:'Edit record',exact:true}).click()
      if(index!==1)await repair.getByLabel('Ship date',{exact:true}).fill('2027-04-01')
      if(index!==0)await repair.getByLabel('Manager approval',{exact:true}).check()
      await rj.command(repair.getByRole('button',{name:'Save record',exact:true}),'record.patch')
      const corrected=await f.read(row.id)
      if(index!==1)assert.equal(corrected.fields[f.ship.id].value,'2027-04-01')
      if(index!==0)assert.equal(corrected.fields[f.approval.id].value,true)
     }
     await rj.capture('rules-resolved-record')
    }finally{await repair.close()}
    await page.getByRole('button',{name:'Revise schema',exact:true}).click()
    const ready=await preview();assert.equal(ready.impacts[0].violatingRecordCount,0);assert.deepEqual(ready.impacts[0].validationViolations,[])
    await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    await j.capture('rules-ready-preview')
    await j.command(page.getByRole('button',{name:'Adopt schema',exact:true}),'release.adopt')
    const adopted=await f.schema()
    for(const expected of f.rules){const rule=adopted.validationRules.find(rule=>rule.name===expected.name);assert.ok(rule);assert.deepEqual({...rule,id:expected.id},expected)}
    await page.goto(f.path+'/'+f.control.id);await page.getByRole('button',{name:'Edit record',exact:true}).click()
    async function refusedControl(button,action,rule){
     const unchanged=await f.snapshot(),pending=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/'+action))
     await button.click();const response=await pending;assert.equal(response.status(),400)
     const wire=await response.json();assert.ok(wire.error.message.includes(rule.name+': '+rule.message),JSON.stringify(wire))
     await page.getByRole('status').filter({hasText:rule.name+': '+rule.message}).waitFor()
     assert.deepEqual(await f.snapshot(),unchanged,'The rendered refusal leaves all public records unchanged')
    }
    await page.getByLabel('Ship date',{exact:true}).fill('')
    await refusedControl(page.getByRole('button',{name:'Save record',exact:true}),'record.patch',f.rules[0]);await j.capture('rules-editor-shipping-refused')
    await page.getByLabel('Ship date',{exact:true}).fill('2027-05-01');await page.getByLabel('Manager approval',{exact:true}).uncheck()
    await refusedControl(page.getByRole('button',{name:'Save record',exact:true}),'record.patch',f.rules[1]);await j.capture('rules-editor-approval-refused')
    await page.getByLabel('Manager approval',{exact:true}).check();await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch')
    const valid=await f.read(f.control.id);assert.equal(valid.fields[f.ship.id].value,'2027-05-01');assert.equal(valid.fields[f.approval.id].value,true);assert.equal(valid.version,f.control.version+1)
    await j.capture('rules-editor-valid')
    const form=(await f.call('/api/v1/commands/form.save',rulesCommand({form:{appId:f.appId,entityId:f.entityId,title:'Rules order form',fields:f.fields.map(field=>({fieldId:field.id,label:field.label,help:'',required:field.required})),submitAction:'record.create',authenticated:true}}))).value
    await page.goto(h.origin+'/app/forms/'+form.id);await page.getByRole('heading',{name:'Rules order form',exact:true}).waitFor()
    await page.getByLabel('Order *',{exact:true}).fill('Form order '+width);await page.getByLabel('Status',{exact:true}).selectOption({label:'Shipped'});await page.getByLabel('Discount',{exact:true}).fill('0')
    await refusedControl(page.getByRole('button',{name:'Submit',exact:true}),'form.submit',f.rules[0]);await j.capture('rules-form-shipping-refused')
    await page.getByLabel('Ship date',{exact:true}).fill('2027-05-02');await page.getByLabel('Discount',{exact:true}).fill('25')
    await refusedControl(page.getByRole('button',{name:'Submit',exact:true}),'form.submit',f.rules[1]);await j.capture('rules-form-approval-refused')
    await page.getByLabel('Manager approval',{exact:true}).check()
    const submitted=await j.command(page.getByRole('button',{name:'Submit',exact:true}),'form.submit'),formRow=await f.read(submitted.id)
    assert.equal(formRow.fields[f.order.id].value,'Form order '+width);assert.equal(formRow.fields[f.ship.id].value,'2027-05-02');assert.equal(formRow.fields[f.discount.id].value,'25');assert.equal(formRow.fields[f.approval.id].value,true)
    await page.getByRole('button',{name:'Start another response',exact:true}).waitFor();await j.capture('rules-form-valid')
    await writeFile(path.join(output,`rules-${width}.json`),JSON.stringify({width,checkpoints:j.checkpoints,violators:f.seeds.map(row=>row.id),validControl:f.control.id},null,2))
    console.log('FIELD_RULES_BROWSER PASS '+width+' builder, independent violation sets, refused adoption, resolution, editor and authenticated form')
   }catch(error){await page.screenshot({path:path.join(output,`rules-failure-${width}.png`),fullPage:true});await writeFile(path.join(output,`rules-failure-${width}.html`),await page.content());throw error}finally{await context.close()}
  }
 }finally{await browser?.close();await h?.close()}
}
