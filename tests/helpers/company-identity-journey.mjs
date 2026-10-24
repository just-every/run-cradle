import assert from 'node:assert/strict'
import {samlProvider} from './saml-provider.mjs'
import {cookie,origin} from './oidc-runtime.mjs'
export async function companyIdentityJourney(t,r,native){
 const idp=await samlProvider(t),post=(path,body,session=native)=>r.call(path,body,session)
 const page=await r.call('/auth/settings/identity',undefined,native);assert.equal(page.status,200)
 assert.equal((await r.call('/auth/settings/identity')).status,401)
 const config={entityId:idp.issuer,ssoUrl:idp.issuer,certificate:idp.certificate,enabled:true}
 assert.equal((await post('/auth/settings/company',config)).status,200)
 assert.equal((await post('/auth/settings/company',config,'')).status,401)
 assert.equal((await post('/auth/settings/identity',{idpSignIn:true})).status,200)
 const start=async()=>{const response=await post('/auth/saml/start',{returnTo:'/app'},'');assert.equal(response.status,303,await response.clone().text());return idp.request(response)}
 const finish=(s,response)=>r.raw('/auth/saml/acs',{method:'POST',headers:{cookie:s.binding,'content-type':'application/x-www-form-urlencoded',origin:idp.issuer},body:response.body})
 for(const signResponse of [false,true]){const s=await start(),accepted=await finish(s,idp.response(s,{signResponse}));assert.equal(accepted.status,303,await accepted.clone().text());assert.equal((await r.call('/auth/session',undefined,cookie(accepted))).status,200)}
 assert.equal((await r.db.prepare("SELECT count(*) n FROM company_identity_audit WHERE action='signin.saml'").first()).n,2,'Each accepted SAML sign-in has one row, without duplicate OIDC labeling')
 for(const options of [{email:'stranger@example.com'},{unsigned:true},{audience:'https://synthetic-cradle-2.example'},{destination:origin+'/wrong'},{expired:true},{requestId:'_wrong'},{wrapped:true}]){
  const s=await start(),response=await finish(s,idp.response(s,options));assert.equal(response.status,options.email?403:400,JSON.stringify(options)+': '+await response.clone().text());assert.ok(!cookie(response)?.includes('operator_session='))
 }
 const tamperStart=await start(),tampered=idp.response(tamperStart);tampered.body=new URLSearchParams({RelayState:tamperStart.id,SAMLResponse:Buffer.from(tampered.xml.replace('owner@example.com','stranger@example.com')).toString('base64')}).toString();assert.equal((await finish(tamperStart,tampered)).status,400)
 const replayStart=await start(),response=idp.response(replayStart);assert.equal((await finish(replayStart,response)).status,303);assert.equal((await finish(replayStart,response)).status,400)
 const other=await start(),reused=idp.response(other,{id:response.id});assert.equal((await finish(other,reused)).status,400)
 const issued=await post('/auth/settings/scim',{action:'rotate'});assert.equal(issued.status,200);let bearer=(await issued.json()).credential
 const scim=(path,method='GET',body,token=bearer)=>r.raw('/scim/v2'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/scim+json'},...(body?{body:JSON.stringify(body)}:{})})
 for(const path of ['/ServiceProviderConfig','/ResourceTypes','/Schemas'])assert.equal((await scim(path)).status,200)
 assert.equal((await scim('/Users','GET',undefined,'synthetic-cradle-invalid')).status,401)
 const input={schemas:['urn:ietf:params:scim:schemas:core:2.0:User'],userName:'synthetic-cradle-1@example.com',displayName:'Synthetic Cradle Operator',externalId:'synthetic-cradle-external-1',active:true,name:{givenName:'Synthetic',familyName:'Operator'}}
 const created=await scim('/Users','POST',input);assert.equal(created.status,201,await created.clone().text());const person=await created.json()
 assert.equal((await scim('/Users','POST',input)).status,409)
 const list=await(await scim('/Users?filter='+encodeURIComponent('userName eq "'+input.userName+'"')+'&startIndex=1&count=1')).json();assert.deepEqual(list.Resources.map(x=>x.id),[person.id]);assert.equal(list.totalResults,1)
 assert.equal((await scim('/Users/'+person.id,'PUT',{...input,displayName:'Synthetic Cradle Renamed'})).status,200)
 const changed=await scim('/Users/'+person.id,'PATCH',{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:'name.givenName',value:'Renamed'}]});assert.equal(changed.status,200,await changed.clone().text());assert.equal((await changed.json()).name.givenName,'Renamed')
 const principal=await r.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(person.id).first();assert.equal((await r.db.prepare('SELECT count(*) n FROM authority_memberships WHERE principal_id=?').bind(principal.principal_id).first()).n,0)
 const signedStart=await start(),signed=await finish(signedStart,idp.response(signedStart,{email:input.userName}));assert.equal(signed.status,303,await signed.clone().text());const session=cookie(signed)
 const clock=Date.now();r.setNow(clock)
 const removal=await scim('/Users/'+person.id,'PATCH',{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:'active',value:false}]});assert.equal(removal.status,200,await removal.clone().text())
 r.setNow(clock+59000);assert.equal((await r.call('/auth/session',undefined,session)).status,401);r.setNow(undefined)
 const removedStart=await start();assert.equal((await finish(removedStart,idp.response(removedStart,{email:input.userName}))).status,403)
 const oidcRemoved=await r.finish(await r.begin(),{sub:'synthetic-cradle-operator-1',email:input.userName});assert.equal(oidcRemoved.status,403)
 const restored=await scim('/Users','POST',input);assert.equal(restored.status,201,await restored.clone().text());assert.equal((await restored.json()).id,person.id)
 const restoredStart=await start();assert.equal((await finish(restoredStart,idp.response(restoredStart,{email:input.userName}))).status,303)
 assert.equal((await r.call('/auth/session',undefined,session)).status,401,'reprovision does not revive old sessions')
 assert.equal((await scim('/Users/'+person.id,'DELETE')).status,204)
 assert.equal((await scim('/Users/'+person.id)).status,404)
 const audit=await r.db.prepare("SELECT action,actor_id FROM company_identity_audit WHERE operator_id=? AND action LIKE 'scim.%'").bind(person.id).all();assert.ok(audit.results.length>=6);assert.ok(audit.results.every(row=>row.actor_id.startsWith('scim:')));assert.deepEqual(audit.results.map(row=>row.action).sort(),['scim.create','scim.create','scim.delete','scim.patch','scim.patch','scim.replace'],'Each accepted SCIM membership mutation is audited exactly once')
 const samlAudit=(await r.db.prepare("SELECT actor_id FROM company_identity_audit WHERE operator_id=? AND action='signin.saml'").bind(person.id).all()).results;assert.equal(samlAudit.length,2,'Initial and reprovisioned SAML sign-ins each appear exactly once');assert.ok(samlAudit.every(row=>row.actor_id===person.id))
 const html=await(await r.call('/auth/settings/identity',undefined,native)).text();assert.ok(!html.includes(bearer))
 const rotated=await post('/auth/settings/scim',{action:'rotate'});assert.equal(rotated.status,200);const next=(await rotated.json()).credential;assert.equal((await scim('/Users')).status,401);bearer=next
 assert.equal((await scim('/Users')).status,200);assert.equal((await post('/auth/settings/scim',{action:'revoke'})).status,200);assert.equal((await scim('/Users')).status,401)
 assert.equal((await post('/auth/settings/company',{...config,enabled:false})).status,200);assert.equal((await post('/auth/saml/start',{},'')).status,403)
 assert.equal((await r.call('/auth/session',undefined,native)).status,200)
}
