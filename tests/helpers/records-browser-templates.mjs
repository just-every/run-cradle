import {displayAction} from './records-table-tools.mjs'
import {baseAction} from './records-base-menu.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {submitImport} from './base-import-browser.mjs'
import {browserCall} from './records-live-fixture.mjs'
const operationsRecords={
 'Inventory and orders':{key:'inventory',title:'Adjustable shelf bracket',values:{SKU:'BRK-1042','Unit price':{amount:'12.95',currency:'USD'},'On hand':'240','Reorder point':'60',Active:true}},
 'Vendor and contract register':{key:'vendors',title:'Northstar Industrial Supply',values:{'Contact name':'Morgan Lee',Email:'purchasing@northstar.example',Phone:'+15125550142',Website:'https://northstar.example',Status:{select:'Approved'}}},
 'Asset and equipment register':{key:'assets',title:'Austin distribution center',values:{Address:'415 Congress Ave, Austin, TX 78701',Contact:'Jordan Reyes',Phone:'+15125550143'}},
 'Event planning':{key:'events',title:'Riverside conference center',values:{Address:'200 Riverside Dr, Austin, TX 78704',Capacity:'180','Contact email':'bookings@riverside.example','Booking cost':{amount:'2400.00',currency:'USD'}}},
 'Field operations tracker':{key:'field-operations',title:'Westlake service center',values:{Address:'3800 Westlake Dr, Austin, TX 78746','Contact name':'Alex Rivera','Contact phone':'+15125550144','Access instructions':'Check in at the north service entrance. Loading dock opens at 8 AM.'}},
 'Content production':{key:'content',title:'Fall customer education',values:{'Start date':'2026-11-02','End date':'2026-11-30',Budget:{amount:'8500.00',currency:'USD'},Brief:'Publish a practical guide, customer email and three short videos showing how to prepare for the holiday season.'}},
}
async function templateRecord(page,j,values){
 await j.action(page.getByRole('button',{name:'New record',exact:true}))
 await page.getByRole('button',{name:'Save record',exact:true}).waitFor()
 for(const [label,value]of Object.entries(values)){
  if(value&&typeof value==='object'&&'amount'in value){
   await page.getByLabel(`${label} amount`,{exact:true}).fill(value.amount)
   await page.getByLabel(`${label} currency`,{exact:true}).fill(value.currency)
  }else if(value&&typeof value==='object'&&'select'in value)await page.getByLabel(label,{exact:true}).selectOption({label:value.select})
  else if(typeof value==='boolean')await j.setChecked(page.getByLabel(label,{exact:true}),value)
  else await page.getByLabel(label,{exact:true}).fill(value)
 }
 const row=await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.create')
 await page.getByRole('button',{name:'New record',exact:true}).waitFor()
 return row
}
export async function exerciseTemplates(page,j,origin,width){
 const templates=[['Customer relationships','Companies','Company'],['Project tracker','Projects','Project'],['Inventory and orders','Products','Product'],['Vendor and contract register','Vendors','Vendor'],['Asset and equipment register','Locations','Location'],['Event planning','Venues','Venue'],['Field operations tracker','Sites','Site'],['Content production','Campaigns','Campaign']]
 const receipts=[]
 const readApps=async()=>{const response=await page.request.get(origin+'/api/v1/apps');assert.equal(response.status(),200);return(await response.json()).data.items}
 await page.goto(origin+'/app/records')
 await baseAction(page,'New base',j.action);await page.getByRole('region',{name:'Start from a template',exact:true}).waitFor()
 await j.capture('template-catalogue')
 const before=await readApps()
 await j.action(page.getByRole('link',{name:'Use Launch readiness',exact:true}))
 await page.waitForURL(url=>url.pathname.startsWith('/app/records/00000000000000000000000700/'))
 const launchQuery=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/query'))
 await displayAction(page,'Campaigns',j.action)
 await launchQuery
 await page.getByRole('columnheader',{name:'Name',exact:true}).waitFor()
 await j.capture('template-launch-included')
 assert.deepEqual((await readApps()).map(app=>app.id),before.map(app=>app.id),'Using the included launch application must preserve the existing bases')
 receipts.push({template:'Launch readiness',appId:'00000000000000000000000700',included:true})
 for(const [name,table,label]of templates){
  const fixture=operationsRecords[name],title=fixture?`${fixture.title} ${width}`:`${name} live ${width}`,edited=fixture?`${fixture.title} reviewed ${width}`:`${name} edited ${width}`
  await page.goto(origin+'/app/records')
  await baseAction(page,'New base',j.action)
  await page.getByRole('heading',{name:'Build your base',exact:true}).waitFor()
  await j.action(page.getByRole('button',{name:`Use ${name}`,exact:true}))
  await page.getByLabel('Base name',{exact:true}).fill(`${name} ${width}`)
  if(fixture)await j.capture(`template-${fixture.key}-schema`)
  const result=await j.adopt();await j.table(table)
  const row=await templateRecord(page,j,{[label]:title,...fixture?.values})
  await j.action(page.getByRole('link',{name:title,exact:true}).first())
  await j.action(page.getByRole('button',{name:'Edit record',exact:true}))
  await page.getByLabel(label,{exact:true}).fill(edited)
  await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch')
  await page.reload();await page.getByRole('heading',{name:edited,exact:true}).waitFor()
  await j.capture(`template-${table.toLowerCase()}`)
  receipts.push({template:name,appId:result.appId,recordId:row.id})
  if(name==='Inventory and orders')receipts.push(await schemaOnlyCopy(page,j,origin,result.appId,width))
 }
 return receipts
}

