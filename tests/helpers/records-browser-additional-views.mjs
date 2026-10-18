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
  const section=page.locator('section.cr-section').filter({has:page.getByRole('heading',{name,exact:true})});await section.waitFor();await section.getByText('First deal',{exact:true}).first().waitFor();assert.match(await section.innerText(),/First deal/);assert.match(await section.innerText(),/Third deal/)
  if(display!=='cards')assert.match(await section.innerText(),/Unscheduled/)
  if(display==='timeline')assert.match(await section.innerText(),/2027-01-15.*→ 2027-01-15/s)
  // Every selected field is rendered, including fields beside a calendar title.
  await page.getByRole('button',{name:'Find in view',exact:true}).click()
  const input=page.getByLabel('Find in visible fields',{exact:true}),find=input.locator('xpath=ancestor::form')
  await input.fill('deal');await input.press('Enter')
  await find.getByRole('status').filter({hasText:/^1 of 3 matching cells$/}).waitFor()
  const seen=new Set()
  for(let index=0;index<3;index++){
   const match=section.locator('.cr-view-match');await match.waitFor()
   seen.add(await match.getAttribute('data-record-id'))
   const bounds=await match.boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y<page.viewportSize().height,`${display}: selected match is scrolled into view`)
   if(index<2)await input.press('Enter')
  }
  assert.equal(seen.size,3)
  await input.press('Shift+Enter');await find.getByRole('status').filter({hasText:/^2 of 3 matching cells$/}).waitFor()
  await input.fill('125.25');await input.press('Enter')
  await find.getByRole('status').filter({hasText:/^1 of 1 matching cells$/}).waitFor()
  await section.locator('.cr-view-match').filter({hasText:'125.25'}).waitFor()
  await input.fill('');await page.getByRole('button',{name:'Find in view',exact:true}).click()
  const download=page.waitForEvent('download');await j.action(section.getByRole('button',{name:'Export CSV',exact:true}));const csv=await readFile(await(await download).path(),'utf8')
  assert.equal(parseCsv(new TextEncoder().encode(csv)).rows.length,4);if(baseline)assert.equal(csv,baseline);else baseline=csv
  await j.capture(`saved-${display}`);receipts.push({display,id:saved.id,exportedRows:4})
  await j.action(page.getByRole('navigation',{name:'Record display',exact:true}).getByRole('button',{name:'Grid',exact:true}))
 }
 return receipts
}
