import {privateExports} from './rer-private-exports.mjs'
import {randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
import {outboxSession} from './rer-development.mjs'
import {checkoutDevKey} from './dev-gate.mjs'
import {withNativeOutbox} from './rer-emitted-worker.mjs'
export async function restoredSignIn(copy,origin,prior){
 return withNativeOutbox(copy,origin,async()=>{
  const {cookie,token}=await outboxSession(origin,await checkoutDevKey(copy.source))
  const app=await fetch(origin+'/app',{headers:{cookie},redirect:'manual'})
  assert.equal(app.status,200,'The archived completed workspace opens normally')
  const setup=await fetch(origin+'/setup',{headers:{cookie},redirect:'manual'})
  assert.equal(setup.status,303,'A completed workspace leaves setup')
  assert.equal(new URL(setup.headers.get('location'),origin).pathname,'/app')
  assert.equal((await fetch(origin+'/api/portfolio',{headers:{cookie}})).status,200,'Fresh owner retains the archived active Launch scope')
  assert.equal((await fetch(origin+'/api/session',{headers:{cookie:prior.cookie}})).status,401,'A previously accepted source session cannot enter the destination')
  assert.equal((await fetch(origin+prior.keyRoute,{headers:{authorization:`Bearer ${prior.key}`}})).status,401,'A previously accepted source API key cannot enter the destination')
  const csrf=await fetch(origin+'/auth/csrf',{headers:{cookie}}),csrfToken=(await csrf.json()).csrfToken
  const send=(route,body)=>fetch(origin+route,{method:body?'POST':'GET',headers:{cookie,origin,...(body?{'content-type':'application/json','x-csrf-token':csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})})
  await privateExports({origin,cookie,csrfToken,records:prior.records},'fresh-owner-restored')
  const r=prior.records,exported=await send('/api/v1/records/base-export',{appId:r.appId,format:'json'})
  assert.equal(exported.status,200,'Returning owner exports restored typed records')
  assert.deepEqual(JSON.parse((await exported.json()).data.content).base,r.portable.base,'Links, lookups, views and forms survive the installation archive')
  const current=await send(`/api/v1/apps/${r.appId}/entities/${r.entityId}/records/${r.recordId}`);assert.equal(current.status,200)
  const record=(await current.json()).data.record
  const edited=await send('/api/v1/commands/record.patch',{commandId:randomBytes(16).toString('hex').slice(0,26).toUpperCase(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,changes:{[r.fieldId]:'Restored owner edit'}}})
  assert.equal(edited.status,200,'Freshly signed-in owner edits a restored record')
  const verified=await send(`/api/v1/apps/${r.appId}/entities/${r.entityId}/records/${r.recordId}`);assert.equal((await verified.json()).data.record.fields[r.fieldId].value,'Restored owner edit');console.log('NATIVE_RESTORED_OWNER: ordinary outbox one-use sign-in; historical identity; actual record edit read back; old session/key refused')
  const apps=await fetch(origin+'/api/v1/apps',{headers:{cookie}});assert.equal(apps.status,200)
  assert.ok(!(await apps.json()).data.items.some(app=>app.id===prior.removedApp),'An already removed source scope is not revived')
  assert.equal((await fetch(origin+prior.removedRoute,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({limit:1})})).status,403,'Removed source scope cannot read its retained records')
  assert.equal((await fetch(origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token})})).status,400,'Restored sign-in is one use')
 })
}
