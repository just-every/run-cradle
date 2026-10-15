import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {contract} from './contract.mjs'
import {userAutomationRuntime} from './helpers/user-automation-runtime.mjs'
import {automationNetworkEdge} from './helpers/automation-network-edge.mjs'
import {prepareFixture} from './helpers/records-import-fixture.mjs'
import {id} from './helpers/base-exit-fixture.mjs'
import {effectCounts,csvFiles,adoptUpload,adopt,reviewRecordedSource,jobAction,jobStatus,finish,armTable,drain,rekeyedPortable} from './helpers/import-effects.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {LAUNCH_APP_ID,launchEntities} from '../src/apps/launch/contracts.ts'

contract('RECORDS-005 AUTO-USER-001','import job writes fire no automation, notification, mail or webhook for CSV, recorded API and native JSON sources across restart, rollback and undo; owner edits still fire once',async()=>{
 let edge,h
 const rows=[]
 try {
  edge=await automationNetworkEdge()
  h=await userAutomationRuntime(18961,{bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
   EGRESS_RELAY_URL:'https://relay.egress.example.com/v1/deliver',EGRESS_RELAY_SECRET:edge.secret},outbound:request=>edge.outbound(request)})
  // The full scheduler stays active; independent workspace schedules are disabled
  // through the owner's command so only import and record-trigger effects are measured.
  const schedules=(await h.db.prepare("SELECT id,version FROM automations WHERE trigger_type='schedule' AND enabled=1").all()).results
  for(const schedule of schedules){
   const disabled=(await h.request('/api/v1/commands/launch.automation.disable',{method:'POST',body:{commandId:createUlid(),
    expected:[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:schedule.id},version:schedule.version}],input:{id:schedule.id}}})).data
   assert.equal(disabled.state,'committed');assert.equal(disabled.value.enabled,false)
  }
  /** Each job step is followed by the scheduled handler, so captured work would have run. */
  const step=async(name,action)=>{
   const before=await effectCounts(h,edge),value=await action();await drain(h)
   const after=await effectCounts(h,edge);rows.push({step:name,before,after})
   assert.deepEqual(after,before,name);return value
  }
  const csv=await prepareFixture('project-tracker','csv'),api=await prepareFixture('project-tracker','api'),files=await csvFiles('project-tracker')
  const coordinates=(fixture,identities)=>{const tasks=fixture.mapping.tables.find(t=>t.key==='tasks'),table=identities.tables[fixture.tableKey(tasks)]
   const field=key=>table.fields[fixture.columnKey(tasks,tasks.fields.find(f=>f.key===key))]
   return {appId:identities.appId,entityId:table.entityId,fieldId:field('description'),primaryId:field('title')}}
  const arm=target=>armTable(h,edge,target.appId,target.entityId,target.fieldId)

  // CSV set: one bounded batch, a forced Worker restart, resume through the link phase, then undo.
  const first=await adoptUpload(h,files,csv.preview.options),tasks=coordinates(csv,first.preview.identities),automations=await arm(tasks)
  const partial=await step('CSV apply first batch',()=>jobAction(h,first.job.id,'resume'))
  assert.equal(partial.state,'applying','The first bounded batch leaves the job partial')
  await h.restart()
  await step('CSV resume after restart, links last',()=>finish(h,first.job.id,'resume','completed'))
  assert.equal((await jobStatus(h,first.job.id)).reconciliation.ok,true)
  const exported=(await h.request('/api/v1/records/base-export',{method:'POST',body:{appId:tasks.appId,format:'json'}})).data.content
  await step('CSV undo completed job',()=>finish(h,first.job.id,'undo','undone'))

  // CSV set again as a second base: a partial job rolled back.
  const second=await adoptUpload(h,files,{...csv.preview.options,name:csv.preview.options.name+' rollback'})
  await arm(coordinates(csv,second.preview.identities))
  assert.equal((await step('CSV second base first batch',()=>jobAction(h,second.job.id,'resume'))).state,'applying')
  await step('CSV roll back partial job',()=>finish(h,second.job.id,'rollback','rolled_back'))

  // Recorded API pages: reviewed in-process (no upload door), adopted and applied through the job routes.
  const review=await reviewRecordedSource(h,api.preview),apiJob=await adopt(h,review)
  await arm(coordinates(api,api.preview.identities))
  await step('API apply to completion',()=>finish(h,apiJob.id,'resume','completed'))
  await step('API undo',()=>finish(h,apiJob.id,'undo','undone'))

  // Native JSON with preserved portable IDs, then the same file as a bijective-map copy.
  const {portable,rekey}=rekeyedPortable()
  const json=[{name:'business.cradle.json',bytes:Buffer.from(JSON.stringify(portable))}],appId=rekey(id(1)),contactsId=rekey(id(20)),nameId=rekey(id(21))
  const fresh=await adoptUpload(h,json,{name:portable.base.name})
  assert.equal(fresh.preview.identities.appId,appId,'A fresh installation keeps portable IDs')
  await arm({appId,entityId:contactsId,fieldId:nameId})
  await step('JSON apply to completion',()=>finish(h,fresh.job.id,'resume','completed'))
  const copy=await adoptUpload(h,json,{name:portable.base.name}),contacts=copy.preview.identities.tables[contactsId]
  assert.notEqual(copy.preview.identities.appId,appId,'An existing identity gives the whole copy one bijective map')
  await arm({appId:copy.preview.identities.appId,entityId:contacts.entityId,fieldId:contacts.fields[nameId]})
  await step('JSON copy apply to completion',()=>finish(h,copy.job.id,'resume','completed'))
  await step('JSON copy undo',()=>finish(h,copy.job.id,'undo','undone'))

  // A copy of the CSV-imported base, made from its own JSON export.
  const returned=await adoptUpload(h,[{name:'tracker.cradle.json',bytes:Buffer.from(exported)}],{name:JSON.parse(exported).base.name})
  const copiedTasks=returned.preview.identities.tables[tasks.entityId]
  assert.notEqual(returned.preview.identities.appId,tasks.appId)
  await arm({appId:returned.preview.identities.appId,entityId:copiedTasks.entityId,fieldId:copiedTasks.fields[tasks.fieldId]})
  await step('Exported CSV base copy apply',()=>finish(h,returned.job.id,'resume','completed'))

  // The owner's own edits on an imported table still fire: one root run per change.
  const roots=async automation=>(await h.db.prepare("SELECT count(*) AS n FROM automation_runs WHERE automation_id=? AND cause_run_ids_json='[]'").bind(automation.id).first()).n
  const entity=(await h.request(`/api/v1/apps/${tasks.appId}/entities`)).data.items.find(e=>e.id===tasks.entityId)
  const before=await effectCounts(h,edge),commandId=createUlid()
  const created=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId,expected:[{ref:{appId:tasks.appId,entityId:'00000000000000000000000001',recordId:tasks.entityId},version:entity.version}],input:{appId:tasks.appId,entityId:tasks.entityId,values:{[tasks.primaryId]:'Owner task'}}}})).data.value
  await h.tick(commandId);await drain(h)
  assert.equal(await roots(automations.created),1,'A hand-created record fires the created automation once')
  const current=(await h.request(`/api/v1/apps/${tasks.appId}/entities/${tasks.entityId}/records/${created.ref.recordId}`)).data.record
  const patched=await h.patch(current,{[tasks.fieldId]:'Owner edit'});await h.tick(patched.data.commandId);await drain(h)
  assert.equal(await roots(automations.updated),1,'A hand edit fires the updated automation once')
  const after=await effectCounts(h,edge);rows.push({step:'Owner create and edit by hand',before,after,
   runs:(await h.db.prepare("SELECT a.name,r.state,json_array_length(r.cause_run_ids_json) AS causes FROM automation_runs r JOIN automations a ON a.id=r.automation_id ORDER BY r.created_at").all()).results})
  assert.ok(after.events>before.events&&after.runs>before.runs&&after.notifications>before.notifications&&after.mail>before.mail&&after.relay>before.relay,'Ordinary edits deliver every action')
 }finally{
  console.log('IMPORT_EFFECT_COUNTS '+JSON.stringify(rows))
  await h?.close();await edge?.close()
 }
})
