import {assignmentKeySettingsBrowser} from './assignment-key-settings-browser.mjs'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {baseAction} from './records-base-menu.mjs'
import {chromium} from '@playwright/test'

/** The native Settings forms are exercised once; phone proof reuses their saved state. */
export async function recordWatchBrowser(h,record){
 const output=path.resolve(process.env.CRADLE_WATCH_SCREENSHOTS??'.private/record-watch'),browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium',args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 await mkdir(output,{recursive:true})
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message));await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
  await page.goto(`${h.origin}/app/records/${h.appId}/${h.entityId}/${record.id}`)
  await page.getByRole('heading',{name:'Assigned native work',exact:true}).waitFor()
  await page.getByText('Record actions',{exact:true}).click();const actions=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Record actions$/})}).first()
  await actions.locator('summary').filter({hasText:/^Settings$/}).click()
  const form=page.getByRole('form',{name:'Record watch settings',exact:true})
  await form.getByLabel('Watch record',{exact:true}).check();await form.getByLabel('Notification timing',{exact:true}).selectOption('daily');await form.getByLabel('Slack',{exact:true}).check()
  await form.getByRole('button',{name:'Save watch settings',exact:true}).click();await actions.getByRole('status').filter({hasText:'Watch settings saved.'}).waitFor()
  await page.reload();await page.getByText('Record actions',{exact:true}).click();await page.locator('summary').filter({hasText:/^Settings$/}).click()
  assert.equal(await form.getByLabel('Watch record',{exact:true}).isChecked(),true);assert.equal(await form.getByLabel('Notification timing',{exact:true}).inputValue(),'daily');assert.equal(await form.getByLabel('Slack',{exact:true}).isChecked(),true)
  for(const width of process.env.CRADLE_WATCH_SCREENSHOTS?[1440,390]:[1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(output,`record-watch-${width}.png`),fullPage:true})}
  await page.setViewportSize({width:1440,height:1000});await form.getByRole('button',{name:'Unwatch record',exact:true}).click();await actions.getByRole('status').filter({hasText:'Watch settings saved.'}).waitFor();assert.equal(await form.getByLabel('Watch record',{exact:true}).isChecked(),false)
  await page.goto(`${h.origin}/app/records/${h.appId}/${h.entityId}`)
  await page.getByRole('button',{name:'Table tools',exact:true}).click()
  await page.locator('summary').filter({hasText:/^Settings$/}).click()
  const table=page.getByRole('form',{name:'Table watch settings',exact:true});await table.getByLabel('Watch table',{exact:true}).check();await table.getByRole('button',{name:'Save watch settings',exact:true}).click();await page.getByRole('status').filter({hasText:'Watch settings saved.'}).waitFor();assert.equal(await table.getByLabel('Watch table',{exact:true}).isChecked(),true)
  for(const width of process.env.CRADLE_WATCH_SCREENSHOTS?[1440,390]:[1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(output,`table-watch-${width}.png`),fullPage:true})}
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Close',exact:true}).click()
  await baseAction(page,'Edit fields');const assignee=page.getByRole('group',{name:'Assignee',exact:true});assert.equal(await assignee.getByLabel('Notify people when they’re added',{exact:true}).isChecked(),true)
  for(const width of process.env.CRADLE_WATCH_SCREENSHOTS?[1440,390]:[1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(output,`assignment-field-${width}.png`),fullPage:true})}
  await assignmentKeySettingsBrowser(page,h,output)
  assert.deepEqual(errors,[])
  await context.close()
 }finally{await browser.close()}
}
