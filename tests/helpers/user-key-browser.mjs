import {adminAuditBrowser} from './admin-audit-browser.mjs'
import assert from 'node:assert/strict'

export async function userKeyBrowser(page,h,journey,width) {
 await page.goto(h.origin+'/app/settings/')
 await page.waitForLoadState('networkidle')
 await page.locator('summary').filter({hasText:/^API keys$/}).click()
 await page.waitForLoadState('networkidle')
 const content=page.locator('section').filter({has:page.getByRole('heading',{name:'API keys',exact:true})}).last()
 await content.getByLabel(/^Application/).selectOption(h.appId)
 await content.getByLabel('Key name',{exact:true}).fill(`Browser reader ${width}`)
 await content.getByLabel(/^Record type/).selectOption(h.entityId)
 const issuedResponse=page.waitForResponse(response=>response.url().endsWith('/api/user-keys')&&response.request().method()==='POST')
 await content.getByRole('button',{name:'Issue API key',exact:true}).click()
 const issued=await issuedResponse;assert.equal(issued.status(),201)
 const key=(await issued.json()).data.key
 assert.equal(await content.getByLabel(/^API key/).evaluate(input=>input.value.length>32),true)
 await content.getByRole('button',{name:'I saved this key',exact:true}).click()
 assert.equal(await content.getByLabel(/^API key/).count(),0)
 await journey.capture('user-key-issued')
 await page.reload()
 await page.waitForLoadState('networkidle')
 await page.locator('summary').filter({hasText:/^API keys$/}).click()
 await content.getByLabel(/^Application/).selectOption(h.appId)
 const revoke=page.waitForResponse(response=>response.url().endsWith(`/api/user-keys/${key.id}/revoke`))
 await content.getByRole('button',{name:`Revoke Browser reader ${width}`,exact:true}).click()
 assert.equal((await revoke).status(),200)
 await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`,{secret:key.secret,status:401})
 assert.equal(await content.getByLabel(/^API key/).count(),0)
 await journey.capture('user-key-revoked')
 await adminAuditBrowser(page,h,journey)
}
