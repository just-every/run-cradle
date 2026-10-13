import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createOperatorAuth} from '../../vendor/base/modules/operator-auth/index.mjs'
import {createMailSender} from '../../vendor/base/modules/mail/index.mjs'
import {createD1DevelopmentOutbox} from '../../vendor/base/modules/mail/src/development/index.mjs'
const {createProductAuth}=await import('../../src/domains/authority/product-auth.server.ts')

// Historical sample identities are test data. Adopt their existing IDs as the
// Base projection migration does during an upgrade, before issuing credentials.
export async function adoptFixtureOperators(db) {
 const trigger=await db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='cradle_project_base_operator'").first()
 assert.ok(trigger,'Fixture requires the real Base projection migration')
 await db.batch([
  db.prepare('DROP TRIGGER cradle_project_base_operator'),
  db.prepare(`INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at)
   SELECT o.id,lower(o.email),o.name,CASE WHEN p.initial_owner=1 THEN 'owner' ELSE 'member' END,
   CASE WHEN o.active=1 AND p.state='active' THEN 'active' ELSE 'inactive' END,1,o.created_at
   FROM operators o JOIN authority_principals p ON p.human_id=o.id
   WHERE NOT EXISTS(SELECT 1 FROM cradle_base_operators b WHERE b.principal_id=p.id)`),
  db.prepare(`INSERT OR IGNORE INTO cradle_base_operators(base_id,principal_id)
   SELECT o.id,p.id FROM operators o JOIN authority_principals p ON p.human_id=o.id`),
  db.prepare(trigger.sql),
 ])
}
export async function createFixtureAuth(db, configuration, principalId) {
 if(!await db.prepare("SELECT 1 FROM sqlite_master WHERE name='oa_operators'").first()){
  for(const name of ['base/9000_base_operator_auth.sql','base/9001_cradle_auth_projection.sql','base/9002_development_outbox.sql','updates/9021_dev_sessions.sql','updates/9022_domain_rules_step_up.sql','updates/9026_provider_setup_lifecycle.sql']){
   const sql=await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')
   await db.exec(sql.replace(/^\s*--.*$/gm,'').replaceAll('\n',' '))
  }
 }else await adoptFixtureOperators(db)
 const {appOrigin:origin,sessionSecret}=configuration
 const outbox=createD1DevelopmentOutbox({db})
 const base=createOperatorAuth({db,config:{local:true,origin,OWNER_EMAIL:'owner@example.test',SESSION_SECRET:sessionSecret,MAIL_FROM:'auth@localhost.test'},mailSender:createMailSender({provider:'development',mode:'development'},{outbox}),clientIp:()=> '127.0.0.1'})
 configuration.base=base
 // These fixtures have already installed their workspace and policy data.
 configuration.initializeBaseOwner=async()=>{}
 const auth=createProductAuth(db,configuration)
 const request=(path,options={})=>new Request(origin+path,{...options,headers:{host:new URL(origin).host,origin,...options.headers}})
 async function signIn(id=principalId){
  const operator=await db.prepare('SELECT email FROM operators WHERE id=?').bind(id).first();assert.ok(operator)
  await base.requestMagicLink(request('/auth/magic-link',{method:'POST'}),{email:operator.email,returnTo:'/app'})
  const email=operator.email.trim().toLowerCase()
  const captures=await outbox.list(),capture=captures.find(row=>row.message.to.some(recipient=>(typeof recipient==='string'?recipient:recipient.email)===email))
  assert.ok(capture,'Base must deliver the real one-use link to the development outbox')
  const link=new URL(capture.message.text.match(/https?:\/\/\S+/)[0])
  const confirmed=await base.confirmLink(request('/auth/confirm',{method:'POST'}),{token:link.searchParams.get('token')})
  const cookie=confirmed.cookie.split(';')[0],read=request('/app',{headers:{cookie}})
  const current=await auth.current(read);assert.equal(current.principal.id,id)
  return {cookie,csrf:await auth.csrf(read),id:current.principal.sessionId,baseId:confirmed.session.id}
 }
 return {...auth,base,configuration,outbox,signIn}
}
