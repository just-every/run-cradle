import {createServerFoundation} from '../src/core/app/foundation.server.ts'
import {createLifecycleComposition} from '../src/core/app/composition/lifecycle.server.ts'
import {adminAuditResponse} from '../src/domains/admission/admin-audit.server.ts'
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
  await multiBaseInvitationAudit(h,appId)
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
  h.sql.prepare('INSERT INTO operation_audit(id,actor_id,app_id,action,feature,created_at) VALUES(?,?,?,?,?,?)').run('synthetic-cradle-operation-audit',h.person,appId,'view.export.csv',null,new Date(now).toISOString())
  const auditCommand=createUlid(),peerAuditCommand=createUlid(),auditFact=createUlid(),peerAuditFact=createUlid()
  const admissionRows=[[auditCommand,h.person,{name:identity.name,email:identity.email,issuer,subject}],[peerAuditCommand,peer.principal_id,{issuer:otherIssuer,subject}]]
  for(const [commandId,actor,value]of admissionRows){
   h.sql.prepare("INSERT INTO command_admissions(command_id,batch_nonce,actor_id,actor_kind,app_id,action,input_hash,state,result_json,access_json,created_at,updated_at) VALUES(?,?,?,'human',?,'synthetic.audit',?,'committed',?,'{}',?,?)").run(commandId,createUlid(),actor,appId,createUlid(),JSON.stringify(value),h.ctx.now,h.ctx.now)
   h.sql.prepare("INSERT INTO admission_audit(id,command_id,actor_id,actor_kind,app_id,action,subject_json,changes_json,source_ids_json,personal_refs_json,created_at) VALUES(?,?,?,'human',?,'synthetic.audit',NULL,?,'[]','[]',?)").run(commandId===auditCommand?auditFact:peerAuditFact,commandId,actor,appId,JSON.stringify(value),h.ctx.now)
  }
  const peerAdmissionBefore=h.sql.prepare('SELECT * FROM command_admissions WHERE command_id=?').get(peerAuditCommand),peerFactBefore=h.sql.prepare('SELECT * FROM admission_audit WHERE id=?').get(peerAuditFact)
  const retainedAudit=[['synthetic-cradle-audit-both',baseId,baseId],['synthetic-cradle-audit-actor',baseId,peer.base_id],['synthetic-cradle-audit-subject',peer.base_id,baseId],['synthetic-cradle-audit-peer',peer.base_id,peer.base_id]]
  for(const [id,actor,operator]of retainedAudit)h.sql.prepare('INSERT INTO company_identity_audit(id,actor_id,operator_id,action,created_at) VALUES(?,?,?,?,?)').run(id,actor,operator,'scim.update',now)
  h.sql.prepare('INSERT INTO oa_auth_audit(id,actor_id,action,value,created_at) VALUES(?,?,?,?,?)').run('synthetic-cradle-auth-audit',baseId,'idpSignIn',identity.email,now)
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
  for(const [id,actor,operator]of retainedAudit){
   const row=h.sql.prepare('SELECT * FROM company_identity_audit WHERE id=?').get(id)
   assert.ok(row,'Company identity audit action survives member erasure exactly once')
   assert.equal(row.actor_id,actor===baseId?'':actor);assert.equal(row.operator_id,operator===baseId?null:operator)
   assert.equal(row.action,'scim.update');assert.equal(row.created_at,now)
  }
  assert.deepEqual({...h.sql.prepare('SELECT * FROM operation_audit WHERE id=?').get('synthetic-cradle-operation-audit')},{id:'synthetic-cradle-operation-audit',actor_id:null,app_id:appId,action:'view.export.csv',feature:null,created_at:new Date(now).toISOString()},'Export audit survives once without the erased actor')
  assert.deepEqual({...h.sql.prepare('SELECT * FROM oa_auth_audit WHERE id=?').get('synthetic-cradle-auth-audit')},{id:'synthetic-cradle-auth-audit',actor_id:'',action:'idpSignIn',value:'',created_at:now},'Authentication audit retains the action without the erased actor or personal metadata')
  for(const [table,key,id]of [['command_admissions','command_id',auditCommand],['admission_audit','id',auditFact]]){
   const retained=h.sql.prepare('SELECT * FROM '+table+' WHERE '+key+'=?').get(id),encoded=JSON.stringify(retained)
   assert.ok(retained,'Each command/admission audit row remains after member.erase')
   for(const literal of [identity.name,identity.email,subject])assert.ok(!encoded.includes(literal),table+' drops names, emails and opaque IdP-shared subjects')
   assert.equal(retained.action,'synthetic.audit')
  }
  assert.deepEqual(h.sql.prepare('SELECT * FROM command_admissions WHERE command_id=?').get(peerAuditCommand),peerAdmissionBefore,'An unrelated actor keeps its identical subject token at another issuer')
  assert.deepEqual(h.sql.prepare('SELECT * FROM admission_audit WHERE id=?').get(peerAuditFact),peerFactBefore)
  const auditPlatform={bindings:{DB:h.db,FILES:h.bucket,WORK_QUEUE:{async send(){},async sendBatch(){}}},auth:{configuration:auth.configuration}},auditFoundation=await createServerFoundation(auditPlatform,{descriptors:[],admissionGuards:()=>[]})
  createLifecycleComposition(auditPlatform,auditFoundation)
  for(const format of ['csv','json']){
   const exported=await adminAuditResponse(new Request(h.origin+'/api/user-automations/admin-audit?'+new URLSearchParams({base:appId,format}),{headers:{host:new URL(h.origin).host,origin:h.origin,cookie:h.session.cookie}}),h.db,auditFoundation),text=await exported.text()
   assert.equal(exported.status,200)
   for(const literal of [identity.name,identity.email,subject])assert.ok(!text.includes(literal),'Audit '+format+' contains no erased identity or IdP-shared subject')
   if(format==='json')assert.equal(JSON.parse(text).data.items.filter(row=>row.eventId===auditCommand&&row.action==='synthetic.audit').length,1)
   else assert.equal(text.split('\r\n').filter(row=>row.includes(auditCommand)&&row.includes('synthetic.audit')).length,1)
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


/** One admitted invitation is visible exactly once under every explicitly granted base. */
async function multiBaseInvitationAudit(h,firstAppId){
 const second=(await h.create()).draft.appId,commandId=createUlid(),configuration={appOrigin:h.origin,sessionSecret:'test-only-erasure-session-secret-long-enough',mode:'development'}
 await createFixtureAuth(h.db,configuration,h.owner)
 const platform={bindings:{DB:h.db,FILES:h.bucket,WORK_QUEUE:{async send(){},async sendBatch(){}}},auth:{configuration}}
 const foundation=await createServerFoundation(platform,{descriptors:[],admissionGuards:()=>[]});createLifecycleComposition(platform,foundation)
 const scopes=[];for(const appId of [firstAppId,second]){const row=await h.db.prepare('SELECT policy_id FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(h.owner,appId).first();scopes.push({appId,policyId:row.policy_id,legacy:false})}
 const request=()=>new Request(h.origin+'/api/v1/commands/member.invite',{method:'POST',headers:{host:new URL(h.origin).host,origin:h.origin,cookie:h.session.cookie,'content-type':'application/json','x-csrf-token':h.session.csrf},body:JSON.stringify({commandId,expected:[],input:{email:'synthetic-cradle-multibase@example.test',name:'Synthetic multibase collaborator',scopes}})})
 const admitted=await foundation.http.fetch(request());assert.equal(admitted.status,200,await admitted.clone().text())
 const replay=await foundation.http.fetch(request());assert.equal(replay.status,200,await replay.clone().text())
 const facts=(await h.db.prepare("SELECT app_id FROM admission_audit WHERE command_id=? AND action='member.invite' ORDER BY app_id").bind(commandId).all()).results
 assert.deepEqual(facts.map(row=>row.app_id),[firstAppId,second].sort(),'Replay does not duplicate the per-base invitation facts')
 for(const base of [firstAppId,second]){
  const get=format=>adminAuditResponse(new Request(h.origin+'/api/user-automations/admin-audit?'+new URLSearchParams({base,...(format?{format}:{} )}),{headers:{host:new URL(h.origin).host,origin:h.origin,cookie:h.session.cookie}}),h.db,foundation)
  const log=await(await get()).json();assert.equal(log.data.items.filter(item=>item.eventId===commandId&&item.action==='member.invite'&&item.baseId===base).length,1)
  const json=await(await get('json')).json();assert.equal(json.data.items.filter(item=>item.eventId===commandId&&item.action==='member.invite').length,1)
  const csv=await(await get('csv')).text();assert.equal(csv.split('\r\n').filter(line=>line.includes(commandId)&&line.includes('member.invite')).length,1)
 }
}
