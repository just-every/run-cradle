import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import {LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

// CAMP-007 on the Campaign Grid: the three built-in views, filter, group, sort and visible fields,
// each view re-queried on open and on refresh, and no view interaction writing any record.
// Invoked by the walkthrough on its empty campaign fixture; it removes its campaigns after.
export async function verifyGridViewScreens({h,page,command,capture}){
 const width=page.viewportSize().width,code=`GRID-${width}`
 const create=async(action,input,expected=[])=>(await command(action,input,expected)).data.value
 const ref=row=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:row.id},version:row.version}]
 const other=await h.addPerson({name:`Rowan Planner ${width}`})
 const campaign=(suffix,name,phase,ownerId,status='On track')=>create('campaign.create',{fields:{code:`${code}-${suffix}`,name,ownerId,startDate:'2026-01-01',launchDate:'2026-12-01',objective:'Compare the grid views',statusSummary:'Grid views',phase,status,health:60,budgetMinor:150000,spendMinor:0,tags:[],customFields:{}}})
 await campaign('A','Atlas launch','Planning',h.owner)
 await campaign('B','Beacon launch','Launch prep',h.owner,'Watch')
 let cedar=await campaign('C','Cedar launch','Build',other.id)
 const delta=await campaign('D','Delta launch','Planning',h.owner)
 await create('campaign.archive',{id:delta.id},ref(delta))
 const stored=async()=>({campaigns:(await h.db.prepare('SELECT id,version,updated_at FROM campaigns ORDER BY id').all()).results,commands:(await h.db.prepare('SELECT count(*) n FROM command_admissions').first()).n})
 const before=await stored()

 await page.goto(`${h.origin}/app/campaigns`)
 await page.getByRole('heading',{name:'Campaign Grid',exact:true}).waitFor()
 const table=await page.locator('.portfolio-campaign-table').isVisible()
 const names=()=>page.locator(table?'.portfolio-campaign-table tbody th a strong':'.portfolio-campaign-cards li a strong')
 const groups=()=>page.locator(table?'.portfolio-group-row th':'.portfolio-card-group h3')
 const view=name=>page.getByRole('tab',{name,exact:true}).click()
 await page.getByLabel('Sort',{exact:true}).selectOption('name:asc')
 await expect(names()).toHaveText(['Atlas launch','Beacon launch','Cedar launch'])
 await view('Launch prep');await expect(names()).toHaveText(['Beacon launch'])
 await view('My campaigns');await expect(names()).toHaveText(['Atlas launch','Beacon launch'])
 await view('All active');await page.getByLabel('Status',{exact:true}).selectOption('On track')
 await expect(names()).toHaveText(['Atlas launch','Cedar launch'])
 await page.getByLabel('Status',{exact:true}).selectOption('')
 await page.getByLabel('Group',{exact:true}).selectOption('owner')
 await expect(groups()).toHaveText(['Mira Example · 2 campaigns',`Rowan Planner ${width} · 1 campaign`])
 await page.getByLabel('Group',{exact:true}).selectOption('phase')
 await expect(groups()).toHaveText(['Planning · 1 campaign','Build · 1 campaign','Launch prep · 1 campaign'])
 await expect(names()).toHaveText(['Atlas launch','Cedar launch','Beacon launch'])

 // Visible fields: hidden columns stay hidden after reload; the name is always shown.
 const fields=page.getByRole('group',{name:'Visible fields',exact:true})
 await page.getByRole('button',{name:'Visible fields',exact:true}).click()
 await fields.getByLabel('Budget',{exact:true}).uncheck();await fields.getByLabel('Owner',{exact:true}).uncheck()
 const shownFields=async()=>table?page.locator('.portfolio-campaign-table thead th').allTextContents():page.locator('.portfolio-campaign-cards > li:not(.portfolio-card-group)').first().evaluate(card=>({budget:card.innerText.includes('Budget'),owner:Boolean(card.querySelector('.portfolio-person'))}))
 const reduced=table?['','Campaign','Phase','Launch','Status','Risk','Inspect']:{budget:false,owner:false}
 await expect.poll(shownFields).toEqual(reduced)
 await page.reload();await expect(groups()).toHaveText(['Planning · 1 campaign','Build · 1 campaign','Launch prep · 1 campaign'])
 await expect.poll(shownFields).toEqual(reduced)
 await page.getByRole('button',{name:'Visible fields',exact:true}).click()
 await expect(fields.getByLabel('Budget',{exact:true})).not.toBeChecked()
 await capture('campaign-grid-grouped-fields')
 await fields.getByLabel('Budget',{exact:true}).check();await fields.getByLabel('Owner',{exact:true}).check()
 await expect.poll(shownFields).toEqual(table?['','Campaign','Phase','Owner','Launch','Budget','Status','Risk','Inspect']:{budget:true,owner:true})
 assert.deepEqual(await stored(),before,'Opening, filtering, grouping, sorting and choosing fields change no record')

 // Each view re-queries on open and on refresh; a change made elsewhere appears then.
 await page.getByLabel('Group',{exact:true}).selectOption('none')
 await view('Launch prep');await expect(names()).toHaveText(['Beacon launch'])
 cedar=await create('campaign.patch',{id:cedar.id,changes:{phase:'Launch prep'}},ref(cedar))
 await view('All active');await view('Launch prep');await expect(names()).toHaveText(['Beacon launch','Cedar launch'])
 await campaign('E','Echo launch','Launch prep',other.id)
 await page.reload();await expect(names()).toHaveText(['Beacon launch','Cedar launch','Echo launch'])
 await view('My campaigns');await expect(names()).toHaveText(['Atlas launch','Beacon launch'])
 // Any operator: the second operator's My campaigns, grouped by phase, through the grid's door.
 const theirs=await h.request(other.session,'/api/campaigns?view=mine&group=phase&sort=name&direction=asc')
 assert.equal(theirs.status,200,await theirs.clone().text())
 assert.deepEqual((await theirs.json()).items.map(item=>[item.name,item.phase]),[['Cedar launch','Launch prep'],['Echo launch','Launch prep']])
 await h.db.prepare('DELETE FROM campaigns WHERE code LIKE ?').bind(`${code}-%`).run()
}
