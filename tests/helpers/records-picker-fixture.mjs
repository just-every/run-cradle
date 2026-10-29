import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'

export const pickerCommand=(input,expected=[])=>({commandId:createUlid(),expected,input})
const schemaEntity='00000000000000000000000001',viewEntity='00000000000000000000000002'

/** The fixture is independent of candidate results. Only initial record seeding
 * uses storage; authoring, candidate reads and chosen writes use public doors. */
export async function vendorPickerFixture({db,call,descriptors},label){
 const appId=createUlid(),vendors=createUlid(),orders=createUlid()
 const name=newField('Vendor'),city=newField('City'),active=newField('Active','boolean'),secret=newField('Private context'),order=newField('Order'),link=newField('Vendor link','relation')
 link.relation={ownerAppId:appId,entityId:vendors,cardinality:'one',onDelete:'restrict'}
 const draft={appId,name:label,tables:[{id:vendors,label:'Vendors',primaryFieldId:name.id,fields:[name,city,active,secret]},{id:orders,label:'Orders',primaryFieldId:order.id,fields:[order,link]}]}
 const preview=await call('/api/v1/records/schema-preview',draft)
 await call('/api/v1/commands/release.adopt',pickerCommand({kind:'manual_schema',previewId:preview.id}))
 const descriptor=(await descriptors()).get(appId,vendors),column=field=>'"'+descriptor.fields.get(field.id).column+'"',now=new Date().toISOString()
 const rows=Array.from({length:5000},(_,index)=>({id:createUlid(),index,name:`synthetic-cradle-${String(index).padStart(4,'0')}`,city:index===4997?'Distant city':index===4998?'Inactive city':index===4999?'Hidden city':`City ${index%11}`,active:index%3!==0}))
 const insert=`INSERT INTO "${descriptor.table.tableId}"(id,version,created_at,updated_at,lifecycle,schema_version,${[name,city,active,secret].map(column).join(',')}) VALUES(?,1,?,?,'active',1,?,?,?,?)`
 async function populate(){const current=(await descriptors()).get(appId,vendors),sql=insert.replace(descriptor.table.tableId,current.table.tableId);for(let offset=0;offset<rows.length;offset+=100)await db.batch(rows.slice(offset,offset+100).map(row=>db.prepare(sql).bind(row.id,now,now,row.name,row.city,Number(row.active),'synthetic-cradle-private-context')))}
 const initial=await db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first()
 const rules=JSON.parse(initial.rules_json),principals=rules.find(rule=>rule.entityId===vendors&&rule.effect==='allow').principals
 const definition={appId,entityId:vendors,name:'Active vendors',display:'grid',fields:[name.id],filter:{kind:'condition',fieldId:active.id,op:'eq',value:true},sort:[{fieldId:name.id,direction:'asc'}],groupBy:[],layout:{titleFieldId:name.id},visibility:'app',shipped:false}
 let view
 async function saveView(filter=definition.filter){
  const current={...definition,filter},expected=view?[{ref:{appId,entityId:viewEntity,recordId:view.id},version:view.version}]:[]
  view=(await call('/api/v1/commands/view.save',pickerCommand({...(view?{id:view.id}:{}),view:current},expected))).value
  return view
 }
 async function configure(){
  const next=await call(`/api/v1/records/bases/${appId}`),field=next.tables.find(table=>table.id===orders).fields.find(field=>field.id===link.id)
  field.linkPicker={searchFieldIds:[city.id,secret.id],displayFieldIds:[city.id,active.id,secret.id],viewId:view.id}
  const preview=await call('/api/v1/records/schema-preview',next)
  await call('/api/v1/commands/release.adopt',pickerCommand({kind:'manual_schema',previewId:preview.id}))
 }
 async function restrict({hideCity=false,hideAnother=false,hideSource=false}={}){
  const next=structuredClone(rules)
  for(const rule of next){
   if(rule.entityId===vendors)rule.readableFields=rule.readableFields.filter(id=>id!==secret.id&&(!hideCity||id!==city.id))
   if(rule.entityId===orders&&hideSource)rule.readableFields=rule.readableFields.filter(id=>id!==link.id)
  }
  next.push({id:createUlid(),principals,entityId:vendors,rows:{kind:'condition',fieldId:name.id,op:'in',value:[rows[4999].name,...(hideAnother?[rows[2].name]:[])]},readableFields:[],writableFields:[],actions:[],effect:'deny',purposes:['read','export']})
  await db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(next),initial.id).run()
 }
 const candidates=(input={},status=200)=>call('/api/v1/records/link-candidates',{appId,entityId:orders,fieldId:link.id,...input},status)
 const expected=rows.filter(row=>row.active&&row.index!==4999)
 return {appId,vendors,orders,name,city,active,secret,order,link,rows,expected,definition,populate,saveView,configure,restrict,candidates,setView:value=>{view=value},get view(){return view},schemaEntity}
}

export function assertPickerPage(result,f,{hideCity=false}={}){
 assert.ok(result.records.items.length<=50,'The public picker keeps bounded candidate pages')
 assert.ok(!JSON.stringify(result).includes('synthetic-cradle-private-context'),'Unreadable context is absent from the complete response')
 for(const ids of [result.schema.fields.map(field=>field.id),result.searchFieldIds,result.displayFieldIds]){
  assert.ok(!ids.includes(f.secret.id),'Unreadable field identities are omitted')
  if(hideCity)assert.ok(!ids.includes(f.city.id),'Newly unreadable city metadata is omitted')
 }
 for(const row of result.records.items){assert.ok(f.expected.some(expected=>expected.id===row.id),'Only independently permitted active vendors appear');assert.ok(!Object.hasOwn(row.fields,f.secret.id));if(hideCity)assert.ok(!Object.hasOwn(row.fields,f.city.id))}
}

export async function enumeratePicker(f,input={},expected=f.expected,options={}){
 const found=[],cursors=new Set();let cursor,pages=0
 do{
  const result=await f.candidates({...input,...(cursor?{cursor}:{})});assertPickerPage(result,f,options)
  assert.equal(result.records.total.value,expected.length,'Totals count only current permitted matches')
  found.push(...result.records.items.map(row=>row.id));pages++
  cursor=result.records.nextCursor
  if(cursor){assert.ok(!cursors.has(cursor),'Each page advances');cursors.add(cursor)}
  assert.ok(pages<=101,'Paging terminates within the fixture bound')
 }while(cursor)
 assert.deepEqual(found,expected.map(row=>row.id),'Every permitted active vendor appears once, in authored view order')
 return {pages,candidates:found.length}
}
