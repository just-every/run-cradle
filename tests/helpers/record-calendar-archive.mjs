import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import path from 'node:path'
import {createUlid} from '../../src/core/shared/ids.ts'
import {emittedMailRuntime} from './emitted-mail-runtime.mjs'
import {fixtureMessages} from './fixture-mail.mjs'
import {restoredWarehouseArchive,restoredWarehouseFailure} from './warehouse-archive.mjs'
import {completeFirstRun} from './complete-first-run.mjs'
import {restoredAutomationTestHistory} from './automation-test-history.mjs'
const bindings=()=>({GOOGLE_CLIENT_ID:'synthetic-cradle-client',GOOGLE_CLIENT_SECRET:'synthetic-cradle-secret',CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64')})
async function drain(runtime,db){const worker=await runtime.getWorker();for(let pass=0;pass<4;pass++){const rows=(await db.prepare("SELECT id FROM admission_outbox WHERE state='pending' AND action IN ('connection.operation','execution.dispatch','execution.reconcile') AND not_before<=? ORDER BY created_at,id").bind(new Date().toISOString()).all()).results;if(!rows.length)return;for(const row of rows)assert.equal((await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.outbox.v1',outboxId:row.id}}])).outcome,'ok')}}
/** Add calendar custody to the same public-door FILE fixture before its single archive export. */
export async function addRecordCalendarArchiveState(h,provider,date,recordId){
 const command=async(action,input)=>(await h.request('/api/v1/commands/'+action,{method:'POST',body:{commandId:createUlid(),expected:[],input}})).data.value
 const connectionId=(await command('connection.configure',{appId:h.appId,adapterId:'google-calendar',name:'synthetic-cradle-calendar-archive',accountId:provider.ownedCalendarId,scopes:[{resource:provider.ownedCalendarId,readFields:[],actions:['connection.sync']}],ownership:[],credentialRef:null})).connectionId
 const consent=await command('connection.begin-consent',{connectionId,returnTo:'/app/records'})
 await h.request('/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-calendar-archive',state:new URL(consent.authorizationUrl).searchParams.get('state')}),{status:303})
 await h.request(`/api/v1/record-calendar-sync/connections/${connectionId}/refresh`,{method:'POST',body:{commandId:createUlid()}});await drain(h.runtime,h.db)
 const definition={appId:h.appId,entityId:h.entityId,startFieldId:date,titleFieldId:h.nameId,fieldIds:[],connectionId,calendarId:provider.ownedCalendarId,enabled:true}
 const configured=(await h.request('/api/v1/record-calendar-sync',{method:'POST',body:{commandId:createUlid(),approveCalendar:true,definition}})).data.value,id=configured.id
 await h.request(`/api/v1/record-calendar-sync/${id}/records/${recordId}/sync`,{method:'POST',body:{commandId:createUlid()}});await drain(h.runtime,h.db)
 assert.equal((await h.db.prepare('SELECT state FROM record_calendar_events WHERE definition_id=?').bind(id).first()).state,'synced')
 return {provider,definitionId:id,definition,recordId,sourceOwnerId:h.operator}
}
/** Called only after the actual rer import into this persisted installation. */
export async function restoredRecordCalendar(root,fixture){
 const {provider,definitionId,definition,recordId}=fixture,setup=randomBytes(32).toString('hex'),session=randomBytes(32).toString('hex')
 const f=await emittedMailRuntime(path.join(root,'.wrangler/state'),0,{APP_ORIGIN:'http://127.0.0.1:0',AUTH_LOCAL:'true',OWNER_EMAIL:'synthetic-cradle-restored-owner@example.test',SESSION_SECRET:session,SETUP_TOKEN:setup,MAIL_FROM:'auth@localhost.test',...fixture.warehouse.edge.bindings,...bindings()},r=>new URL(r.url).hostname==='relay.egress.example.com'?fixture.warehouse.edge.outbound(r):provider.fetch(r))
 try{
  const db=await f.runtime.getD1Database('DB'),before=provider.writes.length
  const original=await db.prepare('SELECT enabled,actor_json FROM record_calendar_definitions WHERE id=?').bind(definitionId).first();assert.deepEqual(original,{enabled:0,actor_json:'{}'})
  assert.equal((await db.prepare('SELECT count(*) n FROM connection_credentials').first()).n,0);assert.equal((await db.prepare('SELECT count(*) n FROM authority_credentials').first()).n,0)
  await restoredAutomationTestHistory(f.runtime,db,undefined,fixture.testHistory,()=>fixtureMessages(f.origin))
  const boot=await fetch(f.origin+'/auth/bootstrap',{method:'POST',redirect:'manual',headers:{origin:f.origin,'content-type':'application/json'},body:JSON.stringify({token:setup,displayName:'Synthetic restored calendar owner',returnTo:'/app'})});assert.equal(boot.status,303)
  const cookie=boot.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');await completeFirstRun(f.origin,cookie)
  const home=await fetch(f.origin+'/app',{headers:{cookie}});assert.equal(home.status,200);await home.arrayBuffer()
  const request=async(route,body,status=200)=>{const csrf=(await(await fetch(f.origin+'/auth/csrf',{headers:{cookie}})).json()).csrfToken,response=await fetch(f.origin+route,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{cookie,origin:f.origin,'content-type':'application/json','x-csrf-token':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})}),value=await response.json().catch(()=>null);assert.equal(response.status,status,route.split('?')[0]+': '+(value?.error?.code??'unexpected response'));return value?.data}
  await restoredAutomationTestHistory(f.runtime,db,request,fixture.testHistory,()=>fixtureMessages(f.origin))
  await restoredWarehouseArchive(f.runtime,db,request,fixture.warehouse,()=>fixtureMessages(f.origin))
  const listPath=`/api/v1/record-calendar-sync?appId=${definition.appId}&entityId=${definition.entityId}`,list=await request(listPath),restored=list.definitions.find(d=>d.id===definitionId),syncPath=`/api/v1/record-calendar-sync/${definitionId}/records/${recordId}`
  assert.ok(restored);assert.equal(restored.state,'stopped');assert.equal(restored.canManage,true);assert.equal(list.connections.find(c=>c.id===definition.connectionId).state,'unconfigured')
  await request(syncPath+'/sync',{commandId:createUlid()},403)
  assert.equal((await(await f.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()})).outcome,'ok');assert.equal(provider.writes.length,before,'Restore starts no old calendar effects')
  await request('/api/v1/record-calendar-sync',{commandId:createUlid(),id:definitionId,version:restored.version,approveCalendar:true,definition},403)
  const consent=(await request('/api/v1/commands/connection.begin-consent',{commandId:createUlid(),expected:[],input:{connectionId:definition.connectionId,returnTo:'/app/records'}})).value
  await request('/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-restored',state:new URL(consent.authorizationUrl).searchParams.get('state')}),undefined,303)
  await request(`/api/v1/record-calendar-sync/connections/${definition.connectionId}/refresh`,{commandId:createUlid()});await drain(f.runtime,db)
  await request('/api/v1/record-calendar-sync',{commandId:createUlid(),id:definitionId,version:restored.version,approveCalendar:true,definition})
  const base=`/api/v1/apps/${definition.appId}/entities/${definition.entityId}`,record=(await request(base+'/records/'+recordId)).record
  await request('/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{appId:definition.appId,entityId:definition.entityId,rows:[{recordId,changes:{[definition.startFieldId]:'2026-12-09'}}]}})
  await request(syncPath+'/sync',{commandId:createUlid()});await drain(f.runtime,db)
  assert.equal(provider.writes.length,before+1);assert.equal(provider.writes.at(-1).method,'PUT');assert.equal(provider.writes.at(-1).body.start.date,'2026-12-09','A fresh native owner reconnects, reapproves and dispatches after archive restore')
  await restoredWarehouseFailure(f.runtime,db,request,fixture.warehouse,()=>fixtureMessages(f.origin))
 }finally{await f.runtime.dispose();await f.mail.close()}
}
