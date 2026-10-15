import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createUlid} from '../../src/core/shared/ids.ts'
import {loadDescriptorRegistry} from '../../src/domains/records/loader.server.ts'
import {createApplicationEntityRegistry} from '../../src/core/app/composition/entities.server.ts'
import {createPolicyPort} from '../../src/domains/authority/policy.server.ts'
import {createAdmissionService} from '../../src/domains/admission/service.server.ts'
import {createReplayAccess} from '../../src/domains/authority/context.server.ts'
import {createManualSchemas} from '../../src/domains/records/manual/service.server.ts'
import {createBaseImportService} from '../../src/domains/records/base-transfer/service.server.ts'
import {previewBaseImport} from '../../src/domains/records/base-transfer/plan.ts'
import {portableFixture} from './base-exit-fixture.mjs'

const base='/api/v1/records/base-import'
/** Observe every automation, notification, provider-mail and delivery effect. */
export async function effectCounts(h,edge){
 const count=async table=>(await h.db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n
 return {events:await count('record_automation_events'),runs:await count('automation_runs'),
  notifications:await count('channel_events')+await count('channel_notifications')+await count('notifications'),
  mail:(await h.mailMessages()).length,deliveries:await count('integration_deliveries'),relay:edge.received.length}
}
export async function csvFiles(fixture){
 const root=new URL(`../fixtures/base-transfer/${fixture}/`,import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'))
 return Promise.all(manifest.csvFiles.map(async file=>({name:file.path.slice(4),bytes:await readFile(new URL(file.path,root))})))
}
/** Preview, review and adopt through the owner's upload doors; returns the retained job. */
export async function adoptUpload(h,files,options){
 const csrfToken=(await (await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
 const upload=async(route,preview)=>{
  const body=new FormData()
  for(const file of files)body.append('files',new Blob([file.bytes]),file.name)
  body.set('options',JSON.stringify(options))
  if(preview){body.set('identities',JSON.stringify(preview.identities));body.set('fingerprint',preview.fingerprint);body.set('acceptLoss','true')}
  const response=await fetch(h.origin+base+route,{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrfToken},body})
  const value=await response.json();assert.equal(response.status,200,route+' '+JSON.stringify(value.error??{}));return value.data
 }
 const preview=await upload('/preview'),review=await upload('/review',preview)
 return {preview,job:await adopt(h,review)}
}
export async function adopt(h,review){
 return (await h.request(base+'/adopt',{method:'POST',body:{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true}})).data
}
/** A recorded API source has no upload door; its review is retained in-process for the signed-in owner, then adopted and applied through the same routes. */
export async function reviewRecordedSource(h,preview){
 const owner=await h.db.prepare("SELECT s.id,s.principal_id,s.authentication_epoch,s.expires_at FROM authority_sessions s JOIN cradle_base_operators b ON b.principal_id=s.principal_id JOIN oa_operators o ON o.id=b.base_id WHERE o.email='import-owner@example.test' AND s.revoked_at IS NULL ORDER BY s.created_at DESC LIMIT 1").first()
 const now=new Date().toISOString(),ctx={principal:{id:owner.principal_id,kind:'human',humanId:owner.principal_id,sessionId:owner.id,credentialId:null,authenticationEpoch:owner.authentication_epoch,issuedAt:now,expiresAt:new Date(owner.expires_at).toISOString()},now,requestId:createUlid(),ingress:'http'}
 const registry=await h.descriptors(),entities=createApplicationEntityRegistry(registry),policy=createPolicyPort(h.db,entities)
 const manual=createManualSchemas(h.db,policy,createAdmissionService(h.db,createReplayAccess(h.db,policy,entities)),await loadDescriptorRegistry(h.db,registry.list()))
 return createBaseImportService(h.db,policy,registry,manual,previewBaseImport).review(ctx,preview,{fingerprint:preview.fingerprint,acceptLoss:true})
}
export async function jobAction(h,id,action){return (await h.request(`${base}/jobs/${id}/${action}`,{method:'POST',body:{}})).data}
export async function jobStatus(h,id){return (await h.request(`${base}/jobs/${id}`)).data}
export async function finish(h,id,action,terminal){
 let job=await jobAction(h,id,action)
 for(let n=0;n<60&&job.state!==terminal;n++)job=await jobAction(h,id,'resume')
 assert.equal(job.state,terminal);return job
}
/** The owner's full automation setup on one imported table: created and updated
 * automations with notify, email, signed webhook and update-field actions, and a scoped key. */
export async function armTable(h,edge,appId,entityId,fieldId){
 const destination=(await h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{commandId:createUlid(),appId,entityId,kind:'webhook',url:edge.receiverOrigin+'/accepted'}})).data
 const automations={}
 for(const event of ['created','updated'])automations[event]=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),
  expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:`Imported table ${event}`,appId,entityId,event,enabled:true,actions:[
   {kind:'notify',operatorId:h.operator,title:`Record ${event}`},{kind:'email',operatorId:h.operator,subject:`Record ${event}`,text:'Open Cradle to review.'},
   {kind:'webhook',destinationId:destination.id},{kind:'update',fieldId,value:`automation ${event}`}]}}})).data.result.value
 const triggers=await h.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN (?,?)").bind(`record_auto_${entityId.toLowerCase()}_created`,`record_auto_${entityId.toLowerCase()}_updated`).first()
 assert.equal(triggers.n,2,'Capture triggers are armed on the imported table')
 await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId,entityId,name:'Imported table key',permissions:'write',expiresAt:new Date(Date.now()+86400000).toISOString()}})
 return automations
}
/** The scheduled handler stages every pending captured event and runs its work. */
export async function drain(h){await (await h.runtime.getWorker()).scheduled({cron:'* * * * *'})}
/** The portable base with every fixture ID replaced consistently, so it imports with preserved IDs. */
export function rekeyedPortable(){
 const renamed=new Map(),rekey=value=>{if(!renamed.has(value))renamed.set(value,createUlid());return renamed.get(value)}
 return {portable:JSON.parse(JSON.stringify(portableFixture()).replace(/"(0{16}\d{10})"/g,(_,value)=>`"${rekey(value)}"`)),rekey}
}
