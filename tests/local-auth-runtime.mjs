import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { contract } from './contract.mjs'
import { launchBaseAuthorityRuntime } from './helpers/launch-base-authority-runtime.mjs'

contract('AUTH-BASE-001 HOME-003 BASE-ACCESS-002', 'emitted production rejects development sender/viewer and public identity follows persisted renames without private data',async()=>{
 const h=await launchBaseAuthorityRuntime()
 try {
  const owner=await h.bootstrap()
  assert.equal((await h.request('/app',{headers:{cookie:owner.cookie}})).status,200)
  const session=await(await h.request('/api/session',{headers:{cookie:owner.cookie}})).json()
  assert.equal(session.launchInUse,false,'Shipped empty launch definitions are not use')
  await h.db.prepare("UPDATE workspace SET name='Renamed records',version=version+1 WHERE id='workspace'").run()
  const front=await(await h.request('/')).text(),signin=await(await h.request('/signin')).text()
  assert.ok(front.includes('Renamed records'),'The Lobby names the persisted rename');assert.match(front,/<a class="btn" href="\/signin">/)
  assert.match(signin,/id="signin-email"/);assert.doesNotMatch(signin,/Welcome back|Checking sign-in|Continue with local development identity/)
  for(const html of [front,signin])assert.doesNotMatch(html,/owner@example\.test|Launch owner/,'Public identity exposes no private operator identity')
  assert.equal((await(await h.request('/api/session',{headers:{cookie:owner.cookie}})).json()).workspace.name,'Renamed records')
  const before=await h.db.prepare('SELECT count(*) n FROM oa_tokens').first()
  await h.reconfigure({AUTH_LOCAL:'true',MAIL_PROVIDER:'development',RER_DEPLOY_SOURCE:'test-deployed-source'})
  assert.equal((await h.request('/__dev/outbox')).status,404)
  assert.equal((await h.request('/__dev/outbox',{headers:{host:'127.0.0.1'}})).status,404)
  assert.equal((await h.post('/auth/magic-link',{email:'owner@example.test'})).status,503)
  assert.deepEqual(await h.db.prepare('SELECT count(*) n FROM oa_tokens').first(),before)
  assert.equal(h.deliveries.length,0)
 } finally {await h.close()}
})
contract('AUTH-BASE-001 BASE-ACCESS-002', 'adopted branded mail and CSP confirmation keep GET/HEAD read-only and POST one-use',async()=>{
 const h=await launchBaseAuthorityRuntime()
 try {
  await h.bootstrap()
  assert.equal((await h.post('/auth/magic-link',{email:'owner@example.test',returnTo:'/app'})).status,202)
  const parts=h.deliveries[0].content
  const plain=parts.find(p=>p.type==='text/plain').value,html=parts.find(p=>p.type==='text/html').value
  assert.match(plain,/Cradle/);assert.match(html,/Cradle/)
  const link=new URL(plain.match(/https:\/\/[^\s]+/)[0])
  assert.equal((plain.match(/token=/g)??[]).length,1);assert.equal((html.match(/token=/g)??[]).length,1)
  const before=await h.db.prepare('SELECT count(*) n FROM oa_sessions').first()
  for(const method of ['GET','HEAD']){
   const response=await h.request(link.pathname+link.search,{method})
   assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('referrer-policy'),'strict-origin')
   const page=await response.text()
   if(method==='HEAD')assert.equal(page,'')
   else {
    assert.match(page,/Confirm sign-in to Cradle/);assert.match(page,/<form[^>]*method="post"/)
    const style=page.match(/<style>([\s\S]*?)<\/style>/)[1]
    assert.ok(response.headers.get('content-security-policy').includes(`'sha256-${createHash('sha256').update(style).digest('base64')}'`))
    assert.equal((page.match(/name="token"/g)??[]).length,1)
   }
  }
  assert.deepEqual(await h.db.prepare('SELECT count(*) n FROM oa_sessions').first(),before)
  assert.equal((await h.db.prepare('SELECT consumed_at FROM oa_tokens ORDER BY created_at DESC LIMIT 1').first()).consumed_at,null)
  assert.equal((await h.post('/auth/confirm',{token:link.searchParams.get('token')})).status,303)
  assert.equal((await h.post('/auth/confirm',{token:link.searchParams.get('token')})).status,400)
 } finally {await h.close()}
})
