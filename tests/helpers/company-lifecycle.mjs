import assert from 'node:assert/strict'
import {samlProvider} from './saml-provider.mjs'
export async function companyLifecycle(t,doors,world){
 const {h,admin}=doors,idp=await samlProvider(t)
 const post=(path,body)=>h.request(admin,path,{method:'POST',body:JSON.stringify(body),redirect:'manual'})
 const configured=await post('/auth/settings/company',{entityId:idp.issuer,ssoUrl:idp.issuer,certificate:idp.certificate,enabled:true});assert.equal(configured.status,200,await configured.clone().text())
 assert.equal((await post('/auth/settings/identity',{idpSignIn:true})).status,200)
 const startResponse=await post('/auth/saml/start',{returnTo:'/app'});assert.equal(startResponse.status,303)
 const start=idp.request(startResponse),person=await h.db.prepare('SELECT o.email,m.base_id FROM operators o JOIN cradle_base_operators m ON m.principal_id=o.id WHERE o.id=?').bind(world.leaver.id).first()
 const response=idp.response(start,{origin:h.origin,email:person.email})
 const signed=await h.request(admin,'/auth/saml/acs',{method:'POST',redirect:'manual',headers:{cookie:start.binding,'content-type':'application/x-www-form-urlencoded'},body:response.body});assert.equal(signed.status,303,await signed.clone().text())
 const issued=await post('/auth/settings/scim',{action:'rotate'});assert.equal(issued.status,200);const credential=(await issued.json()).credential
 const request=(method,body)=>h.request(admin,'/scim/v2/Users/'+person.base_id,{method,headers:{authorization:'Bearer '+credential,'content-type':'application/scim+json'},...(body?{body:JSON.stringify(body)}:{})})
 const remove=()=>request('PATCH',{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:'active',value:false},{op:'replace',path:'externalId',value:'synthetic-cradle-leaver-1'}]})
 return {async blocked(){const response=await remove();assert.equal(response.status,409,await response.clone().text());const body=await response.json();for(const row of [world.owned,world.unresolved,world.assigned])assert.ok(body.detail.includes(row.id));assert.equal((await h.request(world.leaver.session,'/api/v1/session')).status,200)},async remove(){const response=await remove();assert.equal(response.status,200,await response.clone().text());assert.equal((await h.request(admin,'/auth/session',{headers:{cookie:signed.headers.get('set-cookie').split(';')[0]}})).status,401)},async erased(){assert.equal((await request('GET')).status,404);assert.equal((await h.db.prepare('SELECT count(*) n FROM company_scim_users WHERE external_id=?').bind('synthetic-cradle-leaver-1').first()).n,0);assert.equal((await h.db.prepare('SELECT count(*) n FROM oa_external_identities WHERE subject=?').bind(person.email).first()).n,0)}}
}
