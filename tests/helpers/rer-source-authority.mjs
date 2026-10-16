import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {baseHttpSession} from './base-http-session.mjs'
import {withNativeMail} from './rer-emitted-worker.mjs'
import {bindings} from './rer-data-fixture.mjs'
import {sourceRecords} from './rer-source-records.mjs'
const id=()=>randomBytes(16).toString('hex').slice(0,26).toUpperCase()

/** Establish accepted source credentials and a genuinely revoked business scope. */
export async function sourceAuthority(copy,origin){
 return withNativeMail(copy,origin,async()=>{
  const {cookie}=await baseHttpSession(origin,(await copy.readVars()).OWNER_EMAIL)
  const csrfResponse=await fetch(origin+'/auth/csrf',{headers:{cookie}});assert.equal(csrfResponse.status,200)
  const {csrfToken}=await csrfResponse.json()
  const send=(route,body)=>fetch(origin+route,{method:body?'POST':'GET',headers:{cookie,origin,...(body?{'content-type':'application/json','x-csrf-token':csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const apps=await send('/api/v1/apps');assert.equal(apps.status,200)
  const appId=(await apps.json()).data.items[0].id
  const entities=await send(`/api/v1/apps/${appId}/entities`);assert.equal(entities.status,200)
  const entityId=(await entities.json()).data.items[0].id,keyRoute=`/api/v1/apps/${appId}/entities`
  const issued=await send('/api/user-keys',{commandId:id(),appId,entityId,name:'Archive boundary proof',permissions:'read',expiresAt:new Date(Date.now()+86400000).toISOString()})
  assert.equal(issued.status,201,'The real owner issues a source API key')
  const key=(await issued.json()).data.key.secret
  assert.equal((await fetch(origin+keyRoute,{headers:{authorization:`Bearer ${key}`}})).status,200,'The source API key is accepted before export')
  const records=await sourceRecords({origin,cookie,csrfToken,send,id})
  const removedApp=id(),removedEntity=id(),field=id()
  const preview=await send('/api/v1/records/schema-preview',{appId:removedApp,name:'Removed archive scope',tables:[{id:removedEntity,label:'Private records',primaryFieldId:field,fields:[{id:field,label:'Name',type:'text',required:true,unique:false}]}]})
  assert.equal(preview.status,200)
  const adopted=await send('/api/v1/commands/release.adopt',{commandId:id(),expected:[],input:{kind:'manual_schema',previewId:(await preview.json()).data.id}})
  assert.equal(adopted.status,200)
  const removedRoute=`/api/v1/apps/${removedApp}/entities/${removedEntity}/query`
  const created=await send('/api/v1/commands/record.create',{commandId:id(),expected:[{ref:{appId:removedApp,entityId:'00000000000000000000000001',recordId:removedEntity},version:1}],input:{appId:removedApp,entityId:removedEntity,values:{[field]:'Archive retained record'}}})
  assert.equal(created.status,200,'A real record is created in the admitted manual schema before revocation')
  assert.equal((await send(removedRoute,{limit:1})).status,200,'The source scope was usable before revocation')
  await bindings(copy.source,async({DB})=>{
   await DB.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE app_id=?").bind(removedApp).run()
  })
  assert.equal((await send(removedRoute,{limit:1})).status,403,'The source scope is revoked before export')
  return {cookie,key,keyRoute,removedApp,removedRoute,records}
 })
}
