import { migrationConfiguration, migrationGroups } from '../scripts/migration-groups.mjs'
import './helpers/typescript-loader.mjs'
import { createOperatorAuth } from '../vendor/base/modules/operator-auth/index.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { baseEmittedRuntime } from './helpers/base-emitted-runtime.mjs'
import {completeFirstRun} from './helpers/complete-first-run.mjs'

const origin='https://cradle.base.test'
const setupToken='test-only-base-bootstrap-secret-32-characters'
const secret='test-only-base-session-secret-32-characters'
const ownerEmail='owner@example.test'
async function installation(run, mail=false, prior=false) {
 const deliveries=[]
 const directory=await mkdtemp(path.join(tmpdir(),'cradle-base-'))
 let runtime
 const cli=args=>{const result=spawnSync('pnpm',['exec','wrangler',...args],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(result.status,0,result.stderr||result.stdout)}
 try {
  cli(['d1','migrations','apply','cradle','--local','--persist-to',directory])
  if(prior)cli(['d1','execute','cradle','--local','--persist-to',directory,'--command',`
   INSERT INTO operators(id,created_at,updated_at,version,name,email,active) VALUES('00000000000000000000000091',1,1,1,'Existing Owner','owner@example.test',1);
   INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES('00000000000000000000000091','human','00000000000000000000000091','active',1,1,1);
   INSERT INTO workspace(id,created_at,updated_at,name,timezone,currency,version) VALUES('workspace',1,1,'Existing workspace','Australia/Brisbane','AUD',7);
   INSERT INTO campaigns(id,created_at,updated_at,version,code,name,owner_id,start_date,launch_date,objective,status_summary,phase,status,health,health_updated_at,budget_minor,spend_minor) VALUES('00000000000000000000000092',1,1,3,'PRIOR','Retained campaign','00000000000000000000000091','2026-10-01','2026-12-01','','','Planning','On track',50,1,0,0);
  `])
  for(const group of migrationGroups.filter(group=>group!=='core')) {
   const config=path.join(directory,group+'.json')
   await writeFile(config,JSON.stringify(migrationConfiguration(group)))
   cli(['d1','migrations','apply','cradle','--config',config,'--local','--persist-to',directory])
  }
  runtime=await baseEmittedRuntime(directory,18761,{APP_ORIGIN:origin,SESSION_SECRET:secret,SETUP_TOKEN:setupToken,OWNER_EMAIL:ownerEmail,MAIL_PROVIDER:'sendgrid',...(mail?{MAIL_FROM:'sender@example.test',MAIL_PROVIDER_API_KEY:'test-only-sendgrid-key'}:{})},async request=>{
   assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send')
   deliveries.push(await request.json())
   return new Response(null,{status:202,headers:{'x-message-id':'test-only-workerd-mail-receipt'}})
  })
  const worker=await runtime.getWorker(),db=await runtime.getD1Database('DB')
  const request=(route,body,cookie)=>worker.fetch(origin+'/__test_envelope',{method:'POST',redirect:'manual',body:JSON.stringify({url:origin+route,method:body?'POST':'GET',headers:{host:'cradle.base.test',origin,'cf-connecting-ip':'192.0.2.55',...(cookie?{cookie}:{}),...(body?{'content-type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'}:{})},...(body?{body:body instanceof URLSearchParams?body.toString():JSON.stringify(body)}:{})})})
  const finish=cookie=>completeFirstRun(origin,cookie,(url,init)=>request(new URL(url).pathname,init.method==='POST'?new URLSearchParams(init.body):undefined,cookie))
  await run({request,finish,db,deliveries})
 }finally{await runtime?.dispose();await rm(directory,{recursive:true,force:true})}
}

test('Base bootstrap admits exactly one owner, protects private documents, and projects current sessions under current product authority',()=>installation(async({request,finish,db})=>{
 assert.equal((await request('/app')).status,303)
 const wrong=await request('/auth/bootstrap',{token:'test-wrong-bootstrap-token',displayName:'Owner'});assert.equal(wrong.status,403)
 assert.equal((await db.prepare('SELECT count(*) AS n FROM operators').first()).n,0)
 const bootstrap=await request('/auth/bootstrap',{token:setupToken,displayName:'Cradle Owner',returnTo:'/app'})
 assert.equal(bootstrap.status,303,await bootstrap.clone().text());assert.equal(bootstrap.headers.get('location'),'/app')
 const cookie=bootstrap.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith('__Host-operator_session='))
 await finish(cookie)
 const publicSession=await request('/auth/session',undefined,cookie);assert.equal(publicSession.status,200)
 const session=await request('/api/session',undefined,cookie);assert.equal(session.status,200,await session.clone().text())
 const data=await session.json();assert.equal(data.operator.email,ownerEmail);assert.equal(data.operator.name,'Cradle Owner');assert.match(data.operator.id,/^[0-9A-HJKMNP-TV-Z]{26}$/)
 const page=await request('/app',undefined,cookie);assert.equal(page.status,200);assert.match(await page.text(),/Records/)
 assert.equal((await request('/auth/bootstrap',{token:setupToken,displayName:'Replacement'})).status,409)
 assert.equal((await db.prepare('SELECT count(*) AS n FROM operators').first()).n,1)
 assert.equal((await db.prepare('SELECT count(*) AS n FROM campaigns').first()).n,0)
 assert.equal((await db.prepare('SELECT count(*) AS n FROM authority_grants').first()).n,0)
 assert.equal((await request('/auth/local-sign-in',{})).status,404)
 const capabilities=await(await request('/auth/capabilities')).json();assert.equal(capabilities.localDevelopmentSignIn,false)
 const csrf=await(await request('/auth/csrf',undefined,cookie)).json();assert.ok(csrf.csrfToken)
 const mapped=await db.prepare('SELECT principal_id FROM cradle_base_operators').first()
 await db.prepare("UPDATE authority_principals SET state='removed',authentication_epoch=authentication_epoch+1 WHERE id=?").bind(mapped.principal_id).run()
 assert.equal((await request('/api/session',undefined,cookie)).status,401)
 assert.equal((await request('/app',undefined,cookie)).status,303)
 const baseSession=await db.prepare('SELECT id FROM oa_sessions').first()
 await db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),baseSession.id).run()
 assert.equal((await request('/api/session',undefined,cookie)).status,401)
 assert.equal((await request('/app',undefined,cookie)).status,303)
},true))

