import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

/** Submit the authored percentage through the actual authenticated form controls. */
export async function percentageFormBrowser(h,owner,fixture){
 const schema=(await h.request(`/api/v1/apps/${fixture.appId}/entities/${fixture.orders}`)).data
 const {page,capture}=owner,name=schema.fields.find(field=>field.label==='Order'),rate=schema.fields.find(field=>field.label==='Rate')
 const form=(await h.request('/api/v1/commands/form.save',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:fixture.appId,entityId:'00000000000000000000000001',recordId:fixture.orders},version:schema.version}],input:{form:{appId:fixture.appId,entityId:fixture.orders,title:'Percentage entry',fields:[name,rate].map(field=>({fieldId:field.id,label:field.label,help:'',required:field.required})),submitAction:'record.create',authenticated:true}}}})).data.value
 const records=async()=>(await h.request(`/api/v1/apps/${fixture.appId}/entities/${fixture.orders}/query`,{method:'POST',body:{}})).data.items
 const before=(await records()).map(row=>row.id).sort()
 await page.goto(`${h.origin}/app/forms/${form.id}`)
 await page.getByLabel('Order *',{exact:true}).fill('synthetic-cradle-percentage-form')
 const input=page.getByLabel('Rate',{exact:true}),submit=page.getByRole('button',{name:'Submit',exact:true})
 await input.fill('12.5%')
 const refused=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/form.submit'))
 await submit.click();assert.equal((await refused).status(),400)
 await page.getByText(/Rate:.*canonical finite decimal/).waitFor()
 assert.deepEqual((await records()).map(row=>row.id).sort(),before,'An invalid form response creates no record')
 await capture('percentage-form-invalid',input)
 const samples=[
  {label:'precise',raw:'0.12345678901234567890123456789012',display:'12.345678901234567890123456789012%'},
  {label:'zero',raw:'0',display:'0%'},
 ]
 for(const sample of samples){
  await page.getByLabel('Order *',{exact:true}).fill('synthetic-cradle-percentage-'+sample.label)
  await input.fill(sample.raw)
  const pending=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/form.submit'))
  await submit.click();const response=await pending,wire=await response.json()
  assert.equal(response.status(),200,JSON.stringify(wire));assert.equal(wire.data.state,'committed')
  const row=wire.data.value
  assert.equal(row.fields[rate.id].value,sample.raw,'Form admission retains the exact raw fraction')
  const read=(await h.request(`/api/v1/apps/${fixture.appId}/entities/${fixture.orders}/records/${row.id}`)).data.record
  assert.equal(read.fields[rate.id].value,sample.raw,'Native readback retains the exact raw fraction')
  await page.goto(`${fixture.url}/${row.id}`)
  const displayed=page.getByText(sample.display,{exact:true});await displayed.waitFor()
  await capture('percentage-form-'+sample.label,displayed)
  await page.getByRole('button',{name:'Edit record',exact:true}).click()
  assert.equal(await page.getByLabel('Rate',{exact:true}).inputValue(),sample.raw,'A form-created percentage reopens without a second scaling')
  await page.goto(`${h.origin}/app/forms/${form.id}`)
 }
 assert.equal((await records()).length,before.length+samples.length,'Only the two valid form responses create records')
}
