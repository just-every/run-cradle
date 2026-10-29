import {creatorInterfaceScreens} from './records-interfaces-browser.mjs'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {baseAction} from './records-base-menu.mjs'
import {displayAction,tableAction} from './records-table-tools.mjs'

/** Existing form, view and schema screens exercised with a current creator session. */
export async function creatorRoleScreens({h,page,creatorPage,j,cj,call,request,people,cookie,context,appId,entityId,base,tablePath,savedView,title,status}){
 const schema=await call(people.creator.cookie,base),beforeVersion=schema.version
 await creatorPage.goto(tablePath);await tableAction(creatorPage,'Forms');await creatorPage.getByRole('button',{name:'Create form',exact:true}).click()
 await creatorPage.getByLabel('Form title',{exact:true}).fill('Creator receiving form')
 for(const label of ['Order','Status'])await creatorPage.getByRole('checkbox',{name:label,exact:true}).check()
 await cj.capture('creator-form-editor')
 const form=await cj.command(creatorPage.getByRole('button',{name:'Save form',exact:true}),'form.save')
 assert.equal((await call(people.editor.cookie,base)).version,beforeVersion)
 await page.goto(`${h.origin}/app/forms/${form.id}`);await page.getByRole('heading',{name:'Creator receiving form',exact:true}).waitFor()
 await page.getByLabel('Order',{exact:true}).fill('Form-authored delivery');await page.getByLabel('Status',{exact:true}).selectOption(status.options[0].id)
 const submitted=await j.command(page.getByRole('button',{name:'Submit',exact:true}),'form.submit')
 assert.equal((await call(people.editor.cookie,base+'/records/'+submitted.id)).record.fields[title.id].value,'Form-authored delivery')
 await j.capture('editor-creator-form-submitted')
 await creatorPage.goto(tablePath);await displayAction(creatorPage,'Warehouse orders');await creatorPage.getByRole('button',{name:'Edit view',exact:true}).click()
 await creatorPage.getByLabel('Lock view',{exact:true}).check()
 await cj.command(creatorPage.locator('form').filter({has:creatorPage.getByLabel('Name',{exact:true})}).getByRole('button',{name:'Save view',exact:true}),'view.save')
 await page.goto(tablePath);await displayAction(page,'Warehouse orders')
 assert.equal(await page.getByRole('button',{name:'Edit view',exact:true}).isDisabled(),true)
 assert.equal(await page.getByRole('button',{name:'Delete view',exact:true}).isDisabled(),true)
 await j.capture('editor-creator-locked-view')
 const locked=await call(people.editor.cookie,`/api/v1/views/${savedView.id}`)
 const denied=await request(people.editor.cookie,'/api/v1/commands/view.delete',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000002',recordId:locked.id},version:locked.version}],input:{viewId:locked.id}})
 assert.equal(denied.status,403);assert.equal((await call(people.editor.cookie,`/api/v1/views/${savedView.id}`)).version,locked.version)
 await creatorPage.goto(tablePath);await displayAction(creatorPage,'Warehouse orders');await creatorPage.getByRole('button',{name:'Edit view',exact:true}).click()
 await creatorPage.getByLabel('Lock view',{exact:true}).uncheck()
 await cj.command(creatorPage.locator('form').filter({has:creatorPage.getByLabel('Name',{exact:true})}).getByRole('button',{name:'Save view',exact:true}),'view.save')
 await cookie(context,people.owner.cookie);await page.goto(tablePath);await baseAction(page,'People')
 const collaborator=page.getByRole('form',{name:`Role for ${people.creator.name}`,exact:true})
 await collaborator.getByLabel('May adopt destructive changes after impact review',{exact:true}).check()
 const granting=page.waitForResponse(response=>response.url().endsWith('/collaborators')&&response.request().method()==='POST')
 await collaborator.getByRole('button',{name:'Save base role',exact:true}).click();assert.equal((await granting).status(),200)
 await creatorPage.goto(tablePath);await baseAction(creatorPage,'Edit fields')
 await creatorPage.getByRole('group',{name:'PO number',exact:true}).getByRole('button',{name:'Remove field',exact:true}).click()
 const preparing=creatorPage.waitForResponse(response=>response.url().endsWith('/schema-preview')&&response.request().method()==='POST')
 await creatorPage.getByRole('button',{name:'Preview schema changes',exact:true}).click()
 const preview=(await (await preparing).json()).data;assert.equal(preview.requiresOwnerReview,false)
 await cj.capture('creator-delegated-impact')
 await creatorPage.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
 const release=await cj.command(creatorPage.getByRole('button',{name:'Adopt schema',exact:true}),'release.adopt')
 assert.equal((await call(people.editor.cookie,base)).fields.some(field=>field.label==='PO number'),false)
 const recovery=await call(people.creator.cookie,`/api/v1/records/releases/${release.releaseId}/recovery`)
 assert.match(recovery.tables[0].csv,/PO number/)
 await creatorInterfaceScreens({h,page,creatorPage,j,cj,call,people,cookie,context,appId,entityId,base,tablePath,savedView,form})
 await cookie(context,people.editor.cookie)
}
