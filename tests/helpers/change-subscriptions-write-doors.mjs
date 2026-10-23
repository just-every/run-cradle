import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {unbase64} from '../../src/adapters/crypto.server.ts'
import {verifyWebhook} from '../../vendor/base/modules/integrations/core/webhook.ts'

// These are explicit coverage boundaries, never conditions that silently skip a step.
export const changeSubscriptionWriteDoorGaps={
 command:['transition (manual tables have no configured lifecycle transitions)'],trash:['create','patch','delete (the restore door only restores)'],
 bulk:['create','delete','restore'],range:['create','delete','restore'],
 authenticatedForm:['patch','delete','restore (record.create form mapping only)'],
 csv:['delete','restore','undo (table CSV commit has no public undo operation)'],
 automation:['create','delete','restore (the native update action only patches)'],
 mcp:['create and patch interoperability: unexercised'],
 outsideManualTables:['typed application write doors','whole-base import and import undo'],
}

const root='/api/v1/change-subscriptions',schemaEntity='00000000000000000000000001',formEntity='00000000000000000000000003'
const revisions=rows=>rows.map(row=>({ref:row.ref,version:row.version}))

export async function changeSubscriptionWriteDoors(h,edge){
 const worker=await h.runtime.getWorker(),subscriptions=[],failures=[],state={}
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-100',permissions:'read',expiresAt:new Date(Date.now()+20*86400000).toISOString()}})).data.key
 const command=async(action,input,expected=[])=>(await h.request('/api/v1/commands/'+action,{method:'POST',body:{commandId:createUlid(),expected,input}})).data.value
 const schemaRevision={ref:{appId:h.appId,entityId:schemaEntity,recordId:h.entityId},version:h.entity.version}
 const current=async row=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${row.id}`)).data.record
 const page=async(subscription,cursor)=>(await h.request(`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(cursor)}&limit=200`,{secret:key.secret})).data
 const tick=()=>worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.changes.v1',commandId:createUlid()}}])
 const changes=(kind,...rows)=>rows.map(row=>[kind,row.id])
 const csv=async(name,status)=>{
  const preview=(await h.request('/api/v1/records/import-preview',{method:'POST',body:{appId:h.appId,entityId:h.entityId,mergeFieldId:h.nameId,mapping:[{column:'Name',fieldId:h.nameId},{column:'Status',fieldId:h.statusId}],csv:`Name,Status\r\n${name},${status}\r\n`}})).data
  assert.equal(preview.rows.length,1);assert.equal(preview.rejected,0)
  await command('records.import-commit',{previewId:preview.id})
  return {id:preview.rows[0].id}
 }
 const matrix=[
  ['command.create',async()=>{state.first=(await h.create('synthetic-cradle-101')).record;return changes('create',state.first)}],
  ['command.patch',async()=>{await h.patch(await current(state.first),{[h.statusId]:'synthetic-cradle-102'});return changes('update',state.first)}],
  ['command.delete',async()=>{const row=await current(state.first);await command('record.delete',{ref:row.ref,confirmation:row.id},revisions([row]));return changes('delete',row)}],
  ['trash.restore',async()=>{const row=(await h.request(`/api/v1/records/trash?appId=${h.appId}`)).data.items.find(item=>item.id===state.first.id);assert.ok(row);await h.request('/api/v1/records/trash/restore',{method:'POST',body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,recordId:row.id,version:row.version}});return changes('restore',state.first)}],
  ['command.second-create',async()=>{state.second=(await h.create('synthetic-cradle-103')).record;return changes('create',state.second)}],
  ['bulk.patch',async()=>{
   const preview=await command('record.bulk-preview',{appId:h.appId,entityId:h.entityId,selection:{ids:[state.first.id,state.second.id]},change:{fieldId:h.statusId,value:'synthetic-cradle-104'}})
   state.bulk=await command('record.bulk-commit',{previewId:preview.id,token:preview.token},preview.expected)
   return changes('update',state.first,state.second)
  }],
  ['bulk.undo',async()=>{await command('record.undo',{undoId:state.bulk.undoId},state.bulk.changed);return changes('update',state.first,state.second)}],
  ['range.patch',async()=>{
   const rows=await Promise.all([current(state.first),current(state.second)])
   state.range=await command('record.patch',{appId:h.appId,entityId:h.entityId,rows:rows.map(row=>({recordId:row.id,changes:{[h.statusId]:'synthetic-cradle-105'}}))},revisions(rows))
   return changes('update',...rows)
  }],
  ['range.inverse',async()=>{const rows=await Promise.all([current(state.first),current(state.second)]);await command('record.patch',{appId:h.appId,entityId:h.entityId,rows:state.range.inverse},revisions(rows));return changes('update',...rows)}],
  ['form.submit',async()=>{
   const form=await command('form.save',{form:{appId:h.appId,entityId:h.entityId,title:'synthetic-cradle-106',fields:[{fieldId:h.nameId,label:'Name',help:'',required:true},{fieldId:h.statusId,label:'Status',help:'',required:false}],submitAction:'record.create',authenticated:true}},[schemaRevision])
   const row=await command('form.submit',{appId:h.appId,entityId:h.entityId,formId:form.id,values:{[h.nameId]:'synthetic-cradle-107',[h.statusId]:'synthetic-cradle-108'}},[schemaRevision,{ref:{appId:h.appId,entityId:formEntity,recordId:form.id},version:form.version}])
   return changes('create',row)
  }],
  ['csv.create',async()=>changes('create',await csv('synthetic-cradle-109','synthetic-cradle-110'))],
  ['csv.update',async()=>changes('update',await csv('synthetic-cradle-101','synthetic-cradle-111'))],
  ['automation.update',async()=>{
   state.automation=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-112',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'update',fieldId:h.statusId,value:'synthetic-cradle-113'}]}}})).data.result.value
   const created=await h.create('synthetic-cradle-114');await h.tick(created.commandId);await h.tick(created.commandId)
   const runs=(await h.request(`/api/user-automations/${state.automation.id}/runs`)).data.runs
   assert.equal(runs.length,1);assert.equal(runs[0].state,'Complete')
   assert.equal((await current(created.record)).fields[h.statusId].value,'synthetic-cradle-113')
   return [...changes('create',created.record),...changes('update',created.record)]
  }],
 ]
 try{
  const view=await command('view.save',{view:{appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-115',display:'grid',fields:[h.nameId,h.statusId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:h.nameId},visibility:'app',shipped:false}},[schemaRevision])
  for(const scope of ['base','table','view']){
   const subscription=(await h.request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId:h.appId,...(scope==='base'?{}:{entityId:h.entityId}),...(scope==='view'?{viewId:view.id}:{}),url:edge.receiverOrigin+'/changes-write-'+scope}})).data
   subscriptions.push({...subscription,scope,next:subscription.cursor,count:0,seen:new Set(),ranges:[],lastSequence:0})
  }
  for(const [door,run] of matrix){
   try{
    const expected=await run();await tick();await tick()
    for(const subscription of subscriptions){
     try{
      const pings=edge.received.filter(ping=>ping.headers['webhook-destination']===subscription.id)
      for(const ping of pings.slice(subscription.count)){
       const verified=await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(subscription.signingKey),tenant:h.appId,destinationId:subscription.id})
       const body=JSON.parse(verified.envelope.body)
       assert.equal(body.subscriptionId,subscription.id);assert.equal(body.changeCount,1);assert.equal(verified.envelope.event,'record.changed')
       assert.ok(!subscription.seen.has(verified.envelope.id),'No notification is resent by the second dispatcher tick');subscription.seen.add(verified.envelope.id)
       for(const forbidden of ['recordId','synthetic-cradle-',h.nameId,h.statusId])assert.ok(!ping.body.includes(forbidden),'Pings contain no record payload')
      }
      const count=pings.length-subscription.count;subscription.count=pings.length
      const from=subscription.next,result=await page(subscription,from);subscription.next=result.cursor;subscription.ranges.push({from,result})
      assert.equal(count,expected.length,`${door}/${subscription.scope}: exactly one signed ping per real record change`)
      assert.equal(result.hasMore,false,'Each small write-door window is completely fetched')
      if(subscription.scope==='view'&&expected.some(([kind])=>kind==='delete')){
       assert.deepEqual(result.items,[]);assert.equal(result.resyncRequired?.code,'resync_required')
       assert.equal(result.resyncRequired.from,from);assert.equal(result.resyncRequired.through,result.cursor)
       for(const [,id] of expected)assert.ok(!JSON.stringify(result).includes(id),'View delete recovery does not reveal record identity')
      }else{
       assert.deepEqual(result.items.map(item=>[item.kind,item.recordId]),expected,`${door}/${subscription.scope}: ordered, complete feed payloads`)
       assert.equal(result.resyncRequired,undefined)
       for(const item of result.items){assert.ok(item.sequence>subscription.lastSequence,'Change sequences increase across every write door');subscription.lastSequence=item.sequence;if(item.kind==='delete')assert.deepEqual(Object.keys(item).sort(),['id','kind','recordId','sequence'])}
      }
      assert.deepEqual(await page(subscription,from),result,'The captured write window replays identically')
     }catch(error){failures.push(new Error(`${door}/${subscription.scope}: ${error.message}`,{cause:error}))}
    }
   }catch(error){failures.push(new Error(`${door}: ${error.message}`,{cause:error}))}
  }
  // The same retained windows must honor current field and row authority. This
  // uses the existing policy seam, while every observation remains public HTTP.
  const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_credentials c JOIN authority_memberships m ON m.principal_id=c.principal_id JOIN authority_policies p ON p.id=m.policy_id WHERE c.id=? AND m.app_id=?').bind(key.id,h.appId).first()
  const rules=JSON.parse(policy.rules_json)
  for(const rule of rules)rule.readableFields=rule.readableFields.filter(id=>id!==h.statusId)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
  for(const subscription of subscriptions){
   let marker=false
   for(const range of subscription.ranges){const narrowed=await page(subscription,range.from);marker||=Boolean(narrowed.resyncRequired);for(const item of narrowed.items)assert.ok((item.changes??[]).every(change=>change.fieldId!==h.statusId),'Current field narrowing applies to every retained write door')}
   assert.ok(marker,'Retained changes whose fields are hidden report generic range resynchronization')
  }
  for(const rule of rules)rule.rows={kind:'condition',fieldId:h.nameId,op:'eq',value:'synthetic-cradle-101'}
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
  for(const subscription of subscriptions)for(const range of subscription.ranges){const narrowed=await page(subscription,range.from);assert.ok(narrowed.items.every(item=>item.recordId===state.first.id),'Current row narrowing applies across the retained door matrix')}
 }catch(error){failures.push(error)}
 finally{
  if(state.automation)try{await h.request(`/api/user-automations/${state.automation.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:state.automation.version}})}catch(error){failures.push(error)}
  for(const subscription of subscriptions)try{await h.request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}})}catch(error){failures.push(error)}
  try{await h.request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId:h.appId}})}catch(error){failures.push(error)}
 }
 console.log('CHANGE_WRITE_DOOR_DECLARED_GAPS '+JSON.stringify(changeSubscriptionWriteDoorGaps))
 if(failures.length)throw new AggregateError(failures,'Manual-table change-feed write-door matrix failed')
 console.log('CHANGE_WRITE_DOORS PASS '+matrix.map(([door])=>door).join(',')+'; base/table/view; current row/field narrowing')
}
