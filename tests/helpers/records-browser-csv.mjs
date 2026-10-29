import {displayAction,sortAndGroup,tableAction} from './records-table-tools.mjs'
import {writeWorkbook} from '../../src/domains/records/workbooks/write.ts'
import {baseAction} from './records-base-menu.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {encodeCsv,parseCsv} from '../../src/domains/portability/csv.ts'

export async function exerciseCsv(page,j,origin,width){
 async function build(name,{uniqueCode=false}={}){
  await page.goto(origin+'/app/records')
  await baseAction(page,'New base',j.action)
  await page.getByLabel('Base name',{exact:true}).fill(`${name} ${width}`)
  await page.getByLabel('Table name',{exact:true}).fill('Rows')
  await page.getByLabel('Field name',{exact:true}).fill('Key')
  await j.field('Text');await j.field('Number','number');await j.field('Checked','boolean')
  if(uniqueCode)await j.field('Code','text',editor=>j.setChecked(editor.getByLabel('Unique value',{exact:true}),true))
  return j.adopt()
 }
 async function importCsv(csv,expected,rejected=0,{createAll=false,workbook=false}={}){
  const parsed=workbook?parseCsv(new TextEncoder().encode(csv)):null
  const file=workbook?{name:'create-only.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(writeWorkbook([{name:'Rows',headers:parsed.headers,rows:parsed.rows.map(row=>row.map(value=>({value,type:'text'})))}]))}:{name:'records.csv',mimeType:'text/csv',buffer:Buffer.from(csv)}
  await tableAction(page,'Import CSV',j.action)
  await page.getByLabel('CSV or Excel file',{exact:true}).setInputFiles(file)
  const match=page.getByLabel(/^Match existing records by/)
  assert.equal(await match.inputValue(),'');assert.equal(await page.getByRole('button',{name:'Preview import',exact:true}).isDisabled(),true)
  await match.selectOption({label:createAll?'Create all rows':'Key'})
  if(createAll){
   const sourceName=workbook?'synthetic-cradle-workbook':'synthetic-cradle-csv'
   await page.getByLabel('Source name',{exact:true}).fill(sourceName)
   await j.action(page.getByRole('button',{name:'Save mapping',exact:true}));await page.getByRole('status').filter({hasText:`Saved ${sourceName}.`}).waitFor()
   await j.action(page.getByRole('button',{name:'Close import',exact:true}));await tableAction(page,'Import CSV',j.action)
   await page.getByLabel('CSV or Excel file',{exact:true}).setInputFiles(file)
   await page.getByLabel(/^Match existing records by/).selectOption({label:'Key'})
   await page.getByLabel(/^Use saved mapping/).selectOption({label:sourceName})
   await page.getByRole('status').filter({hasText:`Using ${sourceName}.`}).waitFor()
   assert.equal(await page.getByLabel(/^Match existing records by/).inputValue(),'_create_all','Saved mapping restores the deliberate create-only choice')
   await j.capture(workbook?'workbook-create-only-mapping':'csv-create-only-mapping')
  }
  const pending=page.waitForResponse(response=>response.url().endsWith('/records/import-preview'))
  await j.action(page.getByRole('button',{name:'Preview import',exact:true}))
  const response=await pending,body=await response.json()
  assert.equal(response.status(),200,JSON.stringify(body));assert.equal(body.data.creates,expected);assert.equal(body.data.rejected,rejected)
  await page.getByRole('heading',{name:'Review import',exact:true}).waitFor()
  const preview=page.getByRole('region',{name:'CSV import changes',exact:true}),text=await preview.innerText()
  assert.ok(text.includes(body.data.rows[0].label));assert.ok(!text.includes(body.data.rows[0].id))
  if(createAll){
   assert.deepEqual([body.data.updates,body.data.unchanged],[0,0]);assert.ok(body.data.rows.every(row=>row.operation==='create'&&row.version===null&&Object.keys(row.before).length===0))
   assert.equal(await preview.getByRole('cell',{name:/^(?:Change\s*)?Rejected$/}).count(),rejected)
   assert.match(text,/Number:.*number/);assert.match(text,/Checked:.*true.*false/)
  }else if(rejected){
   assert.deepEqual([body.data.updates,body.data.unchanged],[1,1])
   assert.equal(await preview.getByRole('cell',{name:/^(?:Change\s*)?Rejected$/}).count(),rejected)
   assert.match(text,/Number:.*number/);assert.match(text,/Checked:.*true.*false/)
   const invalidRow=preview.getByRole('row').filter({hasText:'Bad number'});assert.equal(await invalidRow.getByRole('listitem').count(),2,'One rejected row lists both invalid fields')
   assert.doesNotMatch(text,/invalid_format|invalid_type|Expected canonical/)
  }
  await j.capture(createAll?(workbook?'workbook-create-only-preview':'csv-create-only-preview'):rejected?'csv-mixed-preview':expected?'csv-preview':'csv-idempotent-preview')
  await j.setChecked(page.getByLabel('Import these reviewed changes',{exact:true}),true)
  const result=await j.command(page.getByRole('button',{name:'Import records',exact:true}),'records.import-commit')
  await page.getByRole('button',{name:'New record',exact:true}).waitFor()
  const status=page.getByRole('status').filter({hasText:'Import complete:'});await status.waitFor()
  assert.match(await status.innerText(),new RegExp(expected+' created'));assert.match(await status.innerText(),new RegExp(rejected+' rejected'))
  assert.deepEqual([result.creates,result.updates,result.unchanged,result.rejected],[expected,body.data.updates,body.data.unchanged,rejected])
  return result
 }
 const samples=['comma,here','a "quoted" phrase','line one\nline two','北 café','']
 const csv=encodeCsv(['Key','Text','Number','Checked'],Array.from({length:205},(_,index)=>[`row-${String(index).padStart(3,'0')}`,samples[index%samples.length],'0','false']))
 const source=await build('CSV source');await importCsv(csv,205)
 await j.action(page.getByRole('button',{name:'Next page',exact:true}));await page.waitForLoadState('networkidle');await j.capture('csv-paged-grid')
 await sortAndGroup(page);await page.getByLabel('Sort',{exact:true}).selectOption({label:'Key'});await page.getByLabel('Direction',{exact:true}).selectOption('desc')
 await tableAction(page,'Save view',j.action)
 const editor=page.locator('form.cr-card').filter({has:page.getByRole('heading',{name:'Save this work view'})})
 await editor.getByLabel('Name',{exact:true}).fill('All imported rows')
 const view=await j.command(editor.getByRole('button',{name:'Save view',exact:true}),'view.save')
 await page.reload();await displayAction(page,view.name,j.action)
 await page.getByRole('heading',{name:'All imported rows',exact:true}).waitFor()
 const section=page.locator('section.cr-section').filter({has:page.getByRole('heading',{name:'All imported rows',exact:true})})
 const pending=page.waitForEvent('download');await tableAction(page,'Export CSV',j.action)
 const file=await pending,exported=await readFile(await file.path(),'utf8'),parsed=parseCsv(new TextEncoder().encode(exported))
 assert.equal(parsed.rows.length,205);assert.equal(parsed.rows[0][0],'row-204');assert.equal(parsed.rows.at(-1)[0],'row-000')
 const target=await build('CSV destination');await importCsv(exported,205);await importCsv(exported,0)
 await sortAndGroup(page);await page.getByLabel('Sort',{exact:true}).selectOption({label:'Key'});await page.getByLabel('Direction',{exact:true}).selectOption('desc')
 const pending2=page.waitForEvent('download');await tableAction(page,'Export CSV',j.action)
 const roundtrip=await readFile(await(await pending2).path(),'utf8');assert.equal(roundtrip,exported);await j.capture('csv-roundtrip')
 const mixed=encodeCsv(['Key','Text','Number','Checked'],[
  ['row-000','Changed','12','true'],['row-001',samples[1],'0','false'],['New row','New','2','false'],
  ['Bad number','','not-a-number','maybe'],['Bad checkbox','','1','maybe'],['Duplicate','','1','false'],['Duplicate','','2','false'],
 ])
 await importCsv(mixed,1,4);await j.capture('csv-mixed-imported')
 const createOnly=encodeCsv(['Key','Text','Number','Checked'],[
  ['row-000','Create first','41','true'],['row-000','Create second','42','false'],['','No merge value','43','false'],['Bad number','','invalid','maybe'],
 ])
 await importCsv(createOnly,3,1,{createAll:true});await importCsv(createOnly,3,1,{createAll:true,workbook:true})
 const createdDownload=page.waitForEvent('download');await tableAction(page,'Export CSV',j.action)
 const created=parseCsv(new TextEncoder().encode(await readFile(await(await createdDownload).path(),'utf8')))
 assert.equal(created.rows.length,212)
 assert.deepEqual(created.rows.filter(row=>row[0]==='row-000').map(row=>row.slice(1)).sort(),[['Changed','12','Yes'],['Create first','41','Yes'],['Create first','41','Yes'],['Create second','42','No'],['Create second','42','No']].sort())
 assert.equal(created.rows.filter(row=>row[0]===''&&row[1]==='No merge value'&&row[2]==='43').length,2)
 await j.capture('csv-create-only-imported')
 // A populated table still enforces unique fields when matching is deliberately off.
 await build('CSV create validation',{uniqueCode:true})
 await j.record({Key:'Existing',Text:'Original',Code:'synthetic-cradle-original'})
 const uniqueCsv=encodeCsv(['Key','Text','Number','Checked','Code'],[
  ['Existing','First duplicate','1','false','synthetic-cradle-duplicate'],
  ['Existing','Second duplicate','2','true','synthetic-cradle-duplicate'],
  ['Existing','Stored conflict','3','false','synthetic-cradle-original'],
  ['Existing','Accepted copy','4','true','synthetic-cradle-distinct'],
 ])
 await tableAction(page,'Import CSV',j.action)
 await page.getByLabel('CSV or Excel file',{exact:true}).setInputFiles({name:'synthetic-cradle-validation.csv',mimeType:'text/csv',buffer:Buffer.from(uniqueCsv)})
 await page.getByLabel(/^Match existing records by/).selectOption({label:'Create all rows'})
 const uniquePending=page.waitForResponse(response=>response.url().endsWith('/records/import-preview'))
 await j.action(page.getByRole('button',{name:'Preview import',exact:true}))
 const uniqueResponse=await uniquePending,uniqueBody=await uniqueResponse.json(),uniquePreview=uniqueBody.data
 assert.equal(uniqueResponse.status(),200,JSON.stringify(uniqueBody))
 assert.deepEqual([uniquePreview.creates,uniquePreview.updates,uniquePreview.unchanged,uniquePreview.rejected],[1,0,0,3])
 const uniqueRegion=page.getByRole('region',{name:'CSV import changes',exact:true})
 assert.equal(await uniqueRegion.getByRole('cell',{name:/^(?:Change\s*)?Rejected$/}).count(),3)
 assert.equal(await uniqueRegion.getByText(/Code unique:/).count(),3)
 assert.match(await uniqueRegion.innerText(),/Accepted copy/)
 await j.capture('csv-create-only-unique-preview')
 await j.setChecked(page.getByLabel('Import these reviewed changes',{exact:true}),true)
 const uniqueReceipt=await j.command(page.getByRole('button',{name:'Import records',exact:true}),'records.import-commit')
 assert.deepEqual(uniqueReceipt,{id:uniquePreview.id,creates:1,updates:0,unchanged:0,rejected:3})
 const uniqueDownload=page.waitForEvent('download');await tableAction(page,'Export CSV',j.action)
 const uniqueRows=parseCsv(new TextEncoder().encode(await readFile(await(await uniqueDownload).path(),'utf8')))
 assert.equal(uniqueRows.rows.length,2)
 assert.deepEqual(uniqueRows.rows.map(row=>[row[0],row[1],row[4]]).sort(),[['Existing','Original','synthetic-cradle-original'],['Existing','Accepted copy','synthetic-cradle-distinct']].sort())
 await j.capture('csv-create-only-unique-imported')
 return {source:source.appId,destination:target.appId,rows:205,exactRoundtrip:true,idempotent:true,mixedRowsImported:true}
}
