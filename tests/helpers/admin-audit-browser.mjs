import assert from 'node:assert/strict'

export async function adminAuditBrowser(page,h,journey){
 await page.goto(h.origin+'/app/settings/')
 await page.waitForLoadState('networkidle')
 await page.locator('summary').filter({hasText:/^Admin audit log$/}).click()
 const panel=page.getByRole('region',{name:'Admin audit log',exact:true})
 await panel.getByRole('link',{name:'Export CSV',exact:true}).waitFor()
 await panel.getByLabel('Base',{exact:true}).selectOption(h.appId)
 await panel.getByLabel('Person',{exact:true}).selectOption({label:'Import owner'})
 await panel.getByLabel('From',{exact:true}).fill('2020-01-01T00:00')
 await panel.getByLabel('Through',{exact:true}).fill('2099-01-01T00:00')
 await panel.getByRole('button',{name:'Apply filters',exact:true}).click()
 await panel.getByRole('link',{name:'Export JSON',exact:true}).waitFor()
 assert.ok(await panel.getByText('credential.issue',{exact:true}).count(),'The issued key is recorded')
 assert.ok(await panel.getByText('credential.revoke',{exact:true}).count(),'The revoked key is recorded')
 assert.ok((await panel.getByRole('link',{name:'Export CSV',exact:true}).getAttribute('href')).includes(h.appId))
 await journey.capture('admin-audit-filtered')
}
