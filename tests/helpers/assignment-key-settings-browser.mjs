import assert from 'node:assert/strict'
import path from 'node:path'

/** The existing Settings key form defaults to REST; an owner explicitly selects agent tools. */
export async function assignmentKeySettingsBrowser(page,h,output){
 await page.setViewportSize({width:1440,height:1000})
 await page.goto(h.origin+'/app/settings')
 await page.waitForLoadState('networkidle')
 await page.locator('summary').filter({hasText:/^API keys$/}).click()
 await page.waitForLoadState('networkidle')
 const panel=page.locator('section.cr-section').filter({has:page.getByRole('heading',{name:'API keys',exact:true})})
 await panel.getByLabel('Application',{exact:true}).selectOption(h.appId)
 const audience=panel.getByLabel('Use this key with',{exact:true})
 await audience.waitFor()
 assert.equal(await audience.inputValue(),'api','An owner must explicitly choose MCP for an agent key')
 await panel.getByLabel('Record type',{exact:true}).selectOption(h.entityId)
 await panel.getByLabel('Access',{exact:true}).selectOption('write')
 await audience.selectOption('mcp')
 assert.equal(await audience.inputValue(),'mcp','The Settings form exposes the isolated MCP audience')
 for(const width of process.env.CRADLE_WATCH_SCREENSHOTS?[1440,390]:[1440]){
  await page.setViewportSize({width,height:1000})
  await page.screenshot({path:path.join(output,`mcp-key-settings-${width}.png`),fullPage:true})
 }
}
