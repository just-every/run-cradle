import './auth-support.mjs'
import {fixture} from './auth-support.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const {createFixtureAuth}=await import('./helpers/base-fixture-auth.mjs')
const {createPolicyPort}=await import('../src/domains/authority/policy.server.ts')
const {revalidateReservationPermit}=await import('../src/domains/authority/reservation-binding.server.ts')
const {prepareBoundSettlement}=await import('../src/domains/authority/settlement.server.ts')
const {compileAdmission}=await import('../src/domains/admission/compiler.server.ts')
const {createReplayAccess}=await import('../src/domains/authority/context.server.ts')
const {createUlid}=await import('../src/core/shared/ids.ts')
const {digest}=await import('../src/domains/authority/crypto.server.ts')
test('prepared effect reservation is reused across restart, revoked writes remain readable, exact settlement is once',async()=>{
 const f=fixture();try{
 f.sql.exec(readFileSync(new URL('../migrations/core/0300_atomic_admission.sql',import.meta.url),'utf8'))
 const app=createUlid(),entity=createUlid(),field=createUlid(),policyId=createUlid(),grant=createUlid(),record=createUlid(),connection=createUlid(),attempt=createUlid(),command=createUlid()
 f.sql.exec('CREATE TABLE bound_records(id TEXT PRIMARY KEY,label TEXT,version INTEGER)');f.sql.prepare('INSERT INTO bound_records VALUES(?,?,1)').run(record,'Repair')
 const registry={get(a,e){return a===app&&e===entity?{id:entity,table:'bound_records',idColumn:'id',fields:[{id:field,column:'label',type:'text',nullable:false}]}:undefined}}
 const config={appOrigin:'http://127.0.0.1:4212',sessionSecret:'test-only-secret-32-characters-or-more',mode:'development',},auth=await createFixtureAuth(f.db,config)
 const session=await auth.signIn(f.id),authenticated=await auth.current(new Request(config.appOrigin+'/app',{headers:{host:'127.0.0.1:4212',cookie:session.cookie}}))
 const ctx={principal:authenticated.principal,requestId:createUlid(),now:new Date().toISOString(),ingress:'http'},now=Date.now(),start=new Date(now-1000).toISOString(),end=new Date(now+3600000).toISOString()
 const rules=[{id:policyId,principals:[{kind:'human',id:f.id}],entityId:entity,rows:{kind:'all',conditions:[]},readableFields:[field],writableFields:[field],actions:['repair.book','execution.read','execution.reconcile'],purposes:['read','provider_context'],effect:'allow'}]
 f.sql.prepare('INSERT INTO authority_policies VALUES(?,?,?,?,?,?,?)').run(policyId,app,'Repairs',JSON.stringify(rules),1,now,now);f.sql.prepare('INSERT INTO authority_memberships VALUES(?,?,?,?,?,?)').run(f.id,app,policyId,0,'active',1)
 const spec={delegate:{kind:'human',id:f.id},appId:app,actions:['repair.book'],scope:[{entityId:entity,recordIds:[record]}],allowedTransitions:[],perAction:[{minor:'100',currency:'AUD',scale:2}],period:{startsAt:start,endsAt:end,ceiling:[{minor:'100',currency:'AUD',scale:2}],modelCalls:0,wallSeconds:0},providerScopes:[{connectionId:connection,fields:[field],purposes:['repair.book']}],startsAt:start,expiresAt:end,decisionRules:[]}
 f.sql.prepare('INSERT INTO authority_grants(id,issuer_id,delegate_id,app_id,spec_json,impact_hash,state,version,starts_at,expires_at,created_at,updated_at,issuer_epoch,delegate_epoch) VALUES(?,?,?,?,?,?,\'active\',1,?,?,?,?,1,1)').run(grant,f.id,f.id,app,JSON.stringify(spec),'impact',now-1000,now+3600000,now,now)
 f.sql.prepare('INSERT INTO authority_budgets VALUES(?,?,?,?,?,?)').run(grant,'money:AUD:2','100','0','0',1)
 const policy=createPolicyPort(f.db,registry),request={appId:app,action:'repair.book',expected:[{ref:{appId:app,entityId:entity,recordId:record},version:1}],cost:[{minor:'70',currency:'AUD',scale:2}],connectionId:connection,purpose:'repair.book',fieldIds:[field],inputHash:await digest('exact-provider-input'),commandId:command,attemptId:attempt,grantId:grant,grantVersion:1}
 await assert.rejects(policy.authorize(ctx,{...request,grantId:undefined,grantVersion:undefined}))
 const permit=await policy.authorize(ctx,request),execute=async(plan)=>{const c=compileAdmission(ctx,plan);await f.db.batch(c.statements.map(s=>f.db.prepare(s.sql).bind(...s.values)))}
 await execute({commandId:command,action:request.action,appId:app,canonicalInputHash:request.inputHash,permit,guards:[],mutations:[],audit:[],events:[],outbox:[],committedResult:{attemptId:attempt,state:'prepared'}})
 const binding={originCommandId:command,attemptId:attempt,reservationIds:permit.reservationIds},fresh=createPolicyPort(f.db,registry)
 const revalidated=await revalidateReservationPermit(fresh,ctx,request,binding);assert.equal(revalidated.reservationMutations.length,0);assert.equal(f.sql.prepare('SELECT reserved FROM authority_budgets').get().reserved,'70')
 await assert.rejects(revalidateReservationPermit(fresh,ctx,request,{...binding,attemptId:createUlid()}));await assert.rejects(revalidateReservationPermit(fresh,ctx,{...request,inputHash:await digest('changed-provider-input')},binding))
 const unknown=await prepareBoundSettlement(f.db,ctx,{...binding,inputHash:request.inputHash},{state:'unknown'});assert.equal(unknown.mutations.length,0)
 f.sql.prepare("UPDATE authority_grants SET state='revoked',version=2 WHERE id=?").run(grant)
 await assert.rejects(revalidateReservationPermit(fresh,ctx,request,binding))
 const access=createReplayAccess(f.db,policy,registry),replay={appId:app,action:'repair.book',actorId:f.id,commandId:command,provenance:{policyVersion:1,grantId:grant,grantVersion:1,subjects:[{ref:request.expected[0].ref,fieldIds:[field]}]}}
 await access.authorizeReplay(ctx,replay)
 const settlement=await prepareBoundSettlement(f.db,ctx,{...binding,inputHash:request.inputHash},{state:'confirmed',actualByUnit:new Map([['money:AUD:2','70']])}),settlePermit=await policy.authorize(ctx,{appId:app,action:'execution.reconcile',expected:request.expected,cost:[],inputHash:request.inputHash})
 await execute({commandId:createUlid(),action:'execution.reconcile',appId:app,canonicalInputHash:await digest('settle'),permit:settlePermit,guards:settlement.guards,mutations:settlement.mutations,audit:[],events:[],outbox:[],committedResult:{state:'confirmed'}})
 assert.deepEqual({...f.sql.prepare('SELECT reserved,consumed FROM authority_budgets').get()},{reserved:'0',consumed:'70'})
 await assert.rejects(prepareBoundSettlement(f.db,ctx,{...binding,inputHash:request.inputHash},{state:'confirmed',actualByUnit:new Map([['money:AUD:2','70']])}))
 f.sql.prepare("UPDATE authority_principals SET state='removed' WHERE id=?").run(f.id);await assert.rejects(access.authorizeReplay(ctx,replay))
 }finally{f.close()}
})
