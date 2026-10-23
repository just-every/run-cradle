import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { contract } from './contract.mjs'
import { launchBaseAuthorityRuntime } from './helpers/launch-base-authority-runtime.mjs'

contract('AUTH-BASE-001 HOME-003 BASE-ACCESS-002 INTEG-002 BASE-SEC-003', 'emitted production rejects development sender/viewer and public identity follows persisted renames without private data',async()=>{
 const h=await launchBaseAuthorityRuntime({configuration:{CONNECTION_ENCRYPTION_KEY_VERSION:undefined,GOOGLE_CLIENT_ID:'test-only-google-client',GOOGLE_CLIENT_SECRET:'test-only-google-secret'}})
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
  for (const [search, destination] of [
   ['?login_hint=owner@example.test','/app'],
   ['?returnTo=%2Fapp%2Frecords%3Fimport%3Dbase','/app/records?import=base'],
   ['?next=%2Fapp%2Fsettings','/app/settings'],
   ['?returnTo=https%3A%2F%2Fattacker.example.test','/app'],
   ['?returnTo=%2F%2Fattacker.example.test','/app'],
   ['?returnTo=%252F%252Fattacker.example.test','/app'],
   ['?returnTo=%2Fsignin','/app'],
  ]) {
   let response=await h.request('/signin'+search,{headers:{cookie:owner.cookie}})
   // TanStack may canonicalize the legacy next alias before its loader runs.
   if(response.status===307&&response.headers.get('location')?.startsWith('/signin?')){
    assert.doesNotMatch(await response.text(),/id="signin-email"/)
    response=await h.request(response.headers.get('location'),{headers:{cookie:owner.cookie}})
   }
   assert.equal(response.status,307,'A current owner leaves sign-in before the form')
   assert.equal(response.headers.get('location'),destination)
   assert.match(response.headers.get('cache-control'),/private.*no-store/)
   assert.doesNotMatch(await response.text(),/id="signin-email"/)
  }
  const hinted=await(await h.request('/signin?login_hint=synthetic-cradle-1%40example.test')).text()
  assert.match(hinted,/value="synthetic-cradle-1@example.test"/,'Signed-out email hint remains available')
  await verifyOwnerGmail(h,owner)
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

async function verifyOwnerGmail(h, owner) {
  const session = async () => (await (await h.request('/api/v1/session', {headers:{cookie:owner.cookie}})).json()).data
  const current = await session(), appId = current.appIds[0]
  const {createUlid} = await import('../src/core/shared/ids.ts')
  const command = async (action,input) => h.post('/api/v1/commands/'+action,{commandId:createUlid(),expected:[],input},{cookie:owner.cookie,'x-csrf-token':(await session()).csrfToken})
  const input = {appId,adapterId:'gmail',name:'Operations mailbox',accountId:'operations@example.test',scopes:[],ownership:[],credentialRef:null}
  const configured = await command('connection.configure',input)
  assert.equal(configured.status,200,await configured.clone().text())
  const {connectionId} = (await configured.json()).data.value
  const read = await h.request('/api/v1/connections/'+connectionId,{headers:{cookie:owner.cookie}})
  assert.equal(read.status,200,await read.clone().text())
  const consent = await command('connection.begin-consent',{connectionId,returnTo:'/app/settings'})
  assert.equal(consent.status,200,await consent.clone().text())
  const authorization = new URL((await consent.json()).data.value.authorizationUrl)
  assert.equal(authorization.origin,'https://accounts.google.com')
  assert.equal(authorization.searchParams.get('redirect_uri'),h.origin+'/oauth/google/callback')
  assert.ok(authorization.searchParams.get('state'))
  assert.ok(authorization.searchParams.get('code_challenge'))
  assert.equal((await h.db.prepare('SELECT count(*) n FROM authority_grants').first()).n,0,'Connecting creates no provider action grant')
  await h.db.prepare('UPDATE authority_principals SET initial_owner=0 WHERE id=?').bind(owner.owner).run()
  const before = await h.db.prepare('SELECT count(*) n FROM provider_connections').first()
  assert.equal((await command('connection.configure',input)).status,403)
  assert.equal((await command('connection.begin-consent',{connectionId,returnTo:'/app/settings'})).status,403)
  assert.deepEqual(await h.db.prepare('SELECT count(*) n FROM provider_connections').first(),before)
  await h.db.prepare('UPDATE authority_principals SET initial_owner=1 WHERE id=?').bind(owner.owner).run()
  await h.db.prepare('DELETE FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(owner.owner,appId).run()
  assert.equal((await command('connection.configure',input)).status,403,'Owner setup never restores a revoked app membership')
}
