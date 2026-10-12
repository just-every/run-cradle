import assert from 'node:assert/strict'
export async function exerciseTemplates(page,j,origin,width){
 const templates=[['Customer relationships','Companies','Company'],['Launch readiness','Campaigns','Campaign'],['Project tracker','Projects','Project']]
 const receipts=[]
 for(const [name,table,label]of templates){await page.goto(origin+'/app/records');await j.action(page.getByText('Start from a template',{exact:true}));await j.action(page.getByRole('button',{name:`Use ${name}`,exact:true}));await page.getByLabel('Base name',{exact:true}).fill(`${name} ${width}`);const result=await j.adopt();await j.table(table);const row=await j.record({[label]:`${name} live ${width}`});await j.action(page.getByRole('link',{name:`${name} live ${width}`,exact:true}).first());await j.action(page.getByRole('button',{name:'Edit record',exact:true}));await page.getByLabel(label,{exact:true}).fill(`${name} edited ${width}`);await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch');await page.reload();await page.getByRole('heading',{name:`${name} edited ${width}`,exact:true}).waitFor();await j.capture(`template-${table.toLowerCase()}`);receipts.push({template:name,appId:result.appId,recordId:row.id})}
 return receipts
}