test('missing hosted mail keeps product access unconfigured while Base bootstrap remains available',()=>installation(async({request,db})=>{
 assert.equal((await request('/auth/magic-link',{email:'stranger@example.test'})).status,503)
 assert.equal((await db.prepare('SELECT count(*) AS n FROM oa_operators').first()).n,0)
 const bootstrap=await request('/auth/bootstrap',{token:setupToken,displayName:'Owner'})
 const cookie=bootstrap.headers.get('set-cookie').split(';')[0]
 assert.equal((await request('/auth/magic-link',{email:ownerEmail})).status,503)
 const tokens=(await db.prepare('SELECT revoked_at FROM oa_tokens').all()).results;assert.ok(tokens.every(t=>t.revoked_at!==null))
 assert.equal((await request('/auth/session',undefined,cookie)).status,200)
 const product=await request('/api/session',undefined,cookie)
 assert.equal(product.status,503)
 const health=await request('/health');assert.equal(health.status,503)
 const missing=(await product.json()).error.missing
 assert.ok(missing.includes('MAIL_FROM'));assert.ok(missing.includes('MAIL_PROVIDER_API_KEY'))
 assert.equal((await request('/app',undefined,cookie)).status,503)
}))


test('emitted Base SendGrid magic-link uses a read-only confirmation before one-time POST and signs the mapped owner into Cradle',()=>installation(async({request,finish,db,deliveries})=>{
 assert.equal((await request('/auth/magic-link',{email:'stranger@example.test'})).status,202)
 assert.equal(deliveries.length,0)
 assert.equal((await db.prepare('SELECT count(*) AS n FROM oa_operators').first()).n,0)
 const bootstrap=await request('/auth/bootstrap',{token:setupToken,displayName:'Magic Owner'})
 assert.equal(bootstrap.status,303)
 assert.equal((await request('/auth/magic-link',{email:ownerEmail,returnTo:'/app'})).status,202)
 assert.equal(deliveries.length,1)
 const text=deliveries[0].content.find(part=>part.type==='text/plain').value
 const link=text.match(/https:\/\/[^\s]+/)[0]
 const url=new URL(link),token=url.searchParams.get('token')
 assert.equal(url.origin,origin);assert.equal(url.pathname,'/auth/confirm')
 const preview=await request(url.pathname+url.search);assert.equal(preview.status,200);assert.equal(preview.headers.get('set-cookie'),null)
 const before=await db.prepare('SELECT count(*) AS n FROM oa_sessions').first();assert.equal(before.n,1)
 assert.equal((await db.prepare('SELECT consumed_at FROM oa_tokens').first()).consumed_at,null)
 const confirmed=await request('/auth/confirm',{token});assert.equal(confirmed.status,303)
 const cookie=confirmed.headers.get('set-cookie').split(';')[0]
 await finish(cookie)
 const page=await request('/app',undefined,cookie);assert.equal(page.status,200);assert.match(await page.text(),/Magic Owner/)
 assert.equal((await request('/auth/confirm',{token})).status,400)
 const session=await(await request('/api/session',undefined,cookie)).json();assert.equal(session.operator.email,ownerEmail)
 const baseSession=await db.prepare('SELECT id FROM oa_sessions ORDER BY created_at DESC LIMIT 1').first()
 const {createBaseSessionReader}=await import('../src/domains/authority/base-session.server.ts')
 const {principalGuards}=await import('../src/domains/authority/guards.server.ts')
 const base=createOperatorAuth({db,config:{origin,OWNER_EMAIL:ownerEmail,SESSION_SECRET:secret},clientIp:()=> '192.0.2.55'})
 const read=createBaseSessionReader(db,{appOrigin:origin,sessionSecret:secret,mode:'production',initializeBaseOwner:async()=>{assert.equal((await request('/app',undefined,cookie)).status,200)}},base)
 const identity=await read(new Request(origin+'/api/session',{headers:{host:'cradle.base.test',cookie}}))
 const guards=principalGuards({principal:identity.principal,now:new Date().toISOString()})
 const prepared=()=>db.prepare('SELECT 1 AS authorized WHERE '+guards.map(g=>'('+g.sql+')').join(' AND ')).bind(...guards.flatMap(g=>g.values)).first()
 assert.ok(await prepared(),'Current Base session admits a prepared product command')
 const csrf=await(await request('/auth/csrf',undefined,cookie)).json();assert.ok(csrf.csrfToken)
 await db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),baseSession.id).run()
 assert.equal(await prepared(),null,'Revoking Base after preparation defeats the atomic product guard')
 assert.equal((await request('/api/session',undefined,cookie)).status,401)
},true))


