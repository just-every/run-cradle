import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {migratedD1} from './helpers/sqlite-d1.mjs'
import {migrationInventory} from '../scripts/migration-groups.mjs'
import {hashToken,opaqueToken} from '../vendor/base/modules/operator-auth/crypto.mjs'
import {createOperatorAuth} from '../vendor/base/modules/operator-auth/index.mjs'
import {createMailSender} from '../vendor/base/modules/mail/index.mjs'
import {createD1DevelopmentOutbox} from '../vendor/base/modules/mail/src/development/index.mjs'
const {createProductAuth}=await import('../src/domains/authority/product-auth.server.ts')

const origin='http://127.0.0.1:4219',secret='test-only-session-secret-32-characters-long',day=86400000
const upgrade=migrationInventory().find(migration=>migration.name==='9021_dev_sessions.sql')
const request=cookie=>new Request(origin+'/app',{headers:{host:new URL(origin).host,cookie}})

contract('AUTH-BASE-001 BASE-ACCESS-002','a populated store from before dev identity upgrades with every session, mirrored product session and key intact and valid',async()=>{
 // A store exactly as the previous main left it: every migration except the new one.
 const store=migratedD1(migrationInventory().filter(migration=>migration.name!==upgrade.name)),{sql,db}=store
 try{
  assert.equal(sql.prepare("SELECT sql FROM sqlite_master WHERE name='oa_sessions'").get().sql.includes("'dev'"),false,'The prior schema does not admit dev sessions')
  const now=Date.now()
  sql.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES('op-owner','owner@example.test','Owner','owner','active',1,?),('op-member','member@example.test','Member','member','active',1,?)").run(now,now)
  const tokens={native:opaqueToken(),revoked:opaqueToken(),expired:opaqueToken(),review:opaqueToken(),oidc:opaqueToken(),password:opaqueToken()}
  const rows=[['s-native','native',tokens.native,now+day,null],['s-revoked','native',tokens.revoked,now+day,now-1],['s-expired','native',tokens.expired,now-1000,null],
   ['s-review','review',tokens.review,now+day,null],['s-oidc','oidc',tokens.oidc,now+day,null],['s-password','password',tokens.password,now+day,null]]
  for(const [id,kind,token,expires,revoked] of rows)sql.prepare('INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,?)').run(id,await hashToken(secret,'session',token),'op-owner',1,kind,now-5000,expires,revoked)
  // The product session handle the reader mirrors for the signed-in owner, and an API key the owner issued.
  const owner=sql.prepare("SELECT principal_id FROM cradle_base_operators WHERE base_id='op-owner'").get().principal_id
  sql.prepare("INSERT INTO authority_sessions(id,principal_id,token_hash,csrf_hash,authentication_epoch,created_at,last_seen_at,expires_at) VALUES('product-native',?,'base:s-native','',?,?,?,?)").run(owner,sql.prepare('SELECT authentication_epoch FROM authority_principals WHERE id=?').get(owner).authentication_epoch,now-5000,now-5000,now+day)
  sql.prepare("INSERT INTO cradle_base_sessions(base_id,session_id) VALUES('s-native','product-native')").run()
  sql.prepare("INSERT INTO authority_principals(id,kind,state,created_at,updated_at) VALUES('01J00000000000000000000099','connector','active',?,?)").run(now,now)
  sql.prepare("INSERT INTO authority_credentials(id,principal_id,token_hash,audience,scopes_json,created_at,expires_at,authentication_epoch) VALUES('credential-1','01J00000000000000000000099','hash-of-an-issued-key',?,'[]',?,?,0)").run(origin+'/api/v1',now-5000,now+day)

  const tables=['oa_sessions','cradle_base_sessions','authority_sessions','authority_credentials','oa_operators','operators','authority_principals','cradle_base_operators']
  const snapshot=()=>Object.fromEntries(tables.map(table=>[table,sql.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]))
  const before=snapshot()
  sql.exec(upgrade.sql)
  assert.deepEqual(snapshot(),before,'Every row of every table is identical, ids and expiries included')
  assert.equal(sql.prepare("SELECT sql FROM sqlite_master WHERE name='oa_sessions'").get().sql.includes("'dev'"),true,'Dev sessions are now admitted')
  assert.equal(sql.prepare("SELECT count(*) n FROM oa_dev_credentials").get().n,0)
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[],'No row refers to a missing parent')

  // The current runtime accepts the old sessions exactly as before, through Base and through Cradle's own reader.
  const base=createOperatorAuth({db,config:{local:true,origin,OWNER_EMAIL:'owner@example.test',SESSION_SECRET:secret,MAIL_FROM:'auth@localhost.test'},
   mailSender:createMailSender({provider:'development',mode:'development'},{outbox:createD1DevelopmentOutbox({db})}),clientIp:()=>'127.0.0.1'})
  const auth=createProductAuth(db,{appOrigin:origin,sessionSecret:secret,mode:'development',base,initializeBaseOwner:async()=>{}})
  const cookie=token=>`operator_session_local=${token}`
  assert.equal((await base.getSession(request(cookie(tokens.native))))?.id,'s-native','The native session is still valid')
  for(const kind of ['revoked','expired'])assert.equal(await base.getSession(request(cookie(tokens[kind]))),null,`The ${kind} session stays invalid`)
  const current=await auth.current(request(cookie(tokens.native)))
  assert.equal(current.principal.id,owner);assert.equal(current.principal.sessionId,'product-native','The mirrored product session is the same one')
  // A new store reaches the same shape: the file is safe after the fresh schema too.
  const fresh=migratedD1();try{fresh.sql.exec(upgrade.sql)}finally{fresh.close()}
 }finally{store.close()}
})
