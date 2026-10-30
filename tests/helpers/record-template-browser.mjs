import {recordTemplateAutomationBrowser} from './record-template-automation-browser.mjs'
import {recordTemplateButtonsBrowser} from './record-template-buttons.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'

const schemaEntity='00000000000000000000000001'
const envelope=(input,expected=[])=>({commandId:createUlid(),input,expected})
const empty=value=>value===null||Array.isArray(value)&&value.length===0

// Shares the real records runtime and the existing 1440/390 journey harness.
// Only fixture setup uses HTTP; every duplication and template decision uses the UI.
export async function recordTemplateBrowser(page,j,h,width){
 const call=async(path,input)=>{
  const csrf=input===undefined?null:await(await page.request.get(h.origin+'/auth/csrf')).json()
  const response=await page.request.fetch(h.origin+path,{method:input===undefined?'GET':'POST',headers:{origin:h.origin,...(csrf?{'x-csrf-token':csrf.csrfToken}:{})},...(input===undefined?{}:{data:input})}),body=await response.json()
  assert.equal(response.status(),200,JSON.stringify(body));return body.data
 }
 const appId=createUlid(),parentId=createUlid(),vendorId=createUlid(),childId=createUlid()
 const title=newField('Order'),vendorName=newField('Supplier'),vendor=newField('Supplier link','relation'),files=newField('Order files','attachment'),line=newField('Line item'),parent=newField('Order link','relation')
 const amount=newField('Amount','money')
 title.required=true;line.required=true
 vendor.relation={ownerAppId:appId,entityId:vendorId,cardinality:'one',onDelete:'restrict'}
 parent.relation={ownerAppId:appId,entityId:parentId,cardinality:'one',onDelete:'restrict'}
 const preview=await call('/api/v1/records/schema-preview',{appId,name:`synthetic-cradle-${width} · Purchasing`,tables:[{id:vendorId,label:'Suppliers',primaryFieldId:vendorName.id,fields:[vendorName]},{id:parentId,label:'Orders',primaryFieldId:title.id,fields:[title,amount,vendor,files],incomingRelations:[{id:createUlid(),label:'Line items',sourceEntityId:childId,sourceFieldId:parent.id}]},{id:childId,label:'Line items',primaryFieldId:line.id,fields:[line,parent]}]})
 await call('/api/v1/commands/release.adopt',envelope({kind:'manual_schema',previewId:preview.id}))
 const schema=await call(`/api/v1/apps/${appId}/entities/${parentId}`),revision={ref:{appId,entityId:schemaEntity,recordId:parentId},version:schema.version}
 const create=async(entityId,values)=>{const entity=await call(`/api/v1/apps/${appId}/entities/${entityId}`);return(await call('/api/v1/commands/record.create',envelope({appId,entityId,values},[{ref:{appId,entityId:schemaEntity,recordId:entityId},version:entity.version}]))).value}
 const supplier=await create(vendorId,{[vendorName.id]:`synthetic-cradle-${width+1}`}),source=await create(parentId,{[title.id]:`synthetic-cradle-${width+2}`,[vendor.id]:supplier.ref,[amount.id]:{minor:'100115',currency:'USD',scale:2}})
 await create(childId,{[line.id]:`synthetic-cradle-${width+3}`,[parent.id]:source.ref})
 const base=`/app/records/${appId}/${parentId}`,sourcePath=`${base}/${source.id}`
 await page.goto(h.origin+sourcePath);await j.action(page.getByRole('button',{name:'Edit record',exact:true}))
 const bytes=Buffer.from(`synthetic-cradle-${width+4}`)
 const fileInput=page.getByLabel('Add Order files',{exact:true})
 const initiated=[];const track=request=>{if(request.url().endsWith('/commands/upload.begin'))initiated.push(request.url())};page.on('request',track)
 await fileInput.evaluate(input=>{const transfer=new DataTransfer();transfer.items.add(new File([new ArrayBuffer(100*1024*1024+1)],'synthetic-cradle-9510.txt',{type:'text/plain'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})
 await j.action(page.getByRole('button',{name:'Upload file',exact:true}))
 await page.getByRole('alert').filter({hasText:/100 MB.*104,857,600 bytes/}).waitFor()
 assert.equal(initiated.length,0,'The browser refuses an oversized file before upload initiation')
 page.off('request',track)
 await j.capture('record-attachment-upload')
 await page.getByLabel('Add Order files',{exact:true}).setInputFiles({name:`synthetic-cradle-${width+4}.txt`,mimeType:'text/plain',buffer:bytes})
 await j.action(page.getByRole('button',{name:'Upload file',exact:true}));await page.getByRole('button',{name:'File verified',exact:true}).waitFor()
 const attached=await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch')
 assert.equal(attached.fields[files.id].value.length,1)
 const uploaded=await page.request.get(`${h.origin}/api/v1/files/${attached.fields[files.id].value[0].fileId}/content`)
 assert.equal(uploaded.status(),200);assert.equal(createHash('sha256').update(await uploaded.body()).digest('hex'),createHash('sha256').update(bytes).digest('hex'))
 await j.capture('record-attachment-uploaded')
 await page.getByRole('button',{name:'Edit record',exact:true}).waitFor()
 await j.action(page.locator('summary').filter({hasText:/^Record actions$/}))
 const duplicates=[]
 for(const include of [false,true]){
  await j.action(page.getByRole('button',{name:'Duplicate record',exact:true}))
  const editor=page.getByRole('form',{name:'Duplicate record',exact:true})
  await j.setChecked(editor.getByLabel('Linked records',{exact:true}),include);await j.setChecked(editor.getByLabel('Attachments',{exact:true}),include)
  await j.capture(`record-duplicate-${include?'with-links-and-files':'without-links-or-files'}`)
  const copy=await j.command(editor.getByRole('button',{name:'Create duplicate',exact:true}),'record.duplicate')
  assert.notEqual(copy.id,source.id);assert.equal(copy.fields[title.id].value,source.fields[title.id].value)
  if(include){assert.deepEqual(copy.fields[vendor.id].value,supplier.ref);assert.equal(copy.fields[files.id].value.length,1)}else{assert.ok(empty(copy.fields[vendor.id].value));assert.ok(empty(copy.fields[files.id].value))}
  await j.action(editor.getByRole('link',{name:'Open duplicate',exact:true}));await page.getByRole('button',{name:'Edit record',exact:true}).waitFor()
  if(include){
   await page.getByRole('link',{name:`synthetic-cradle-${width+1}`,exact:true}).waitFor()
   const attachment=page.getByRole('link',{name:'Open attachment',exact:true}),href=await attachment.getAttribute('href'),content=await page.request.get(h.origin+href)
   assert.equal(content.status(),200);assert.deepEqual(await content.body(),bytes)
  }else{assert.equal(await page.getByRole('link',{name:'Open attachment',exact:true}).count(),0)}
  await j.capture(`record-duplicate-created-${include?'with-links-and-files':'without-links-or-files'}`)
  duplicates.push(copy.id)
  await page.goto(h.origin+sourcePath);await page.getByRole('button',{name:'Edit record',exact:true}).waitFor();await j.action(page.locator('summary').filter({hasText:/^Record actions$/}))
 }
 await j.action(page.getByRole('button',{name:'Save as template',exact:true}))
 const editor=page.getByRole('form',{name:'Save record template',exact:true}),templateName=`synthetic-cradle-${width+5}`
 await editor.getByLabel('Template name',{exact:true}).fill(templateName)
 for(const name of ['Linked records','Attachments','Child records'])await j.setChecked(editor.getByLabel(name,{exact:true}),true)
 await j.capture('record-template-save-with-child')
 const template=await j.command(editor.getByRole('button',{name:'Save template',exact:true}),'record.template-save')
 assert.equal(template.children.length,1);assert.equal(template.children[0].values[line.id],`synthetic-cradle-${width+3}`);assert.deepEqual(template.values[vendor.id],supplier.ref)
 await j.capture('record-template-saved')
 const listed=await call(`/api/v1/apps/${appId}/entities/${parentId}/templates`)
 assert.ok(listed.some(item=>item.id===template.id),'The saved table template is discoverable through its ordinary list')
 const assertApplied=async(row,label)=>{
  assert.equal(row.fields[title.id].value,label);assert.deepEqual(row.fields[vendor.id].value,supplier.ref)
  const children=await call(`/api/v1/apps/${appId}/entities/${childId}/query`,{filter:{kind:'condition',fieldId:parent.id,op:'eq',value:row.ref}})
  assert.equal(children.items.length,1);assert.equal(children.items[0].fields[line.id].value,`synthetic-cradle-${width+3}`);assert.deepEqual(children.items[0].fields[parent.id].value,row.ref)
 }
 await page.goto(h.origin+base);await j.action(page.getByRole('button',{name:'New record',exact:true}))
 await page.getByLabel('Amount amount',{exact:true}).fill('500.00');await page.getByLabel('Amount currency',{exact:true}).fill('USD')
 await page.getByLabel('Record template',{exact:true}).selectOption({label:templateName});assert.equal(await page.getByLabel('Order *',{exact:true}).inputValue(),source.fields[title.id].value)
 const displayedAmount={minor:(await page.getByLabel('Amount amount',{exact:true}).inputValue()).replace('.',''),currency:await page.getByLabel('Amount currency',{exact:true}).inputValue(),scale:2}
 const gridName=`synthetic-cradle-${width+6}`;await page.getByLabel('Order *',{exact:true}).fill(gridName)
 await j.capture('record-template-grid-edit')
 const gridRow=await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.apply-template');await assertApplied(gridRow,gridName)
 const savedGrid=(await call(`/api/v1/apps/${appId}/entities/${parentId}/records/${gridRow.id}`)).record
 assert.deepEqual(displayedAmount,savedGrid.fields[amount.id].value,'The template amount and currency shown at Save equal the saved money')
 await page.getByRole('button',{name:'New record',exact:true}).waitFor();await j.capture('record-template-grid-created')
 const form=(await call('/api/v1/commands/form.save',envelope({form:{appId,entityId:parentId,title:`synthetic-cradle-${width+7}`,fields:[title,amount,vendor,files].map(field=>({fieldId:field.id,label:field.label,help:'',required:field.required})),submitAction:'record.create',authenticated:true}},[revision]))).value
 await page.goto(`${h.origin}/app/forms/${form.id}`);await page.getByLabel('Record template',{exact:true}).selectOption({label:templateName})
 assert.equal(await page.getByLabel('Order *',{exact:true}).inputValue(),source.fields[title.id].value)
 const formName=`synthetic-cradle-${width+8}`;await page.getByLabel('Order *',{exact:true}).fill(formName);await j.capture('record-template-form-edit')
 const formRow=await j.command(page.getByRole('button',{name:'Submit',exact:true}),'form.submit');await assertApplied(formRow,formName);await j.capture('record-template-form-submitted')
 const buttons=await recordTemplateButtonsBrowser(page,j,h,width,{appId,parentId,source,template})
 const automation=await recordTemplateAutomationBrowser(page,j,h,width,{appId,parentId,source,template})
 return {automation,buttons,duplicates,templateId:template.id,gridRecordId:gridRow.id,formRecordId:formRow.id,childRecordsCreated:2}
}
