import { fixture } from './auth-support.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { createFixtureAuth } = await import('./helpers/base-fixture-auth.mjs')
const { createPolicyPort } = await import('../src/domains/authority/policy.server.ts')
const { preparePendingApplication, INSTALLATION_AUTHORITY_APP } = await import('../src/domains/authority/pending-app.server.ts')
const { constructionPolicyEntities } = await import('../src/domains/construction/authority.server.ts')
const { candidateEntityId } = await import('../src/domains/construction/contracts.ts')
const { compileAdmission } = await import('../src/domains/admission/compiler.server.ts')
const { createUlid } = await import('../src/core/shared/ids.ts')
const { digest } = await import('../src/domains/authority/crypto.server.ts')
test('explicit pending app preparation permits source/build/cancel only in that app', async () => {
 const f=fixture()
 try {
  f.sql.exec(readFileSync(new URL('../migrations/core/0300_atomic_admission.sql',import.meta.url),'utf8'))
  const config={appOrigin:'http://127.0.0.1:4212',sessionSecret:'test-only-secret-32-characters-or-more',mode:'development',}
  const auth=await createFixtureAuth(f.db,config)
  const session=await auth.signIn(f.id)
  const current=await auth.current(new Request(config.appOrigin+'/app',{headers:{host:'127.0.0.1:4212',cookie:session.cookie}}))
  const ctx={principal:current.principal,requestId:createUlid(),now:new Date().toISOString(),ingress:'http'}
  const registry={get(_app,id){return constructionPolicyEntities.find(entity=>entity.id===id)}}
  const policy=createPolicyPort(f.db,registry),policyId=createUlid(),appId=createUlid(),now=Date.now()
  const rule={id:createUlid(),principals:[{kind:'human',id:f.id}],entityId:candidateEntityId,rows:{kind:'all',conditions:[]},readableFields:[],writableFields:[],actions:['application.prepare'],effect:'allow',purposes:['read']}
  f.sql.prepare('INSERT INTO authority_policies VALUES(?,?,?,?,?,?,?)').run(policyId,INSTALLATION_AUTHORITY_APP,'Explicit installation authority',JSON.stringify([rule]),1,now,now)
  f.sql.prepare('INSERT INTO authority_memberships VALUES(?,?,?,?,?,?)').run(f.id,INSTALLATION_AUTHORITY_APP,policyId,0,'active',1)
  const input={appId,newCandidateId:createUlid(),installationAppId:INSTALLATION_AUTHORITY_APP}
  const effects=await preparePendingApplication(f.db,policy,ctx,input),hash=await digest(JSON.stringify(input)),commandId=createUlid()
  const permit=await policy.authorize(ctx,{appId:INSTALLATION_AUTHORITY_APP,action:'application.prepare',expected:[],cost:[],inputHash:hash})
  const plan={commandId,action:'application.prepare',appId:INSTALLATION_AUTHORITY_APP,canonicalInputHash:hash,permit,...effects,audit:[],events:[],outbox:[],committedResult:{appId}}
  const compiled=compileAdmission(ctx,plan)
  await f.db.batch(compiled.statements.map(s=>f.db.prepare(s.sql).bind(...s.values)))
  for(const action of ['source.prepare','candidate.build','candidate.cancel'])await policy.authorize(ctx,{appId,action,expected:[],cost:[],inputHash:hash})
  for(const action of ['release.adopt','repair.book','model.generate','source.export','grant.issue'])await assert.rejects(policy.authorize(ctx,{appId,action,expected:[],cost:[],inputHash:hash}))
  await assert.rejects(policy.authorize(ctx,{appId:createUlid(),action:'candidate.build',expected:[],cost:[],inputHash:hash}))
  await assert.rejects(preparePendingApplication(f.db,policy,ctx,input))
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM authority_grants').get().n,0)
 } finally { f.close() }
})
