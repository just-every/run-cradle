import './auth-support.mjs'
import {fixture} from './auth-support.mjs'
import {createFixtureAuth} from './helpers/base-fixture-auth.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'

const origin='http://127.0.0.1:4212'
const configuration=()=>({appOrigin:origin,sessionSecret:'test-only-secret-with-at-least-32-characters',mode:'development'})
const request=(cookie,csrf,foreign=false)=>new Request(origin+'/auth/sign-out',{method:'POST',headers:{host:new URL(origin).host,origin:foreign?'https://foreign.example.test':origin,...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})}})

test('real Base outbox sign-in creates hashed credentials and sign-out immediately revokes the product session',async()=>{
 const f=fixture();try{
  const auth=await createFixtureAuth(f.db,configuration(),f.id),session=await auth.signIn()
  const read=request(session.cookie),current=await auth.current(read)
  assert.equal(current.principal.id,f.id)
  const token=session.cookie.slice(session.cookie.indexOf('=')+1)
  assert.ok(!JSON.stringify(f.sql.prepare('SELECT * FROM oa_sessions').all()).includes(token))
  assert.ok(f.sql.prepare('SELECT token_hash FROM authority_sessions').get().token_hash.startsWith('base:'))
  await assert.rejects(auth.signOut(request(session.cookie)))
  await auth.signOut(request(session.cookie,session.csrf))
  assert.equal(await auth.current(read),undefined)
 }finally{f.close()}
})
test('product CSRF survives reads, binds each Base session and refuses a foreign origin',async()=>{
 const f=fixture();try{
  const auth=await createFixtureAuth(f.db,configuration(),f.id),first=await auth.signIn(),second=await auth.signIn()
  assert.equal(await auth.csrf(request(first.cookie)),first.csrf)
  assert.notEqual(first.csrf,second.csrf)
  await auth.requireCsrf(request(first.cookie,first.csrf))
  await assert.rejects(auth.requireCsrf(request(second.cookie,first.csrf)))
  await assert.rejects(auth.requireCsrf(request(first.cookie,first.csrf,true)))
  f.sql.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=?').run(Date.now(),first.baseId)
  await assert.rejects(auth.requireCsrf(request(first.cookie,first.csrf)))
 }finally{f.close()}
})
test('current Base sessions still require the current product identity and authentication epoch',async()=>{
 const f=fixture();try{
  const auth=await createFixtureAuth(f.db,configuration(),f.id),session=await auth.signIn(),read=request(session.cookie)
  f.sql.prepare('UPDATE authority_principals SET authentication_epoch=authentication_epoch+1 WHERE id=?').run(f.id)
  assert.equal(await auth.current(read),undefined)
  const replacement=await auth.signIn()
  f.sql.prepare("UPDATE authority_principals SET state='removed' WHERE id=?").run(f.id)
  assert.equal(await auth.current(request(replacement.cookie)),undefined)
 }finally{f.close()}
})
