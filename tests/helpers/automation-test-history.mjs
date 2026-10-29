import assert from 'node:assert/strict'
import {fileRecords} from '@runeditrun/rer/modules/portability/files'
import {createUlid} from '../../src/core/shared/ids.ts'

const result=value=>({id:value.id,mode:value.mode,state:value.state,definitionVersion:value.definitionVersion,recordId:value.recordId,trigger:value.trigger,steps:value.steps})
const ordered=rows=>rows.toSorted((a,b)=>a.id.localeCompare(b.id))

/** Populate distinct saved versions and outcomes through the actual builder test door. */
export async function populateAutomationTestHistory(h,mail,setMailStatus){
 const owner=await h.db.prepare('SELECT name,email FROM operators WHERE id=?').bind(h.operator).first()
 const schema=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
 const record=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:schema.version}],input:{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:'synthetic-cradle-5101'}}}})).data.value
 const definition={name:'synthetic-cradle-5102',appId:h.appId,entityId:h.entityId,event:'created',enabled:false,actions:[
  {kind:'update',fieldId:h.statusId,value:'synthetic-cradle-5106'},
  {kind:'notify',operatorId:h.operator,title:'synthetic-cradle-5103'},
  {kind:'email',operatorId:h.operator,subject:'synthetic-cradle-5104',text:owner.name+' '+owner.email},
 ]}
 const save=async(definition,prior)=>(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition,...(prior?{id:prior.id,version:prior.version}:{})}})).data.result.value
 const first=await save(definition),route=`/api/user-automations/${first.id}/test`
 const test=async(body)=>(await h.request(route,{method:'POST',body:{commandId:createUlid(),recordId:record.id,event:'created',...body}})).data
 const beforeMail=mail.length,dry=await test()
 assert.equal(dry.mode,'dry');assert.equal(dry.state,'Complete');assert.equal(dry.definitionVersion,first.definitionVersion)
 assert.deepEqual(dry.steps.map(step=>step.state),['Complete','Complete','Complete'])
 assert.deepEqual(dry.steps[0].output,{fieldId:h.statusId,before:null,after:'synthetic-cradle-5106'})
 assert.equal(dry.steps[1].output.sent,false);assert.deepEqual(dry.steps[2].output.to,[owner.email])
 assert.equal(mail.length,beforeMail+1,'The populated dry history comes from one real builder-only send')
 assert.equal((await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${record.id}`)).data.record.fields[h.statusId].value,null,'Dry history has no update effect')
 const nextDefinition={...definition,actions:definition.actions.map(action=>action.kind==='update'?{...action,value:'synthetic-cradle-5107'}:action)}
 const second=await save(nextDefinition,first),preview=await test(),live=await test({live:{previewId:preview.id,effects:preview.confirmationEffects}})
 assert.notEqual(second.definitionVersion,first.definitionVersion);assert.equal(live.definitionVersion,second.definitionVersion)
 assert.equal(live.mode,'live');assert.equal(live.state,'Complete');assert.deepEqual(live.steps.map(step=>step.state),['Complete','Complete','Complete'])
 assert.equal((await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${record.id}`)).data.record.fields[h.statusId].value,'synthetic-cradle-5107')
 const uncertainInput={commandId:createUlid(),recordId:record.id,event:'created'},beforeUnknown=mail.length
 setMailStatus(503)
 let unknown
 try{unknown=(await h.request(route,{method:'POST',body:uncertainInput})).data}finally{setMailStatus(202)}
 assert.equal(unknown.mode,'dry');assert.equal(unknown.state,'Unknown');assert.equal(unknown.steps[2].state,'Unknown')
 assert.equal(mail.length,beforeUnknown+1)
 assert.deepEqual(result((await h.request(route,{method:'POST',body:uncertainInput})).data),result(unknown))
 assert.equal(mail.length,beforeUnknown+1,'The real uncertain test is replayed without another send')
 const fixture={automationId:first.id,appId:h.appId,entityId:h.entityId,recordId:record.id,ownerId:h.operator,owner,unknownInput:uncertainInput,
  runs:ordered([dry,preview,live,unknown].map(result)),versions:[{version:first.definitionVersion,definition},{version:second.definitionVersion,definition:nextDefinition}]}
 await assertAutomationTestHistory(h.db,fixture,'source')
 const publicRuns=(await h.request(`/api/user-automations/${first.id}/runs`)).data.runs
 assert.deepEqual(ordered(publicRuns.map(row=>({id:row.id,mode:row.testMode,state:row.state,version:row.definitionVersion,actions:row.actions.map(action=>action.state)}))),ordered(fixture.runs.map(row=>({id:row.id,mode:row.mode,state:row.state,version:row.definitionVersion,actions:row.steps.map(step=>step.state)}))),'The populated states are visible in the native history door')
 return fixture
}

