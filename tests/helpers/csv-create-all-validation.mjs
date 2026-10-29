import assert from 'node:assert/strict'
import { createUlid } from '../../src/core/shared/ids.ts'
import { newField } from '../../src/ui/records/schema/templates.ts'
import { recordsCsvHttp } from '../../src/domains/records/csv-http.server.ts'
import { encodeCsv } from '../../src/domains/portability/csv.ts'
import { writeWorkbook } from '../../src/domains/records/workbooks/write.ts'

export async function createAllValidation(h) {
 const key=newField('Key'),code={...newField('Code'),unique:true,defaultValue:'synthetic-cradle-default'},phone=newField('Phone','phone')
 const draft={appId:createUlid(),name:'synthetic-cradle-create-validation',tables:[{id:createUlid(),label:'Rows',fields:[key,code,phone]}]}
 let {r}=await h.create(draft)
 const identity={appId:draft.appId,entityId:draft.tables[0].id},fields=[key,code,phone],origin='https://records.test'
 const read=async()=>{const scope=await r.policy.scope(h.ctx,{...identity,purpose:'read'});return (await r.services.reader.query(h.ctx,scope,{})).items}
 async function preview(rows,workbook=false,withoutCode=false) {
  const selected=withoutCode?[key,phone]:fields,headers=selected.map(field=>field.label),mapping=selected.map(field=>({column:field.label,fieldId:field.id}))
  const source=workbook?{workbook:{filename:'synthetic-cradle-validation.xlsx',sheet:'Rows',base64:Buffer.from(writeWorkbook([{name:'Rows',headers,rows:rows.map(row=>row.map(value=>({value,type:'text'})))}])).toString('base64')}}:{csv:encodeCsv(headers,rows)}
  const response=await recordsCsvHttp(r.csv,async()=>h.ctx).fetch(new Request(origin+'/api/v1/records/import-preview',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...identity,...source,mapping,mergeFieldId:'_create_all'})})),body=await response.json()
  assert.equal(response.status,200,JSON.stringify(body));return body.data
 }
 const initial=await preview([['Existing','synthetic-cradle-original','(555) 123-4567']])
 await r.csv.commit(h.ctx,createUlid(),initial.id)
 const original=(await read())[0]
 const defaults=await preview([['First default','555-123-4572'],['Second default','555-123-4573']],false,true)
 assert.deepEqual([defaults.creates,defaults.rejected],[0,2],'Unmapped defaults participate in unique validation')
 for(const error of defaults.errors)assert.match(error.message,/Code.*unique/)
 await assert.rejects(r.csv.commit(h.ctx,createUlid(),defaults.id),/no valid rows/i)
 assert.deepEqual(await read(),[original])
 for(const workbook of [false,true]) {
  const suffix=workbook?'xlsx':'csv'
  const review=await preview([
   ['Existing','synthetic-cradle-duplicate-'+suffix,'555-123-4568'],
   ['Existing','synthetic-cradle-duplicate-'+suffix,'+15551234569'],
   ['Existing','synthetic-cradle-original','555-123-4570'],
   ['Existing','synthetic-cradle-valid-'+suffix,'(555) 123-4571'],
   ['Bad phone','synthetic-cradle-invalid-'+suffix,'not a phone'],
  ],workbook)
  assert.deepEqual([review.creates,review.updates,review.unchanged,review.rejected],[1,0,0,4])
  assert.deepEqual(review.errors.map(error=>error.row),[2,3,4,6])
  for(const error of review.errors.slice(0,3))assert.match(error.message,/Code.*unique/)
  assert.match(review.errors[3].message,/Phone.*E\.164/)
  assert.equal(review.rows[0].row,5);assert.equal(review.rows[0].values[phone.id],'+15551234571')
  const before=await read(),commandId=createUlid(),receipt=await r.csv.commit(h.ctx,commandId,review.id)
  assert.deepEqual(receipt.result.value,{id:review.id,creates:1,updates:0,unchanged:0,rejected:4})
  r=await h.runtime()
  assert.deepEqual((await r.csv.commit(h.ctx,commandId,review.id)).result,receipt.result)
  const after=await read();assert.equal(after.length,before.length+1)
  for(const row of before)assert.deepEqual(after.find(item=>item.id===row.id),row)
  assert.equal(after.find(row=>row.id===review.rows[0].id).fields[phone.id].value,'+15551234571')
 }
 assert.deepEqual((await read()).find(row=>row.id===original.id),original)
}
