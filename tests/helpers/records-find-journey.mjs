import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {compileSchema} from '../../src/domains/records/descriptors.server.ts'
import {ownerRules} from '../../src/domains/records/manual/authority.server.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'

/** Persist a realistic large table; all search and navigation use the emitted product. */
async function fixture(h){
 const appId=createUlid(),entityId=createUlid(),now=new Date().toISOString(),title=newField('Order'),notes=newField('Notes'),secret=newField('Internal reference'),stage=newField('Stage','select'),due=newField('Due','date')
 stage.options=[{id:createUlid(),label:'Ready'},{id:createUlid(),label:'Shipped'}]
 const schema={id:entityId,appId,label:'Orders',version:1,createdAt:now,updatedAt:now,physicalRevision:'find-journey',primaryFieldId:title.id,fields:[title,notes,secret,stage,due],lifecycle:{states:['active'],initial:'active',transitions:[]}}
 const compiled=compileSchema(schema,()=>undefined),d=compiled.descriptor
 for(const sql of compiled.sql)await h.db.prepare(sql).run()
 await h.db.prepare('INSERT INTO record_schemas VALUES(?,?,?,?,?,?,?)').bind(entityId,appId,1,schema.physicalRevision,JSON.stringify(schema),now,now).run()
 const rules=ownerRules('00000000000000000000000981',[schema]);rules[0].readableFields=rules[0].readableFields.filter(id=>id!==secret.id)
 const policyId=createUlid()
 await h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policyId,appId,'Orders',JSON.stringify(rules),Date.now(),Date.now()).run()
 await h.db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,0,'active',1)").bind('00000000000000000000000981',appId,policyId).run()
 const targets=[]
 for(let start=0;start<5000;start+=100){
  const statements=[]
  for(let index=start;index<start+100;index++){
   const id=createUlid(),found=[0,119,4999].includes(index)
   if(found)targets.push(id)
   statements.push(h.db.prepare(`INSERT INTO "${d.table.tableId}"(id,version,created_at,updated_at,lifecycle,schema_version,${schema.fields.map(f=>'"'+d.fields.get(f.id).column+'"').join(',')}) VALUES(?,1,?,?,'active',1,?,?,?,?,?)`).bind(id,now,now,`PO-${String(index+1).padStart(5,'0')}`,found?'Renewal due for Northgate warehouse':'Standard replenishment','hidden-needle',stage.options[index%2].id,index%2?'2026-11-02':'2026-11-01'))
  }
  await h.db.batch(statements)
 }
 const views=[]
 for(const display of ['grid','cards','board','calendar','timeline','agenda']){
  const id=createUlid(),view={id,appId,entityId,name:`Orders ${display}`,display,fields:[title.id,notes.id,due.id],filter:{kind:'all',conditions:[]},sort:[{fieldId:title.id,direction:'asc'}],groupBy:[],layout:{titleFieldId:title.id,...(display==='board'?{boardFieldId:stage.id}:{}),...(['calendar','timeline','agenda'].includes(display)?{startFieldId:due.id}:{}),...(display==='timeline'?{endFieldId:due.id}:{})},visibility:'app',shipped:false,version:1,createdAt:now,updatedAt:now}
  await h.db.prepare('INSERT INTO record_views(id,app_id,entity_id,definition_json,owner_id,visibility,version,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)').bind(id,appId,entityId,JSON.stringify(view),'00000000000000000000000981','app',now,now).run();views.push(view)
 }
 return {appId,entityId,notes,targets,views}
}

export async function findBrowserJourney(page,j,h){
 const f=await fixture(h)
 console.log(`Find fixture ready at ${page.viewportSize().width}px`)
 await page.goto(`${h.origin}/app/records/${f.appId}/${f.entityId}`)
 for(const view of f.views){
  console.log(`Find ${view.display} at ${page.viewportSize().width}px`)
  await page.getByRole('navigation',{name:'Saved views',exact:true}).getByRole('button',{name:view.name,exact:true}).click()
  await page.getByRole('heading',{name:view.name,exact:true}).waitFor()
  await page.keyboard.press('Control+f')
  const input=page.getByLabel('Find in visible fields',{exact:true}),form=input.locator('xpath=ancestor::form')
  await input.fill('hidden-needle');await input.press('Enter');await form.getByRole('status').filter({hasText:'No matches'}).waitFor()
  await input.fill('renewal');await input.press('Enter');await form.getByRole('status').filter({hasText:/^1 of 3 matching cells$/}).waitFor()
  const selector=view.display==='grid'?'.cr-grid-match':'.cr-view-match'
  for(let index=0;index<3;index++){
   const match=page.locator(`${selector}[data-record-id="${f.targets[index]}"][data-field-id="${f.notes.id}"]`)
   await match.waitFor();assert.match(await match.innerText(),/Renewal due/)
   const bounds=await match.boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y<page.viewportSize().height,`${view.display}: distant match visible`)
   if(index<2)await input.press('Enter')
  }
  await input.press('Shift+Enter');await form.getByRole('status').filter({hasText:/^2 of 3 matching cells$/}).waitFor()
  await j.capture(`find-${view.display}`,{viewport:true})
 }
 return f
}
