import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'

export const pickerCommand=(input,expected=[])=>({commandId:createUlid(),input,expected})
export const pickerRows=()=>Array.from({length:5000},(_,index)=>({
 id:createUlid(),name:`synthetic-cradle-${String(index).padStart(4,'0')}`,
 city:index===4879?'Distant city':`City ${index%23}`,
 active:index%4!==0,allowed:index%11!==0,private:`Private context ${index}`,
}))

/** Adopt the ordinary narrow schema, then seed a deterministic populated table.
 * Expectations come from this inventory, independently of the candidate query. */
export async function pickerScaleFixture(h,call,descriptors){
 const appId=createUlid(),vendorsId=createUlid(),ordersId=createUlid()
 const name=newField('Vendor'),city=newField('City'),active=newField('Active','boolean'),allowed=newField('Allowed','boolean'),privateField=newField('Private context'),order=newField('Order'),vendor=newField('Vendor link','relation')
 vendor.relation={ownerAppId:appId,entityId:vendorsId,cardinality:'one',onDelete:'restrict'}
 const draft={appId,name:'Vendor purchasing',tables:[{id:vendorsId,label:'Vendors',primaryFieldId:name.id,fields:[name,city,active,allowed,privateField]},{id:ordersId,label:'Orders',primaryFieldId:order.id,fields:[order,vendor]}]}
 const preview=await call('/api/v1/records/schema-preview',draft)
 await call('/api/v1/commands/release.adopt',pickerCommand({kind:'manual_schema',previewId:preview.id}))
 const rows=pickerRows()
 async function seed(){
 const d=(await descriptors()).get(appId,vendorsId),now=new Date().toISOString()
 const columns=[name,city,active,allowed,privateField].map(field=>'"'+d.fields.get(field.id).column+'"').join(',')
 for(let offset=0;offset<rows.length;offset+=100)await h.db.batch(rows.slice(offset,offset+100).map(row=>h.db.prepare(`INSERT INTO "${d.table.tableId}"(id,version,created_at,updated_at,lifecycle,schema_version,${columns}) VALUES(?,1,?,?,'active',1,?,?,?,?,?)`).bind(row.id,now,now,row.name,row.city,Number(row.active),Number(row.allowed),row.private)))
 }
 const stored=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),rules=JSON.parse(stored.rules_json)
 const target=rules.find(rule=>rule.entityId===vendorsId)
 assert.ok(target)
 target.rows={kind:'condition',fieldId:allowed.id,op:'eq',value:true}
 target.readableFields=target.readableFields.filter(id=>id!==privateField.id)
 async function policy(next=rules){await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(next),stored.id).run()}
 const viewDefinition={appId,entityId:vendorsId,name:'Active vendors',display:'grid',fields:[name.id,city.id],filter:{kind:'condition',fieldId:active.id,op:'eq',value:true},sort:[{fieldId:name.id,direction:'asc'}],groupBy:[],layout:{titleFieldId:name.id},visibility:'app',shipped:false}
 const request={appId,entityId:ordersId,fieldId:vendor.id}
 return {appId,vendorsId,ordersId,name,city,active,allowed,privateField,order,vendor,rows,rules,policy,seed,viewDefinition,request,
  expected:rows.filter(row=>row.active&&row.allowed),
  candidates:(input={},status=200)=>call('/api/v1/records/link-candidates',{...request,...input},status),
 }
}

export async function configureScalePicker(call,f,view){
 const draft=await call(`/api/v1/records/bases/${f.appId}`)
 draft.tables.find(table=>table.id===f.ordersId).fields.find(field=>field.id===f.vendor.id).linkPicker={searchFieldIds:[f.city.id,f.privateField.id],displayFieldIds:[f.city.id,f.privateField.id],viewId:view.id}
 const preview=await call('/api/v1/records/schema-preview',draft)
 await call('/api/v1/commands/release.adopt',pickerCommand({kind:'manual_schema',previewId:preview.id}))
}

/** Walk every bounded public page; never derive the expected inventory from it. */
export async function enumeratePicker(f,expected=f.expected){
 const actual=[],seen=new Set();let cursor,pages=0
 do{
  const result=await f.candidates(cursor?{cursor}:{})
  assert.ok(++pages<=101,'The picker finishes within the finite fixture page budget')
  assert.ok(result.records.items.length<=50,'Candidate pages stay bounded')
  assert.equal(result.records.total.value,expected.length)
  assert.ok(!result.schema.fields.some(field=>field.id===f.privateField.id))
  assert.ok(!result.searchFieldIds.includes(f.privateField.id));assert.ok(!result.displayFieldIds.includes(f.privateField.id))
  for(const row of result.records.items){
   assert.ok(!seen.has(row.id),'No duplicate candidate across pages');seen.add(row.id)
   assert.equal(row.fields[f.privateField.id],undefined)
   actual.push({id:row.id,name:row.fields[f.name.id].value,city:row.fields[f.city.id].value})
  }
  cursor=result.records.nextCursor
 }while(cursor)
 assert.deepEqual(actual,expected.map(row=>({id:row.id,name:row.name,city:row.city})))
 return {pages,candidates:actual.length}
}