async function schemaOnlyCopy(page,j,origin,appId,width){
 await page.goto(`${origin}/app/records/${appId}`)
 await baseAction(page,'Export base',j.action)
 await j.setChecked(page.getByLabel('Include records in base JSON',{exact:true}),false)
 const pending=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/records/base-export'))
 await j.action(page.getByRole('button',{name:'Prepare schema-only JSON',exact:true}))
 const response=await pending;assert.equal(response.status(),200)
 const file=(await response.json()).data,source=JSON.parse(file.content)
 assert.ok(source.base.tables.every(table=>table.records.length===0))
 assert.ok(file.omissions.length>0)
 const review=page.getByRole('region',{name:'Review schema-only copy',exact:true})
 assert.equal(await review.getByRole('button',{name:'Download schema-only JSON',exact:true}).isDisabled(),true)
 for(const omission of file.omissions)await review.getByText(omission,{exact:true}).waitFor()
 await j.capture('template-copy-exclusions')
 await j.setChecked(review.getByLabel('I reviewed the exclusions from this copy.',{exact:true}),true)
 const downloading=page.waitForEvent('download');await j.action(review.getByRole('button',{name:'Download schema-only JSON',exact:true}))
 const download=await downloading,buffer=await readFile(await download.path())
 assert.deepEqual(JSON.parse(buffer.toString()),source)
 await page.goto(origin+'/app/records/?import=base')
 await j.setChecked(page.getByRole('radio',{name:'Base JSON',exact:true}),true)
 await page.getByLabel('Base name',{exact:true}).fill(`Inventory schema copy ${width}`)
 await page.getByLabel('Cradle base JSON file',{exact:true}).setInputFiles({name:'inventory-schema.cradle.json',mimeType:'application/json',buffer})
 const previewing=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/base-import/preview'))
 await j.action(page.getByRole('button',{name:'Preview import',exact:true}))
 const previewResponse=await previewing;assert.equal(previewResponse.status(),200)
 const preview=(await previewResponse.json()).data
 assert.notEqual(preview.identities.appId,appId);assert.equal(preview.records.length,0)
 await submitImport(page,{action:j.action,setChecked:j.setChecked})
 await j.action(page.getByRole('link',{name:'Open imported base',exact:true}))
 await j.table('Products')
 await j.capture('template-copy-without-records')
 for(const table of source.base.tables){
  const copied=preview.identities.tables[table.id]
  assert.notEqual(copied.entityId,table.id)
  const records=await browserCall(page,`/api/v1/apps/${preview.identities.appId}/entities/${copied.entityId}/query`,{})
  assert.equal(records.items.length,0)
 }
 const original=await browserCall(page,`/api/v1/apps/${appId}/entities/${source.base.tables[0].id}/query`,{})
 assert.equal(original.items.length,1,'Schema-only copy retains the populated source')
 return {template:'Inventory and orders',sourceAppId:appId,copyAppId:preview.identities.appId,includeRecords:false}
}
