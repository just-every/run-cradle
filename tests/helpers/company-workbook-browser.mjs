import {workbookLookupBrowser} from './workbook-lookup-browser.mjs'
import {tableAction,tableTools} from './records-table-tools.mjs'
import {baseAction} from './records-base-menu.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {workbook,workbookSheets,cell,arithmeticWorkbook} from './workbook-fixtures.mjs'
import {submitImport} from './base-import-browser.mjs'
import {workbookDoors} from './workbook-http.mjs'
import {readWorkbook} from '../../src/domains/records/workbooks/read.ts'
import {writeWorkbook} from '../../src/domains/records/workbooks/write.ts'
import {connectSheets} from './sheets-journey.mjs'
import {companyIdentityBrowser} from './company-identity-browser.mjs'
export async function companyWorkbookBrowser(page,j,h,width){
 try{await companyIdentityBrowser(page,j,h,width);const d=await workbookDoors(h)
  await page.goto(h.origin+'/app/records/?import=base');await page.getByLabel('Excel workbook (.xlsx)',{exact:true}).check();await j.capture('workbook-import-controls')
  await page.getByLabel('Excel workbook',{exact:true}).setInputFiles({name:'synthetic-cradle.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(workbook())});const pending=page.waitForResponse(r=>r.url().endsWith('/base-import/preview'));await page.getByRole('button',{name:'Preview import',exact:true}).click();const preview=(await(await pending).json()).data;assert.equal(preview.schemaDraft.tables.length,2);await j.capture('workbook-import-preview')
  const {preview:adopted}=await d.adopt(workbook(),'synthetic-cradle.xlsx');const orders=adopted.schemaDraft.tables[0];await page.goto(`${h.origin}/app/records/${adopted.identities.appId}/${orders.id}`);await tableTools(page);await j.capture('workbook-export-controls')
  const download=page.waitForEvent('download');await tableAction(page,'Export workbook');const file=await download;assert.ok(readWorkbook(await readFile(await file.path()),file.suggestedFilename())[0].rows.length)
  await baseAction(page,'Export base');await j.capture('workbook-base-export');const all=page.waitForEvent('download');await page.getByRole('button',{name:'Download workbook (.xlsx)',exact:true}).click();const allFile=await all;assert.equal(readWorkbook(await readFile(await allFile.path()),allFile.suggestedFilename()).length,2);await j.action(page.getByRole('dialog',{name:'Export base',exact:true}).getByRole('button',{name:'Close',exact:true}))
  const changed=workbookSheets();changed[0].rows[0][1]=cell('25','number');changed[0].rows.push([cell('synthetic-cradle-4'),cell('45','number'),cell('2026-10-25','date'),cell(true),cell('North')]);await tableAction(page,'Import CSV');await page.getByLabel('CSV or Excel file',{exact:true}).setInputFiles({name:'synthetic-cradle.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(writeWorkbook(changed))});await page.waitForFunction(()=>document.querySelector('select')&&[...document.querySelectorAll('label')].some(e=>e.textContent.startsWith('Worksheet'))||document.querySelector('[role=alert]'));assert.equal(await page.getByRole('alert').count(),0,await page.getByRole('alert').allTextContents());await page.getByLabel(/^Worksheet/).waitFor();await page.getByLabel(/^Match existing records by/).selectOption({label:'Order'});await j.capture('workbook-merge-mapping');await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByRole('heading',{name:'Review import',exact:true}).waitFor();await j.capture('workbook-merge-preview')
  await page.goto(h.origin+'/app/records/?import=base');await page.getByLabel('Google Sheets',{exact:true}).check();await page.getByLabel(/^Google Sheets connection/).waitFor();await j.capture('sheets-import-controls')
  const connectionId=await connectSheets(d,h.sheetsProvider,{appId:adopted.identities.appId});await page.goto(`${h.origin}/app/records/${adopted.identities.appId}/${orders.id}`);await tableAction(page,'Import CSV');await page.getByLabel(/^Google Sheets connection/).selectOption(connectionId);await page.getByRole('button',{name:'Read Google Sheets',exact:true}).click();await page.getByLabel(/^Google worksheet/).waitFor()
  for(const label of ['Order','Amount','Due','Approved'])await page.getByLabel(new RegExp('^'+label+'Skip')).selectOption(orders.fields.find(f=>f.label===label).id)
  await page.getByLabel(/^Match existing records by/).selectOption({label:'Order'});await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByRole('heading',{name:'Review import',exact:true}).waitFor();await page.getByLabel('Import these reviewed changes',{exact:true}).check();await page.getByRole('button',{name:'Enable hourly merge',exact:true}).click();await page.getByRole('status').filter({hasText:'Hourly merge enabled'}).waitFor();await j.capture('sheets-schedule-enabled');await page.getByRole('button',{name:'Pause hourly merge',exact:true}).click();await page.getByRole('status').filter({hasText:'Hourly merge paused'}).waitFor();await j.capture('sheets-schedule-paused')
  await workbookArithmeticBrowser(page,j,h,d,width)
  await workbookLookupBrowser(page,j,h,d,width)
 }catch(error){await page.screenshot({path:j.companyOutput('failed-state'),fullPage:true});throw error}
}

/** Use the actual review, schema adoption, receipt and record editor screens. */
async function workbookArithmeticBrowser(page,j,h,d,width){
 await page.goto(h.origin+'/app/records/?import=base');await page.getByLabel('Excel workbook (.xlsx)',{exact:true}).check();await page.getByLabel('Base name',{exact:true}).fill(`synthetic-cradle-formulas-${width}`)
 const bytes=arithmeticWorkbook();await page.getByLabel('Excel workbook',{exact:true}).setInputFiles({name:'arithmetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bytes)})
 const pending=page.waitForResponse(response=>response.url().endsWith('/base-import/preview')&&response.request().method()==='POST');await j.action(page.getByRole('button',{name:'Preview import',exact:true}));const response=await pending,body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));const preview=body.data
 assert.equal(await page.getByLabel('Type for Total',{exact:true}).inputValue(),'computed');assert.equal(await page.getByLabel('Type for Shipping',{exact:true}).inputValue(),'computed')
 for(const label of ['Total','Mismatch','Mixed','External','Cycle one','Cycle two']){
  const column=page.locator('fieldset.cr-import-column').filter({has:page.getByLabel(`Type for ${label}`,{exact:true})});await j.action(column.getByText('Samples and conversion details',{exact:true}))
  const source=preview.source.tables[0].columns.find(item=>item.label===label),decision=preview.report.workbookFormulas.find(item=>item.tableKey==='sheet-1'&&item.columnKey===source.key)
  if(!decision.recognized){assert.equal(await page.getByLabel(`Type for ${label}`,{exact:true}).inputValue(),'number');assert.ok((await column.innerText()).includes(decision.reason),`Review explains ${label} refusal`)}else assert.match(await column.innerText(),/4 of 4|4.*cached|cached.*4/i,'Review reports complete cached-result comparison')
 }
 await j.capture('workbook-formula-review')
 const job=await submitImport(page,{action:j.action,setChecked:j.setChecked,onReview:()=>j.capture('workbook-formula-adoption')})
 await j.action(page.getByRole('link',{name:'Open move-in receipt',exact:true}));await page.getByRole('heading',{name:'Move-in receipt',exact:true}).waitFor()
 const receipt=await d.call(`/api/v1/records/base-import/jobs/${job.id}/receipt.json`);await page.getByRole('heading',{name:'Workbook formulas',exact:true}).first().waitFor()
 for(const label of ['Total','Mismatch']){const source=preview.source.tables[0].columns.find(item=>item.label===label),decision=receipt.workbookFormulas.find(item=>item.tableKey==='sheet-1'&&item.columnKey===source.key);assert.ok((await page.locator('main').innerText()).includes(decision.reason??decision.nativeFormula),`Receipt shows ${label} formula decision`)}
 await j.capture('workbook-formula-receipt')
 const table=preview.schemaDraft.tables.find(item=>item.label==='Orders'),total=table.fields.find(item=>item.label==='Total'),mismatch=table.fields.find(item=>item.label==='Mismatch'),recordId=preview.identities.tables['sheet-1'].records['row-1'],recordPath=`/app/records/${preview.identities.appId}/${table.id}/${recordId}`
 await page.goto(h.origin+recordPath);await page.getByRole('button',{name:'Edit record',exact:true}).waitFor();const displayed=label=>page.locator('dl.cr-record-fields .cr-field').filter({has:page.locator('dt').getByText(label,{exact:true})}).locator('dd')
 assert.equal((await displayed('Total').innerText()).trim(),'25');await j.action(page.getByRole('button',{name:'Edit record',exact:true}));assert.equal(await page.getByLabel('Total',{exact:true}).count(),0,'Preserved formula is not an editable cached literal');await page.getByLabel('Quantity',{exact:true}).fill('5')
 await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch');await page.getByRole('button',{name:'Edit record',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'Edit record',exact:true}).waitFor()
 assert.equal((await displayed('Total').innerText()).trim(),'62.5');assert.equal((await displayed('Mismatch').innerText()).trim(),'25')
 const rows=(await d.call(`/api/v1/apps/${preview.identities.appId}/entities/${table.id}/query`,{fields:[total.id,mismatch.id]})).items;assert.equal(rows.find(item=>item.id===recordId).fields[total.id].value,'62.5')
 await j.capture('workbook-formula-recomputed')
}
