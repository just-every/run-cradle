import {z} from 'zod'
import {X509Certificate} from 'node:crypto'
import {pageResponse} from '../../../vendor/base/modules/operator-auth/page.mjs'
import {escapeHtml} from '../../../vendor/base/modules/operator-auth/http.mjs'
import type {OperatorAuth} from '../../../vendor/base/modules/operator-auth/index.mjs'
import type {PlatformBindings} from '../../core/platform/bindings'
import {configuration,serviceEntity} from './saml.server'
import {owner,secret,digest,audit,bounded,atomic,headers,fail} from './shared.server'
import {trustedPredicate} from '../admission/sql.server'
const https=z.string().url().max(2048).refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash},'Use an HTTPS address without credentials or fragment')
export async function settingsResponse(request:Request,env:PlatformBindings,auth:OperatorAuth):Promise<Response>{
 const session=await owner(request,auth,env),url=new URL(request.url),json=request.headers.get('content-type')?.includes('application/json'),db=env.DB
 const page=async(message='',credential?:string)=>{
  const config=await configuration(db),enabled=await auth.accounts.identityEnabled?.(),scim=await db.prepare('SELECT id FROM company_scim_credentials WHERE revoked_at IS NULL').first()
  const content='<link rel="stylesheet" href="/company-identity.css"><div class="company-identity"><p>Company identity admits existing operators only. Native email sign-in remains available.</p>'+ (message?`<p role="alert">${escapeHtml(message)}</p>`:'')+
   (credential?`<section><h2>Copy the SCIM credential now</h2><p>This is the only time this credential is shown.</p><code>${escapeHtml(credential)}</code></section>`:'')+
   `<form action="/auth/settings/identity" method="post"><input type="hidden" name="setting" value="identity"><label class="check"><input type="checkbox" name="idpSignIn" value="true"${enabled?' checked':''}>Allow provider sign-in</label><button>Save settings</button></form>`+
   `<h2>SAML company sign-in</h2><p>${config?'An identity provider is configured.':'No SAML identity provider is configured.'}</p><p>Give your provider the <a href="/auth/saml/metadata">service-provider metadata</a>. Entity ID: <code>${escapeHtml(serviceEntity(env.APP_ORIGIN!))}</code>. Use emailAddress NameID, signed RSA-SHA256 responses or assertions, and SP-initiated login. Clock skew allowance is 60 seconds.</p>`+
   `<form action="/auth/settings/company" method="post"><label>Identity provider entity ID<input name="entityId" required maxlength="2048" value="${escapeHtml(config?.entity_id??'')}"></label><label>SSO URL<input name="ssoUrl" type="url" required value="${escapeHtml(config?.sso_url??'')}"></label><label>Signing certificate (PEM)<textarea name="certificate" rows="5"${config?'':' required'}></textarea></label><p>${config?'Leave the certificate blank to retain it.':'Paste the provider signing certificate.'}</p><label class="check"><input name="enabled" type="checkbox" value="true"${config?.enabled?' checked':''}>Enable SAML sign-in</label><button>Save SAML settings</button></form>`+
   `<h2>SCIM provisioning</h2><p>Endpoint: <code>${escapeHtml(env.APP_ORIGIN!+'/scim/v2')}</code></p><p>${scim?'A provisioning credential is active.':'Provisioning is inactive.'} New operators receive the member role and no base grants. Remove blocking campaign ownership and unresolved decision assignments before deprovisioning.</p><form class="stack" action="/auth/settings/scim" method="post"><button name="action" value="rotate">${scim?'Rotate':'Issue'} SCIM credential</button>${scim?'<button name="action" value="revoke">Revoke SCIM credential</button>':''}</form><p class="secondary-link"><a href="/app">Back to app</a></p></div>`
  return pageResponse({branding:auth.presentation,title:'Sign-in settings',heading:'Sign-in settings',content,referrer:'strict-origin'})
 }
 if(request.method==='GET')return page()
 if(request.method!=='POST')fail('POST required',405)
 const guard=trustedPredicate(`EXISTS(SELECT 1 FROM oa_operators o JOIN oa_sessions s ON s.operator_id=o.id WHERE o.id=? AND o.version=? AND o.status='active' AND o.role='owner' AND s.id=? AND s.revoked_at IS NULL AND s.expires_at>?)`,[session.operator.id,session.operator.version,session.id,Date.now()])
 try{
 const raw=await bounded(request),input=json?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw))
 if(url.pathname==='/auth/settings/company'){
  const data=z.object({entityId:z.string().trim().min(1).max(2048),ssoUrl:https,certificate:z.string().max(16384),enabled:z.union([z.boolean(),z.literal('true')]).optional()}).strict().parse(input),previous=await configuration(db),certificate=data.certificate.trim()||previous?.certificate
  if(!certificate)fail('A signing certificate is required')
  let cert:X509Certificate;try{cert=new X509Certificate(certificate)}catch{fail('Paste a valid PEM signing certificate from your identity provider.')}if(cert.publicKey.asymmetricKeyType!=='rsa'||(cert.publicKey.asymmetricKeyDetails?.modulusLength??0)<2048)fail('Use an RSA signing certificate with at least 2048 bits')
  if(Date.parse(cert.validTo)<=Date.now()||Date.parse(cert.validFrom)>Date.now()+60000)fail('Signing certificate is expired or not yet valid')
  await atomic(db,[guard],[],[db.prepare(`INSERT INTO company_identity_config(singleton,entity_id,sso_url,certificate,enabled,generation,updated_at) VALUES(1,?,?,?,?,1,?) ON CONFLICT(singleton) DO UPDATE SET entity_id=excluded.entity_id,sso_url=excluded.sso_url,certificate=excluded.certificate,enabled=excluded.enabled,generation=company_identity_config.generation+1,updated_at=excluded.updated_at`).bind(data.entityId,data.ssoUrl,certificate,data.enabled?1:0,Date.now()),db.prepare('UPDATE oa_auth_settings SET generation=generation+1 WHERE singleton=1'),db.prepare("UPDATE oa_sessions SET revoked_at=coalesce(revoked_at,?) WHERE kind='oidc'").bind(Date.now()),db.prepare('DELETE FROM company_saml_requests'),audit(db,session.operator.id,null,'saml.configure')])
  return json?Response.json({configured:true,enabled:!!data.enabled},{headers}):page('SAML settings saved. Allow provider sign-in above to offer the company option.')
 }
 if(url.pathname==='/auth/settings/scim'){
  const action=z.enum(['rotate','revoke']).parse(input.action),token=action==='rotate'?secret():undefined,id=crypto.randomUUID()
  await atomic(db,[guard],[],[db.prepare('UPDATE company_scim_credentials SET revoked_at=coalesce(revoked_at,?)').bind(Date.now()),...(token?[db.prepare('INSERT INTO company_scim_credentials(id,token_hash,owner_id,owner_version,created_at) VALUES(?,?,?,?,?)').bind(id,await digest('cradle-scim:'+token),session.operator.id,session.operator.version,Date.now())]:[]),audit(db,session.operator.id,null,'scim.'+action)])
  return json?Response.json({active:!!token,...(token?{credential:token}:{})},{headers}):page(action==='rotate'?'SCIM credential issued; earlier credentials are revoked.':'SCIM provisioning revoked.',token)
 }
 fail('Unknown company settings endpoint',404)
 }catch(error){if(json)throw error;return page(error instanceof Error?error.message:'Settings could not be saved')}
}
