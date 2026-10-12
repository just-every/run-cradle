import {boardReview} from './records-browser-review.mjs'
import {formHydration} from './records-browser-hydration.mjs'
import {parseCsv} from '../../src/domains/portability/csv.ts'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'

async function groupedTableReview(page,table,expectedRecords){
 const groups=await table.evaluate(table=>[...table.tBodies].map(body=>{
  const headers=[...body.querySelectorAll('th[scope="rowgroup"]')],header=headers[0]
  const rows=[...body.rows].filter(row=>row.querySelector('td'))
  return {
   headerCount:headers.length,
   headerFirst:header?.parentElement===body.rows[0],
   records:rows.map(row=>[...row.cells].map(cell=>cell.textContent.trim())),
   associated:rows.every(row=>[...row.cells].every((cell,index)=>{
    const ids=cell.headers.split(/\s+/),column=table.tHead.rows[0].cells[index]
    return ids.length===2&&ids[0]===column.id&&ids[1]===header?.id&&ids.every(id=>id&&document.getElementById(id)?.closest('table')===table)
   })),
  }
 }))
 assert.equal(groups.length,expectedRecords.length,'Each actual group has its own tbody')
 groups.forEach((group,index)=>{
  assert.equal(group.headerCount,1,'One rowgroup header owns each tbody')
  assert.equal(group.headerFirst,true,'The group header precedes its records')
  assert.equal(group.associated,true,'Every record cell references its column and its own group header')
  assert.deepEqual(group.records.map(cells=>cells.find(value=>expectedRecords[index].includes(value))),expectedRecords[index],'Group membership and record order are retained')
 })
 const axe=await new AxeBuilder({page}).withRules(['th-has-data-cells','td-headers-attr']).analyze()
 assert.deepEqual([...axe.violations,...axe.incomplete],[],'Grouped tables have complete, valid header associations')
 return groups
}
export async function exerciseViews(page,j){
 await page.getByLabel('Sort',{exact:true}).selectOption({label:'Deal'});await page.getByLabel('Direction',{exact:true}).selectOption('desc');await page.waitForLoadState('networkidle')
 assert.match(await page.locator('table.cr-table tbody tr').first().innerText(),/Third deal/)
 await page.getByLabel('Group',{exact:true}).selectOption({label:'Stage'});await page.waitForLoadState('networkidle');await page.getByRole('columnheader',{name:'Group',exact:true}).waitFor();assert.equal(await page.getByRole('columnheader',{name:'Group',exact:true}).count(),1)
 await page.getByLabel('Sort',{exact:true}).selectOption({label:'Value'});await page.getByLabel('Direction',{exact:true}).selectOption('asc');await page.waitForLoadState('networkidle')
 await page.getByRole('link',{name:'First deal',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));const groupedNames=await page.locator('table.cr-table tbody td:nth-child(3) > a').allTextContents();assert.deepEqual(groupedNames,['First deal','Third deal','Second deal'])
 const groupedTable=await groupedTableReview(page,page.locator('table.cr-table'),[['First deal','Third deal'],['Second deal']])
 const groupedDownload=page.waitForEvent('download');await j.action(page.getByRole('button',{name:'Export CSV',exact:true}));const groupedFile=await groupedDownload,groupedCsv=parseCsv(new Uint8Array(await readFile(await groupedFile.path())));assert.deepEqual(groupedCsv.rows.map(row=>row[groupedCsv.headers.indexOf('Deal')]),groupedNames);await j.capture('grid-grouped-sort')
 await j.action(page.getByText('Filter records',{exact:true}));await j.action(page.getByRole('button',{name:'Add condition',exact:true}));const filter=page.locator('.cr-filter-group');await filter.getByLabel(/^Field/).selectOption({label:'Deal'});await filter.getByLabel('Condition',{exact:true}).selectOption('contains');await filter.getByLabel('Deal',{exact:true}).fill('First');const filteredResponse=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/query')&&JSON.stringify(response.request().postDataJSON()?.filter??null).includes('First'));await j.action(page.getByRole('button',{name:'Apply filters',exact:true}));const filteredBody=await(await filteredResponse).json();assert.equal(filteredBody.data.total.value,1);await page.waitForLoadState('networkidle');await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));await page.getByRole('link',{name:'First deal',exact:true}).waitFor();assert.equal(await page.locator('table.cr-table tbody tr').filter({has:page.getByRole('link',{name:'First deal',exact:true})}).count(),1)
 await j.action(page.getByText('Visible columns',{exact:true}));const columns=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Visible columns'})});for(const label of ['Close date','Approved','Company link','Company name'])await j.setChecked(columns.getByLabel(label,{exact:true}),false)
 await j.action(page.getByRole('button',{name:'Save view',exact:true}));const editor=page.locator('form.cr-card').filter({has:page.getByRole('heading',{name:'Save this work view'})});await editor.getByLabel('Name',{exact:true}).fill('First deals');const saved=await j.command(editor.getByRole('button',{name:'Save view',exact:true}),'view.save')
 await page.reload();await j.action(page.getByText('Saved views',{exact:true}));await page.getByLabel('Saved view',{exact:true}).selectOption(saved.id);await page.getByRole('heading',{name:'First deals',exact:true}).waitFor();const section=page.locator('section.cr-section').filter({has:page.getByRole('heading',{name:'First deals',exact:true})})
 const savedTable=await groupedTableReview(page,section.locator('table.cr-table'),[['First deal']])
 assert.match(await section.locator('.cr-record-group').innerText(),/New.*1 on this page/);const download=page.waitForEvent('download');await j.action(section.getByRole('button',{name:'Export CSV',exact:true}));const file=await download,contents=await readFile(await file.path(),'utf8');assert.ok(contents.startsWith('"Deal","Value","Stage"'));assert.match(contents,/First deal/);assert.doesNotMatch(contents,/Third deal/);await j.capture('saved-filtered-view')
 await j.action(page.getByText('Saved views',{exact:true}));await j.action(page.getByText('Visible columns',{exact:true}));await j.setChecked(page.locator('details').filter({has:page.locator('summary').filter({hasText:'Visible columns'})}).getByLabel('Stage',{exact:true}),false);await j.action(page.getByRole('button',{name:'Save view',exact:true}));const boardEditor=page.locator('form.cr-card').filter({has:page.getByRole('heading',{name:'Save this work view'})});await boardEditor.getByLabel('Name',{exact:true}).fill('Sales pipeline');await boardEditor.getByLabel('Display',{exact:true}).selectOption('board');await boardEditor.getByLabel('Columns',{exact:true}).selectOption({label:'Stage'});const board=await j.command(boardEditor.getByRole('button',{name:'Save view',exact:true}),'view.save')
 await page.reload();await j.action(page.getByText('Saved views',{exact:true}));await page.getByLabel('Saved view',{exact:true}).selectOption(board.id);await page.getByRole('heading',{name:'Sales pipeline',exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:'Sales pipeline board; scroll for columns'}).getByRole('heading',{name:'Qualified',exact:true}).count(),1);assert.match(await page.getByRole('region',{name:'Sales pipeline board; scroll for columns'}).locator('section').filter({has:page.getByRole('heading',{name:'Qualified',exact:true})}).innerText(),/Second deal/);await boardReview(page);await j.capture('kanban')
 await j.action(page.getByText('Saved views',{exact:true}));await j.action(page.getByText('Forms',{exact:true}));await j.action(page.getByRole('button',{name:'Create form',exact:true}));const form=page.locator('form').filter({has:page.getByLabel('Form title',{exact:true})});await form.getByLabel('Form title',{exact:true}).fill('New opportunity');await j.setChecked(form.getByRole('checkbox',{name:'Deal',exact:true}),true);await j.setChecked(form.getByRole('checkbox',{name:'Value',exact:true}),true);await j.setChecked(form.getByRole('checkbox',{name:'Approved',exact:true}),true);const savedForm=await j.command(form.getByRole('button',{name:'Save form',exact:true}),'form.save');await j.action(page.getByRole('link',{name:'Open form',exact:true}));await page.getByRole('heading',{name:'New opportunity',exact:true}).waitFor();const hydration=await formHydration(page),fieldIds={};for(const label of ['Deal','Value','Approved'])fieldIds[label]=(await page.getByLabel(label,{exact:true}).getAttribute('id')).slice('field-'.length);await page.getByLabel('Deal',{exact:true}).fill('From authenticated form');await page.getByLabel('Value',{exact:true}).fill('50');await j.setChecked(page.getByRole('checkbox',{name:'Approved',exact:true}),true);const submitted=await j.command(page.getByRole('button',{name:'Submit',exact:true}),'form.submit');assert.equal(submitted.fields[fieldIds.Deal].value,'From authenticated form');assert.equal(submitted.fields[fieldIds.Value].value,'50');assert.equal(submitted.fields[fieldIds.Approved].value,true);const read=await page.request.get(new URL(`/api/v1/apps/${submitted.ref.appId}/entities/${submitted.ref.entityId}/records/${submitted.id}`,page.url()).href);assert.equal(read.status(),200);const persisted=(await read.json()).data.record;assert.equal(persisted.fields[fieldIds.Deal].value,'From authenticated form');assert.equal(persisted.fields[fieldIds.Value].value,'50');assert.equal(persisted.fields[fieldIds.Approved].value,true);await page.getByRole('button',{name:'Start another response'}).waitFor();await j.capture('authenticated-form')
 assert.equal((await fetch(new URL(`/api/v1/forms/${savedForm.id}`,page.url()))).status,401)
 return {savedViewId:saved.id,boardId:board.id,formId:savedForm.id,formRecordId:submitted.id,hydration,groupedTable,savedTable}
}