test('Base additive adoption preserves existing product IDs/history and refuses a replacement first owner',()=>installation(async({request,db,deliveries})=>{
 const old=await db.prepare('SELECT id,email,version FROM operators').first();assert.deepEqual(old,{id:'00000000000000000000000091',email:ownerEmail,version:1})
 assert.deepEqual(await db.prepare('SELECT id,version,name FROM campaigns').first(),{id:'00000000000000000000000092',version:3,name:'Retained campaign'})
 assert.equal((await request('/auth/bootstrap',{token:setupToken,displayName:'Replacement'})).status,409)
 assert.equal((await request('/auth/session',undefined,'session_id=test-only-legacy-cookie')).status,401)
 assert.equal((await request('/auth/magic-link',{email:ownerEmail})).status,202)
 const link=new URL(deliveries[0].content.find(p=>p.type==='text/plain').value.match(/https:\/\/[^\s]+/)[0])
 const confirmed=await request('/auth/confirm',{token:link.searchParams.get('token')});assert.equal(confirmed.status,303)
 const cookie=confirmed.headers.get('set-cookie').split(';')[0]
 const session=await(await request('/api/session',undefined,cookie)).json();assert.equal(session.operator.id,old.id);assert.equal(session.workspace.name,'Existing workspace')
 assert.deepEqual(await db.prepare('SELECT id,version,name FROM campaigns').first(),{id:'00000000000000000000000092',version:3,name:'Retained campaign'})
 assert.deepEqual(await db.prepare('SELECT timezone,currency,version FROM workspace').first(),{timezone:'Australia/Brisbane',currency:'AUD',version:7})
},true,true))
