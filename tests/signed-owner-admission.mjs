import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {admissionRuntime} from './helpers/admission-runtime.mjs'
import {completeFirstRun} from './helpers/complete-first-run.mjs'

contract('ADMISSION-SIGNED-001','signed first-owner admission binds the installation, admits once and gates editor config on the current native owner',async()=>{
 const ownerName='Synthetic Cradle Owner'
 const h=await admissionRuntime(18958,{ownerEmail:'CLAIM-OWNER@EXAMPLE.TEST',ownerName})
 try{
  const count=()=>h.db.prepare('SELECT (SELECT count(*) FROM oa_operators) AS operators,(SELECT count(*) FROM oa_sessions) AS sessions,(SELECT count(*) FROM oc_owner_claims) AS claims').first()
  const before=await count()
  const confirmation=await h.request('/auth/owner-claim');assert.equal(confirmation.status,200)
  assert.ok(confirmation.headers.get('content-security-policy').includes("frame-ancestors 'none'"))
  for(const changes of [{installationId:'another-installation'},{aud:'https://another.example.test'},
   {iss:'https://another-manager.example.test'},{email:'another-owner@example.test'},
   {iat:Math.floor(Date.now()/1000)-120,exp:Math.floor(Date.now()/1000)-1}]){
   const response=await h.request('/auth/owner-claim',{method:'POST',body:{token:await h.token(changes)}})
   assert.equal(response.status,403);assert.equal(response.headers.get('set-cookie'),null)
  }
  const malformed=await h.request('/auth/owner-claim',{method:'POST',body:{token:'invalid'}})
  assert.equal(malformed.status,403)
  const wrongOrigin=await h.request('/auth/owner-claim',{method:'POST',body:{token:await h.token()},headers:{origin:'https://attacker.example.test'}})
  assert.equal(wrongOrigin.status,403)
  assert.deepEqual(await count(),before,'Rejected claims change no owner or session state')
  const tokens=await Promise.all([h.token(),h.token()])
  const admitted=await Promise.all(tokens.map((token,index)=>h.request('/auth/owner-claim',{method:'POST',body:{token,...(index?{displayName:'Owner'}:{}),returnTo:'/app'}})))
  assert.deepEqual(admitted.map(response=>response.status).sort(),[303,409],'Only one concurrent claim can bootstrap')
  const cookie=admitted.find(response=>response.status===303).headers.get('set-cookie').split(';')[0]
  const session=await h.request('/auth/session',{cookie});assert.equal(session.status,200)
  const nativeOwner=(await session.json()).operator
  assert.equal(nativeOwner.role,'owner');assert.equal(nativeOwner.email,'claim-owner@example.test')
  assert.equal(nativeOwner.displayName,ownerName,'Signed admission uses the configured initial owner name')
  await completeFirstRun(h.origin,cookie)
  const document=await h.request('/app',{cookie});assert.equal(document.status,200);await document.arrayBuffer()
  assert.deepEqual(await count(),{operators:1,sessions:1,claims:1})
  assert.equal((await h.db.prepare('SELECT completed FROM oc_owner_claims').first()).completed,1)
  for(const token of tokens)assert.equal((await h.request('/auth/owner-claim',{method:'POST',body:{token}})).status,409)
  const renamed='Synthetic Chosen Name'
  assert.equal((await h.request('/auth/display-name',{method:'POST',cookie,body:{displayName:renamed}})).status,200)
  assert.equal((await h.request('/auth/magic-link',{method:'POST',body:{email:h.email}})).status,202)
  const message=(await h.mailMessages()).findLast(message=>message.personalizations.some(group=>group.to.some(recipient=>recipient.email===h.email)))
  const link=new URL(message.content.find(part=>part.type==='text/plain').value.match(/http:\/\/[^\s]+/)[0])
  const signedIn=await h.request('/auth/confirm',{method:'POST',body:{token:link.searchParams.get('token')}})
  assert.equal(signedIn.status,303)
  const returningCookie=signedIn.headers.get('set-cookie').split(';')[0]
  assert.equal((await(await h.request('/auth/session',{cookie:returningCookie})).json()).operator.displayName,renamed,'Later sign-in preserves the person’s chosen name')
  assert.equal((await h.request('/auth/signout',{method:'POST',cookie:returningCookie,body:{}})).status,204,'Finish the additional email session before testing the signed-admission credential')
  assert.equal((await h.request('/auth/owner-claim',{method:'POST',body:{token:await h.token(),displayName:'Owner'}})).status,409)
  assert.equal((await(await h.request('/auth/session',{cookie})).json()).operator.displayName,renamed,'Repeated claims never overwrite the existing name')
  const config=await h.request('/api/editor/config',{cookie});assert.equal(config.status,200)
  assert.equal(config.headers.get('cache-control'),'no-store, private')
  const grant=await config.json()
  assert.deepEqual(grant.config,{enabled:true,managementOrigin:h.managementOrigin,installationId:h.installationId})
  assert.ok(grant.expiresAt>Date.now()&&grant.expiresAt<=Date.now()+60000)
  assert.equal((await h.request('/api/editor/config')).status,403)
  const member=await h.member(cookie)
  assert.equal((await h.request('/api/editor/config',{cookie:member})).status,403)
  const native=await h.request('/auth/sessions',{cookie});assert.equal(native.status,200)
  const sessions=(await native.json()).sessions
  const csrf=await h.request('/auth/csrf',{cookie});const {csrfToken}=await csrf.json()
  const revoked=await h.request('/auth/sessions/'+sessions.find(s=>s.active).id+'/revoke',
   {method:'POST',cookie,body:{},headers:{'x-csrf-token':csrfToken}})
  assert.equal(revoked.status,200)
  assert.equal((await h.request('/api/editor/config',{cookie})).status,403,'Revoked native credentials lose editor authority')
 }finally{await h.close()}
 const chosen=await admissionRuntime(18958,{ownerName})
 try{
  const displayName='Synthetic Explicit Owner'
  const claim=await chosen.request('/auth/owner-claim',{method:'POST',body:{token:await chosen.token(),displayName}})
  assert.equal(claim.status,303)
  const cookie=claim.headers.get('set-cookie').split(';')[0]
  assert.equal((await(await chosen.request('/auth/session',{cookie})).json()).operator.displayName,displayName,'A name chosen on the claim takes precedence over installation configuration')
 }finally{await chosen.close()}
})
