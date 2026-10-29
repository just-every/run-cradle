import assert from 'node:assert/strict'
import {baseAction} from './records-base-menu.mjs'

// Extends the existing collaborator journey through the real creator session.
export async function creatorRollups({h,people,appId,entityId,linesId,original,lines,amount,included,page,j,call,request}){
 const tablePath=`${h.origin}/app/records/${appId}/${entityId}`,base=`/api/v1/apps/${appId}/entities/${entityId}`
 async function prepare(sumLabel,countLabel){
  for(const [label,type]of [[sumLabel,'rollup'],[countLabel,'count']])await j.field(label,type,async editor=>{
   await editor.getByLabel('Linked records',{exact:true}).selectOption({label:'Order lines'})
   if(type==='rollup'){
    await editor.getByLabel('Aggregate field',{exact:true}).selectOption({label:'Amount'})
    await editor.getByLabel('Aggregate',{exact:true}).selectOption('sum')
   }
   await editor.getByLabel('Only linked records matching conditions',{exact:true}).check()
   await editor.getByRole('button',{name:'Add condition',exact:true}).click()
   await editor.getByLabel('Field',{exact:true}).selectOption({label:'Included'})
   await editor.getByLabel('Included',{exact:true}).check()
  })
  const pending=page.waitForResponse(r=>r.url().endsWith('/schema-preview')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'Preview schema changes',exact:true}).click()
  const response=await pending;assert.equal(response.status(),200,await response.text())
  const preview=(await response.json()).data;assert.equal(preview.requiresOwnerReview,false)
  await page.getByRole('heading',{name:'Review schema changes',exact:true}).waitFor()
  return preview
 }
 async function values(sum,count){
  const schema=await call(people.creator.cookie,base),row=(await call(people.creator.cookie,`${base}/records/${original.id}`)).record
  for(const [label,expected]of [['Included amount',sum],['Included lines',count]]){
   const field=schema.fields.find(field=>field.label===label);assert.ok(field,label)
   assert.deepEqual(row.fields[field.id],{state:'value',value:expected},label)
  }
  await page.goto(`${tablePath}/${original.id}`)
  await page.getByRole('heading',{name:'Grove Equipment replenishment',exact:true}).waitFor()
  for(const [label,expected]of [['Included amount',sum],['Included lines',count]]){
   const value=page.locator('dl.cr-record-fields .cr-field').filter({has:page.locator('dt').getByText(label,{exact:true})}).locator('dd')
   assert.equal((await value.innerText()).trim(),expected,label)
  }
 }
 await baseAction(page,'Edit fields')
 const preview=await prepare('Included amount','Included lines')
 for(const [label,value]of [['Included amount','15'],['Included lines','2']]){
  const calculation=preview.calculations.find(item=>item.label===label)
  assert.equal(calculation.totalRecords,1);assert.equal(calculation.samples[0].recordId,original.id)
  assert.deepEqual(calculation.samples[0].after,{state:'value',value})
  const article=page.locator('.cr-calculation-review article').filter({has:page.getByRole('heading',{name:`Orders · ${label}`,exact:true})})
  const row=article.getByRole('row').filter({has:page.getByRole('link',{name:'Grove Equipment replenishment',exact:true})})
  assert.equal((await row.getByRole('cell').last().innerText()).trim(),value,label)
 }
 await j.capture('creator-rollup-count-preview')
 const schemaBefore=await call(people.editor.cookie,base)
 assert.ok(schemaBefore.fields.every(field=>!['Included amount','Included lines'].includes(field.label)))
 const draft=await call(people.creator.cookie,`/api/v1/records/bases/${appId}`)
 for(const field of preview.schemas.find(schema=>schema.id===entityId).fields.filter(field=>!schemaBefore.fields.some(existing=>existing.id===field.id)))draft.tables.find(table=>table.id===entityId).fields.push(field)
 assert.equal((await request(people.editor.cookie,'/api/v1/records/schema-preview',draft)).status,403)
 assert.equal((await request(people.editor.cookie,'/api/v1/commands/release.adopt',{commandId:preview.id,expected:[],input:{kind:'manual_schema',previewId:preview.id}})).status,404)
 assert.deepEqual(await call(people.editor.cookie,base),schemaBefore)
 await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
 const adopted=await j.command(page.getByRole('button',{name:'Adopt schema',exact:true}),'release.adopt')
 assert.equal((await h.db.prepare('SELECT owner_id FROM manual_record_releases WHERE id=?').bind(adopted.releaseId).first()).owner_id,people.creator.id)
 await values('15','2');await j.capture('creator-rollup-count-adopted')
 await page.goto(`${h.origin}/app/records/${appId}/${linesId}/${lines[1].id}`)
 await page.getByRole('button',{name:'Edit record',exact:true}).click()
 await page.getByLabel('Amount',{exact:true}).fill('25');await page.getByLabel('Included',{exact:true}).check()
 await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch')
 const changed=(await call(people.creator.cookie,`/api/v1/apps/${appId}/entities/${linesId}/records/${lines[1].id}`)).record
 assert.equal(changed.fields[amount.id].value,'25');assert.equal(changed.fields[included.id].value,true)
 await values('40','3');await j.capture('creator-rollup-count-next-read')
 await page.goto(tablePath);await page.getByRole('button',{name:'New record',exact:true}).waitFor()
 return {prepare,values}
}
