import type {XmlElement as Element,XmlDocument as Document} from '../../core/shared/xml-types'
import {DOMParser} from '@xmldom/xmldom'
import {SignedXml} from 'xml-crypto'
import {fail} from './shared.server'
export const protocol='urn:oasis:names:tc:SAML:2.0:protocol',assertion='urn:oasis:names:tc:SAML:2.0:assertion',ds='http://www.w3.org/2000/09/xmldsig#'
const exclusive='http://www.w3.org/2001/10/xml-exc-c14n#',enveloped=ds+'enveloped-signature'
export function parseXml(xml:string){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('SAML DTDs and entities are not supported')
 const document=new DOMParser({errorHandler:{warning:()=>fail('Malformed SAML XML'),error:()=>fail('Malformed SAML XML'),fatalError:()=>fail('Malformed SAML XML')}}).parseFromString(xml,'application/xml') as unknown as Document
 if(!document.documentElement)fail('SAML document is empty');return document
}
export const children=(element:Element,namespace:string,name:string)=>Array.from(element.childNodes).filter((node):node is Element=>node.nodeType===1&&(node as Element).namespaceURI===namespace&&(node as Element).localName===name)
export function one(element:Element,namespace:string,name:string){const nodes=children(element,namespace,name);if(nodes.length!==1)fail('SAML requires one '+name);return nodes[0]!}
const root=(document:Document,namespace:string,name:string)=>{const node=document.documentElement!;if(node.namespaceURI!==namespace||node.localName!==name)fail('Unexpected signed SAML element');return node}
const text=(element:Element)=>element.textContent?.trim()??''
function shape(document:Document){
 const response=root(document,protocol,'Response'),payload=one(response,assertion,'Assertion'),ids=new Set<string>()
 for(const node of Array.from(document.getElementsByTagName('*'))){
  for(const attr of Array.from(node.attributes)){if(['id','Id','ID'].includes(attr.name)){if(!attr.value||ids.has(attr.value))fail('SAML duplicate or empty ID');ids.add(attr.value)}}
 }
 if(document.getElementsByTagNameNS(assertion,'Assertion').length!==1||document.getElementsByTagNameNS(protocol,'Response').length!==1)fail('SAML wrapped elements are refused')
 const signatures=Array.from(document.getElementsByTagNameNS(ds,'Signature'))
 if(signatures.length!==1||![response,payload].includes(signatures[0]!.parentNode as Element))fail('SAML signature must cover the consumed Response or Assertion')
 return {response,payload,signature:signatures[0]!}
}
export function verifiedAssertion(xml:string,certificate:string){
 const document=parseXml(xml),original=shape(document),signed=original.signature.parentNode as Element,id=signed.getAttribute('ID')
 const info=one(original.signature,ds,'SignedInfo'),references=children(info,ds,'Reference')
 if(!id||references.length!==1||references[0]!.getAttribute('URI')!=='#'+id)fail('SAML signature reference does not cover its containing element')
 if(one(info,ds,'CanonicalizationMethod').getAttribute('Algorithm')!==exclusive||one(info,ds,'SignatureMethod').getAttribute('Algorithm')!=='http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'||one(references[0]!,ds,'DigestMethod').getAttribute('Algorithm')!=='http://www.w3.org/2001/04/xmlenc#sha256')fail('Unsupported SAML signature algorithm; use RSA-SHA256 and exclusive canonicalization')
 const transforms=children(one(references[0]!,ds,'Transforms'),ds,'Transform')
 if(transforms.length!==2||transforms[0]!.getAttribute('Algorithm')!==enveloped||transforms[1]!.getAttribute('Algorithm')!==exclusive)fail('Unsupported SAML signature transforms')
 for(const inclusive of Array.from(document.getElementsByTagNameNS(exclusive,'InclusiveNamespaces'))){if(![transforms[1],one(info,ds,'CanonicalizationMethod')].includes(inclusive.parentNode as Element))fail('Misplaced SAML namespace declaration')}
 const verifier=new SignedXml({publicCert:certificate,getCertFromKeyInfo:()=>null})
 verifier.loadSignature(original.signature as unknown as Node)
 if(!verifier.checkSignature(xml))fail('Invalid SAML signature')
 const signedBytes=verifier.getSignedReferences();if(signedBytes.length!==1)fail('Ambiguous SAML signature references')
 const verified=parseXml(signedBytes[0]!),verifiedRoot=root(verified,signed.namespaceURI!,signed.localName!)
 if(verifiedRoot.getAttribute('ID')!==id)fail('SAML signature identity mismatch')
 const payload=signed===original.response?one(verifiedRoot,assertion,'Assertion'):verifiedRoot
 return {response:signed===original.response?verifiedRoot:original.response,payload}
}
export function claims(xml:string,certificate:string,expected:{issuer:string;audience:string;destination:string;requestId:string;now:number}){
 const {response,payload}=verifiedAssertion(xml,certificate),now=expected.now,skew=60000
 if(response.getAttribute('Version')!=='2.0'||payload.getAttribute('Version')!=='2.0')fail('Unsupported SAML version')
 if(response.getAttribute('Destination')!==expected.destination||response.getAttribute('InResponseTo')!==expected.requestId)fail('SAML destination or request mismatch')
 if(text(one(response,assertion,'Issuer'))!==expected.issuer||text(one(payload,assertion,'Issuer'))!==expected.issuer)fail('SAML issuer mismatch')
 if(one(one(response,protocol,'Status'),protocol,'StatusCode').getAttribute('Value')!=='urn:oasis:names:tc:SAML:2.0:status:Success')fail('SAML response was not successful')
 const timestamp=(node:Element,attr:string)=>{const value=node.getAttribute(attr),n=value?Date.parse(value):NaN;if(!Number.isFinite(n))fail('SAML '+attr+' is required');return n}
 for(const node of [response,payload])if(timestamp(node,'IssueInstant')>now+skew||timestamp(node,'IssueInstant')<now-300000-skew)fail('SAML issue time is outside the login window')
 const conditions=one(payload,assertion,'Conditions'),before=timestamp(conditions,'NotBefore'),expires=timestamp(conditions,'NotOnOrAfter')
 if(now+skew<before||now-skew>=expires||expires<=before||expires-now>600000)fail('SAML assertion is expired or not yet valid')
 const restrictions=children(conditions,assertion,'AudienceRestriction');if(!restrictions.length||restrictions.some(r=>!children(r,assertion,'Audience').some(a=>text(a)===expected.audience)))fail('SAML audience mismatch')
 const subject=one(payload,assertion,'Subject'),name=one(subject,assertion,'NameID'),confirmation=one(subject,assertion,'SubjectConfirmation'),data=one(confirmation,assertion,'SubjectConfirmationData')
 if(confirmation.getAttribute('Method')!=='urn:oasis:names:tc:SAML:2.0:cm:bearer'||data.getAttribute('Recipient')!==expected.destination||data.getAttribute('InResponseTo')!==expected.requestId||now-skew>=timestamp(data,'NotOnOrAfter'))fail('SAML bearer confirmation mismatch or expiry')
 if(data.hasAttribute('NotBefore')&&now+skew<timestamp(data,'NotBefore'))fail('SAML bearer confirmation is not yet valid')
 const email=text(name),id=payload.getAttribute('ID');if(!id||id.length>255||!email||email.length>254||name.getAttribute('Format')!=='urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'||!/^\S+@\S+\.\S+$/.test(email))fail('SAML requires an emailAddress NameID for an existing operator')
 return {id,subject:email,email:email.toLowerCase(),expires:Math.max(expires,timestamp(data,'NotOnOrAfter'))+skew}
}
