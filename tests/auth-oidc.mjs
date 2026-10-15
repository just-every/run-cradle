import test from 'node:test'
import assert from 'node:assert/strict'
import { sign } from './helpers/oidc-provider.mjs'
import { oidcRuntime, issuer, email, origin, cookie } from './helpers/oidc-runtime.mjs'
const emitted=process.env.CRADLE_OIDC_EMITTED==='1'
async function ready(t){
 const r=await oidcRuntime(t,emitted)
 assert.equal((await r.call('/auth/oidc/auth/start',{})).status,403)
 assert.equal((await r.call('/auth/dependencies/setup',{issuer,token:r.bindings.SETUP_TOKEN})).status,200)
 const owner=await r.call('/auth/bootstrap',{token:r.bindings.SETUP_TOKEN,displayName:'Owner'})
 assert.equal(owner.status,303,await owner.clone().text());r.owner=cookie(owner)
 r.bindings.IDENTITY_PROVIDER=issuer
 await r.link();return r
}
test('OIDC: optional pull-link shares the email owner, admits only existing people and retains product policy',async t=>{
 const r=await oidcRuntime(t,emitted,issuer+'/')
 const discovery=await r.call('/.well-known/rer-dependencies');assert.equal(discovery.status,200)
 const dependency=(await discovery.json()).dependencies[0]
 assert.equal(dependency.optional,true);assert.equal(dependency.provider,issuer)
 assert.equal((await r.call('/auth/oidc/auth/start',{})).status,403)
 const owner=await r.call('/auth/bootstrap',{token:r.bindings.SETUP_TOKEN,displayName:'Owner'});assert.equal(owner.status,303)
 const native=await r.proof();assert.equal((await r.call('/auth/session',undefined,native)).status,200)
 if(!emitted){
  for(const invalid of ['invalid','http://identity.example.com/','https://user:password@identity.example.com/','https://identity.example.com/path','https://identity.example.com/path/..','https://identity.example.com/?query=1','https://identity.example.com/#fragment','https://identity.example.com/?','https://identity.example.com/#']){
   r.bindings.IDENTITY_PROVIDER=invalid
   const refused=await r.call('/.well-known/rer-dependencies');assert.equal(refused.status,503,invalid);assert.equal((await refused.json()).error,'invalid_identity_provider')
  }
  assert.equal((await r.call('/auth/session',undefined,await r.proof())).status,200)
 }
 r.bindings.IDENTITY_PROVIDER=issuer+'/'
 assert.equal((await r.call('/auth/dependencies/relink',{issuer},native)).status,200);await r.link()
 assert.equal((await r.call('/auth/oidc/auth/start',{})).status,403,'existing installation stays off after linking')
 if(emitted)assert.doesNotMatch(await(await r.call('/signin')).text(),/action="\/auth\/oidc\/auth\/start"/)
 assert.equal((await r.call('/auth/settings/identity',{idpSignIn:true},native)).status,200)
 if(emitted)assert.match(await(await r.call('/signin')).text(),/action="\/auth\/oidc\/auth\/start"/)
 const rejected=await r.finish(await r.begin(),{sub:'stranger',email:'stranger@example.com'});assert.equal(rejected.status,403);assert.ok(!cookie(rejected)?.includes('operator_session='))
 const accepted=await r.finish(await r.begin('//evil.example/'));assert.equal(accepted.status,303,await accepted.clone().text());assert.equal(accepted.headers.get('location'),'/app')
 const session=cookie(accepted);assert.equal((await r.call('/auth/session',undefined,session)).status,200)
 if(emitted){assert.equal((await r.call('/api/session',undefined,session)).status,200)}else{assert.ok(await r.platform().auth.configuration.base.getSession(new Request(origin+'/auth/session',{headers:{cookie:session}})));assert.equal((await r.db.prepare('SELECT count(*) n FROM oa_operators').first()).n,1)}
 assert.equal((await r.call('/auth/session',undefined,await r.proof())).status,200)
 assert.equal((await r.call('/auth/settings/identity',{idpSignIn:false},native)).status,200)
 assert.equal((await r.call('/auth/session',undefined,session)).status,401)
 assert.equal((await r.call('/auth/oidc/auth/start',{})).status,403)
 assert.equal((await r.call('/auth/session',undefined,native)).status,200)
 assert.equal((await r.call('/auth/session',undefined,await r.proof())).status,200)
 if(emitted)assert.doesNotMatch(await(await r.call('/signin')).text(),/action="\/auth\/oidc\/auth\/start"/)
})
test('OIDC: state, nonce, issuer, signature and PKCE bind the actual callback; replay issues no session',async t=>{
 const r=await ready(t)
 for(const [claims,query,corrupt] of [[{nonce:'$other'},{},false],[{iss:'https://wrong.example'},{},false],[{}, {iss:'https://wrong.example'},false],[{},{},true]]){
  r.idp.options.corruptSignature=corrupt
  const result=await r.finish(await r.begin(),claims,query);assert.equal(result.status,400,await result.clone().text());assert.ok(!cookie(result)?.includes('operator_session='))
 }
 r.idp.options.corruptSignature=false
 const start=await r.begin();assert.equal(start.authorization.searchParams.get('code_challenge_method'),'S256');assert.ok(start.authorization.searchParams.get('nonce'));assert.ok(start.authorization.searchParams.get('state'))
 const grant=await r.idp.authorize(start.authorization.href)
 const invalid=await r.call('/auth/oidc/auth/callback?'+new URLSearchParams({...grant,state:crypto.randomUUID()}),undefined,start.binding);assert.equal(invalid.status,400)
 const path='/auth/oidc/auth/callback?'+new URLSearchParams(grant)
 const accepted=await r.call(path,undefined,start.binding);assert.equal(accepted.status,303,await accepted.clone().text())
 const replay=await r.call(path,undefined,start.binding);assert.equal(replay.status,400);assert.ok(!cookie(replay)?.includes('operator_session='))
 const broken=await r.begin();broken.authorization.searchParams.set('code_challenge','bad-challenge');assert.equal((await r.finish(broken)).status,502)
})
test('OIDC: disabling during token exchange fences the callback and revocation survives re-enable',async t=>{
 const r=await ready(t),signed=await r.finish(await r.begin());assert.equal(signed.status,303)
 const session=cookie(signed),pending=await r.begin(),gate=r.pauseToken(),completion=r.finish(pending)
 await gate.ready
 try{assert.equal((await r.call('/auth/settings/identity',{idpSignIn:false},r.owner)).status,200);assert.equal((await r.call('/auth/settings/identity',{idpSignIn:true},r.owner)).status,200)}finally{gate.release()}
 const refused=await completion;assert.equal(refused.status,403);assert.ok(!cookie(refused)?.includes('operator_session='));assert.equal((await r.call('/auth/session',undefined,session)).status,401)
 const fresh=cookie(await r.finish(await r.begin())),native=await r.proof()
 assert.equal((await r.call('/auth/dependencies/unlink',{interface:'oidc-provider@1'},native)).status,200)
 assert.equal((await r.call('/auth/session',undefined,fresh)).status,401)
 assert.equal((await r.call('/auth/oidc/auth/start',{})).status,403)
 assert.equal((await r.call('/auth/session',undefined,native)).status,200)
})
test('OIDC: member sign-in creates no grant and current product restrictions still deny access',async t=>{
 const r=await ready(t),native=await r.proof()
 // The owner's first product visit initializes the workspace through its real
 // installation coordinator before an invited member can enter it.
 if(emitted)assert.equal((await r.call('/api/session',undefined,native)).status,200)
 assert.equal((await r.call('/auth/invite',{email:'member@example.com',displayName:'Member',role:'member'},native)).status,202)
 const before=await r.db.prepare('SELECT count(*) n FROM authority_grants').first()
 const signed=await r.finish(await r.begin(),{sub:'member-subject',email:'member@example.com'})
 assert.equal(signed.status,303,await signed.clone().text());const session=cookie(signed)
 assert.equal((await r.db.prepare('SELECT count(*) n FROM authority_grants').first()).n,before.n)
 const member=await r.db.prepare("SELECT p.id FROM authority_principals p JOIN operators o ON o.id=p.human_id WHERE o.email='member@example.com'").first()
 assert.equal((await r.db.prepare('SELECT count(*) n FROM authority_memberships WHERE principal_id=?').bind(member.id).first()).n,0)
 if(emitted){
  assert.equal((await r.call('/api/session',undefined,session)).status,200)
  assert.equal((await r.call('/api/portfolio',undefined,session)).status,403,'identity admission grants no Launch data access')
 }else{
  const {createBaseSessionReader}=await import('../src/domains/authority/base-session.server.ts')
  const platform=r.platform(),reader=createBaseSessionReader(r.db,platform.auth.configuration,platform.auth.configuration.base)
  assert.ok(await reader(new Request(origin+'/app',{headers:{cookie:session}})))
 }
 await r.db.prepare("UPDATE authority_principals SET state='removed' WHERE id=?").bind(member.id).run()
 assert.equal((await r.call('/auth/session',undefined,session)).status,200,'identity remains valid independently of product admission')
 if(emitted){assert.equal((await r.call('/api/session',undefined,session)).status,401)}else{
  const {createBaseSessionReader}=await import('../src/domains/authority/base-session.server.ts')
  const platform=r.platform(),reader=createBaseSessionReader(r.db,platform.auth.configuration,platform.auth.configuration.base)
  assert.equal(await reader(new Request(origin+'/app',{headers:{cookie:session}})),undefined)
 }
})

test('OIDC: a pull-link signed owner grant uses Base one-use admission without changing signed setup',async t=>{
 const r=await oidcRuntime(t,emitted)
 assert.equal((await r.call('/auth/dependencies/setup',{issuer,token:r.bindings.SETUP_TOKEN})).status,200)
 r.ownerGrant(document=>{const now=Math.floor(Date.now()/1000);return sign(r.idp.key,{iss:issuer,aud:'cradle-client',sub:'install-owner',email,email_verified:true,email_verified_at:now,iat:now,exp:now+300,jti:crypto.randomUUID(),install_owner:{client_id:'cradle-client',sector_id:document.sector_id,subject:'install-owner',email}})})
 await r.link()
 assert.equal((await r.db.prepare('SELECT count(*) n FROM oa_operators').first()).n,1)
 assert.equal((await r.db.prepare('SELECT count(*) n FROM oc_idp_grants').first()).n,1)
 assert.equal((await r.call('/auth/bootstrap',{token:r.bindings.SETUP_TOKEN,displayName:'Another owner'})).status,409)
 assert.equal((await r.call('/auth/session',undefined,await r.proof())).status,200)
})
