import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {adoptUpload,armTable,effectCounts,finish,jobAction,jobStatus} from './import-effects.mjs'

// Real reviewed CSV jobs, real retained custody and real HTTP feed reads. The
// interim has no import sequence projection: every imported-base page therefore
// carries the existing cause-free marker, including an otherwise empty page.
export async function changeSubscriptionImports(h,edge){
 const root='/api/v1/change-subscriptions'
 const tick=async()=>{
  await h.tick(createUlid())
  await (await h.runtime.getWorker()).queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.changes.v1',commandId:createUlid()}}])
 }
 const files=[{name:'Items.csv',bytes:Buffer.from('Name,Status\n'+Array.from({length:21},(_,n)=>`synthetic-import-${n},Pending`).join('\n')+'\n')}]
 for(const operation of ['undo','rollback']){
  const imported=await adoptUpload(h,files,{name:'Synthetic feed import '+operation})
  const appId=imported.preview.identities.appId,table=Object.values(imported.preview.identities.tables)[0],entityId=table.entityId
  const entity=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items.find(row=>row.id===entityId)
  const nameId=entity.primaryFieldId,statusId=entity.fields.find(field=>field.label==='Status').id
  await armTable(h,edge,appId,entityId,statusId)
  const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId,entityId,name:'Synthetic import feed',permissions:'read',expiresAt:new Date(Date.now()+86400000).toISOString()}})).data.key
  const subscriptions=[]
  try{
   const view=(await h.request('/api/v1/commands/view.save',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:entity.version}],input:{view:{appId,entityId,name:'Synthetic import feed',display:'grid',fields:[nameId,statusId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:nameId},visibility:'app',shipped:false}}}})).data.value
   for(const scope of ['base','table','view']){
    const subscription=(await h.request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId,...(scope==='base'?{}:{entityId}),...(scope==='view'?{viewId:view.id}:{}),url:edge.receiverOrigin+'/changes-import-'+operation+'-'+scope}})).data
    subscriptions.push({...subscription,next:subscription.cursor,scope})
   }
   const page=async(subscription,cursor)=>(await h.request(`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(cursor)}`,{secret:key.secret})).data
   const observe=async(label,action)=>{
    const before=await effectCounts(h,edge),result=await action();await tick()
    assert.deepEqual(await effectCounts(h,edge),before,label+': import effects remain suppressed')
    for(const subscription of subscriptions){
     const from=subscription.next,result=await page(subscription,from)
     assert.deepEqual(result.items,[],label+': unprojected import has no invented payload')
     assert.equal(result.hasMore,false)
     assert.equal(result.resyncRequired?.code,'resync_required')
     assert.deepEqual(Object.keys(result.resyncRequired).sort(),['code','from','message','through'])
     assert.equal(result.resyncRequired.from,from);assert.equal(result.resyncRequired.through,result.cursor)
     for(const forbidden of ['synthetic-import-',nameId,statusId,imported.job.id,'recordId','changes_json','rowCount'])assert.ok(!JSON.stringify(result).includes(forbidden),label+': range marker reveals no import cause or record content')
     assert.deepEqual(await page(subscription,from),result,label+': fixed window replays identically')
     subscription.next=result.cursor
    }
    return result
   }
   const partial=await observe('apply first batch',()=>jobAction(h,imported.job.id,'resume'))
   assert.equal(partial.state,'applying')
   if(operation==='undo'){
    await h.restart()
    await observe('resume after restart',()=>finish(h,imported.job.id,'resume','completed'))
    assert.equal((await jobStatus(h,imported.job.id)).reconciliation.ok,true)
   }
   await observe(operation,()=>finish(h,imported.job.id,operation,operation==='undo'?'undone':'rolled_back'))
   for(const subscription of subscriptions)assert.ok(!edge.received.some(ping=>ping.headers['webhook-destination']===subscription.id),'Imports and reversals never deliver change webhooks')
   console.log('CHANGE_IMPORT_RESYNC '+operation+' PASS base/table/view; generic marker; suppressed effects')
  }finally{
   for(const subscription of subscriptions)await h.request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}})
   await h.request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId}})
  }
 }
}
