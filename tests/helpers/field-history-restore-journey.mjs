import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
/** A canonical stored relationship must not look like a type conversion when
 * a field is restored after an earlier schema revision and phone conversion. */
export async function historicalLinkedFieldRestore(h){
 const [appId,orders,vendors,legacy,name,phone,memo,link,vendorName,legacyName,amount]=Array.from({length:11},()=>createUlid())
 const field=(id,label,type='text',extra={})=>({id,label,type,required:false,unique:false,...extra})
 const draft={appId,name:'synthetic-cradle-410',tables:[{id:orders,label:'Orders',primaryFieldId:name,fields:[field(name,'Name'),field(phone,'Phone'),field(memo,'Memo'),field(amount,'Amount'),field(link,'Vendor','relation',{relation:{ownerAppId:appId,entityId:vendors,cardinality:'one',onDelete:'restrict'}})]},{id:vendors,label:'Vendors',primaryFieldId:vendorName,fields:[field(vendorName,'Vendor')]},{id:legacy,label:'Legacy',primaryFieldId:legacyName,fields:[field(legacyName,'Legacy')]}]}
 const readDraft=async()=>(await h.request(`/api/v1/records/bases/${appId}`)).data
 const adopt=async draft=>{const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data;await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})}
 async function create(entityId,values){const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data;return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,values}}})).data.value}
 await adopt(draft)
 const vendor=await create(vendors,{[vendorName]:'synthetic-cradle-411'}),rows=[]
 for(const [index,value]of ['1250.50','Awaiting quote'].entries())rows.push(await create(orders,{[name]:'synthetic-cradle-'+(412+index),[phone]:'5551234567',[memo]:'synthetic-cradle-'+(414+index),[amount]:value,[link]:index===0?vendor.ref:null}))
 let edit=await readDraft();edit.tables[0].fields.find(field=>field.id===phone).type='phone';await adopt(edit)
 rows.push(await create(orders,{[name]:'synthetic-cradle-416',[phone]:'+15551234567',[memo]:null,[amount]:null,[link]:null}))
 edit=await readDraft();edit.tables=edit.tables.filter(table=>table.id!==legacy);edit.tables[0].fields=edit.tables[0].fields.filter(field=>field.id!==memo);edit.tables[0].fields.find(field=>field.id===amount).type='number';await adopt(edit)
 const marker=(await h.request(`/api/v1/records/trash?appId=${appId}`)).data.items.find(item=>item.kind==='field'&&item.id===memo)
 await h.request('/api/v1/records/trash/restore',{method:'POST',body:{kind:'field',commandId:createUlid(),appId,entityId:orders,recordId:memo,version:marker.version}})
 for(const [index,row]of rows.entries()){
  const current=(await h.request(`/api/v1/apps/${appId}/entities/${orders}/records/${row.id}`)).data.record
  assert.equal(current.fields[memo].value,row.fields[memo].value);assert.equal(current.fields[phone].value,'+15551234567')
  assert.deepEqual(current.fields[link].value,index===0?vendor.ref:null)
 }
 assert.equal((await h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 console.log('FIELD_HISTORICAL_RESTORE PASS canonical relationship, prior phone conversion, newer row and retained links')
}
