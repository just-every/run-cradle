import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {migrationInventory} from '../../scripts/migration-groups.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {createCursorCodec} from '../../src/domains/records/cursor.server.ts'
import {emittedMailRuntime} from './emitted-mail-runtime.mjs'
import {completeFirstRun} from './complete-first-run.mjs'
import {baseHttpSession} from './base-http-session.mjs'

/** Owns one emitted Worker. Call outside another runtime's lifetime; the caller
 * owns the existing real relay/receiver network edge and its cleanup. */
export async function changeSubscriptionsUpgrade(edge){
 const directory=await mkdtemp(path.join(tmpdir(),'cradle-change-upgrade-'))
 let runtime,mail
 try{
  let origin
  const sessionSecret=randomBytes(32).toString('hex'),setupToken=randomBytes(32).toString('hex')
  ;({runtime,mail,origin}=await emittedMailRuntime(directory,0,{
   AUTH_LOCAL:'true',OWNER_EMAIL:'upgrade-owner@example.test',
   SESSION_SECRET:sessionSecret,SETUP_TOKEN:setupToken,WORKSPACE_NAME:'Upgrade acceptance',
   WORKSPACE_TIMEZONE:'UTC',WORKSPACE_CURRENCY:'USD',MAIL_FROM:'auth@localhost.test',
   CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
   EGRESS_RELAY_URL:'https://relay.egress.example.com/v1/deliver',EGRESS_RELAY_SECRET:edge.secret,
  },request=>edge.outbound(request)))
  const db=await runtime.getD1Database('DB'),migrations=migrationInventory()
  const cut=migrations.findIndex(migration=>migration.name==='9045_change_subscriptions.sql')
  assert.ok(cut>=0,'The actual change-subscription upgrade is available')
  assert.ok(migrations.slice(cut).some(migration=>migration.name==='9047_metadata_trash.sql'))
  const migrate=async migration=>db.exec(migration.sql.replace(/^\s*--.*$/gm,'').replaceAll('\n',' '))
  for(const migration of migrations.slice(0,cut))await migrate(migration)
  const appId=createUlid(),entityId=createUlid(),fieldId=createUlid()
  const historical=await seedPreUpgrade(db,{appId,entityId,fieldId})
  const upgradeStarted=Date.now()
  for(const migration of migrations.slice(cut))await migrate(migration)
  const upgradeFinished=Date.now()
  await verifyRetainedUpgrade(db,historical,upgradeStarted,upgradeFinished)
  await runtime.ready

  const bootstrap=await fetch(origin+'/auth/bootstrap',{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token:setupToken,displayName:'Upgrade owner',returnTo:'/app'})})
  assert.equal(bootstrap.status,303,'The upgraded Worker bootstraps through native auth')
  const bootstrapCookie=bootstrap.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
  await completeFirstRun(origin,bootstrapCookie)
  const home=await fetch(origin+'/app',{headers:{cookie:bootstrapCookie}})
  assert.equal(home.status,200);await home.arrayBuffer()
  const {cookie,csrfToken}=await baseHttpSession(origin,'upgrade-owner@example.test')
  async function request(route,{method='GET',body,secret,status=200}={}){
   const response=await fetch(origin+route,{method,redirect:'manual',headers:{
    ...(secret?{authorization:`Bearer ${secret}`}:{cookie}),
    ...(body?{origin,'content-type':'application/json','x-csrf-token':csrfToken}:{}),
   },...(body?{body:JSON.stringify(body)}:{})})
   const value=await response.json()
   assert.equal(response.status,status,`${method} ${route.split('?')[0]}: ${value.error?.code??'unexpected response'}`)
   return value.data
  }
  const draft={appId,name:'Synthetic upgrade base',tables:[{id:entityId,label:'Items',primaryFieldId:fieldId,fields:[{id:fieldId,label:'Name',type:'text',required:true,unique:false}]}]}
  const preview=await request('/api/v1/records/schema-preview',{method:'POST',body:draft})
  await request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
  const schema=await request(`/api/v1/apps/${appId}/entities/${entityId}`)
  const key=(await request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId,entityId,name:'synthetic-cradle-87',permissions:'read',expiresAt:new Date(Date.now()+86400000).toISOString()}})).key
  const root='/api/v1/change-subscriptions'
  const subscription=await request(root,{method:'POST',secret:key.secret,status:201,body:{commandId:createUlid(),appId,entityId,url:edge.receiverOrigin+'/changes-upgrade'}})
  const page=(cursor,limit=200,through)=>request(`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}${through?'&through='+encodeURIComponent(through):''}`,{secret:key.secret})
  // A new subscription starts at the current head. The production signing
  // codec is the fixture seam for reading its retained pre-upgrade range;
  // authentication, projection, window capture and replay stay real HTTP.
  const historyCursor=await createCursorCodec(sessionSecret).encode({binding:subscription.id+':upgrade-history',revision:Date.now(),offset:0})
  // The migration-only window ends before the later real schema adoption.
  // A separate range containing that adoption must use the new generic marker.
  const codec=createCursorCodec(sessionSecret),historicalThrough=await codec.encode({binding:subscription.id+':upgrade-through',revision:Date.now(),offset:historical.audits.at(-1).rowid})
  const history=await page(historyCursor,200,historicalThrough)
  const adoptionCursor=await codec.encode({binding:subscription.id+':upgrade-adoption',revision:Date.now(),offset:0})
  const adoptionRange=await page(adoptionCursor)
  assert.deepEqual(adoptionRange.items,[],'An upgraded range containing schema adoption exposes no record facts')
  assert.equal(adoptionRange.resyncRequired.code,'resync_required')
  assert.deepEqual(history.items.map(item=>[item.id,item.sequence,item.kind,item.recordId]),historical.audits.map(row=>[row.id,row.rowid,'delete',row.recordId]),'Migrated old audit facts reach the public feed in prior commit order, despite inverse lexical IDs')
  async function create(name){
   const result=await request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,values:{[fieldId]:name}}}})
   assert.equal(result.state,'committed');return result.value
  }
  const first=await create('synthetic-cradle-upgrade-1'),second=await create('synthetic-cradle-upgrade-2')
  await request('/api/v1/commands/record.patch',{method:'POST',body:{commandId:createUlid(),expected:[{ref:first.ref,version:first.version}],input:{ref:first.ref,changes:{[fieldId]:'synthetic-cradle-upgrade-3'}}}})
  const changes=await page(subscription.cursor)
  assert.deepEqual(changes.items.map(item=>[item.kind,item.recordId]),[['create',first.id],['create',second.id],['update',first.id]])
  assert.ok(changes.items.every((item,index)=>item.sequence>(index?changes.items[index-1].sequence:historical.audits.at(-1).rowid)),'Post-upgrade commits never reuse a migrated sequence')
  assert.equal(new Set([...history.items,...changes.items].map(item=>item.sequence)).size,5)
  await create('synthetic-cradle-upgrade-4')
  assert.deepEqual(await page(historyCursor),history,'The retained historical cursor replays after new writes')
  assert.deepEqual(await page(subscription.cursor),changes,'The first post-upgrade cursor window replays after later writes')
  let cursor=subscription.cursor,items=[],finished=false
  for(let count=0;count<20;count++){
   const part=await page(cursor,1);items.push(...part.items);cursor=part.cursor
   if(!part.hasMore){finished=true;break}
  }
  assert.ok(finished,'The known upgraded feed finishes in bounded pages')
  assert.deepEqual(items,changes.items,'One-row paging of the captured window has no gaps or duplicates')
  const later=await page(changes.cursor)
  assert.equal(later.items.length,1);assert.equal(later.items[0].kind,'create')
  assert.ok(later.items[0].sequence>changes.items.at(-1).sequence)
  const audit=await db.prepare('SELECT id,change_sequence FROM admission_audit ORDER BY change_sequence').all()
  assert.equal(new Set(audit.results.map(row=>row.change_sequence)).size,audit.results.length)
  assert.ok(audit.results.every(row=>Number.isSafeInteger(row.change_sequence)&&row.change_sequence>0))
  assert.ok(audit.results.filter(row=>!historical.audits.some(old=>old.id===row.id)).every(row=>row.change_sequence>historical.audits.at(-1).rowid))
  await request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}})
  await request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId}})
  console.log('CHANGE_SUBSCRIPTION_UPGRADE PASS populated pre-9045 audit order, public feed/replay, fresh sequences and 30-day pre-9047 deleted-view custody')
 }finally{
  try{await runtime?.dispose()}finally{try{await mail?.close()}finally{await rm(directory,{recursive:true,force:true})}}
 }
}

