import assert from 'node:assert/strict'
import {prepareApiSource} from '../../src/domains/records/base-transfer/source-api.ts'
import {allocateImportIdentities} from '../../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../../src/domains/records/base-transfer/plan.ts'
import {parseBaseCsv} from '../../src/domains/records/base-transfer/parse.ts'
import {createUlid} from '../../src/core/shared/ids.ts'
import {AUTHORITY_ENTITY_IDS} from '../../src/domains/authority/contracts.ts'
import {adopt,reviewRecordedSource,jobAction,finish} from './import-effects.mjs'
import {userAutomationRuntime} from './user-automation-runtime.mjs'

const jobs='/api/v1/records/base-import/jobs/'
export async function sourceRecordMapFixture(personal='synthetic-cradle') {
 const tables=[{id:'synthetic-cradle-table-1',name:'Orders'},{id:'synthetic-cradle-table-2',name:'Vendors'}]
 // The same record ID in two source tables is two identities, never a collision.
 const truth=[...Array.from({length:23},(_,i)=>({sourceTableId:tables[0].id,sourceRecordId:`synthetic-cradle-${i+1}`,name:`${personal} order ${i+1}`,amount:String(i+1)})),
  {sourceTableId:tables[1].id,sourceRecordId:'synthetic-cradle-1',name:`${personal} vendor`,amount:'24'}]
 const metadata={tables:tables.map(table=>({...table,primaryFieldId:'name',fields:[{id:'name',name:'Name',type:'singleLineText'},{id:'amount',name:'Amount',type:'number'}]}))}
 const source=await prepareApiSource({namespace:personal,metadataUrl:'https://recorded.example.test/metadata',recordsUrl:key=>`https://recorded.example.test/${key}`},async request=>{
  const key=new URL(request.url).pathname.slice(1)
  const records=truth.filter(row=>row.sourceTableId===key).map(row=>({id:row.sourceRecordId,fields:{name:row.name,amount:Number(row.amount)}}))
  if(key===tables[0].id)records.push({id:'synthetic-cradle-rejected',fields:{name:'Rejected source row',amount:'invalid number'}})
  return Response.json(key==='metadata'?metadata:{records})
 })
 const preview=previewBaseImport(source,{name:'Recorded source ID map',tables:Object.fromEntries(tables.map(table=>[table.id,{columns:{amount:{type:'number'}}}]))},allocateImportIdentities(source))
 assert.equal(preview.report.tables.reduce((sum,table)=>sum+table.rejected,0),1)
 return {preview,truth,tables}
}
export async function recordMapClient(h) {
 const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
 return {...h,request:async(route,{method='GET',body,status=200}={})=>{
  const response=await fetch(h.origin+route,{method,headers:{cookie:h.cookie,...(body?{origin:h.origin,'content-type':'application/json','x-csrf-token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result
 }}
}
export function parseRecordMapCsv(text) {
 const csv=parseBaseCsv(new TextEncoder().encode(text),'source-record-map.csv')
 return csv.rows.map(row=>Object.fromEntries(csv.headers.map((header,i)=>[header,row.cells[i]])))
}
export async function downloadRecordMap(h,id,format) {
 const response=await fetch(h.origin+jobs+id+'/source-record-map.'+format,{headers:{cookie:h.cookie}})
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')
 assert.match(response.headers.get('content-disposition'),/^attachment;/)
 assert.match(response.headers.get('content-type'),format==='json'?/application\/json/:/text\/csv/)
 const text=await response.text();return {text,value:format==='json'?JSON.parse(text):parseRecordMapCsv(text)}
}
/** Native destination identities come from public schema and record readback, never the preview's allocation. */
export async function assertRecordMap(h,job,fixture,rows) {
 const draft=(await h.request(`/api/v1/records/bases/${job.destination}`)).data,expected=[]
 for(const table of fixture.tables){
  const adopted=draft.tables.find(item=>item.label===table.name),nameId=adopted.fields.find(field=>field.label==='Name').id,amountId=adopted.fields.find(field=>field.label==='Amount').id
  const live=(await h.request(`/api/v1/apps/${job.destination}/entities/${adopted.id}/query`,{method:'POST',body:{limit:100}})).data.items
  const sourceRows=fixture.truth.filter(row=>row.sourceTableId===table.id)
  assert.equal(live.length,sourceRows.length,'Rejected rows are absent from adopted native records')
  for(const source of sourceRows){
   const record=live.find(row=>row.fields[nameId].value===source.name);assert.ok(record)
   assert.equal(record.fields[amountId].value,source.amount)
   expected.push({sourceTableId:source.sourceTableId,sourceRecordId:source.sourceRecordId,appId:job.destination,entityId:adopted.id,recordId:record.id})
  }
 }
 const ordered=value=>[...value].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
 assert.deepEqual(ordered(rows),ordered(expected))
 assert.equal(new Set(rows.map(row=>JSON.stringify([row.sourceTableId,row.sourceRecordId]))).size,fixture.truth.length)
 for(const row of rows){
  const live=(await h.request(`/api/v1/apps/${row.appId}/entities/${row.entityId}/records/${row.recordId}`)).data.record
  assert.equal(live.id,row.recordId)
 }
 return expected
}
export async function refuseRecordMaps(h,id,status=409) {
 for(const format of ['csv','json']){
  const response=await fetch(h.origin+jobs+id+'/source-record-map.'+format,{headers:{cookie:h.cookie}})
  assert.equal(response.status,status);assert.equal(response.headers.get('content-disposition'),null)
  const body=await response.json();assert.ok(body.error);assert.equal(body.records,undefined);assert.equal(body.data,undefined)
 }
}
export async function sourceRecordMapJourney() {
 const h=await userAutomationRuntime(0)
 try {
 // This person is seeded as a native operator; the dangerous remove and erase paths use public commands.
 const name='synthetic-cradle-905',email=[name,'example.test'].join('@'),basePerson=createUlid()
 await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(basePerson,email,name,Date.now()).run()
 const person=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(basePerson).first()).principal_id
 const fixture=await sourceRecordMapFixture(email),job=await adopt(h,await reviewRecordedSource(h,fixture.preview))
 await refuseRecordMaps(h,job.id)
 await jobAction(h,job.id,'resume');await refuseRecordMaps(h,job.id)
 const pending=(await h.request(jobs+job.id+'/receipt.json')).data
 assert.equal(pending.sourceRecordMap.available,false);assert.equal(pending.sourceRecordMap.recordCount,0)
 await finish(h,job.id,'resume','completed')
 const json=await downloadRecordMap(h,job.id,'json'),csv=await downloadRecordMap(h,job.id,'csv')
 assert.equal(json.value.jobId,job.id);assert.equal(json.value.sourceKind,'api')
 assert.deepEqual(csv.value,json.value.records)
 await assertRecordMap(h,job,fixture,json.value.records)
 assert.equal((await h.request(jobs+job.id+'/receipt.json')).data.sourceRecordMap.recordCount,24)
 await h.restart()
 assert.equal((await downloadRecordMap(h,job.id,'json')).text,json.text)
 assert.equal((await downloadRecordMap(h,job.id,'csv')).text,csv.text)

 const mismatchFixture=await sourceRecordMapFixture(),mismatch=await adopt(h,await reviewRecordedSource(h,mismatchFixture.preview))
 await finish(h,mismatch.id,'resume','completed')
 const first=(await downloadRecordMap(h,mismatch.id,'json')).value.records[0],route=`/api/v1/apps/${first.appId}/entities/${first.entityId}/records/${first.recordId}`,record=(await h.request(route)).data.record
 const schema=(await h.request(`/api/v1/apps/${first.appId}/entities/${first.entityId}`)).data,amount=schema.fields.find(field=>field.label==='Amount').id
 await h.request('/api/v1/commands/record.patch',{method:'POST',body:{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,changes:{[amount]:'99'}}}})
 await refuseRecordMaps(h,mismatch.id)
 assert.equal((await h.request(jobs+mismatch.id+'/receipt.json')).data.sourceRecordMap.available,false)
 assert.equal((await h.request(route)).data.record.fields[amount].value,'99','Refused downloads cannot revert a native edit')

 // A second completed control remains readable after reversal and erasure of the first custody.
 const controlFixture=await sourceRecordMapFixture(),control=await adopt(h,await reviewRecordedSource(h,controlFixture.preview))
 await finish(h,control.id,'resume','completed');const controlMap=await downloadRecordMap(h,control.id,'json')
 // Keep a second personal import completed: erasure must fence a map that was
 // readable, independently of the already tested reversal-state refusal.
 const retiredFixture=await sourceRecordMapFixture(email),retired=await adopt(h,await reviewRecordedSource(h,retiredFixture.preview))
 await finish(h,retired.id,'resume','completed')
 const retiredMap=await downloadRecordMap(h,retired.id,'json')
 await assertRecordMap(h,retired,retiredFixture,retiredMap.value.records)
 assert.equal((await h.request(jobs+retired.id+'/receipt.json')).data.sourceRecordMap.available,true)
 await finish(h,job.id,'undo','undone');await refuseRecordMaps(h,job.id)
 await h.request(`/api/v1/records/bases/${h.appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:person,role:'editor',version:0}})
 const version=async()=>(await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(person).first()).version
 const memberClient=await recordMapClient(h)
 for(const verb of ['remove','erase']){
  const result=await memberClient.request('/api/v1/commands/member.'+verb,{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:AUTHORITY_ENTITY_IDS.member,recordId:person},version:await version()}],input:{memberId:person,reason:'synthetic-cradle-906'}}})
  if(verb==='erase')assert.equal(result.data.value.confirmed,true)
 }
 assert.ok(await h.db.prepare("SELECT 1 FROM ik_d1_retirements WHERE id=? AND kind='job'").bind(job.id).first(),'The public erasure retired the source custody')
 assert.ok(await h.db.prepare("SELECT 1 FROM ik_d1_retirements WHERE id=? AND kind='job'").bind(retired.id).first(),'The public erasure also retired completed source custody')
 await refuseRecordMaps(h,job.id)
 await refuseRecordMaps(h,retired.id)
 const retiredReceipt=await h.request(jobs+retired.id+'/receipt.json',{status:409})
 assert.equal(retiredReceipt.data,undefined,'Retired custody cannot advertise an available map')
 await h.request(jobs+retired.id+'/resume',{method:'POST',body:{},status:409})
 await h.restart();await refuseRecordMaps(h,job.id)
 await refuseRecordMaps(h,retired.id)
 assert.equal((await h.request(jobs+retired.id+'/receipt.json',{status:409})).data,undefined)
 assert.equal((await downloadRecordMap(h,control.id,'json')).text,controlMap.text)
 // Restored custody must be confirmed by the current owner before its map can be read.
 await h.db.prepare('UPDATE ik_jobs SET cradle_restore_hold=1 WHERE id=?').bind(control.id).run()
 await refuseRecordMaps(h,control.id)
 assert.equal((await h.request(jobs+control.id+'/receipt.json')).data.sourceRecordMap.available,false)
 await jobAction(h,control.id,'resume')
 assert.equal((await downloadRecordMap(h,control.id,'json')).text,controlMap.text)
 const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(control.destination).first()
 const narrowed=JSON.parse(policy.rules_json).map(rule=>rule.entityId===controlMap.value.records[0].entityId?{...rule,readableFields:[]}:rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrowed),policy.id).run()
 await refuseRecordMaps(h,control.id,403)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()
 assert.equal((await downloadRecordMap(h,control.id,'json')).text,controlMap.text,'Restored current authority reads the original correspondence')
 await h.request('/auth/sign-out',{method:'POST',body:{}})
 await refuseRecordMaps(h,control.id,401)
 }finally{await h.close()}
}
