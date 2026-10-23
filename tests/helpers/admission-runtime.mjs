import assert from 'node:assert/strict'
import {randomBytes,randomUUID,webcrypto} from 'node:crypto'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createFixtureMail,fixtureMessages} from './fixture-mail.mjs'
import {emittedRuntime} from './emitted-runtime.mjs'
import {migrationInventory} from '../../scripts/migration-groups.mjs'
import {completeFirstRun} from './complete-first-run.mjs'

/** Real built Worker, migrations, ES256 admission and Base session. */
export async function admissionRuntime(port,{managementOrigin='https://management.example.test',ownerEmail='claim-owner@example.test',ownerName}={}){
 const directory=await mkdtemp(path.join(tmpdir(),'cradle-signed-admission-'))
 const origin=`http://127.0.0.1:${port}`,email=ownerEmail.trim().toLowerCase(),installationId='cradle-admission-test'
 const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
 const publicKey=await webcrypto.subtle.exportKey('jwk',keys.publicKey)
 const mail=await createFixtureMail(port)
 let runtime
 const close=async()=>{try{await runtime?.dispose()}finally{try{await mail.close()}finally{await rm(directory,{recursive:true,force:true})}}}
 try{
 runtime=await emittedRuntime(directory,port,{APP_ORIGIN:origin,AUTH_ORIGIN:origin,AUTH_LOCAL:'true',
  OWNER_EMAIL:ownerEmail,...(ownerName===undefined?{}:{OWNER_NAME:ownerName}),SESSION_SECRET:randomBytes(32).toString('hex'),SETUP_TOKEN:randomBytes(32).toString('hex'),
  WORKSPACE_NAME:'Admission acceptance',WORKSPACE_TIMEZONE:'UTC',WORKSPACE_CURRENCY:'USD',
  ...mail.bindings,MAIL_FROM:'auth@localhost.test',RER_MANAGEMENT_ORIGIN:managementOrigin,
  RER_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_ISSUER:managementOrigin,
  RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({admission:publicKey})},mail.fetch)
  await runtime.ready
  const db=await runtime.getD1Database('DB')
  for(const migration of migrationInventory())await db.exec(migration.sql.replace(/^\s*--.*$/gm,'').replaceAll('\n',' '))
  async function request(route,{method='GET',body,cookie,headers={}}={}){
   return fetch(origin+route,{method,redirect:'manual',headers:{...(cookie?{cookie}:{}),
    ...(body?{origin,'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})})
  }
  async function token(changes={}){
   const now=Math.floor(Date.now()/1000)
   const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
   const payload=encode({v:1,iss:managementOrigin,aud:origin,installationId,email,jti:randomUUID(),iat:now,exp:now+120,...changes})
   const input=encode({alg:'ES256',typ:'rer-owner-claim+jwt',kid:'admission'})+'.'+payload
   const signature=await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from(input))
   return input+'.'+Buffer.from(signature).toString('base64url')
  }
  async function claim(){
   const response=await request('/auth/owner-claim',{method:'POST',body:{token:await token(),displayName:'Claim owner',returnTo:'/app'}})
   assert.equal(response.status,303,'Signed admission succeeds')
   const cookie=response.headers.get('set-cookie').split(';')[0]
   await completeFirstRun(origin,cookie)
   const document=await request('/app',{cookie});assert.equal(document.status,200);await document.arrayBuffer()
   return cookie
  }
  async function member(cookie){
   const email='claim-member@example.test'
   const invite=await request('/auth/invite',{method:'POST',cookie,body:{email,role:'member',displayName:'Claim member'}})
   assert.equal(invite.status,202,'Native Base invitation succeeds')
   const message=(await fixtureMessages(origin)).findLast(message=>message.personalizations.some(group=>group.to.some(recipient=>recipient.email===email)))
   assert.ok(message,'The real provider request delivers the invitation to its recipient')
   const text=message.content.find(part=>part.type==='text/plain').value
   const link=new URL(text.match(/http:\/\/[^\s]+/)[0])
   const confirmed=await request('/auth/confirm',{method:'POST',body:{token:link.searchParams.get('token')}})
   assert.equal(confirmed.status,303)
   return confirmed.headers.get('set-cookie').split(';')[0]
  }
  return {runtime,db,origin,email,installationId,managementOrigin,request,token,claim,member,mailMessages:()=>fixtureMessages(origin),close}
 }catch(error){await close();throw error}
}
