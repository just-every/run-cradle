import assert from 'node:assert/strict'
import {portableFixture,id as fixtureId} from './base-exit-fixture.mjs'
/** Populate through the owner import door, including exact source custody and metadata. */
export async function sourceRecords({origin,cookie,csrfToken,send,id}){
 const native=portableFixture(),base='/api/v1/records/base-import'
 const upload=async(route,preview)=>{
  const body=new FormData();body.append('files',new Blob([JSON.stringify(native)],{type:'application/json'}),'business.cradle.json')
  body.append('options',JSON.stringify({name:native.base.name}))
  if(preview){body.append('identities',JSON.stringify(preview.identities));body.append('fingerprint',preview.fingerprint);body.append('acceptLoss','true')}
  const response=await fetch(origin+base+route,{method:'POST',headers:{cookie,origin,'x-csrf-token':csrfToken},body})
  assert.equal(response.status,200,'Reviewed base import '+route);return (await response.json()).data
 }
 const preview=await upload('/preview'),review=await upload('/review',preview)
 const adoption=await send(base+'/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true})
 assert.equal(adoption.status,200,'Owner adopts reviewed base');let job=(await adoption.json()).data
 for(let n=0;n<40&&job.state!=='completed';n++){
  const response=await send(base+`/jobs/${job.id}/resume`,{});assert.equal(response.status,200);job=(await response.json()).data
 }
 assert.equal(job.state,'completed','Reviewed import completes with native reconciliation')
 const status=await send(base+`/jobs/${job.id}`);assert.equal(status.status,200);assert.equal((await status.json()).data.reconciliation.ok,true)
 const appId=preview.identities.appId,table=preview.identities.tables[fixtureId(2)],entityId=table.entityId,recordId=table.records[fixtureId(10)],fieldId=table.fields[fixtureId(3)]
 const saved=await send('/api/user-automations',{commandId:id(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'Archive held automation',appId,entityId,event:'updated',enabled:true,actions:[{kind:'update',fieldId,value:'Automation review'}]}})
 assert.equal(saved.status,201,'Owner saves a user automation')
 const automationId=(await saved.json()).data.result.value.id
 const destination=await send('/api/user-automations/destinations',{commandId:id(),appId,entityId,kind:'webhook',url:'https://archive.example.com/receive'})
 assert.equal(destination.status,201,'Owner stores a webhook destination without sending a request')
 const exported=await send('/api/v1/records/base-export',{appId,format:'json'});assert.equal(exported.status,200)
 return {appId,entityId,recordId,fieldId,jobId:job.id,automationId,portable:JSON.parse((await exported.json()).data.content)}
}