async function seedPreUpgrade(db,{appId,entityId,fieldId}){
 const columns=await db.prepare('PRAGMA table_info(admission_audit)').all()
 assert.ok(!columns.results.some(column=>column.name==='change_sequence'),'History is populated before the sequence column exists')
 const viewColumns=await db.prepare('PRAGMA table_info(record_views)').all()
 assert.ok(!viewColumns.results.some(column=>column.name==='deleted_at'),'The deleted view predates Trash metadata')
 const at=new Date(Date.now()-3600000).toISOString(),actorId=createUlid()
 const ids=[createUlid(),createUlid()].sort().reverse(),audits=[]
 for(const [index,rowid] of [11,43].entries()){
  const id=ids[index],commandId=createUlid(),recordId=createUlid()
  await db.prepare("INSERT INTO command_admissions(command_id,batch_nonce,actor_id,actor_kind,app_id,action,input_hash,state,result_json,access_json,created_at,updated_at) VALUES(?,?,?,'human',?,'record.delete',?,'committed','{}','{}',?,?)").bind(commandId,createUlid(),actorId,appId,'0'.repeat(64),at,at).run()
  // Retained deletion facts legitimately outlive their removed records. Their
  // subject identities are synthetic; no current record or authority is injected.
  await db.prepare("INSERT INTO admission_audit(rowid,id,command_id,actor_id,actor_kind,app_id,action,subject_json,changes_json,source_ids_json,personal_refs_json,created_at) VALUES(?,?,?,?,'human',?,'record.delete',?,'[]','[]','[]',?)").bind(rowid,id,commandId,actorId,appId,JSON.stringify({appId,entityId,recordId}),at).run()
  audits.push({id,rowid,recordId})
 }
 const view={id:createUlid(),appId,entityId,name:'synthetic-cradle-upgrade-deleted-view',version:3,createdAt:at,updatedAt:at,display:'grid',fields:[fieldId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:fieldId},visibility:'app',shipped:false}
 const definition=JSON.stringify(view)
 await db.prepare("INSERT INTO record_views(id,app_id,entity_id,owner_id,version,visibility,definition_json,created_at,updated_at) VALUES(?,?,?,?,?,'deleted',?,?,?)").bind(view.id,appId,entityId,actorId,view.version,definition,at,at).run()
 const before=(await db.prepare('SELECT rowid,* FROM admission_audit ORDER BY rowid').all()).results
 const beforeView=await db.prepare('SELECT * FROM record_views WHERE id=?').bind(view.id).first()
 return {audits,before,view,beforeView}
}

async function verifyRetainedUpgrade(db,history,started,finished){
 const after=(await db.prepare('SELECT rowid,* FROM admission_audit ORDER BY rowid').all()).results
 assert.deepEqual(after.map(({change_sequence,...row})=>row),history.before,'The additive sequence migration preserves every populated audit fact')
 assert.deepEqual(after.map(row=>row.change_sequence),history.audits.map(row=>row.rowid),'Historical sequence preserves gapped rowid commit order')
 const view=await db.prepare('SELECT * FROM record_views WHERE id=?').bind(history.view.id).first()
 const {deleted_at,expires_at,purge_state,...retainedView}=view
 assert.deepEqual(retainedView,history.beforeView,'The Trash upgrade preserves the deleted view definition, identity, owner and prior timestamps')
 assert.equal(view.visibility,'deleted');assert.equal(view.purge_state,'held')
 assert.ok(view.deleted_at>=Math.floor(started/1000)*1000&&view.deleted_at<=finished,'A previously deleted view enters Trash at the upgrade clock')
 assert.equal(view.expires_at-view.deleted_at,30*86400000,'Previously deleted views receive a complete 30-day restore window')
 assert.ok(view.expires_at>finished,'The populated deleted view remains restorable after upgrade')
}
