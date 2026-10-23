import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import { companyResponse } from '../../src/domains/company-identity/http.server.ts'
import { migratedD1 } from './sqlite-d1.mjs'
import { createBaseAuth, createAuthHandler } from '../../src/core/platform/base-auth.server.ts'
import { dependencyResponse } from '../../src/core/platform/dependencies.server.ts'
import { createPlatform } from '../../src/core/platform/index.ts'
import { provider } from './oidc-provider.mjs'
import { parseIdToken, verifySignature } from '../../vendor/base/modules/operator-auth/identity/oidc/jwt.mjs'
export const origin='https://cradle.example.com',issuer='https://identity.example.com',email='owner@example.com'
export const cookie=response=>response.headers.get('set-cookie')?.match(/__Host-operator_session=[^;,]+/)?.[0]??response.headers.get('set-cookie')?.split(';')[0]
export async function oidcRuntime(t,emitted=false,identityProvider=emitted?issuer:undefined) {
 const fixture=emitted?null:migratedD1(), mails=[],codes=new Map(),assertions=new Set()
 const bindings={IDENTITY_PROVIDER:identityProvider,APP_ORIGIN:origin,OWNER_EMAIL:email,OWNER_NAME:'synthetic-cradle-1',MAIL_FROM:'cradle@example.com',MAIL_PROVIDER:'sendgrid',MAIL_PROVIDER_API_KEY:'network-edge-only',SESSION_SECRET:'test-only-session-secret-with-at-least-32-characters',SETUP_TOKEN:'test-only-setup-secret-with-at-least-32-characters'}
 const idp=await provider({issuer,clientId:'cradle-client',redirectUri:origin+'/auth/oidc/auth/callback',alg:'ES256',method:'private_key_jwt',rerInterfaces:['oidc-provider@1.0.0'],claims:{email_verified_at:Math.floor(Date.now()/1000)}})
 let clockNow,transport,gate,ownerGrant,db=fixture?.db
 const network=async(input,init={})=>{
  // Miniflare supplies its own Request class at the outbound network edge.
  const request=typeof input==='string'||input instanceof URL?new Request(String(input),init):input,url=request.url
  if(url==='https://api.sendgrid.com/v3/mail/send'){mails.push(await request.json());return new Response(null,{status:202})}
  if(url===issuer+'/.well-known/rer-provider')return Response.json({issuer,interface:'oidc-provider@1',version:1,initiate:issuer+'/link',redeem:issuer+'/redeem',deregister:issuer+'/remove'})
  if(url===issuer+'/redeem'){
   const body=await request.json(),entry=codes.get(body.code);assert.ok(entry,'provider requires one-use approved code');codes.delete(body.code)
   const parsed=parseIdToken(body.client_assertion,{algorithms:['ES256']});await verifySignature(parsed,entry.jwks)
   const c=parsed.claims;assert.equal(c.iss,origin);assert.equal(c.sub,origin);assert.equal(c.aud,url);assert.equal(c.code,body.code);assert.equal(c.sector_id,entry.document.sector_id);assert.equal(c.callback,entry.document.callback);assert.equal(c.interface,'oidc-provider@1');assert.ok(c.exp>Date.now()/1000);assert.ok(!assertions.has(c.jti));assertions.add(c.jti)
   idp.options.clientKey=entry.jwks.keys[0]
   return Response.json({issuer,interface:'oidc-provider@1',origin,callback:entry.document.callback,sector_id:entry.document.sector_id,client_id:'cradle-client',continuity:'provider-owner',...(ownerGrant?{install_owner:await ownerGrant(entry.document)}:{})})
  }
  if(url===issuer+'/remove')return new Response(null,{status:204})
  if(url===issuer+'/token'&&gate){const wait=gate;gate=null;wait.reached();await wait.wait}
  assert.ok(url.startsWith(issuer+'/'),'unexpected network edge '+url)
  return idp.fetch(url,{method:request.method,headers:Object.fromEntries(request.headers),redirect:'manual',...(request.method==='POST'?{body:await request.text()}:{})})
 }
 if(emitted){
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
  const {migrateFixture}=await import('./migrate-fixture.mjs'),{baseEmittedRuntime}=await import('./base-emitted-runtime.mjs'),{productionBindings}=await import('./production-bindings.mjs')
  const dir=await mkdtemp(join(tmpdir(),'cradle-oidc-'));migrateFixture(dir)
  const runtime=await baseEmittedRuntime(dir,0,{...productionBindings,...bindings},network),worker=await runtime.getWorker();db=await runtime.getD1Database('DB');
  t.after(async()=>{await runtime.dispose();await rm(dir,{recursive:true,force:true})})
  // Observe each actual auth response. Following its 303 would send a bodyless
  // GET back through the JSON envelope and hide the redirect and session cookie.
  transport=req=>worker.fetch(origin+'/__test_envelope',{method:'POST',redirect:'manual',body:JSON.stringify({url:req.url,method:req.method,headers:Object.fromEntries(req.headers),...(req._body!==undefined?{body:req._body}:{}),...(clockNow?{testNow:clockNow}:{})})})
 }else{
  t.after(()=>fixture.close());bindings.DB=fixture.db
  const previous=globalThis.fetch;globalThis.fetch=network;t.after(()=>{globalThis.fetch=previous})
  transport=async request=>{
   const auth=createBaseAuth(bindings)
   return await companyResponse(request,bindings,auth)??await dependencyResponse(request,bindings,auth)??await createAuthHandler(auth)(request)??new Response(null,{status:404})
  }
 }
 const call=(path,body,session,headers={})=>{const text=body===undefined?undefined:JSON.stringify(body);const req=new Request(origin+path,{method:text?'POST':'GET',headers:{host:new URL(origin).host,origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.25',...(session?{cookie:session}:{}),...headers},body:text});req._body=text;return transport(req)}
 const proof=async()=>{const response=await call('/auth/magic-link',{email});assert.equal(response.status,202,await response.clone().text());const text=mails.at(-1).content.find(c=>c.type==='text/plain').value;const token=new URL(text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');const result=await call('/auth/confirm',{token});assert.equal(result.status,303,await result.clone().text());return cookie(result)}
 return {bindings,call,proof,idp,db,setNow:value=>{clockNow=value},raw:(path,init={})=>{const req=new Request(origin+path,{...init,headers:{host:new URL(origin).host,origin,'cf-connecting-ip':'192.0.2.25',...init.headers}});req._body=init.body;return transport(req)},ownerGrant:grant=>{ownerGrant=grant},platform:()=>createPlatform(bindings),
  pauseToken(){let reached,release;const ready=new Promise(r=>{reached=r}),wait=new Promise(r=>{release=r});gate={reached,wait};return {ready,release}},
  async link(){const document=await(await call('/.well-known/rer-dependencies')).json(),jwks=await(await call('/.well-known/rer-link/jwks')).json();assert.equal(jwks.keys[0].d,undefined);const code=crypto.randomUUID();codes.set(code,{document,jwks});const response=await call('/.well-known/rer-link/callback',{issuer,interface:'oidc-provider@1',code});assert.equal(response.status,200,await response.clone().text());return document},
  async begin(returnTo='/app'){const response=await call('/auth/oidc/auth/start',{returnTo});assert.equal(response.status,303,await response.clone().text());return {response,authorization:new URL(response.headers.get('location')),binding:cookie(response)}},
  async finish(start,claims={},query={}){const grant=await idp.authorize(start.authorization.href,claims);return call('/auth/oidc/auth/callback?'+new URLSearchParams({...grant,...query}),undefined,start.binding)},
 }
}
