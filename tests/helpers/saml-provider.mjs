import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {inflateRawSync} from 'node:zlib'
import {SignedXml} from 'xml-crypto'
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')
/** Local identity-provider network edge: generates its own signing key, never real credentials. */
export async function samlProvider(t){
 const dir=await mkdtemp(join(tmpdir(),'synthetic-cradle-saml-'));t.after(()=>rm(dir,{recursive:true,force:true}))
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','2','-subj','/CN=synthetic-cradle-1'],{stdio:'ignore'})
 const key=await readFile(join(dir,'key.pem'),'utf8'),certificate=await readFile(join(dir,'cert.pem'),'utf8'),issuer='https://synthetic-cradle-1.example/saml'
 return {certificate,issuer,
  request(response){const url=new URL(response.headers.get('location'));const xml=inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest'),'base64')).toString();return {id:url.searchParams.get('RelayState'),xml,binding:response.headers.get('set-cookie').split(';')[0]}},
  response(start,{origin='https://cradle.example.com',email='owner@example.com',id='_'+crypto.randomUUID(),now=Date.now(),audience=origin+'/auth/saml/metadata',destination=origin+'/auth/saml/acs',requestId=start.id,expired=false,signResponse=false,unsigned=false,wrapped=false}={}){
   const instant=new Date(now).toISOString(),before=new Date(now-60000).toISOString(),expires=new Date(expired?now-120000:now+240000).toISOString()
   const assertion=`<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id}" Version="2.0" IssueInstant="${instant}"><saml:Issuer>${issuer}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${esc(email)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${requestId}" Recipient="${destination}" NotOnOrAfter="${expires}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${before}" NotOnOrAfter="${expires}"><saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${instant}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement></saml:Assertion>`
   let xml=`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${crypto.randomUUID()}" Version="2.0" IssueInstant="${instant}" Destination="${destination}" InResponseTo="${requestId}"><saml:Issuer>${issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${assertion}</samlp:Response>`
   if(!unsigned){const signature=new SignedXml({privateKey:key,publicCert:certificate,canonicalizationAlgorithm:'http://www.w3.org/2001/10/xml-exc-c14n#',signatureAlgorithm:'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'});const element=signResponse?'Response':'Assertion';signature.addReference({xpath:`//*[local-name()='${element}']`,transforms:['http://www.w3.org/2000/09/xmldsig#enveloped-signature','http://www.w3.org/2001/10/xml-exc-c14n#'],digestAlgorithm:'http://www.w3.org/2001/04/xmlenc#sha256'});signature.computeSignature(xml,{location:{reference:`//*[local-name()='${element}']/*[local-name()='Issuer']`,action:'after'}});xml=signature.getSignedXml()}
   if(wrapped)xml=xml.replace('</samlp:Response>',assertion.replaceAll(id,'_'+crypto.randomUUID()).replace(email,'stranger@example.com')+'</samlp:Response>')
   return {xml,id,body:new URLSearchParams({RelayState:start.id,SAMLResponse:Buffer.from(xml).toString('base64')}).toString()}
 }
}
}
