import assert from 'node:assert/strict'
export async function exerciseTemplates(page,j,origin,width){
 const templates=[['Customer relationships','Companies','Company'],['Project tracker','Projects','Project']]
 const receipts=[]
 const readApps=async()=>{const response=await page.request.get(origin+'/api/v1/apps');assert.equal(response.status(),200);return(await response.json()).data.items}
 await page.goto(origin+'/app/records')
 const before=await readApps()
 await j.action(page.getByRole('button',{name:'Create base',exact:true}))
 await j.action(page.getByRole('link',{name:'Use Launch readiness',exact:true}))
 await page.waitForURL(origin+'/app/records/00000000000000000000000700')
 const launchQuery=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/query'))
 await j.action(page.getByRole('navigation',{name:'Record types',exact:true}).getByRole('link',{name:'Campaigns',exact:true}))
 await launchQuery
 await page.getByRole('columnheader',{name:'Name',exact:true}).waitFor()
 await j.capture('template-launch-included')
 assert.deepEqual((await readApps()).map(app=>app.id),before.map(app=>app.id),'Using the included launch application must preserve the existing bases')
 receipts.push({template:'Launch readiness',appId:'00000000000000000000000700',included:true})
 for(const [name,table,label]of templates){await page.goto(origin+'/app/records');await j.action(page.getByRole('button',{name:'Create base',exact:true}));await page.getByRole('heading',{name:'Build your base',exact:true}).waitFor();await j.action(page.getByRole('button',{name:`Use ${name}`,exact:true}));await page.getByLabel('Base name',{exact:true}).fill(`${name} ${width}`);const result=await j.adopt();await j.table(table);const row=await j.record({[label]:`${name} live ${width}`});await j.action(page.getByRole('link',{name:`${name} live ${width}`,exact:true}).first());await j.action(page.getByRole('button',{name:'Edit record',exact:true}));await page.getByLabel(label,{exact:true}).fill(`${name} edited ${width}`);await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch');await page.reload();await page.getByRole('heading',{name:`${name} edited ${width}`,exact:true}).waitFor();await j.capture(`template-${table.toLowerCase()}`);receipts.push({template:name,appId:result.appId,recordId:row.id})}
 return receipts
}
