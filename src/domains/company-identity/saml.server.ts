import {Buffer} from 'node:buffer'
import {deflateRawSync} from 'node:zlib'
import {safeReturnTo} from '../../../vendor/base/modules/operator-auth/policy.mjs'
import type {OperatorAuth} from '../../../vendor/base/modules/operator-auth/index.mjs'
import type {PlatformBindings} from '../../core/platform/bindings'
import {claims,protocol,assertion} from './saml-xml.server'
import {digest,secret,fail,headers,bounded,atomic} from './shared.server'
import {trustedPredicate} from '../admission/sql.server'
export type SamlConfig={entity_id:string;sso_url:string;certificate:string;enabled:number;generation:number}
export const configuration=(db:D1Database)=>db.prepare('SELECT * FROM company_identity_config WHERE singleton=1').first<SamlConfig>()
const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
export const serviceEntity=(origin:string)=>origin+'/auth/saml/metadata'
const bindingCookie=(origin:string)=>'company_saml_'+(new URL(origin).port||'443')
export async function samlResponse(request:Request,env:PlatformBindings,auth:OperatorAuth):Promise<Response>{
 const origin=env.APP_ORIGIN!,url=new URL(request.url),config=await configuration(env.DB),cookieName=bindingCookie(origin)
 if(url.pathname==='/auth/saml/metadata'&&request.method==='GET')return new Response(`<?xml version="1.0"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escape(serviceEntity(origin))}"><md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="${protocol}"><md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat><md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${escape(origin+'/auth/saml/acs')}" index="0" isDefault="true"/></md:SPSSODescriptor></md:EntityDescriptor>`,{headers:{...headers,'content-type':'application/samlmetadata+xml'}})
 if(!config?.enabled||!await auth.accounts.identityEnabled?.())fail('Company SAML sign-in is disabled',403)
 if(request.method!=='POST')fail('POST required',405)
 if(url.pathname==='/auth/saml/start'){
  if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')fail('Same-origin login start required',403)
  const body=await bounded(request,8192),input=request.headers.get('content-type')?.includes('application/json')?JSON.parse(body):Object.fromEntries(new URLSearchParams(body)),id='_'+crypto.randomUUID(),binding=secret(),now=Date.now()
  const settings=await env.DB.prepare('SELECT generation FROM oa_auth_settings WHERE singleton=1 AND idp_sign_in=1').first<{generation:number}>();if(!settings)fail('Company sign-in is disabled',403)
  await env.DB.batch([env.DB.prepare('DELETE FROM company_saml_requests WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM company_saml_assertions WHERE expires_at<?').bind(now),env.DB.prepare('INSERT INTO company_saml_requests(id,binding_hash,generation,auth_generation,expires_at,return_to) VALUES(?,?,?,?,?,?)').bind(id,await digest(binding),config.generation,settings.generation,now+300000,safeReturnTo(input.returnTo))])
  const xml=`<samlp:AuthnRequest xmlns:samlp="${protocol}" xmlns:saml="${assertion}" ID="${id}" Version="2.0" IssueInstant="${new Date(now).toISOString()}" Destination="${escape(config.sso_url)}" AssertionConsumerServiceURL="${escape(origin+'/auth/saml/acs')}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"><saml:Issuer>${escape(serviceEntity(origin))}</saml:Issuer><samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="false"/></samlp:AuthnRequest>`
  const target=new URL(config.sso_url);target.searchParams.set('SAMLRequest',Buffer.from(deflateRawSync(xml)).toString('base64'));target.searchParams.set('RelayState',id)
  return new Response(null,{status:303,headers:{...headers,location:target.href,'set-cookie':`${cookieName}=${binding}; Path=/auth/saml; Max-Age=300; HttpOnly; Secure; SameSite=None`}})
 }
 if(url.pathname!=='/auth/saml/acs')fail('Unknown SAML endpoint',404)
 if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))fail('SAML POST binding requires form data')
 const form=new URLSearchParams(await bounded(request,350000));if(form.getAll('SAMLResponse').length!==1||form.getAll('RelayState').length!==1)fail('Ambiguous SAML form')
 const requestId=form.get('RelayState')!,binding=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));if(binding.length!==1)fail('SAML browser binding missing')
 const pending=await env.DB.prepare('SELECT * FROM company_saml_requests WHERE id=? AND binding_hash=? AND expires_at>? AND generation=?').bind(requestId,await digest(binding[0]!.slice(cookieName.length+1)),Date.now(),config.generation).first<{auth_generation:number;return_to:string}>();if(!pending)fail('SAML login request expired, replayed or unbound')
 const encoded=form.get('SAMLResponse')!;if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('Invalid SAML base64')
 const xml=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))),verified=claims(xml,config.certificate,{issuer:config.entity_id,audience:serviceEntity(origin),destination:origin+'/auth/saml/acs',requestId,now:Date.now()}),assertionHash=await digest(config.entity_id+'\n'+verified.id)
 await atomic(env.DB,[trustedPredicate('EXISTS(SELECT 1 FROM company_saml_requests WHERE id=? AND generation=? AND expires_at>?)',[requestId,config.generation,Date.now()]),trustedPredicate('EXISTS(SELECT 1 FROM company_identity_config WHERE singleton=1 AND enabled=1 AND generation=?)',[config.generation]),trustedPredicate('EXISTS(SELECT 1 FROM oa_auth_settings WHERE singleton=1 AND idp_sign_in=1 AND generation=?)',[pending.auth_generation]),trustedPredicate('NOT EXISTS(SELECT 1 FROM company_saml_assertions WHERE assertion_hash=?)',[assertionHash])],[],[env.DB.prepare('INSERT INTO company_saml_assertions(assertion_hash,expires_at) VALUES(?,?)').bind(assertionHash,verified.expires),env.DB.prepare('DELETE FROM company_saml_requests WHERE id=?').bind(requestId)])
 const admitted=await auth.admission.admit(request,{issuer:config.entity_id,subject:verified.subject,email:verified.email,emailVerified:true,providerGeneration:pending.auth_generation},{returnTo:pending.return_to})
 return new Response(null,{status:303,headers:{...headers,location:admitted.returnTo??'/app','set-cookie':admitted.cookie}})
}
