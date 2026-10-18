import {recordsBrowserWidths} from './records-browser-widths.mjs'
import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
import {freePort} from './free-port.mjs'
import {assertPortableJsonSchema} from './json-schema-assert.mjs'
import {prepareJsonSource,allocateJsonIdentities} from '../../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'
const schemaEntity='00000000000000000000000001',formEntity='00000000000000000000000003'
const command=(input,expected=[])=>({commandId:createUlid(),input,expected})

export async function conditionalFormsJourney(){
 const output='.private/conditional-forms';await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await recordsBrowserRuntime(await freePort())
  const call=async(path,input,status=200)=>{const csrf=input===undefined?null:await (await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json();const response=await fetch(h.origin+path,{signal:AbortSignal.timeout(30000),method:input===undefined?'GET':'POST',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json',...(csrf?{'x-csrf-token':csrf.csrfToken}:{})},...(input===undefined?{}:{body:JSON.stringify(input)})});const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error}
  const appId=createUlid(),entityId=createUlid(),name=newField('Request'),kind=newField('Fulfilment','select'),address=newField('Delivery address'),access=newField('Access instructions'),note=newField('Notes')
  name.required=true;kind.options=[{id:createUlid(),label:'Delivery'},{id:createUlid(),label:'Pickup'}]
  const fields=[name,kind,address,access,note],draft={appId,name:'Warehouse requests',tables:[{id:entityId,label:'Requests',primaryFieldId:name.id,fields,validationRules:[{id:createUlid(),name:'Pickup instructions',message:'Provide pickup instructions.',when:{kind:'condition',fieldId:kind.id,op:'eq',value:kind.options[1].id},require:{kind:'condition',fieldId:note.id,op:'not_empty'}}]}]}
  const preview=await call('/api/v1/records/schema-preview',draft);await call('/api/v1/commands/release.adopt',command({kind:'manual_schema',previewId:preview.id}))
  const schema=await call(`/api/v1/apps/${appId}/entities/${entityId}`),schemaRevision={ref:{appId,entityId:schemaEntity,recordId:entityId},version:schema.version}
  const definition={appId,entityId,title:'Warehouse request',fields:fields.map(f=>({fieldId:f.id,label:f.label,help:'',required:f.required})),submitAction:'record.create',authenticated:true}
  let saved=(await call('/api/v1/commands/form.save',command({form:definition},[schemaRevision]))).value
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  for(const width of recordsBrowserWidths()){
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   try{
    page.setDefaultTimeout(15000)
    await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
    await page.goto(`${h.origin}/app/records/${appId}/${entityId}`)
    await page.getByRole('button',{name:'Form',exact:true}).click()
    await page.getByRole('button',{name:'Edit form',exact:true}).click()
    const editor=page.locator('form').filter({has:page.getByLabel('Form title',{exact:true})})
    const tile=label=>editor.locator('fieldset.cr-field-tile').filter({has:page.locator('legend').getByText(label,{exact:true})})
    const request=tile('Request'),delivery=tile('Delivery address'),instructions=tile('Access instructions'),notes=tile('Notes')
    for(const field of [request,tile('Fulfilment')]){await field.getByLabel('Page',{exact:true}).fill('Request');await field.getByLabel('Section',{exact:true}).fill('Request details')}
    for(const field of [delivery,instructions,notes])await field.getByLabel('Page',{exact:true}).fill('Delivery details')
    await delivery.getByLabel('Section',{exact:true}).fill('Destination')
    await delivery.getByLabel('Show only when an earlier answer matches').check()
    await delivery.getByLabel('Show when field',{exact:true}).selectOption(kind.id)
    await delivery.getByLabel('Show when comparison',{exact:true}).selectOption('eq')
    await delivery.getByLabel('Show when value',{exact:true}).selectOption(kind.options[0].id)
    await delivery.getByLabel('Required',{exact:true}).check()
    await instructions.getByLabel('Show only when an earlier answer matches').check()
    await instructions.getByLabel('Show when field',{exact:true}).selectOption(address.id)
    await j.capture('conditional-form-editor')
    saved=await j.command(editor.getByRole('button',{name:'Save form',exact:true}),'form.save')
    await page.goto(`${h.origin}/app/forms/${saved.id}`)
    await page.getByLabel('Request *',{exact:true}).fill(`PO 1042 ${width}`)
    await page.getByLabel('Fulfilment',{exact:true}).selectOption(kind.options[0].id)
    await j.capture('conditional-form-request')
    await page.getByRole('button',{name:'Next',exact:true}).click()
    await page.getByLabel('Delivery address *',{exact:true}).fill('1800 Market Street, Philadelphia PA 19103')
    await page.getByLabel('Access instructions',{exact:true}).fill('Use loading dock B')
    await j.capture('conditional-form-delivery')
    await page.getByRole('button',{name:'Back',exact:true}).click()
    await page.getByLabel('Fulfilment',{exact:true}).selectOption(kind.options[1].id)
    await page.getByRole('button',{name:'Next',exact:true}).click()
    assert.equal(await page.getByLabel('Delivery address *',{exact:true}).count(),0)
    assert.equal(await page.getByLabel('Access instructions',{exact:true}).count(),0)
    await page.getByLabel('Notes',{exact:true}).fill('Collect at front counter')
    await j.capture('conditional-form-pickup')
    const row=await j.command(page.getByRole('button',{name:'Submit',exact:true}),'form.submit')
    assert.equal(row.fields[address.id].value,null);assert.equal(row.fields[access.id].value,null);assert.equal(row.fields[note.id].value,'Collect at front counter')
    await j.capture('conditional-form-complete')
   }catch(error){await page.screenshot({path:`${output}/failure-${width}.png`,fullPage:true});throw error}finally{await context.close()}
  }
  const revisions=[schemaRevision,{ref:{appId,entityId:formEntity,recordId:saved.id},version:saved.version}],submit=values=>command({appId,entityId,formId:saved.id,values},revisions)
  const before=(await call(`/api/v1/apps/${appId}/entities/${entityId}/query`,{})).items.length
  await call('/api/v1/commands/form.submit',submit({[name.id]:'Forged pickup',[kind.id]:kind.options[1].id,[address.id]:'Hidden answer'}),400)
  await call('/api/v1/commands/form.submit',submit({[name.id]:'Missing destination',[kind.id]:kind.options[0].id}),400)
  assert.equal((await call(`/api/v1/apps/${appId}/entities/${entityId}/query`,{})).items.length,before)
  const refused=await call('/api/v1/commands/form.submit',submit({[name.id]:'No pickup details',[kind.id]:kind.options[1].id}),400);assert.match(JSON.stringify(refused),/Pickup instructions/)
  const delivered=(await call('/api/v1/commands/form.submit',submit({[name.id]:'PO 1043',[kind.id]:kind.options[0].id,[address.id]:'100 Main Street'}))).value
  assert.equal(delivered.fields[address.id].value,'100 Main Street')
  const invalid=structuredClone(saved);invalid.fields[1].showWhen={kind:'condition',fieldId:address.id,op:'not_empty'}
  const {id,version,createdAt,updatedAt,...bad}=invalid
  await call('/api/v1/commands/form.save',command({id,form:bad},revisions),400)
  const exported=await call('/api/v1/records/base-export',{appId,format:'json'}),snapshot=JSON.parse(exported.content)
  assert.deepEqual(snapshot.base.forms[0].fields,saved.fields);assertPortableJsonSchema(snapshot)
  const source=prepareJsonSource({filename:'warehouse.json',bytes:new TextEncoder().encode(exported.content)}),ids=allocateJsonIdentities(snapshot,'copy'),copy=previewJsonImport(source,{name:'Warehouse copy'},ids),copied=copy.portableForms[0]
  assert.equal(copied.fields[2].showWhen.fieldId,ids.tables[entityId].fields[kind.id]);assert.equal(copied.fields[2].showWhen.value,ids.tables[entityId].options[kind.id].Delivery);assert.equal(copied.fields[2].page,'Delivery details')
 }finally{await browser?.close();await h?.close()}
}
