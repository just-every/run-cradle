import {recordsBrowserWidths} from './records-browser-widths.mjs'
import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {collectionLookupFixture} from './records-collection-lookups.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function collectionLookupsBrowser(){
 const output='.private/collection-lookups';await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await recordsBrowserRuntime(0)
  const call=async(path,input,status=200)=>{const csrf=input===undefined?null:await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json();const response=await fetch(h.origin+path,{method:input===undefined?'GET':'POST',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json',...(csrf?{'x-csrf-token':csrf.csrfToken}:{})},...(input===undefined?{}:{body:JSON.stringify(input)})}),body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error}
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  for(const width of recordsBrowserWidths()){
   const f=await collectionLookupFixture(call),context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   try{
    page.setDefaultTimeout(15000)
    await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
    await page.goto(`${h.origin}/app/records/${f.appId}/${f.accountsId}`)
    await page.getByRole('button',{name:'Edit base schema',exact:true}).click()
    await page.getByRole('navigation',{name:'Schema tables'}).getByRole('button',{name:'Accounts',exact:true}).click()
    for(const [label,source,link]of [['Handling requirements','Handling','Orders'],['Ordered products','Products','Orders'],['Ordered product names','Product names','Orders'],['Latest handling','Handling','Latest order']]){
     await j.field(label,'computed',async editor=>{
      await editor.getByLabel('Lookup link',{exact:true}).selectOption({label:link})
      await editor.getByLabel('Lookup source field',{exact:true}).selectOption({label:source})
      await editor.getByRole('button',{name:'Add lookup sort',exact:true}).click()
      await editor.getByLabel('Lookup sort field 1',{exact:true}).selectOption({label:'Due'})
      await editor.getByLabel('Lookup sort direction 1',{exact:true}).selectOption('desc')
      await editor.getByLabel('First N linked records',{exact:true}).fill('4')
     })
    }
    await j.capture('collection-source-authoring')
    await page.getByRole('button',{name:'Preview schema changes',exact:true}).click()
    await page.getByRole('heading',{name:'Review schema changes',exact:true}).waitFor()
    await j.capture('collection-results-preview')
    await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    await j.command(page.getByRole('button',{name:'Adopt schema',exact:true}),'release.adopt')
    await page.goto(`${h.origin}/app/records/${f.appId}/${f.accountsId}/${f.company.id}`)
    await page.getByRole('heading',{name:'Northstar Supply',exact:true}).waitFor()
    const fields=page.locator('dl.cr-record-fields'),value=label=>fields.locator('.cr-field').filter({has:page.locator('dt').getByText(label,{exact:true})}).locator('dd')
    assert.match(await value('Handling requirements').innerText(),/Oversize.*Refrigerated.*Fragile.*Refrigerated/s)
    assert.match(await value('Ordered product names').innerText(),/Shipping label.*Cold pack.*Shipping label.*Insulated crate.*Cold pack/s)
    await value('Ordered products').getByRole('link',{name:'Shipping label',exact:true}).first().waitFor()
    await j.capture('collection-record-values')
    await call('/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref:f.rows[3].ref,version:f.rows[3].version}],input:{ref:f.rows[3].ref,changes:{[f.tags.id]:[f.tags.options[0].id]}}})
    await value('Handling requirements').getByText('Fragile',{exact:true}).first().waitFor()
    const next=(await f.query()).items.find(row=>row.id===f.company.id),schema=await call(`/api/v1/apps/${f.appId}/entities/${f.accountsId}`),handling=schema.fields.find(field=>field.label==='Handling requirements')
    assert.deepEqual(next.fields[handling.id].value,[f.tags.options[0].id,f.tags.options[1].id,f.tags.options[0].id,f.tags.options[1].id])
    await page.reload();await value('Handling requirements').getByText('Fragile',{exact:true}).first().waitFor();await j.capture('collection-next-read')
    assert.deepEqual(j.errors,[])
   }catch(error){await page.screenshot({path:`${output}/failure-${width}.png`,fullPage:true});throw error}finally{await context.close()}
  }
  console.log(`CALC-002 collection builder and record journeys passed at ${recordsBrowserWidths().join(' and ')}`)
 }finally{await browser?.close();await h?.close()}
}
