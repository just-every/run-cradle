import assert from 'node:assert/strict'
import {readArchive} from '@runeditrun/rer/modules/portability'
import {launchArchiveContents} from './launch-archive-contents.mjs'

export async function installationArchive(h,owner){
  const input={scope:'installation',format:'archive'}
  assert.equal((await h.post('/api/v1/commands/export.start',input)).status,401)
  const csrf=(await (await h.request('/auth/csrf',{headers:{cookie:owner.cookie}})).json()).csrfToken
  const headers={cookie:owner.cookie,'x-csrf-token':csrf}
  const checkContents=await launchArchiveContents(h,headers)
  const refused=await h.post('/api/v1/commands/export.start',input,{...headers,origin:'https://other.example.test'})
  assert.equal(refused.status,403)
  const response=await h.post('/api/v1/commands/export.start',input,headers)
  assert.equal(response.status,200,await response.clone().text())
  const {data:{id}}=await response.json()
  let status
  for(let step=0;step<100;step++){
   const next=await h.post(`/api/v1/archive-jobs/${id}/advance`,{},headers)
   assert.equal(next.status,200,await next.clone().text());status=(await next.json()).data
   if(status.phase==='complete')break
  }
  assert.equal(status.phase,'complete');assert.ok(status.contentHash)
  const download=await h.request(`/api/v1/archive-jobs/${id}/content`,{headers})
  assert.equal(download.status,200,await download.clone().text())
  const bytes=await download.text(),records=[]
  for await(const record of readArchive(new Response(bytes).body))records.push(record)
  const manifest=records[0]
  assert.equal(manifest.product,'just-every/cradle')
  assert.ok(manifest.tables.some(table=>table.name==='workspace'))
  assert.ok(!manifest.tables.some(table=>['oa_sessions','authority_sessions','connection_credentials'].includes(table.name)))
  assert.ok(!bytes.includes(h.bindings.SESSION_SECRET));assert.ok(!bytes.includes(owner.cookie.split('=')[1]))
  assert.ok(records.some(record=>record.kind==='part'&&record.items.some(item=>item.kind==='row'&&item.table==='workspace')))
  assert.equal(records.at(-1).kind,'closing')
  checkContents(records)
  await h.db.prepare('UPDATE authority_principals SET initial_owner=0 WHERE id=?').bind(owner.owner).run()
  assert.equal((await h.request(`/api/v1/archive-jobs/${id}/content`,{headers})).status,403)
  assert.equal((await h.post('/api/v1/commands/export.start',input,headers)).status,403,'Revoked installation authority cannot capture another archive')
  assert.equal((await h.post(`/api/v1/archive-jobs/${id}/advance`,{},headers)).status,403,'A captured archive job cannot bypass current owner authority')
  assert.equal((await h.request(`/api/v1/archive-jobs/${id}`,{headers})).status,403,'Revoked installation authority cannot read a captured job')
}
