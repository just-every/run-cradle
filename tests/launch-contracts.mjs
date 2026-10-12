import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{build}=require('../node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild'),{Miniflare,convertV4MiniflareOptions}=require('../node_modules/.pnpm/miniflare@5.20260907.0-alpha/node_modules/miniflare')
test('[CAMP-001 CAMP-003 CAMP-005 VIEW-006 ACT-001 AUTO-002 SET-003] canonical campaign admission, attribution and version-race rollback',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cradle-launch-')),mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-07',d1Databases:{DB:'launch-isolated'}}))
 try {
  await build({entryPoints:['tests/launch-runtime-entry.ts'],outfile:join(dir,'runtime.mjs'),bundle:true,platform:'node',format:'esm'});const r=await import(join(dir,'runtime.mjs')),db=await mf.getD1Database('DB')
  for(const file of ['0000_foundation.sql','0001_portfolio_spine.sql','0100_authority.sql','0200_relational_records.sql','0300_atomic_admission.sql','0700_launch_completion.sql'])await db.exec((await readFile('migrations/core/'+file,'utf8')).replace(/^--.*$/gm,'').replaceAll('\n',' '))
  const actor=r.createUlid(),now=new Date().toISOString(),millis=Date.parse(now)
  await db.prepare('INSERT INTO operators VALUES(?,?,?,1,?,?,1)').bind(actor,millis,millis,'Owner','owner@example.test').run()
  await db.prepare("INSERT OR IGNORE INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(actor,actor,millis,millis).run()
  await db.batch(await r.prepareLaunchSetup(db,actor,millis));await db.batch(await r.prepareLaunchSetup(db,actor,millis))
  for(const [table,count]of [['campaigns',0],['lenses',2],['automations',4],['authority_memberships',1]])assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,count)
  const principal={id:actor,kind:'human',humanId:actor,sessionId:null,credentialId:null,issuedAt:now,expiresAt:'2099-01-01T00:00:00.000Z',authenticationEpoch:1},ctx={principal,requestId:r.createUlid(),now,ingress:'http'}
  const policy={authorize:async(_ctx,req)=>({actor:{id:actor,kind:'human'},action:req.action,appId:r.LAUNCH_APP_ID,grantId:null,grantVersion:null,policyVersion:1,validUntil:principal.expiresAt,guards:[],reservationMutations:[],reservationIds:[]})}
  const context={db,policy,integration:{notification:async()=>{throw Error('unexpected notification')},withdrawCampaign:async()=>{throw Error('unexpected archive')},deleteCampaign:async()=>{throw Error('unexpected deletion')}}},admission=r.createAdmissionService(db,{authorizeReplay:async()=>{}})
  const fields={code:'  TEST  ',name:'Launch',ownerId:actor,startDate:'2026-01-01',launchDate:'2026-10-01',objective:'Launch',statusSummary:'Ready',phase:'Planning',status:'On track',health:75,budgetMinor:100,spendMinor:0,tags:[],customFields:{}}
  const input=r.launchCommandSchema('campaign.create').parse({commandId:r.createUlid(),expected:[],input:{fields}}),created=await r.prepareCampaign(context,ctx,input,'create');await admission.commit(ctx,created)
  const id=created.committedResult.id,row=await db.prepare('SELECT * FROM campaigns WHERE id=?').bind(id).first();assert.equal(row.code,'TEST');assert.equal(row.health_set_by_id,actor)
  assert.ok((await db.prepare('SELECT COUNT(*) AS n FROM activity_entries WHERE campaign_id=? AND actor_id=?').bind(id,actor).first()).n>0)
  const expected=[{ref:{appId:r.LAUNCH_APP_ID,entityId:r.launchEntities.campaign,recordId:id},version:1}],patch=()=>({commandId:r.createUlid(),expected,input:{id,changes:{name:'Updated'}}})
  const p1=await r.prepareCampaign(context,ctx,patch(),'patch'),p2=await r.prepareCampaign(context,ctx,patch(),'patch');await admission.commit(ctx,p1)
  const counts=async()=>Promise.all(['activity_entries','admission_audit','admission_events'].map(async t=>(await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n)),before=await counts();await assert.rejects(admission.commit(ctx,p2));assert.deepEqual(await counts(),before)
  assert.equal((await db.prepare('SELECT name,version FROM campaigns WHERE id=?').bind(id).first()).version,2)
  await assert.rejects(r.prepareCampaign(context,ctx,{commandId:r.createUlid(),expected:[],input:{fields:{...fields,code:'BAD',health:101}}},'create'))
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM campaigns').first()).n,1)
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true})}
})
