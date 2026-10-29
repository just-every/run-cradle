import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function userKeyDeleteBrowser(page,h,journey,width) {
 await page.goto(h.origin+'/app/settings/')
 await page.waitForLoadState('networkidle')
 await page.locator('summary').filter({hasText:/^API keys$/}).click()
 const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'API keys',exact:true})}).last()
 await panel.getByLabel(/^Application/).selectOption(h.appId)
 await panel.getByLabel(/^Record type/).selectOption(h.entityId)
 const access=panel.getByLabel('Access',{exact:true}),deletion=panel.getByRole('checkbox',{name:'Allow record deletion',exact:true})
 await deletion.waitFor()
 if(width===1440){assert.equal(await deletion.isChecked(),false);assert.equal(await deletion.isDisabled(),true)}
 await access.selectOption('write')
 if(width===1440){assert.equal(await deletion.isChecked(),false);assert.equal(await deletion.isEnabled(),true)}
 await journey.setChecked(deletion,true)
 await access.selectOption('read')
 if(width===1440){assert.equal(await deletion.isChecked(),false);assert.equal(await deletion.isDisabled(),true)}
 await access.selectOption('write')
 if(width===1440)assert.equal(await deletion.isChecked(),false,'Read access clears the previous delete opt-in')
 const name=`synthetic-cradle-${width} Settings`
 const card=label=>panel.locator('article').filter({has:page.getByRole('heading',{name:label,exact:true})})
 async function issue(label) {
  await panel.getByLabel('Key name',{exact:true}).fill(label)
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/user-keys')&&r.request().method()==='POST')
  await panel.getByRole('button',{name:'Issue API key',exact:true}).click()
  const response=await pending
  assert.equal(response.status(),201)
  const key=(await response.json()).data.key
  await panel.getByRole('button',{name:'I saved this key',exact:true}).click()
  await card(label).waitFor()
  return key
 }
 const ordinary=await issue(name+' writer')
 if(width===1440)assert.match(await card(name+' writer').innerText(),/Read, create and update records/)
 await journey.setChecked(deletion,true)
 await journey.capture('settings-delete-key-opt-in')
 const opted=await issue(name+' delete')
 await page.reload();await page.waitForLoadState('networkidle')
 await page.locator('summary').filter({hasText:/^API keys$/}).click()
 await panel.getByLabel(/^Application/).selectOption(h.appId)
 await card(name+' delete').waitFor()
 if(width===1440){
  assert.match(await card(name+' delete').innerText(),/Read, create, update and delete records/)
  assert.doesNotMatch(await card(name+' writer').innerText(),/and delete records/)
 }
 await journey.capture('settings-retained-key-permissions')
 if(width!==1440)return
 const document=await h.request(`/api/v1/apps/${h.appId}/openapi.json`,{secret:ordinary.secret})
 const operations=Object.entries(document.paths).flatMap(([path,methods])=>Object.entries(methods).map(([method,operation])=>({path,method:method.toUpperCase(),operation})))
 async function call(name,secret,{id,body,status=200}={}) {
  const operation=operations.find(item=>item.operation['x-cradle-operation']===name&&item.operation['x-cradle-entityId']===h.entityId)
  assert.ok(operation,`Generated REST document supplies ${name}`)
  return h.request(operation.path.replace('{recordId}',id??''),{method:operation.method,secret,body,status})
 }
 const created=(await call('create',ordinary.secret,{body:{commandId:createUlid(),schemaVersion:h.entity.version,values:{[h.nameId]:'synthetic-cradle-301 Settings deletion'}}})).data.result.value.rows[0]
 const request={id:created.id,body:{commandId:createUlid(),version:created.version,confirmation:created.id}}
 await call('delete',ordinary.secret,{...request,status:403})
 assert.deepEqual((await call('get',ordinary.secret,{id:created.id})).data,created,'A default writable key cannot delete or change the row')
 async function rotate(key,label) {
  const before=(await h.request(`/api/user-keys?appId=${h.appId}`)).data.keys.find(row=>row.id===key.id)
  const pending=page.waitForResponse(r=>r.url().endsWith(`/api/user-keys/${key.id}/rotate`))
  await card(label).getByRole('button',{name:`Rotate ${label}`,exact:true}).click()
  const response=await pending;assert.equal(response.status(),200)
  const replacement=(await response.json()).data.key
  await panel.getByRole('button',{name:'I saved this key',exact:true}).click()
  const after=(await h.request(`/api/user-keys?appId=${h.appId}`)).data.keys.find(row=>row.id===replacement.id)
  assert.deepEqual(after.scopes,before.scopes,'Rotation preserves granted actions')
  await call('schema',key.secret,{status:401})
  await call('schema',replacement.secret)
  return replacement
 }
 const writer=await rotate(ordinary,name+' writer')
 await call('delete',writer.secret,{...request,status:403})
 const deleting=await rotate(opted,name+' delete')
 await call('delete',deleting.secret,{...request,body:{...request.body,confirmation:createUlid()},status:400})
 assert.deepEqual((await call('get',writer.secret,{id:created.id})).data,created,'Incorrect confirmation changes nothing')
 assert.equal((await call('delete',deleting.secret,request)).data.result.state,'committed')
 assert.ok(JSON.stringify((await h.request(`/api/v1/records/trash?appId=${h.appId}`)).data).includes(created.id),'Explicit delete uses recoverable Trash')
 assert.ok(!(await call('query',writer.secret,{body:{limit:100}})).data.items.some(row=>row.id===created.id))
 const pending=page.waitForResponse(r=>r.url().endsWith(`/api/user-keys/${deleting.id}/revoke`))
 await card(name+' delete').getByRole('button',{name:`Revoke ${name} delete`,exact:true}).click()
 assert.equal((await pending).status(),200)
 await call('schema',deleting.secret,{status:401})
 await call('delete',deleting.secret,{...request,status:401})
 assert.ok(JSON.stringify((await h.request(`/api/v1/records/trash?appId=${h.appId}`)).data).includes(created.id),'Revoked capture cannot remove the Trash custody')
}
