import assert from 'node:assert/strict'
import {lookupSheets,formulaWorkbook} from './workbook-fixtures.mjs'
import {submitImport} from './base-import-browser.mjs'
import {connectSheets} from './sheets-journey.mjs'

/** Exercise the existing review, receipt and editor with both workbook sources. */
export async function workbookLookupBrowser(page,j,h,d,width){
 for(const source of ['xlsx','google-sheets']){
  await page.goto(h.origin+'/app/records/?import=base')
  if(source==='xlsx'){
   await page.getByLabel('Excel workbook (.xlsx)',{exact:true}).check()
   await page.getByLabel('Excel workbook',{exact:true}).setInputFiles({name:'lookups.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(formulaWorkbook(lookupSheets()))})
  }else{
   h.sheetsProvider.setWorkbook(lookupSheets())
   const connectionId=await connectSheets(d,h.sheetsProvider,{appId:h.workbookLookupBase})
   await page.getByLabel('Google Sheets',{exact:true}).check()
   await page.getByLabel(/^Google Sheets connection/).selectOption(connectionId)
   const capture=page.waitForResponse(r=>r.url().endsWith('/sheets-source')&&r.request().method()==='POST')
   await page.getByRole('button',{name:'Read Google Sheets',exact:true}).click()
   const result=await capture;assert.equal(result.status(),200,await result.text())
  }
  const pending=page.waitForResponse(r=>r.url().endsWith('/base-import/preview')&&r.request().method()==='POST')
  await j.action(page.getByRole('button',{name:'Preview import',exact:true}));const response=await pending,body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));const preview=body.data
  const tables=preview.schemaDraft.tables,orders=tables[0],vendors=tables[1],field=(table,label)=>table.fields.find(f=>f.label===label)
  if(source==='xlsx')h.workbookLookupBase=preview.identities.appId
  assert.equal(await page.getByLabel('Type for Vendor',{exact:true}).inputValue(),'relation')
  for(const label of ['V price','X city']){
   assert.equal(await page.getByLabel(`Type for ${label}`,{exact:true}).inputValue(),'computed')
   const column=page.locator('fieldset.cr-import-column').filter({has:page.getByLabel(`Type for ${label}`,{exact:true})})
   assert.match(await column.innerText(),/3 of 3 cached results match/)
  }
  const refused=page.locator('fieldset.cr-import-column').filter({has:page.getByLabel('Type for Bad cache',{exact:true})})
  assert.match(await refused.innerText(),/first mismatch/);assert.notEqual(await page.getByLabel('Type for Approximate',{exact:true}).inputValue(),'computed')
  await j.capture(`workbook-${source}-lookup-review`)
  const job=await submitImport(page,{action:j.action,setChecked:j.setChecked,onReview:()=>j.capture(`workbook-${source}-lookup-adoption`)})
  await j.action(page.getByRole('link',{name:'Open move-in receipt',exact:true}));await page.getByRole('heading',{name:'Move-in receipt',exact:true}).waitFor()
  const receipt=await d.call(`/api/v1/records/base-import/jobs/${job.id}/receipt.json`)
  assert.deepEqual(receipt.workbookFormulas.filter(f=>f.recognized).map(f=>f.column),['V price','X city'])
  assert.match(await page.locator('main').innerText(),/Vendor catalog/);assert.match(await page.locator('main').innerText(),/first mismatch/)
  await j.capture(`workbook-${source}-lookup-receipt`)
  // Edit the adopted target through the real record editor; the repeated source key follows it.
  const vendorId=preview.identities.tables['sheet-2'].records['row-1']
  await page.goto(`${h.origin}/app/records/${preview.identities.appId}/${vendors.id}/${vendorId}`)
  await j.action(page.getByRole('button',{name:'Edit record',exact:true}));await page.getByLabel('Price',{exact:true}).fill('15');await page.getByLabel('City',{exact:true}).fill('Sydney')
  await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch');await page.getByRole('button',{name:'Edit record',exact:true}).waitFor()
  const rows=(await d.call(`/api/v1/apps/${preview.identities.appId}/entities/${orders.id}/query`,{fields:orders.fields.map(f=>f.id),sort:[{fieldId:orders.fields[0].id,direction:'asc'}]})).items
  assert.deepEqual(rows.map(r=>[r.fields[field(orders,'V price').id].value,r.fields[field(orders,'X city').id].value]),[['15','Sydney'],['7.25','Perth'],['15','Sydney']])
  await page.goto(`${h.origin}/app/records/${preview.identities.appId}/${orders.id}/${preview.identities.tables['sheet-1'].records['row-3']}`)
  await page.getByRole('button',{name:'Edit record',exact:true}).waitFor()
  const displayed=label=>page.locator('dl.cr-record-fields .cr-field').filter({has:page.locator('dt').getByText(label,{exact:true})}).locator('dd')
  assert.equal((await displayed('V price').innerText()).trim(),'15');assert.equal((await displayed('X city').innerText()).trim(),'Sydney');assert.equal((await displayed('Bad cache').innerText()).trim(),'12.5')
  await j.capture(`workbook-${source}-lookup-recomputed`)
 }
 h.sheetsProvider.setWorkbook(null)
}
