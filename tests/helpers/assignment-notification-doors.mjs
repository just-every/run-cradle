import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {RECORD_SCHEMA_ENTITY_ID,RECORD_FORM_ENTITY_ID} from '../../src/domains/records/contracts.ts'

/** The installed form, configured button, REST, MCP and automation share one notice contract. */
export async function assignmentNotificationDoors(h){
 const schema=await h.call(`/api/v1/apps/${h.appId}/entities/${h.entityId}`),revision={ref:{appId:h.appId,entityId:RECORD_SCHEMA_ENTITY_ID,recordId:h.entityId},version:schema.version},assignedValues=name=>({[h.title.id]:name,[h.person.id]:h.assignee})
 async function assigned(record,label){
  const shown=(await h.detail(record.id,h.reader)).record
  assert.equal(shown.fields[h.person.id].value,h.assignee,label+' persists the new person')
  const notices=(await h.db.prepare("SELECT n.id,n.body FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.operator_id=? AND n.subject_id=? AND c.app_id=? AND c.event_kind='field-assigned'").bind(h.assignee,record.id,h.appId).all()).results
  assert.equal(notices.length,1,label+' notifies the new person once')
  assert.match(notices[0].body,/Assignee/)
  const deliveries=(await h.db.prepare('SELECT id FROM channel_deliveries WHERE notification_id=?').bind(notices[0].id).all()).results
  assert.equal(deliveries.length,1,label+' queues one email delivery')
  const inbox=await h.call('/api/v1/notifications?limit=100',undefined,h.reader)
  const notice=inbox.items.find(n=>n.id===notices[0].id)
  assert.ok(notice,label+' appears in the recipient inbox')
  assert.equal(notice.subject.available,true)
  console.log('Assignment door passed:',label)
 }
 const form=await h.command('form.save',{form:{appId:h.appId,entityId:h.entityId,title:'Assigned work form',fields:[h.title,h.person].map(field=>({fieldId:field.id,label:field.label,help:'',required:field.required})),submitAction:'record.create',authenticated:true}},[revision])
 const formCommand={commandId:createUlid(),expected:[revision,{ref:{appId:h.appId,entityId:RECORD_FORM_ENTITY_ID,recordId:form.id},version:form.version}],input:{appId:h.appId,entityId:h.entityId,formId:form.id,values:assignedValues('Assigned through a saved form')}}
 const submitted=await h.call('/api/v1/commands/form.submit',formCommand)
 await assigned(submitted.value,'Saved form')
 assert.equal((await h.call('/api/v1/commands/form.submit',formCommand)).value.id,submitted.value.id)
 await assigned(submitted.value,'Saved form replay')
 const template=await h.command('record.template-save',{ref:submitted.value.ref,name:'Assigned work template',includeLinks:false,includeAttachments:false,includeChildren:false},[revision,{ref:submitted.value.ref,version:submitted.value.version}])
 const button=await h.command('record.template-button-save',{appId:h.appId,entityId:h.entityId,templateId:template.id,name:'Create assigned work',confirmation:true},[revision])
 const buttonCommand={commandId:createUlid(),expected:[revision,{ref:submitted.value.ref,version:submitted.value.version}],input:{appId:h.appId,entityId:h.entityId,buttonId:button.id,confirmed:true,ref:submitted.value.ref}},buttonResult=await h.call('/api/v1/commands/record.template-button-run',buttonCommand)
 await assigned(buttonResult.value,'Configured interface button')
 assert.equal((await h.call('/api/v1/commands/record.template-button-run',buttonCommand)).value.id,buttonResult.value.id)
 await assigned(buttonResult.value,'Configured interface button replay')
 const issued=await h.request('/api/user-keys',{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'Scoped assignment operator',permissions:'write',expiresAt:new Date(Date.now()+86400000).toISOString()})
 assert.equal(issued.status,201,'The owner can issue the scoped write credential')
 const key=issued.data.key
 async function machine(path,body,expected=200){
  const response=await fetch(h.origin+path,{method:'POST',headers:{authorization:'Bearer '+key.secret,'content-type':'application/json'},body:JSON.stringify(body)}),wire=await response.json()
  assert.equal(response.status,expected,wire.error?.message??'Scoped machine request returned an unexpected status')
  return wire
 }
 const restPath=`/api/v1/apps/${h.appId}/rest/entities/${h.entityId}/records`,restBody={commandId:createUlid(),schemaVersion:schema.version,values:assignedValues('Assigned through scoped REST')},rest=(await machine(restPath,restBody)).data.result.value.rows[0]
 await assigned(rest,'Scoped REST create')
 assert.equal((await machine(restPath,restBody)).data.result.value.rows[0].id,rest.id)
 await assigned(rest,'Scoped REST replay')
 const toolBody={jsonrpc:'2.0',id:1,method:['tools','call'].join('/'),params:{name:'record.create',arguments:{commandId:createUlid(),expected:[revision],input:{appId:h.appId,entityId:h.entityId,values:assignedValues('Assigned through the agent tool')}}}},toolResult=await machine('/mcp',toolBody),tool=JSON.parse(toolResult.result.content[0].text).result.value
 await assigned(tool,'Agent MCP tool')
 const replayedTool=await machine('/mcp',toolBody)
 assert.equal(JSON.parse(replayedTool.result.content[0].text).result.value.id,tool.id)
 await assigned(tool,'Agent MCP replay')
 await h.call(`/api/user-keys/${key.id}/revoke`,{commandId:createUlid(),appId:h.appId})
 const count=await h.db.prepare("SELECT count(*) n FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.operator_id=? AND c.app_id=? AND c.event_kind='field-assigned'").bind(h.assignee,h.appId).first('n')
 await machine(restPath,{...restBody,commandId:createUlid(),values:assignedValues('Revoked key cannot assign')},401)
 await machine('/mcp',{...toolBody,params:{...toolBody.params,arguments:{...toolBody.params.arguments,commandId:createUlid()}}},401)
 assert.equal(await h.db.prepare("SELECT count(*) n FROM notifications n JOIN channel_notifications c ON c.notification_id=n.id WHERE n.operator_id=? AND c.app_id=? AND c.event_kind='field-assigned'").bind(h.assignee,h.appId).first('n'),count,'Revoked machine captures create no assignment or notice')
 const approval=await h.request('/api/user-automations',{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'Assign newly created work',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'update',fieldId:h.person.id,value:h.assignee}]}})
 assert.equal(approval.status,201,approval.error?.message??'The owner can approve the assigning automation')
 const automation=approval.data.result.value,triggerId=createUlid()
 try{
  const trigger=await h.call('/api/v1/commands/record.create',{commandId:triggerId,expected:[revision],input:{appId:h.appId,entityId:h.entityId,values:{[h.title.id]:'Assigned by the approved automation'}}}),worker=await h.runtime.getWorker()
  const tick=()=>worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.records.automations.v1',commandId:triggerId}}])
  let run
  for(let attempt=0;attempt<30;attempt++){
   await tick();run=(await h.call(`/api/user-automations/${automation.id}/runs`)).runs.find(row=>row.recordId===trigger.value.id&&!row.testMode)
   if(run&&!['Queued','Running','Held'].includes(run.state))break
   await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.equal(run?.state,'Complete',JSON.stringify(run))
  await assigned(trigger.value,'Approved automation')
  await tick();await assigned(trigger.value,'Approved automation replay')
 }finally{await h.call(`/api/user-automations/${automation.id}/disable`,{commandId:createUlid(),version:automation.version})}
 return {doors:['saved form','configured interface button','scoped REST','agent MCP tool','approved automation']}
}
