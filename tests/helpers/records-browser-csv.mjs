import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {encodeCsv,parseCsv} from '../../src/domains/portability/csv.ts'

export async function exerciseCsv(page,j,origin,width){
 async function build(name){
  await page.goto(origin+'/app/records')
  await j.action(page.getByRole('button',{name:'Create base',exact:true}))
  await page.getByLabel('Base name',{exact:true}).fill(`${name} ${width}`)
  await page.getByLabel('Table name',{exact:true}).fill('Rows')
  await page.getByLabel('Field name',{exact:true}).fill('Key')
  await j.field('Text');await j.field('Number','number');await j.field('Checked','boolean')
  return j.adopt()
 }
 async function importCsv(csv,expected,rejected=0){
  await j.action(page.getByRole('button',{name:'Import CSV',exact:true}))
  await page.getByLabel('CSV file',{exact:true}).setInputFiles({name:'records.csv',mimeType:'text/csv',buffer:Buffer.from(csv)})
  await page.getByLabel(/^Match existing records by/).selectOption({label:'Key'})
  const pending=page.waitForResponse(response=>response.url().endsWith('/records/import-preview'))
  await j.action(page.getByRole('button',{name:'Preview import',exact:true}))
  const response=await pending,body=await response.json()
  assert.equal(response.status(),200,JSON.stringify(body));assert.equal(body.data.creates,expected);assert.equal(body.data.rejected,rejected)
  await page.getByRole('heading',{name:'Review import',exact:true}).waitFor()
  const preview=page.getByRole('region',{name:'CSV import changes',exact:true}),text=await preview.innerText()
  assert.ok(text.includes(body.data.rows[0].label));assert.ok(!text.includes(body.data.rows[0].id))
  if(rejected){
   assert.deepEqual([body.data.updates,body.data.unchanged],[1,1])
   assert.equal(await preview.getByRole('cell',{name:/^(?:Change\s*)?Rejected$/}).count(),rejected)
   assert.match(text,/Number:.*number/);assert.match(text,/Checked:.*true.*false/)
   assert.doesNotMatch(text,/invalid_format|invalid_type|Expected canonical/)
  }
  await j.capture(rejected?'csv-mixed-preview':expected?'csv-preview':'csv-idempotent-preview')
  await j.setChecked(page.getByLabel('Import these reviewed changes',{exact:true}),true)
  const result=await j.command(page.getByRole('button',{name:'Import records',exact:true}),'records.import-commit')
  await page.getByRole('button',{name:'New record',exact:true}).waitFor()
  const status=page.getByRole('status').filter({hasText:'Import complete:'});await status.waitFor()
  assert.match(await status.innerText(),new RegExp(expected+' created'));assert.match(await status.innerText(),new RegExp(rejected+' rejected'))
  return result
 }
 const samples=['comma,here','a "quoted" phrase','line one\nline two','北 café','']
 const csv=encodeCsv(['Key','Text','Number','Checked'],Array.from({length:205},(_,index)=>[`row-${String(index).padStart(3,'0')}`,samples[index%samples.length],'0','false']))
 const source=await build('CSV source');await importCsv(csv,205)
 await j.action(page.getByRole('button',{name:'Next page',exact:true}));await page.waitForLoadState('networkidle');await j.capture('csv-paged-grid')
 await page.getByLabel('Sort',{exact:true}).selectOption({label:'Key'});await page.getByLabel('Direction',{exact:true}).selectOption('desc')
 await j.action(page.getByRole('button',{name:'Save view',exact:true}))
 const editor=page.locator('form.cr-card').filter({has:page.getByRole('heading',{name:'Save this work view'})})
 await editor.getByLabel('Name',{exact:true}).fill('All imported rows')
 const view=await j.command(editor.getByRole('button',{name:'Save view',exact:true}),'view.save')
 await page.reload();await j.action(page.getByText('Saved views',{exact:true}));await page.getByLabel('Saved view',{exact:true}).selectOption(view.id)
 await page.getByRole('heading',{name:'All imported rows',exact:true}).waitFor()
 const section=page.locator('section.cr-section').filter({has:page.getByRole('heading',{name:'All imported rows',exact:true})})
 const pending=page.waitForEvent('download');await j.action(section.getByRole('button',{name:'Export CSV',exact:true}))
 const file=await pending,exported=await readFile(await file.path(),'utf8'),parsed=parseCsv(new TextEncoder().encode(exported))
 assert.equal(parsed.rows.length,205);assert.equal(parsed.rows[0][0],'row-204');assert.equal(parsed.rows.at(-1)[0],'row-000')
 const target=await build('CSV destination');await importCsv(exported,205);await importCsv(exported,0)
 await page.getByLabel('Sort',{exact:true}).selectOption({label:'Key'});await page.getByLabel('Direction',{exact:true}).selectOption('desc')
 const pending2=page.waitForEvent('download');await j.action(page.getByRole('button',{name:'Export CSV',exact:true}))
 const roundtrip=await readFile(await(await pending2).path(),'utf8');assert.equal(roundtrip,exported);await j.capture('csv-roundtrip')
 const mixed=encodeCsv(['Key','Text','Number','Checked'],[
  ['row-000','Changed','12','true'],['row-001',samples[1],'0','false'],['New row','New','2','false'],
  ['Bad number','','not-a-number','false'],['Bad checkbox','','1','maybe'],['Duplicate','','1','false'],['Duplicate','','2','false'],
 ])
 await importCsv(mixed,1,4);await j.capture('csv-mixed-imported')
 return {source:source.appId,destination:target.appId,rows:205,exactRoundtrip:true,idempotent:true,mixedRowsImported:true}
}
