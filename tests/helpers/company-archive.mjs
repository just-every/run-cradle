import assert from 'node:assert/strict'
import {samlProvider} from './saml-provider.mjs'
export async function companyArchiveSource(origin,cookie){let cleanup;const idp=await samlProvider({after:fn=>{cleanup=fn}})
 try{const post=(path,body)=>fetch(origin+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)}),configured=await post('/auth/settings/company',{entityId:idp.issuer,ssoUrl:idp.issuer,certificate:idp.certificate,enabled:true});assert.equal(configured.status,200,await configured.clone().text());const issued=await post('/auth/settings/scim',{action:'rotate'});assert.equal(issued.status,200);return {certificate:idp.certificate,credential:(await issued.json()).credential,issuer:idp.issuer}}finally{await cleanup()}}
export async function companyArchivePerson(copy,origin,cookie,identity,company){let cleanup;const idp=await samlProvider({after:fn=>{cleanup=fn}})
 try{
  const email='erasure-canary@example.test',post=(path,body)=>fetch(origin+path,{method:'POST',redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)})
  const configured=await post('/auth/settings/company',{entityId:idp.issuer,ssoUrl:idp.issuer,certificate:idp.certificate,enabled:true});assert.equal(configured.status,200)
  assert.equal((await post('/auth/settings/identity',{idpSignIn:true})).status,200)
  const provisioned=await fetch(origin+'/scim/v2/Users/'+identity.base,{method:'PUT',headers:{authorization:'Bearer '+company.credential,'content-type':'application/scim+json'},body:JSON.stringify({userName:email,displayName:'Erasure Canary Person',externalId:email,active:true})});assert.equal(provisioned.status,200,await provisioned.clone().text())
  const start=idp.request(await post('/auth/saml/start',{returnTo:'/app'})),signed=idp.response(start,{origin,email})
  const admitted=await fetch(origin+'/auth/saml/acs',{method:'POST',redirect:'manual',headers:{origin,cookie:start.binding,'content-type':'application/x-www-form-urlencoded'},body:signed.body});assert.equal(admitted.status,303,await admitted.clone().text())
  return {...company,certificate:idp.certificate}
 }finally{await cleanup()}
}
