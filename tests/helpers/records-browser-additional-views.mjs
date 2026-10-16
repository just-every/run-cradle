import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {parseCsv} from '../../src/domains/portability/csv.ts'

export async function additionalViews(page,j,origin,appId){
 await page.goto(`${origin}/app/records/${appId}`);await j.table('Deals')
 await page.getByLabel('Sort',{exact:true}).selectOption({label:'Deal'});await page.getByLabel('Direction',{exact:true}).selectOption('asc')
 const receipts=[];let baseline
 for(const display of ['cards','calendar','timeline','agenda']){
  await page.getByLabel('Sort',{exact:true}).selectOption({label:'Deal'});await page.getByLabel('Direction',{exact:true}).selectOption('asc');await page.waitForLoadState('networkidle');await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'))
  await j.action(page.getByRole('button',{name:'Save view',exact:true}))
  const editor=page.locator('form.cr-card').filter({has:page.getByRole('heading',{name:'Save this work view'})}),name=`Deals ${display}`
  await editor.getByLabel('Name',{exact:true}).fill(name);await editor.getByLabel('Display',{exact:true}).selectOption(display)
  if(display!=='cards')await editor.getByLabel('Date',{exact:true}).selectOption({label:'Close date'})
  if(display==='timeline')await editor.getByLabel('End date',{exact:true}).selectOption({label:'Close date'})
  const saved=await j.command(editor.getByRole('button',{name:'Save view',exact:true}),'view.save')
  await page.reload();await j.action(page.getByRole('navigation',{name:'Saved views',exact:true}).getByRole('button',{name:saved.name,exact:true}))
  const section=page.locator('section.cr-section').filter({has:page.getByRole('heading',{name,exact:true})});await section.waitFor();assert.match(await section.innerText(),/First deal/);assert.match(await section.innerText(),/Third deal/)
  if(display!=='cards')assert.match(await section.innerText(),/Unscheduled/)
  if(display==='timeline')assert.match(await section.innerText(),/2027-01-15.*→ 2027-01-15/s)
  const download=page.waitForEvent('download');await j.action(section.getByRole('button',{name:'Export CSV',exact:true}));const csv=await readFile(await(await download).path(),'utf8')
  assert.equal(parseCsv(new TextEncoder().encode(csv)).rows.length,4);if(baseline)assert.equal(csv,baseline);else baseline=csv
  await j.capture(`saved-${display}`);receipts.push({display,id:saved.id,exportedRows:4})
  await j.action(page.getByRole('navigation',{name:'Record display',exact:true}).getByRole('button',{name:'Grid',exact:true}))
 }
 return receipts
}
