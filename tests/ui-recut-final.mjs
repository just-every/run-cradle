import {displayAction,tableAction} from './helpers/records-table-tools.mjs'
import {baseAction} from './helpers/records-base-menu.mjs'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {contract} from './contract.mjs'
import {recordsBrowserRuntime} from './helpers/records-browser-runtime.mjs'
import {recordsJourney} from './helpers/records-browser-journey.mjs'
import {accessibilityContextOptions,accessibilityWidths} from './helpers/accessibility-evidence.mjs'
import {waitForResourcePanels} from './helpers/accessibility-readiness.mjs'

const output=path.resolve(process.env.CRADLE_RECUT_OUTPUT??'../evidence/recut-final')
// The second element follows the first: below it, or (on wide screens) beside it at the right.
// Measure the settled page: while a section is still loading, or the scroll is settling after the record editor closes, the two boxes are read at different scroll positions.
async function comfortableGap(first,next){
 await waitForResourcePanels(first.page())
 const a=await first.boundingBox(),b=await next.boundingBox()
 assert.ok(a&&b,'Both reviewed elements must be visible')
 const below=b.y>=a.y+a.height-1,gap=below?b.y-a.y-a.height:b.x-a.x-a.width
 assert.ok(gap>=16&&gap<=64,JSON.stringify({gap,below,a,b}));return gap
}
async function capture(page,j,name){
 await j.capture(name)
 const axe=await new AxeBuilder({page}).analyze()
 assert.deepEqual(axe.violations.filter(finding=>finding.id==='heading-order').map(finding=>finding.nodes.map(node=>node.target)),[],`${name}: heading order`)
}
async function savedGridRecord(result){
 const title=result.getByRole('cell',{name:'First deal, Deal, editable',exact:true})
 await title.waitFor();assert.equal(await title.count(),1)
 const rows=result.locator('tbody').getByRole('row');assert.equal(await rows.count(),1)
 await rows.getByRole('link',{name:'Acme Co',exact:true}).waitFor()
 assert.deepEqual(await rows.locator('td[data-field-id]').allTextContents(),['First deal','12','Acme Co'])
}

contract('RECORDS-003] [BASE-PUBLIC-003','final records review preserves spacing, hierarchy and reachable records on desktop and phone',async()=>{
 let h,browser
 await mkdir(output,{recursive:true})
 try{
  h=await recordsBrowserRuntime(Number(process.env.CRADLE_RECUT_PORT ?? 0))
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  const receipts=[]
  for(const width of accessibilityWidths){
   const context=await browser.newContext(accessibilityContextOptions({viewport:{width,height:width===390?844:900}})),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   const consoleErrors=[],externalRequests=[]
   page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
   page.on('request',request=>{const url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&url.origin!==h.origin)externalRequests.push(url.href)})
   try{
    await context.addCookies([{name: h.cookie.split('=')[0], value: h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
    await page.goto(h.origin+'/app/records');await page.getByRole('button',{name:/^Base ▾/}).waitFor();assert.equal(await page.getByRole('heading',{name:'Choose an application',exact:true}).count(),0);await capture(page,j,'records-entry')
    await baseAction(page,'New base',j.action);await page.getByLabel('Base name',{exact:true}).fill(`Final review ${width}`)
    await page.getByLabel('Table name',{exact:true}).fill('Companies');await page.getByLabel('Field name',{exact:true}).fill('Company')
    await j.action(page.getByRole('button',{name:'Add table',exact:true}));await page.getByLabel('Table name',{exact:true}).fill('Deals');await page.getByLabel('Field name',{exact:true}).fill('Deal')
    await j.field('Value','number');await j.field('Company link','relation',async editor=>editor.getByLabel('Linked table',{exact:true}).selectOption({label:'Companies'}))
    const base=await j.adopt();await j.record({Company:'Acme Co'});await j.table('Deals');await j.record({Deal:'First deal',Value:'12','Company link':{link:'Acme Co'}})
    const dealsUrl=page.url(),heading=page.locator('.cr-view-bar'),cardHead=page.locator('.cr-page-header'),displayTabs=page.locator('.cr-view-bar')
    await heading.waitFor();const closedGap=await comfortableGap(cardHead,displayTabs);await capture(page,j,'records-deals-closed')
    await displayAction(page,'Form',j.action);await page.getByRole('heading',{name:'No forms for these records',level:2,exact:true}).waitFor();await capture(page,j,'records-forms-empty');await displayAction(page,'Grid',j.action)
    await tableAction(page,'Save view',j.action);const editor=page.locator('form.cr-card').filter({has:page.getByRole('heading',{name:'Save this work view',exact:true})})
    await editor.getByLabel('Name',{exact:true}).fill('Reviewed deals');const view=await j.command(editor.getByRole('button',{name:'Save view',exact:true}),'view.save')
    await page.reload();await displayAction(page,view.name,j.action);await page.getByRole('heading',{name:'Reviewed deals',level:2,exact:true}).waitFor()
    const result=page.locator('.cr-saved-view-result');await savedGridRecord(result)
    const openGap=await comfortableGap(displayTabs,page.locator('section.cr-records-card'));await capture(page,j,'records-deals-open');await displayAction(page,'Grid',j.action)
    await j.action(page.locator('table.cr-table').getByRole('link',{name:'First deal',exact:true}));await page.getByRole('heading',{name:'First deal',level:1,exact:true}).waitFor()
    const relation=page.locator('.cr-record-relation'),linkHeading=page.getByRole('heading',{name:'Company link',level:2,exact:true}),companyLink=relation.getByRole('link',{name:'Acme Co',exact:true})
    // LinkedRecord loads its own schema and record after the detail heading is rendered.
    await linkHeading.waitFor();await companyLink.waitFor()
    assert.equal(await linkHeading.count(),1);assert.equal(await page.locator('dl dt').filter({hasText:/^Company link$/}).count(),0)
    const relationGap=await comfortableGap(page.locator('dl.cr-card'),linkHeading);assert.equal(await companyLink.count(),1)
    const back=page.getByRole('link',{name:'← Back to records',exact:true});assert.equal(new URL(await back.getAttribute('href'),h.origin).href,dealsUrl)
    await capture(page,j,'record-detail');await j.action(back);await heading.waitFor();await j.action(page.locator('table.cr-table').getByRole('link',{name:'First deal',exact:true}));await linkHeading.waitFor()
    await j.action(companyLink);await page.getByRole('heading',{name:'Acme Co',level:1,exact:true}).waitFor();await capture(page,j,'company-link-reached')
    await j.action(page.getByRole('link',{name:'← Back to records',exact:true}));await page.locator('.cr-view-bar').waitFor();assert.equal(await page.locator('.cr-view-bar__pills a[aria-current=page]').filter({hasText:/^Companies$/}).count(),1)
    await page.goto(dealsUrl);await displayAction(page,view.name,j.action);await page.getByRole('heading',{name:'Reviewed deals',level:2,exact:true}).waitFor();await savedGridRecord(result);await capture(page,j,'saved-view-retained')
    assert.deepEqual(consoleErrors,[],`${width}: console errors`);assert.deepEqual(externalRequests,[],`${width}: external requests`)
    receipts.push({width,baseId:base.appId,viewId:view.id,closedGap,openGap,relationGap,consoleErrors,externalRequests,checkpoints:j.checkpoints})
   }finally{await context.close()}
  }
  await writeFile(path.join(output,'final-review-results.json'),JSON.stringify(receipts,null,2))
 }finally{await browser?.close();await h?.close()}
})
