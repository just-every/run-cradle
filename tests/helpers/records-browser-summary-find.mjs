import assert from 'node:assert/strict'

/** The operating view keeps its grouping while summaries and readable link matches span its cells. */
export async function summaryAndFind(page,j){
 await j.action(page.getByRole('button',{name:'Summary',exact:true}))
 const summary=page.getByRole('region',{name:'Whole-query summary',exact:true})
 await summary.getByRole('combobox',{name:/^Summary field/}).selectOption({label:'Value'})
 await summary.getByRole('combobox',{name:/^Calculation/}).selectOption('sum')
 await j.action(summary.getByRole('button',{name:'Calculate summary',exact:true}))
 await summary.locator('strong').filter({hasText:/325\.25$/}).waitFor()
 assert.match(await summary.getByRole('listitem').filter({hasText:'Stage: New'}).innerText(),/2$/)
 assert.match(await summary.getByRole('listitem').filter({hasText:'Stage: Qualified'}).innerText(),/1$/)
 await j.capture('whole-query-summary')
 await j.action(page.getByRole('button',{name:'Summary',exact:true}))
 await j.action(page.getByRole('button',{name:'Find in view',exact:true}))
 const input=page.getByLabel('Find in visible fields',{exact:true}),find=input.locator('xpath=ancestor::form')
 await input.fill('Acme 北');await j.action(find.getByRole('button',{name:'Find',exact:true}))
 await find.getByRole('status').filter({hasText:/^1 of 2 /}).waitFor()
 await page.locator('td.cr-grid-match[data-label="Company link"]').waitFor()
 await input.press('Enter');await find.getByRole('status').filter({hasText:/^2 of 2 /}).waitFor()
 await page.locator('td.cr-grid-match[data-label="Company name"]').waitFor()
 await input.press('Shift+Enter');await find.getByRole('status').filter({hasText:/^1 of 2 /}).waitFor()
 await j.capture('find-readable-link')
 await input.fill('');await j.action(page.getByRole('button',{name:'Find in view',exact:true}))
}
