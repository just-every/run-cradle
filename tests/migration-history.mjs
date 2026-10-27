import {baseHttpSession} from './helpers/base-http-session.mjs'
import {migrationConfiguration,migrationInventory,migrationGroups} from '../scripts/migration-groups.mjs'
import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { emittedRuntime } from './helpers/emitted-runtime.mjs'
import {emittedMailRuntime} from './helpers/emitted-mail-runtime.mjs'
const { createSampleDataRepository } = await import('../src/core/features/sample-data/repository.ts')
const { prepareLaunchSetup } = await import('../src/apps/launch/setup.server.ts')
import test from 'node:test'

test('prior portfolio IDs and history survive all forward migrations and accept a versioned change',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'cradle-history-'))
  let port=Number(process.env.CRADLE_TEST_PORT ?? 0),origin=`http://127.0.0.1:${port}`
  let runtime,mail
  const bindings={APP_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'maya@northstar.example',MAIL_FROM:'auth@localhost.test',SESSION_SECRET:'test-only-session-secret-32-characters-long'}
  const cli=args=>{const result=spawnSync('pnpm',['exec','wrangler',...args],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(result.status,0,result.stderr||result.stdout)}
  try {
    const initial=path.join(directory,'initial');await mkdir(initial)
    for(const file of ['0000_foundation.sql','0001_portfolio_spine.sql'])await copyFile('migrations/core/'+file,path.join(initial,file))
    const config=path.join(directory,'wrangler.json')
    await writeFile(config,JSON.stringify({name:'cradle',compatibility_date:'2026-09-08',d1_databases:[{binding:'DB',database_name:'cradle',database_id:'00000000-0000-0000-0000-000000000000',migrations_dir:initial}]}))
    cli(['d1','migrations','apply','cradle','--config',config,'--local','--persist-to',directory])
    ;({runtime,mail,port,origin}=await emittedMailRuntime(directory,port,bindings))
    Object.assign(bindings,{APP_ORIGIN:origin},mail.bindings)
    let db=await runtime.getD1Database('DB')
    const fixture=JSON.parse(await readFile('sample-data/cradle.json','utf8'))
    await createSampleDataRepository({$client:db}).install({...fixture,comments:[]})
    const snapshot=async()=>({campaigns:(await db.prepare('SELECT * FROM campaigns ORDER BY id').all()).results,activity:(await db.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results,operators:(await db.prepare('SELECT id,name,email FROM operators ORDER BY id').all()).results})
    const before=await snapshot(),oldLedger=(await db.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results
    assert.ok(oldLedger.length>0)
    await runtime.dispose();runtime=null
    cli(['d1','migrations','apply','cradle','--local','--persist-to',directory])
    const owner=fixture.operators.slice().sort((a,b)=>a.id.localeCompare(b.id))[0].id
    for(const group of migrationGroups.filter(group=>group!=='core')){const config=path.join(directory,group+'.json');await writeFile(config,JSON.stringify(migrationConfiguration(group)));cli(['d1','migrations','apply','cradle','--config',config,'--local','--persist-to',directory])}
    runtime=await emittedRuntime(directory,port,bindings,mail.fetch);db=await runtime.getD1Database('DB')
    const after=await snapshot()
    for(const table of Object.keys(before)){assert.equal(after[table].length,before[table].length);for(const row of before[table]){const retained=after[table].find(value=>value.id===row.id);assert.ok(retained);assert.deepEqual(Object.fromEntries(Object.keys(row).map(key=>[key,retained[key]])),row)}}
    const ledger=(await db.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results
    assert.deepEqual(ledger.slice(0,oldLedger.length),oldLedger,'Applied ledger rows retain their IDs, names and timestamps')
    assert.deepEqual(ledger.map(row=>row.name),migrationInventory().map(m=>m.name),'Every supplied forward migration is applied once in declaration order')
    await db.batch(await prepareLaunchSetup(db,owner))
    await runtime.ready
    const {cookie,csrfToken}=await baseHttpSession(origin)
    const campaign=before.campaigns[0]
    const changed=await fetch(origin+'/api/campaigns/'+campaign.id,{method:'PATCH',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({version:campaign.version,name:'Prior portfolio after rendering transition'})})
    assert.equal(changed.status,200,await changed.clone().text())
    const current=await db.prepare('SELECT id,name,version FROM campaigns WHERE id=?').bind(campaign.id).first()
    assert.deepEqual(current,{id:campaign.id,name:'Prior portfolio after rendering transition',version:campaign.version+1})
    const oldActivity=(await db.prepare('SELECT * FROM activity_entries ORDER BY id').all()).results
    for(const row of before.activity){const retained=oldActivity.find(value=>value.id===row.id);assert.ok(retained);assert.deepEqual(Object.fromEntries(Object.keys(row).map(key=>[key,retained[key]])),row)}
    const report={oldMigrations:oldLedger,newMigrationCount:ledger.length,preservedCampaignIds:before.campaigns.map(row=>row.id),preservedHistoryRows:before.activity.length,current}
    if(process.env.CRADLE_HISTORY_EVIDENCE)await writeFile(process.env.CRADLE_HISTORY_EVIDENCE,JSON.stringify(report,null,2))
    console.log(JSON.stringify(report))
  } finally {try{if(runtime)await runtime.dispose()}finally{await mail?.close();await rm(directory,{recursive:true,force:true})}}
})

test('[ACT-002 COLLAB-001 VIEW-006] an existing Launch comment joins the record thread with its author and deletion authority',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cradle-comment-upgrade-'))
 let runtime,mail,port=0,origin='http://127.0.0.1:0'
 const bindings={APP_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'maya@northstar.example',MAIL_FROM:'auth@localhost.test',SESSION_SECRET:'test-only-session-secret-32-characters-long'}
 const update=migrationInventory().find(m=>m.name.endsWith('_launch_comments_to_record_thread.sql'))
 const cli=args=>{const result=spawnSync('pnpm',['exec','wrangler',...args],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(result.status,0,result.stderr||result.stdout)}
 try{
  const legacy=path.join(directory,'legacy');await mkdir(legacy)
  for(const file of ['0000_foundation.sql','0001_portfolio_spine.sql'])await copyFile('migrations/core/'+file,path.join(legacy,file))
  const legacyConfig=path.join(directory,'legacy.json'),legacyConfiguration=migrationConfiguration('core');legacyConfiguration.d1_databases[0].migrations_dir=legacy;await writeFile(legacyConfig,JSON.stringify(legacyConfiguration))
  cli(['d1','migrations','apply','cradle','--config',legacyConfig,'--local','--persist-to',directory])
  ;({runtime,mail,port,origin}=await emittedMailRuntime(directory,port,bindings));Object.assign(bindings,{APP_ORIGIN:origin},mail.bindings)
  const fixture=JSON.parse(await readFile('sample-data/cradle.json','utf8'))
  await createSampleDataRepository({$client:await runtime.getD1Database('DB')}).install({...fixture,comments:[]})
  await runtime.dispose();runtime=null
  for(const group of migrationGroups){
   const initial=path.join(directory,group);await mkdir(initial)
   for(const migration of migrationInventory([group]).filter(m=>m!==update&&m.name!==update.name))await writeFile(path.join(initial,migration.name),migration.sql)
   const config=path.join(directory,group+'.json'),configuration=migrationConfiguration(group);configuration.d1_databases[0].migrations_dir=initial;await writeFile(config,JSON.stringify(configuration))
   cli(['d1','migrations','apply','cradle','--config',config,'--local','--persist-to',directory])
  }
  runtime=await emittedRuntime(directory,port,bindings,mail.fetch);await runtime.ready
  let db=await runtime.getD1Database('DB')
  const session=await baseHttpSession(origin),{LAUNCH_APP_ID,launchEntities}=await import('../src/apps/launch/contracts.ts'),{createUlid}=await import('../src/core/shared/ids.ts')
  const owner=fixture.operators.slice().sort((a,b)=>a.id.localeCompare(b.id))[0].id
  await db.batch(await prepareLaunchSetup(db,owner))
  const request=(route,body)=>fetch(origin+route,{headers:{cookie:session.cookie,origin,'x-csrf-token':session.csrfToken,...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})})
  const created=await request('/api/v1/commands/launch.campaign.create',{commandId:createUlid(),expected:[],input:{fields:{code:'THREAD-UPGRADE',name:'Prior campaign conversation',ownerId:owner,startDate:'2026-10-01',launchDate:'2026-12-01',objective:'Retain the conversation',statusSummary:'',phase:'Planning',status:'On track',health:50,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}}})
  assert.equal(created.status,200,await created.clone().text());const campaign=(await created.json()).data.value,subject={appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:campaign.id},id=createUlid(),deletedId=createUlid(),at=Date.now()-60000
  await db.batch([id,deletedId].map(comment=>db.prepare('INSERT INTO comments(id,created_at,updated_at,version,campaign_id,author_id,body,deleted_at) VALUES(?,?,?,3,?,?,?,?)').bind(comment,at,at+1000,campaign.id,owner,'A conversation kept across the update',comment===deletedId?at+2000:null)))
  const policy=await db.prepare('SELECT p.* FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(owner,LAUNCH_APP_ID).first(),rules=JSON.parse(policy.rules_json)
  for(const rule of rules)rule.actions=rule.actions.map(action=>action==='comment.add'?'launch.comment.create':action==='comment.delete'?'launch.comment.delete':action)
  const campaignRule=rules.find(rule=>rule.entityId===subject.entityId)
  const deny={...structuredClone(campaignRule),id:createUlid(),effect:'deny',rows:{kind:'condition',fieldId:campaignRule.readableFields[0],op:'eq',value:'A different campaign'},actions:['launch.comment.create','launch.comment.delete']};rules.push(deny)
  await db.prepare('UPDATE authority_policies SET rules_json=? WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
  await runtime.dispose();runtime=null
  await writeFile(path.join(directory,'updates',update.name),update.sql)
  cli(['d1','migrations','apply','cradle','--config',path.join(directory,'updates.json'),'--local','--persist-to',directory])
  const updateFile=path.join(directory,'thread-update.sql');await writeFile(updateFile,update.sql)
  runtime=await emittedRuntime(directory,port,bindings,mail.fetch);await runtime.ready;db=await runtime.getD1Database('DB')
  const thread=await request('/api/v1/comments?'+new URLSearchParams(subject));assert.equal(thread.status,200,await thread.clone().text());const page=(await thread.json()).data,comment=page.items.find(item=>item.id===id)
  assert.equal(page.canAdd,true);assert.equal(comment.author.id,owner);assert.equal(comment.author.kind,'human');assert.equal(comment.authorLabel,'Maya Chen');assert.equal(comment.body,'A conversation kept across the update');assert.equal(comment.createdAt,new Date(at).toISOString());assert.equal(comment.updatedAt,new Date(at+1000).toISOString());assert.equal(comment.version,3);assert.equal(comment.canDelete,true);assert.equal(comment.canEdit,false);assert.deepEqual(comment.mentions,[])
  assert.equal(page.items.find(item=>item.id===deletedId).deletedAt,new Date(at+2000).toISOString())
  const translated=await db.prepare('SELECT rules_json,version FROM authority_policies WHERE id=?').bind(policy.id).first()
  assert.deepEqual(JSON.parse(translated.rules_json),rules.map(rule=>({...rule,actions:[...new Set(rule.actions.map(action=>action==='launch.comment.create'?'comment.add':action==='launch.comment.delete'?'comment.delete':action))]})));assert.equal(translated.version,policy.version+1)
  assert.equal(await db.prepare("SELECT 1 FROM sqlite_master WHERE name='comments'").first(),null)
  const stable=async()=>({comments:(await db.prepare('SELECT * FROM evidence_comments ORDER BY id').all()).results,policies:(await db.prepare('SELECT * FROM authority_policies ORDER BY id').all()).results})
  const before=await stable();await runtime.dispose();runtime=null
  cli(['d1','execute','cradle','--config',path.join(directory,'updates.json'),'--local','--persist-to',directory,'--file',updateFile])
  runtime=await emittedRuntime(directory,port,bindings,mail.fetch);await runtime.ready;db=await runtime.getD1Database('DB');assert.deepEqual(await stable(),before,'Reapplying the update changes no comments or authority')
  const removed=await request('/api/v1/commands/comment.delete',{commandId:createUlid(),input:{subject,id,version:comment.version},expected:[{ref:subject,version:campaign.version}]});assert.equal(removed.status,200,await removed.clone().text())
  const after=(await(await request('/api/v1/comments?'+new URLSearchParams(subject))).json()).data.items.find(item=>item.id===id);assert.equal(after.body,null);assert.ok(after.deletedAt)
 }finally{try{await runtime?.dispose()}finally{await mail?.close();await rm(directory,{recursive:true,force:true})}}
})
