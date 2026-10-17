import {boardBrowserJourney} from './helpers/records-board-journey.mjs'
import {findBrowserJourney} from './helpers/records-find-journey.mjs'
import {liveBrowserJourney} from './helpers/records-live-journey.mjs'
import {contract} from './contract.mjs'
import {relationFixture,relationReview} from './helpers/records-browser-relations.mjs'
import {homeReview, builderReview, gridReview, gridEdgeReview} from './helpers/records-browser-review.mjs'
import {additionalViews} from './helpers/records-browser-additional-views.mjs'
import {retainedLaunch} from './helpers/records-browser-retained.mjs'
import {exerciseCsv} from './helpers/records-browser-csv.mjs'
import {exerciseViews} from './helpers/records-browser-views.mjs'
import {exerciseSchemaEdit} from './helpers/records-browser-edit.mjs'
import {exerciseTemplates} from './helpers/records-browser-templates.mjs'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './helpers/records-browser-runtime.mjs'
import {recordsJourney} from './helpers/records-browser-journey.mjs'
import {accessibilityContextOptions,accessibilityWidths} from './helpers/accessibility-evidence.mjs'
import {freePort} from './helpers/free-port.mjs'
const output=path.resolve(process.env.CRADLE_RECORDS_OUTPUT??'.private/records-builder/browser');await mkdir(output,{recursive:true})
contract(['RECORDS-001','BASE-PUBLIC-003'].join('] ['),'Home presents records and bases before launch work at desktop and phone widths',async()=>{await writeFile(path.join(output,'home-results.json'),JSON.stringify(await homeReview(output),null,2))})
contract(['RECORDS-002','RECORDS-003'].join('] ['),'Record detail keeps one relation heading, reachable links and policy restrictions',async()=>{
 let h,browser
 try{
  h=await recordsBrowserRuntime(Number(process.env.CRADLE_RECORDS_PORT ?? await freePort()));const fixture=await relationFixture(h);browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  const receipts=[]
  for(const width of accessibilityWidths){
   const context=await browser.newContext(accessibilityContextOptions({viewport:{width,height:width===390?844:900}})),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   try{await context.addCookies([{name: h.cookie.split('=')[0], value: h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}]);receipts.push({width,...await relationReview(page,j,h,fixture),checkpoints:j.checkpoints})}finally{await context.close()}
  }
  await writeFile(path.join(output,'relation-results.json'),JSON.stringify(receipts,null,2))
 }finally{await browser?.close();await h?.close()}
})
contract(['VIEW-014','VIEW-009','VIEW-013','VIEW-015','VIEW-016','RECORDS-002','RECORDS-003','RECORDS-004'].join('] ['),'Manual records browser journeys and concrete UI review corrections',async()=>{
let h,browser,activePage
try{
 h=await recordsBrowserRuntime(Number(process.env.CRADLE_RECORDS_PORT ?? await freePort()));const bindings=await h.runtime.getBindings();for(const key of ['AI_PROVIDER_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY'])assert.ok(!bindings[key],`${key} must be absent for no-AI records acceptance`);browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
 const receipts=[]
 for(const width of accessibilityWidths){
  const context=await browser.newContext(accessibilityContextOptions({viewport:{width,height:width===390?844:900}})),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width);activePage=page
  await context.addCookies([{name: h.cookie.split('=')[0], value: h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
  const verifyRetained=await retainedLaunch(page,j,h,width)
  await page.goto(h.origin+'/app/records');await page.getByRole('button',{name:'Create base',exact:true}).waitFor()
  await j.action(page.getByRole('button',{name:'Create base',exact:true}));await page.getByLabel('Base name',{exact:true}).fill(`CRM ${width}`);await page.getByLabel('Table name',{exact:true}).fill('Companies');await page.getByLabel('Field name',{exact:true}).fill('Company')
  await j.field('Website','url');await j.field('Renewal','date')
  await j.action(page.getByRole('button',{name:'Add table',exact:true}));await page.getByLabel('Table name',{exact:true}).fill('Contacts');await page.getByLabel('Field name',{exact:true}).fill('Contact');await j.field('Email');await j.field('Company link','relation',async e=>e.getByLabel('Linked table',{exact:true}).selectOption({label:'Companies'}));await j.field('Company name','computed',async e=>{await e.getByLabel('Lookup link',{exact:true}).selectOption({label:'Company link'});await e.getByLabel('Lookup source field',{exact:true}).selectOption({label:'Company'})})
  await j.action(page.getByRole('button',{name:'Add table',exact:true}));await page.getByLabel('Table name',{exact:true}).fill('Deals');await page.getByLabel('Field name',{exact:true}).fill('Deal');await j.field('Value','number');await j.field('Close date','date');await j.field('Approved','boolean');await j.field('Stage','select',async e=>e.getByLabel('Options (one per line)').fill('New\nQualified\nWon'));await j.field('Company link','relation',async e=>e.getByLabel('Linked table',{exact:true}).selectOption({label:'Companies'}));await j.field('Company name','computed',async e=>{await e.getByLabel('Lookup link',{exact:true}).selectOption({label:'Company link'});await e.getByLabel('Lookup source field',{exact:true}).selectOption({label:'Company'})})
  await builderReview(page,j);await j.capture('schema-builder');const result=await j.adopt()
  const company=await j.record({Company:'Acme 北, "Co"',Website:'https://example.test',Renewal:'2027-02-10'});await j.capture('companies')
  await j.table('Contacts');await j.record({Contact:'Alex',Email:'alex@example.test','Company link':{link:'Acme 北, "Co"'}});await j.capture('contacts')
  await j.table('Deals');await j.record({Deal:'First deal',Value:'0','Close date':'2027-01-15',Approved:false,Stage:{select:'New'},'Company link':{link:'Acme 北, "Co"'}});await j.record({Deal:'Second deal',Value:'125.25',Stage:{select:'Qualified'}});await j.record({Deal:'Third deal',Value:'200',Stage:{select:'New'}});await gridReview(page,j);await j.capture('deals')
  const views=await exerciseViews(page,j);views.additional=await additionalViews(page,j,h.origin,result.appId);await exerciseSchemaEdit(page,j,h.origin,result.appId);const csv=await exerciseCsv(page,j,h.origin,width);const templates=await exerciseTemplates(page,j,h.origin,width);await gridEdgeReview(page,j,h.origin,width);await boardBrowserJourney(page,j,h,width);await verifyRetained();await page.goto(h.origin+'/app');await page.getByText('Launch readiness template',{exact:true}).waitFor();await j.capture('populated-home')
  await findBrowserJourney(page,j,h)
  await liveBrowserJourney(page,j,h,browser,width,output)
  receipts.push({views,templates,csv,width,baseId:result.appId,companyId:company.id,pageErrors:j.errors,checkpoints:j.checkpoints})
  await context.close()
 }
 const aiCounts={};for(const table of ['execution_model_calls','operation_model_tasks','operation_model_usage','construction_model_tasks','launch_analyses']){aiCounts[table]=(await h.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;assert.equal(aiCounts[table],0,`${table}: ordinary records must not call a model`)}
 await writeFile(path.join(output,'ai-counts.json'),JSON.stringify(aiCounts,null,2));
 await writeFile(path.join(output,'results.json'),JSON.stringify(receipts,null,2));console.log(JSON.stringify({passed:receipts,evidence:output}))
}catch(error){if(activePage){await activePage.screenshot({path:path.join(output,'failure.png'),fullPage:true});await writeFile(path.join(output,'failure.html'),await activePage.content())}throw error}finally{await browser?.close();await h?.close()}

})
