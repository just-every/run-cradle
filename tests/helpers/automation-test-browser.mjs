import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
export async function automationTestBrowser(page,h,width){
 const panel=page.getByRole('region',{name:'Test automation',exact:true})
 await panel.getByRole('combobox').first().selectOption({label:`Browser trigger ${width}`})
 const response=page.waitForResponse(response=>response.url().endsWith('/test')&&response.request().method()==='POST')
 await panel.getByRole('button',{name:'Run test',exact:true}).click()
 const result=await response;assert.equal(result.status(),200,await result.text());assert.equal((await result.json()).data.state,'Complete')
 await panel.getByText('Test · Complete',{exact:true}).waitFor();await panel.locator('summary').first().click()
 await page.waitForLoadState('networkidle')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 const axe=await new AxeBuilder({page}).analyze();assert.deepEqual(axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(node=>node.target)})),[])
 await mkdir('docs/contract/AUTO-USER-005',{recursive:true});await panel.scrollIntoViewIfNeeded();await page.evaluate(()=>scrollBy(0,-100));await page.screenshot({path:`docs/contract/AUTO-USER-005/test-panel-${width}.png`,fullPage:false})
}
