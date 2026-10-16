import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {fixture,identity,control} from './helpers/lifecycle-erasure-fixture.mjs'
import {createFixtureAuth} from './helpers/base-fixture-auth.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {verifyIdentityArchive} from './helpers/lifecycle-identity-archive.mjs'

contract('BASE-DATA-003 BASE-ACCESS-002','member erasure retires attributed OIDC custody, retains used grants and preserves accountant mappings',async()=>{
 const h=await fixture()
 try{
  const {draft}=await h.create(),appId=draft.appId;await h.assign(appId)
  const auth=await createFixtureAuth(h.db,{appOrigin:h.origin,sessionSecret:'test-only-erasure-session-secret-long-enough',mode:'development'},h.owner)
  const member=await auth.signIn(h.person),baseId=h.sql.prepare('SELECT base_id FROM cradle_base_operators WHERE principal_id=?').get(h.person).base_id
  assert.notEqual(baseId,h.person,'Exercise the Base operator to product principal projection')
  const peer=h.sql.prepare('SELECT p.base_id,p.principal_id FROM cradle_base_operators p JOIN operators o ON o.id=p.principal_id WHERE o.email=?').get(control.email),other=await auth.signIn(peer.principal_id)
  const issuer='https://identity.example.test',otherIssuer='https://other-identity.example.test',subject='opaque-member-subject',now=Date.now()
  h.sql.prepare("INSERT INTO oa_identity_providers(provider_id,preset,status,issuer,client_id,jwks_uri,authorization_endpoint,token_endpoint,algorithms,token_auth_method,response_iss,linked_at) VALUES('auth','rer','linked',?,'cradle-client',?,?,?,'[\"RS256\"]','none',1,?)").run(issuer,issuer+'/jwks',issuer+'/authorize',issuer+'/token',now)
  h.sql.prepare('INSERT INTO oa_auth_settings(singleton,idp_sign_in,generation) VALUES(1,1,1) ON CONFLICT(singleton) DO UPDATE SET idp_sign_in=1,generation=1').run()
  for(const [owner,session,prefix,subjectValue] of [[baseId,member.baseId,'member',subject],[peer.base_id,other.baseId,'peer','opaque-peer-subject']]){
   h.sql.prepare("UPDATE oa_sessions SET kind='oidc' WHERE id=?").run(session)
   h.sql.prepare('INSERT INTO oa_external_identities(issuer,subject,operator_id) VALUES(?,?,?)').run(issuer,subjectValue,owner)
   h.sql.prepare('INSERT INTO oa_provider_sessions(session_id,issuer,subject,sid,generation) VALUES(?,?,?,?,1)').run(session,issuer,subjectValue,prefix+'-provider-session')
   h.sql.prepare('INSERT INTO oa_provider_session_pins(session_id,provider_id,issuer,client_id,linked_at) VALUES(?,?,?,?,?)').run(session,'auth',issuer,'cradle-client',now)
   h.sql.prepare('INSERT INTO oa_setup_links(interface,attempt_id,expires_at,owner_id,owner_version,session_id) VALUES(?,?,?,?,1,?)').run(prefix+'-setup',prefix+'-attempt',now+600000,owner,session)
   h.sql.prepare('INSERT INTO rer_dependency_pending(interface,issuer,approved_by,expires_at,approved_session,approved_version,callbacks,attempt_id) VALUES(?,?,?,?,?,1,?,?)').run(prefix+'-link',issuer,owner,now+600000,session,JSON.stringify({owner:prefix==='member'?identity.email:control.email}),prefix+'-approval')
  }
  // A provider can use an email as subject; scrub whole values, not just known
  // name/email tokens. The same opaque subject at another issuer is unrelated.
  h.sql.prepare('INSERT INTO oa_external_identities(issuer,subject,operator_id) VALUES(?,?,?)').run(otherIssuer,identity.email,baseId)
  const grants=[[issuer,'member-client','used-member-grant',subject],[otherIssuer,'email-client','used-email-grant',identity.email],[otherIssuer,'peer-client','used-peer-grant',subject]]
  for(const grant of grants)h.sql.prepare('INSERT INTO oc_idp_grants(issuer,client_id,jti,subject,sector_id) VALUES(?,?,?,?,?)').run(...grant,'installation-sector')
  const connection=createUlid(),mapping={contacts:{'contractor-payee':'xero-contact-42'},allowedAccountCodes:['400'],allowedTaxTypes:['INPUT']}
  h.sql.prepare("INSERT INTO provider_connections(id,app_id,adapter_id,name,state,account_id,scopes_json,ownership_json,created_at,updated_at) VALUES(?,?,'xero','Accounts','connected','tenant-42','[]','[]',?,?)").run(connection,appId,h.ctx.now,h.ctx.now)
  h.sql.prepare('INSERT INTO repair_accounting_mappings(connection_id,version,mapping_json,actor_id,created_at,updated_at) VALUES(?,3,?,?,?,?)').run(connection,JSON.stringify(mapping),h.person,h.ctx.now,h.ctx.now)
  const mappingBefore=h.sql.prepare('SELECT * FROM repair_accounting_mappings WHERE connection_id=?').get(connection)
  await verifyIdentityArchive(h,{issuer,subject,connection,mapping})
  const peerRows=()=>[
   h.sql.prepare('SELECT * FROM oa_provider_sessions WHERE session_id=?').get(other.baseId),
   h.sql.prepare('SELECT * FROM oa_provider_session_pins WHERE session_id=?').get(other.baseId),
   h.sql.prepare("SELECT * FROM oa_setup_links WHERE interface='peer-setup'").get(),
   h.sql.prepare("SELECT * FROM rer_dependency_pending WHERE interface='peer-link'").get(),
   h.sql.prepare("SELECT * FROM oc_idp_grants WHERE jti='used-peer-grant'").get(),
   h.sql.prepare('SELECT * FROM oa_external_identities WHERE operator_id=?').all(peer.base_id),
  ],peerBefore=peerRows()
  const version=()=>h.sql.prepare('SELECT version FROM authority_principals WHERE id=?').get(h.person).version
  assert.equal((await h.send('remove',{appId},version())).status,200)
  const erased=await h.send('erase',{appId},version()),result=await erased.json()
  assert.equal(erased.status,200,JSON.stringify(result))
  for(const table of ['oa_provider_sessions','oa_provider_session_pins'])assert.equal(h.sql.prepare('SELECT count(*) n FROM '+table+' WHERE session_id=?').get(member.baseId).n,0)
  assert.equal(h.sql.prepare('SELECT count(*) n FROM oa_external_identities WHERE operator_id=?').get(baseId).n,0)
  assert.equal(h.sql.prepare('SELECT count(*) n FROM oa_setup_links WHERE owner_id=?').get(baseId).n,0)
  assert.equal(h.sql.prepare('SELECT count(*) n FROM rer_dependency_pending WHERE approved_by=?').get(baseId).n,0)
  for(const [grantIssuer,client,jti] of grants.slice(0,2)){
   const retained=h.sql.prepare('SELECT * FROM oc_idp_grants WHERE issuer=? AND client_id=?').get(grantIssuer,client)
   assert.equal(retained.subject,'');assert.equal(retained.jti,jti);assert.equal(retained.sector_id,'installation-sector')
   assert.throws(()=>h.sql.prepare('INSERT INTO oc_idp_grants VALUES(?,?,?,?,?)').run(grantIssuer,client,'new-grant',subject,'installation-sector'),/UNIQUE/,'The consumed client grant cannot be reissued')
   assert.throws(()=>h.sql.prepare('INSERT INTO oc_idp_grants VALUES(?,?,?,?,?)').run(grantIssuer,'new-client',jti,subject,'installation-sector'),/UNIQUE/,'The consumed grant cannot be replayed for another client')
  }
  assert.deepEqual(peerRows(),peerBefore,'Other operators, sessions, approvals and the same subject at another issuer are untouched')
  assert.deepEqual(h.sql.prepare('SELECT * FROM repair_accounting_mappings WHERE connection_id=?').get(connection),mappingBefore,'Erasure preserves operational mapping values, version and anonymous actor reference')
  assert.deepEqual(JSON.parse(mappingBefore.mapping_json),mapping)
  const sessionRequest=cookie=>new Request(h.origin+'/auth/session',{headers:{host:new URL(h.origin).host,origin:h.origin,cookie}})
  assert.equal(await auth.base.getSession(sessionRequest(member.cookie)),null,'Erasure cannot revive the removed member session')
  assert.ok(await auth.base.getSession(sessionRequest(other.cookie)),'Other member sessions remain usable')
  assert.equal(h.sql.prepare('SELECT payload FROM oa_oidc_transactions WHERE state_hash=?').get('fixture-state').payload,'fixture-only-encrypted-oidc-transaction','A pre-login transaction has no attributable member and is preserved')
  const receipt=await h.resumeErasure();assert.equal(receipt.status,200);assert.equal((await receipt.json()).data.state,'complete')
  assert.equal(h.sql.prepare('SELECT count(*) n FROM operators WHERE name=? OR email=?').get(identity.name,identity.email).n,0)
 }finally{h.close()}
})
