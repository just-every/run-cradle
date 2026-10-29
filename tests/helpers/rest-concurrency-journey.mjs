import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createUlid} from '../../src/core/shared/ids.ts'
import {recordLimits} from '../../src/domains/records/capacity.ts'
const {Agent}=createRequire(import.meta.resolve('miniflare'))('undici')

export async function restConcurrencyJourney(h){
 const dispatcher=new Agent({pipelining:0})
 const fixture=async(count,name)=>{
  const appId=createUlid(),tables=Array.from({length:count},(_,i)=>{const id=createUlid(),nameId=createUlid(),valueId=createUlid();return{id,nameId,valueId,label:`Concurrency items ${i}`,primaryFieldId:nameId,fields:[{id:nameId,label:'Name',type:'text',required:true,unique:true},{id:valueId,label:'Value',type:'text',required:false,unique:false}]}})
  const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:{appId,name,tables:tables.map(({nameId,valueId,...table})=>table)}})).data
  await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
  const schemas=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items
  for(const table of tables){table.version=schemas.find(schema=>schema.id===table.id).version;table.key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{appId,entityId:table.id,expiresAt:new Date(Date.now()+86400000).toISOString(),commandId:createUlid(),name:'synthetic-cradle-502 concurrency key',permissions:'write'}})).data.key}
  const document=await h.request(`/api/v1/apps/${appId}/openapi.json`)
  const operations=Object.entries(document.paths).flatMap(([path,methods])=>Object.entries(methods).map(([method,operation])=>({path,method:method.toUpperCase(),operation})))
  const call=async(table,name,body)=>{
   const item=operations.find(item=>item.operation['x-cradle-operation']===name&&item.operation['x-cradle-entityId']===table.id);assert.ok(item,`OpenAPI supplies ${name}`)
   const response=await fetch(h.origin+item.path,{dispatcher,method:item.method,headers:{authorization:`Bearer ${table.key.secret}`,'content-type':'application/json'},body:JSON.stringify(body)})
   return {status:response.status,value:await response.json()}
  }
  const query=async table=>{const response=await call(table,'query',{limit:200});assert.equal(response.status,200,JSON.stringify(response.value));return response.value.data}
  const counter=async(table,rowCount)=>{const changed=await h.db.prepare('UPDATE record_capacity SET row_count=? WHERE app_id=? AND entity_id=?').bind(rowCount,appId,table.id).run();assert.equal(changed.meta.changes,1)}
  const createdInput=(table,name)=>({commandId:createUlid(),schemaVersion:table.version,values:{[table.nameId]:name}})
  return{appId,tables,call,query,counter,createdInput}
 }
 try{
  const upsert=await fixture(1,'synthetic-cradle-501 concurrent upsert'),table=upsert.tables[0]
  const merge='synthetic-cradle-503 shared merge value',input={schemaVersion:table.version,mergeFieldId:table.nameId,values:{[table.nameId]:merge}}
  const requests=['synthetic-cradle-504 first','synthetic-cradle-505 second'].map(value=>({...input,commandId:createUlid(),values:{...input.values,[table.valueId]:value}}))
  const outcomes=await Promise.all(requests.map(body=>upsert.call(table,'upsert',body)))
  assert.ok(outcomes.some(outcome=>outcome.status===200),'At least one concurrent upsert commits')
  for(const outcome of outcomes){assert.ok([200,409].includes(outcome.status),`Concurrent upsert must commit or report a conflict: ${JSON.stringify(outcome)}`);if(outcome.status===200)assert.equal(outcome.value.data.result.state,'committed')}
  const after=await upsert.query(table)
  assert.equal(after.total.value,1,'Concurrent unique upserts never create two merge targets');assert.equal(after.items[0].fields[table.nameId].value,merge)
  const id=after.items[0].id
  for(const outcome of outcomes.filter(outcome=>outcome.status===200))assert.equal(outcome.value.data.result.value.rows[0].id,id)
  const retry=await upsert.call(table,'upsert',{...input,commandId:createUlid(),values:{...input.values,[table.valueId]:'synthetic-cradle-506 retry'}})
  assert.equal(retry.status,200,JSON.stringify(retry.value));assert.equal(retry.value.data.result.value.rows[0].id,id)
  const retried=await upsert.query(table)
  assert.equal(retried.total.value,1);assert.equal(retried.items[0].fields[table.valueId].value,'synthetic-cradle-506 retry')
  for(const [index,outcome]of outcomes.entries())assert.equal(await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(requests[index].commandId).first('n'),outcome.status===200?1:0,'A refused race has no admission')

  // Seed durable capacity counters at the boundary; this proves atomic admission, not physical scale.
  const capacity=await fixture(1,'synthetic-cradle-507 table capacity'),target=capacity.tables[0]
  await capacity.counter(target,recordLimits.recordsPerTable-1)
  const batch={commandId:createUlid(),schemaVersion:target.version,operation:'create',rows:['synthetic-cradle-508 first rejected batch row','synthetic-cradle-509 second rejected batch row'].map(name=>({values:{[target.nameId]:name}}))}
  const denied=await capacity.call(target,'batch',batch)
  assert.equal(denied.status,409,JSON.stringify(denied.value));assert.equal(denied.value.error.code,'capacity_limit')
  assert.equal((await capacity.query(target)).total.value,0,'An over-capacity batch commits no prefix')
  assert.equal(await h.db.prepare('SELECT row_count FROM record_capacity WHERE app_id=? AND entity_id=?').bind(capacity.appId,target.id).first('row_count'),recordLimits.recordsPerTable-1,'A refused batch rolls back its capacity claims')
  assert.equal(await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(batch.commandId).first('n'),0)
  const creates=['synthetic-cradle-510 slot A','synthetic-cradle-511 slot B'].map(name=>capacity.createdInput(target,name))
  const slots=await Promise.all(creates.map(body=>capacity.call(target,'create',body)))
  assert.deepEqual(slots.map(result=>result.status).sort(),[200,409],JSON.stringify(slots))
  const stored=await capacity.query(target),winner=slots.findIndex(result=>result.status===200)
  assert.equal(stored.total.value,1);assert.equal(stored.items[0].fields[target.nameId].value,creates[winner].values[target.nameId])
  assert.equal(await h.db.prepare('SELECT row_count FROM record_capacity WHERE app_id=? AND entity_id=?').bind(capacity.appId,target.id).first('row_count'),recordLimits.recordsPerTable)
  for(const [index,result]of slots.entries())assert.equal(await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(creates[index].commandId).first('n'),result.status===200?1:0)

  const base=await fixture(3,'synthetic-cradle-512 base capacity'),[left,right,reserve]=base.tables
  const perTable=Math.floor(recordLimits.recordsPerBase/3)
  await base.counter(left,perTable);await base.counter(right,perTable);await base.counter(reserve,recordLimits.recordsPerBase-perTable*2-1)
  const baseCreates=[base.createdInput(left,'synthetic-cradle-513 base slot A'),base.createdInput(right,'synthetic-cradle-514 base slot B')]
  const baseSlots=await Promise.all(baseCreates.map((body,index)=>base.call(base.tables[index],'create',body)))
  assert.deepEqual(baseSlots.map(result=>result.status).sort(),[200,409],JSON.stringify(baseSlots))
  const [leftRows,rightRows]=await Promise.all([base.query(left),base.query(right)])
  assert.equal(leftRows.total.value+rightRows.total.value,1,'Concurrent creates in different tables share the final base slot')
  assert.equal(await h.db.prepare('SELECT sum(row_count) n FROM record_capacity WHERE app_id=?').bind(base.appId).first('n'),recordLimits.recordsPerBase)
  const baseWinner=baseSlots.findIndex(result=>result.status===200),winningRows=baseWinner===0?leftRows:rightRows,winningTable=base.tables[baseWinner]
  assert.equal(winningRows.items[0].fields[winningTable.nameId].value,baseCreates[baseWinner].values[winningTable.nameId])
  for(const [index,result]of baseSlots.entries()){if(result.status===409)assert.ok(['capacity_limit','version_conflict'].includes(result.value.error.code),JSON.stringify(result.value));assert.equal(await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(baseCreates[index].commandId).first('n'),result.status===200?1:0)}
 }finally{await dispatcher.close()}
}
