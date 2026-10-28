import assert from 'node:assert/strict'
import {browserCookies} from './session-cookies.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function guestAccessBrowser(browser,h,world,output){
 for(const width of [1440,390]){
  const owner=await browser.newContext({viewport:{width,height:width===390?844:960}})
  try{
   await owner.addCookies(browserCookies(h.cookie,h.origin))
   const page=await owner.newPage(),journey=recordsJourney(page,h.origin,output,width)
   await page.goto(h.origin+'/app/settings')
   const section=page.locator('details').filter({has:page.locator('summary').getByText('Guests',{exact:true})})
   await section.locator('summary').click()
   await page.getByLabel('Guest name',{exact:true}).fill('Guest reviewer')
   const email=['synthetic-cradle-'+createUlid().toLowerCase(),'example.test'].join('@')
   await page.getByLabel('Guest email',{exact:true}).fill(email)
   await page.getByLabel('Shared base',{exact:true}).selectOption(world.shared.appId)
   await journey.capture('guest-invitation')
   const sent=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/v1/guests/invite'))
   await page.getByRole('button',{name:'Invite guest',exact:true}).click()
   const response=await sent,payload=await response.json()
   assert.equal(response.status(),200,JSON.stringify(payload));assert.equal(payload.data.state,'committed')
   await section.getByRole('heading',{name:'Guest reviewer',exact:true}).last().waitFor()
   assert.equal((await h.mailMessages()).some(message=>message.personalizations.some(group=>group.to.some(person=>person.email===email))),true,'The Settings invitation sends to the entered guest')
   await journey.capture('guest-invited')
  }finally{await owner.close()}
  const context=await browser.newContext({viewport:{width,height:width===390?844:960}})
  try{
   await context.addCookies(browserCookies(world.cookie,h.origin))
   const page=await context.newPage(),journey=recordsJourney(page,h.origin,output,width)
   await page.goto(h.origin+'/app')
   await page.getByRole('heading',{name:world.shared.name,exact:true}).waitFor()
   await page.getByText(world.shared.recordName,{exact:true}).first().waitFor()
   assert.equal(await page.getByRole('button',{name:'New record',exact:true}).isDisabled(),true)
   if(width===390){
    const open=page.getByRole('button',{name:'Open navigation',exact:true})
    await open.focus();assert.equal(await page.getByRole('tooltip',{name:'Open navigation',exact:true}).isVisible(),true)
    await open.click()
   }
   const nav=width===390?page.getByRole('dialog',{name:'Navigation',exact:true}):page.locator('.operator-rail')
   const links=await nav.locator('a[href^="/app"]').evaluateAll(items=>items.filter(item=>item.textContent.trim()).map(item=>item.getAttribute('href')))
   assert.deepEqual([...new Set(links)].sort(),['/app','/app/records','/app/search'],'Only the shared records and search navigation is offered')
   for(const name of ['Settings','Automations','Notifications','App studio'])assert.equal(await nav.getByRole('link',{name,exact:true}).count(),0)
   await journey.capture('guest-navigation')
   if(width===390)await page.getByRole('button',{name:'Close navigation',exact:true}).click()
   await page.getByRole('button',{name:/^Base ▾/}).click()
   const menu=page.getByRole('dialog',{name:'Base',exact:true})
   assert.equal(await menu.getByRole('link',{name:world.shared.name,exact:true}).count(),1)
   assert.equal(await menu.getByRole('link',{name:world.other.name,exact:true}).count(),0)
   assert.equal(await menu.getByRole('button',{name:'New base',exact:true}).count(),0)
   assert.equal(await menu.getByRole('button',{name:'People',exact:true}).count(),0)
   await journey.capture('guest-base-menu')
   await page.keyboard.press('Escape')
   await page.goto(h.origin+'/app/search')
   await page.getByLabel('Search all bases',{exact:true}).fill(world.shared.recordName)
   const search=page.waitForResponse(response=>response.url().includes('/api/search?')&&response.status()===200)
   await page.getByRole('button',{name:'Search',exact:true}).click();await search
   await page.getByRole('link',{name:world.shared.recordName,exact:true}).waitFor()
   assert.equal(await page.getByText(world.other.recordName,{exact:true}).count(),0)
   await journey.capture('guest-search-visible')
   await page.getByLabel('Search all bases',{exact:true}).fill(world.other.recordName)
   const hidden=page.waitForResponse(response=>response.url().includes('/api/search?')&&response.status()===200)
   await page.getByRole('button',{name:'Search',exact:true}).click();await hidden
   await page.getByRole('heading',{name:'No matching records',exact:true}).waitFor()
   assert.equal(await page.getByRole('link',{name:world.other.recordName,exact:true}).count(),0)
   await journey.capture('guest-search-isolated')
  }finally{await context.close()}
 }
}
