import assert from 'node:assert/strict'
import { browserCookies } from './session-cookies.mjs'

export async function verifyDecisionLensScreens({h,page,command,capture}) {
 const entities={campaign:'00000000000000000000000701',decision:'00000000000000000000000705',lens:'00000000000000000000000706'}
 const expected=(kind,row)=>[{ref:{appId:'00000000000000000000000700',entityId:entities[kind],recordId:row.id},version:row.version}]
 const create=async(action,input,revisions=[]) => (await command(action,input,revisions)).data.value
 const width=page.viewportSize().width
 const campaign=await create('campaign.create',{fields:{code:`DEC-SCREEN-${width}`,name:'Supplier readiness review',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2026-12-01',objective:'Confirm supplier readiness',statusSummary:'Reviewing updated evidence',phase:'Planning',status:'On track',health:70,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const fields={campaignId:campaign.id,riskId:null,supersedesId:null,title:'Packaging approval',requesterId:h.owner,assigneeId:null,priority:'High',dueAt:'2026-12-01T12:00:00.000Z',recommendation:'Require current supplier evidence',impact:'Release scope'}
 const initial=await create('decision.create',{fields})
 const prior=await create('decision.outcome',{id:initial.id,outcome:'Rejected',rationale:'New supplier evidence is required'},expected('decision',initial))
 const replacement=await create('decision.supersede',{id:prior.id,fields:{...fields,title:'Updated packaging approval'}},expected('decision',prior))
 await page.goto(`${h.origin}/app/decisions/${prior.id}`)
 await page.getByRole('heading',{name:prior.title,exact:true}).waitFor()
 const related=page.getByRole('region',{name:'Related decisions',exact:true})
 const next=related.getByRole('link',{name:replacement.title,exact:true})
 assert.equal(await next.getAttribute('href'),`/app/decisions/${replacement.id}`)
 await capture('clause-decision-superseded')
 await next.click();await page.getByRole('heading',{name:replacement.title,exact:true}).waitFor()
 assert.equal(await page.getByRole('region',{name:'Related decisions',exact:true}).getByRole('link',{name:prior.title,exact:true}).getAttribute('href'),`/app/decisions/${prior.id}`)
 await capture('clause-decision-superseding')

 await page.goto(`${h.origin}/app/lenses/new`)
 await page.getByRole('heading',{name:'Create a Lens',exact:true}).waitFor()
 await page.waitForLoadState('networkidle')
 await page.getByLabel('Lens name',{exact:true}).fill(`Supplier review ${width}`)
 await page.getByLabel('Description',{exact:true}).fill('Review supplier evidence before release.')
 await page.getByRole('button',{name:'Add condition',exact:true}).click()
 await page.getByLabel('Condition 1 field',{exact:true}).selectOption('title')
 await page.getByLabel('Condition 1 operator',{exact:true}).selectOption('equals')
 await page.getByLabel('Condition 1 value',{exact:true}).fill(`No matching supplier risk ${width}`)
 await page.getByRole('button',{name:'Preview',exact:true}).click()
 await page.getByRole('heading',{name:'No matching records',exact:true}).waitFor()
 await capture('clause-lens-preview-zero')
 const saveStartedAt=Date.now()
 await page.getByRole('button',{name:'Save lens',exact:true}).click()
 const open=page.getByRole('link',{name:'Open saved lens',exact:true})
 await open.waitFor()
 const saveFinishedAt=Date.now()
 await capture('clause-lens-saved')
 const url=await open.getAttribute('href')
 await open.click();await page.getByRole('heading',{name:`Supplier review ${width}`,exact:true}).waitFor()
 await page.getByRole('heading',{name:'No matching records',exact:true}).waitFor()
 await capture('clause-lens-shared')
 const id=new URL(url,h.origin).pathname.split('/')[3]
 const response=await h.request(h.ownerSession,`/api/lenses/${id}`)
 assert.equal(response.status,200)
 const lens=(await response.json()).lens
 assert.equal(lens.createdById,h.owner,'Browser save records the independently known current operator')
 assert.ok(Number.isFinite(lens.createdAt)&&lens.createdAt>=saveStartedAt&&lens.createdAt<=saveFinishedAt,'Browser save creation time falls within independently observed save bounds')
 const colleague=await h.addPerson({name:'Lens browser colleague'})
 assert.notEqual(colleague.id,h.owner)
 const sharedResponse=await h.request(colleague.session,`/api/lenses/${id}`)
 assert.equal(sharedResponse.status,200)
 const shared=(await sharedResponse.json()).lens
 assert.equal(shared.createdById,h.owner,'A different current operator reads the original saver')
 assert.equal(shared.createdAt,lens.createdAt,'A different current operator reads the same creation time')
 const sharedContext=await page.context().browser().newContext({viewport:page.viewportSize()})
 try {
  await sharedContext.addCookies(browserCookies(colleague.session.cookie,h.origin))
  const sharedPage=await sharedContext.newPage()
  const document=await sharedPage.goto(new URL(url,h.origin).href)
  assert.equal(document.status(),200,'Another operator opens the URL produced by the browser save')
  await sharedPage.getByRole('heading',{name:`Supplier review ${width}`,exact:true}).waitFor()
  await sharedPage.getByRole('heading',{name:'No matching records',exact:true}).waitFor()
 } finally {await sharedContext.close()}
 await create('lens.delete',{id},expected('lens',lens))
 await create('campaign.delete',{id:campaign.id,confirmationCode:campaign.code},expected('campaign',campaign))
}
