import assert from 'node:assert/strict'
import AxeBuilder from '@axe-core/playwright'
import {samlProvider} from './saml-provider.mjs'
export async function companyIdentityBrowser(page,j,h,width){let cleanup;const idp=await samlProvider({after:fn=>{cleanup=fn}})
 const d={async call(path,body){const response=await fetch(h.origin+path,{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json()}}
 try{
  await d.call('/auth/settings/scim',{action:'revoke'});await d.call('/auth/settings/identity',{idpSignIn:false});await h.db.prepare('DELETE FROM company_identity_config').run()
  await page.goto(h.origin+'/signin');assert.equal(await page.getByRole('button',{name:/SAML/}).count(),0);await j.capture('company-signin-disabled')
  await page.goto(h.origin+'/auth/settings/identity');await page.getByRole('heading',{name:'Sign-in settings',exact:true}).waitFor();await j.capture('company-settings-empty')
  await page.getByLabel('Identity provider entity ID',{exact:true}).fill(idp.issuer);await page.getByLabel('SSO URL',{exact:true}).fill(idp.issuer);await page.getByLabel('Signing certificate (PEM)',{exact:true}).fill('invalid certificate');await page.getByRole('button',{name:'Save SAML settings',exact:true}).click();await page.getByRole('alert').waitFor();await j.capture('company-settings-failure')
  await page.getByLabel('Identity provider entity ID',{exact:true}).fill(idp.issuer);await page.getByLabel('SSO URL',{exact:true}).fill(idp.issuer);await page.getByLabel('Signing certificate (PEM)',{exact:true}).fill(idp.certificate);await page.getByLabel('Enable SAML sign-in',{exact:true}).check();await page.getByRole('button',{name:'Save SAML settings',exact:true}).click()
  assert.equal((await h.db.prepare('SELECT enabled FROM company_identity_config').first())?.enabled,1);
  await page.getByLabel('Allow provider sign-in',{exact:true}).check();await page.getByRole('button',{name:'Save settings',exact:true}).click();await page.goto(h.origin+'/auth/settings/identity');await j.capture('company-settings-configured')
  await page.getByRole('button',{name:/Issue SCIM credential|Rotate SCIM credential/}).click();await page.getByRole('heading',{name:'Copy the SCIM credential now',exact:true}).waitFor();assert.equal(await page.locator('code').filter({hasText:/^[a-f0-9]{64}$/}).count(),1);await page.goto(h.origin+'/auth/settings/identity');await j.capture('company-settings-provisioning');assert.equal(await page.locator('code').filter({hasText:/^[a-f0-9]{64}$/}).count(),0)
  // The public page stays accessible with no operator session.
  const guest=await page.context().browser().newContext({viewport:{width,height:width===390?844:900}})
  try{const p=await guest.newPage();await p.goto(h.origin+'/signin');await p.getByRole('button',{name:/SAML/}).waitFor();assert.deepEqual((await new AxeBuilder({page:p}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact)),[]);await p.screenshot({path:j.companyOutput('company-signin-enabled'),fullPage:true});const response=await p.goto(h.origin+'/auth/settings/identity');assert.equal(response.status(),401);await p.getByRole('heading',{name:'Owner access required'}).waitFor();assert.deepEqual((await new AxeBuilder({page:p}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact)),[]);await p.screenshot({path:j.companyOutput('company-settings-denied'),fullPage:true})}finally{await guest.close()}
 }finally{await cleanup()}
}