function compare(rows,versions,fixture,stage){
 assert.equal(rows.length,fixture.runs.length,stage+': every populated test remains')
 assert.deepEqual(ordered(rows.map(row=>{assert.equal(row.mode,JSON.parse(row.result_json).mode);assert.equal(row.state,JSON.parse(row.result_json).state);assert.equal(row.definition_version,JSON.parse(row.result_json).definitionVersion);return result(JSON.parse(row.result_json))})),fixture.runs,stage+': dry, live and Unknown retain their distinct step inputs and outputs')
 assert.deepEqual(versions.map(row=>({version:row.definition_version,definition:JSON.parse(row.definition_json)})),fixture.versions,stage+': both approved definition snapshots remain exact')
 for(const row of rows){assert.equal(row.automation_id,fixture.automationId);assert.equal(row.owner_id,fixture.ownerId);assert.equal(row.record_id,fixture.recordId)}
}
export async function assertAutomationTestHistory(db,fixture,stage){
 const rows=(await db.prepare('SELECT * FROM record_automation_tests WHERE automation_id=? ORDER BY id').bind(fixture.automationId).all()).results
 const versions=(await db.prepare('SELECT * FROM record_automation_versions WHERE automation_id=? ORDER BY definition_version').bind(fixture.automationId).all()).results
 compare(rows,versions,fixture,stage)
 return rows
}
export async function assertAutomationTestArchive(path,fixture){
 const rows=[],versions=[]
 for await(const part of fileRecords(path))if(part.kind==='part')for(const item of part.items)if(item.kind==='row'&&item.row.automation_id===fixture.automationId){
  if(item.table==='record_automation_tests')rows.push(item.row)
  if(item.table==='record_automation_versions')versions.push(item.row)
 }
 compare(rows,versions.toSorted((a,b)=>a.definition_version-b.definition_version),fixture,'exported installation')
 assert.ok(versions.every(row=>row.credential_id===null),'Definition history exports no execution credential')
 console.log('AUTOMATION_TEST_ARCHIVE '+JSON.stringify({tests:rows.length,dry:rows.filter(row=>row.mode==='dry').length,live:rows.filter(row=>row.mode==='live').length,unknown:rows.filter(row=>row.state==='Unknown').length,versions:versions.length}))
}

/** Exercise the restored emitted event doors before and after fresh owner admission. */
export async function restoredAutomationTestHistory(runtime,db,request,fixture,readMail){
 const before=await assertAutomationTestHistory(db,fixture,'fresh installation'),mailBefore=(await readMail()).length
 assert.equal((await db.prepare('SELECT enabled FROM automations WHERE id=?').bind(fixture.automationId).first()).enabled,0)
 assert.equal((await db.prepare('SELECT count(*) n FROM authority_credentials').first()).n,0)
 const worker=await runtime.getWorker()
 assert.equal((await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.records.automations.v1',commandId:fixture.unknownInput.commandId}}])).outcome,'ok')
 assert.equal((await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()})).outcome,'ok')
 assert.deepEqual(await assertAutomationTestHistory(db,fixture,'restored event replay'),before,'Restored event doors cannot mutate or replay test effects')
 assert.equal((await readMail()).length,mailBefore,'Restored tests never send, including Unknown')
 if(request){
  await request(`/api/user-automations/${fixture.automationId}/test`,fixture.unknownInput,404)
  await request(`/api/user-automations/${fixture.automationId}/runs`,undefined,404)
  assert.deepEqual(await assertAutomationTestHistory(db,fixture,'fresh owner replay refusal'),before)
  assert.equal((await readMail()).length,mailBefore,'A new owner cannot inherit the former author test authority')
 }
}
