import './helpers/typescript-loader.mjs'
import {contract} from './contract.mjs'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fork} from 'node:child_process'
import {once} from 'node:events'
import {openImportD1} from './helpers/records-import-d1-runtime.mjs'
import {setup} from './helpers/records-import-harness.mjs'
import {resumeD1Import,readD1PersistedImport,readD1ImportOriginals,undoD1Import} from '../vendor/base/modules/import-kit/src/d1/index.ts'
contract('RECORDS-005 BASE-OPS-003','actual workerd D1 survives process-group SIGKILL after commit and resumes stored job alone',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-import-crash-')),receipt=join(directory,'receipt.json'),childFile=new URL('./helpers/records-import-crash-child.mjs',import.meta.url)
 let child
 try{
  child=fork(childFile,['crash',join(directory,'d1'),receipt],{detached:true,stdio:['ignore','pipe','pipe','ipc'],execArgv:['--import',new URL('./helpers/typescript-loader.mjs',import.meta.url).pathname]});let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk})
  const exit=once(child,'exit'),message=await Promise.race([once(child,'message').then(([v])=>v),exit.then(([code])=>{throw new Error('Crash child exited '+code+': '+stderr)})]);assert.equal(message.committed,1);process.kill(-child.pid,'SIGKILL');assert.equal((await exit)[1],'SIGKILL');child=undefined
  const resumed=fork(childFile,['resume',join(directory,'d1'),receipt],{detached:true,stdio:['ignore','pipe','pipe','ipc'],execArgv:['--import',new URL('./helpers/typescript-loader.mjs',import.meta.url).pathname]});child=resumed;let errors='';resumed.stderr.on('data',chunk=>{errors+=chunk});const [code]=await once(resumed,'exit');child=undefined;assert.equal(code,0,errors)
  const result=JSON.parse(await readFile(receipt+'.result','utf8'));assert.deepEqual(result.normalized,[{name:'1',links:['2']},{name:'2',links:['1']}]);assert.equal(result.provenance,4);assert.equal(result.unique,4);assert.equal(result.state,'undone');assert.equal(result.remainingRows,0);assert.equal(result.retainedOriginalBase64,message.originalBase64);assert.equal(Object.hasOwn(JSON.parse(await readFile(receipt,'utf8')),'originalBase64'),false,'The resume process receives no source bytes')
  const live=await openImportD1(join(directory,'uninterrupted'),true);try{const x=await setup({...live,close:()=>{}});let job=x.job;while(job.state!=='completed')job=await resumeD1Import(job.id,x.context);const read=await readD1PersistedImport(x.context),d=x.r.registry.get(x.appId,x.tableId),records=read.rows.filter(r=>r.targetKind.startsWith('record:')),names=new Map(records.map(r=>[r.targetId,r.value.row[d.fields.get(x.name.id).column]])),normalized=records.map(r=>({name:names.get(r.targetId),links:read.rows.find(l=>l.targetKind.startsWith('link:')&&l.targetId===r.targetId).value.values.map(v=>names.get(v.value))})).sort((a,b)=>a.name.localeCompare(b.name));assert.deepEqual(result.normalized,normalized)}finally{await live.close()}
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,'SIGKILL')}catch{child.kill('SIGKILL')}await once(child,'exit').catch(()=>{})}await rm(directory,{recursive:true,force:true})}
})
contract('RECORDS-005 BASE-SEC-003','actual D1 checks current Base session inside native commit and retains zero checkpoint on denial',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-import-auth-')),live=await openImportD1(directory,true)
 try{
  const x=await setup({...live,close:()=>{}}),time=Date.now(),baseOperator='test-base-import-owner',baseSession='test-base-import-session'
  await live.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,'base-import@example.test','Import owner','owner','active',1,?)").bind(baseOperator,time).run()
  await live.db.prepare('UPDATE cradle_base_operators SET principal_id=? WHERE base_id=?').bind(x.h.owner,baseOperator).run()
  await live.db.prepare("INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at) VALUES(?,'test-only-hash',?,1,'native',?,?)").bind(baseSession,baseOperator,time,time+3600000).run()
  x.h.ctx.principal.baseSessionId=baseSession
  const {importAuthority}=await import('../src/domains/records/base-transfer/authority.server.ts'),authority=await importAuthority(live.db,x.r.policy,x.h.ctx,x.appId),original=x.context.storage.targets
  let revoked=false
  const racing={...original,async read(...args){const result=await original.read(...args);if(!revoked){revoked=true;await live.db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),baseSession).run()}return result}}
  await assert.rejects(resumeD1Import(x.job.id,{...x.context,authorization:{principalId:x.h.owner,predicate:()=>authority},storage:{database:live.db,targets:racing}}),/IMPORT_ATOMIC_GUARD/)
  assert.equal((await live.db.prepare('SELECT checkpoint FROM ik_jobs WHERE id=?').bind(x.job.id).first()).checkpoint,0);assert.equal((await original.list(live.db,x.appId)).length,0)
 }finally{await live.close();await rm(directory,{recursive:true,force:true})}
})

contract('RECORDS-005 BASE-SEC-003 BASE-INPUT-001','actual D1 snapshots of every application table prove HTTP preview and limit failures have zero persistent effects',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-import-preview-')),live=await openImportD1(directory,true)
 try{const {assertReadOnlyPreview}=await import('./helpers/records-import-preview-auth.mjs');const snapshot=async()=>{const tables=(await live.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_cf_METADATA' ORDER BY name").all()).results,result=[];for(const table of tables){const rows=(await live.db.prepare('SELECT * FROM '+JSON.stringify(table.name)).all()).results;result.push({schema:table,rows:rows.map(row=>JSON.stringify(row)).sort()})}return JSON.stringify(result)};await assertReadOnlyPreview(live,snapshot)}finally{await live.close();await rm(directory,{recursive:true,force:true})}
})
contract('RECORDS-005 BASE-SEC-003','actual D1 native constraint failure is atomic, revocation stops the next batch, and partial rollback resumes stored mode',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-import-atomic-')),live=await openImportD1(directory,true)
 try{const x=await setup({...live,close:()=>{}}),target=x.context.storage.targets,broken={...target,write(row){return [...target.write(row),{sql:'INSERT INTO record_import_assertions(ok) VALUES(0)'}]}}
  await assert.rejects(resumeD1Import(x.job.id,{...x.context,storage:{database:live.db,targets:broken}}),/CHECK constraint failed/);assert.equal((await target.list(live.db,x.appId)).length,0);assert.equal((await live.db.prepare('SELECT checkpoint FROM ik_jobs WHERE id=?').bind(x.job.id).first()).checkpoint,0)
  let job=await resumeD1Import(x.job.id,x.context);assert.equal(job.checkpoint,1);await live.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),x.h.session).run();await assert.rejects(resumeD1Import(job.id,x.context),/IMPORT_ATOMIC_GUARD/);assert.equal((await target.list(live.db,x.appId)).length,1);assert.equal((await live.db.prepare('SELECT checkpoint FROM ik_jobs WHERE id=?').bind(job.id).first()).checkpoint,1)
  // Test fixture restores its own authority so the separately requested rollback can run.
  await live.db.prepare('UPDATE authority_sessions SET revoked_at=NULL WHERE id=?').bind(x.h.session).run();job=await resumeD1Import(job.id,x.context);assert.equal(job.checkpoint,2)
  const {rollbackD1Import}=await import('../vendor/base/modules/import-kit/src/d1/index.ts');const reverse=await rollbackD1Import(job.id,x.context);assert.equal(reverse.state,'rolling_back');const restarted=await resumeD1Import(job.id,{...x.context});assert.equal(restarted.state,'rolled_back');assert.equal((await target.list(live.db,x.appId)).length,0);assert.equal((await readD1ImportOriginals(job.id,x.context))[0].original.base64,x.bytes.toString('base64'))
 }finally{await live.close();await rm(directory,{recursive:true,force:true})}
})
contract('RECORDS-005','actual D1 same-revision value edit survives stored undo conflict while unaffected reversal stays durable',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cradle-import-edit-')),live=await openImportD1(directory,true)
 try{const x=await setup({...live,close:()=>{}});let job=x.job;while(job.state!=='completed')job=await resumeD1Import(job.id,x.context);const d=x.r.registry.get(x.appId,x.tableId),column=d.fields.get(x.name.id).column;await live.db.prepare(`UPDATE "${d.table.tableId}" SET "${column}"='777' WHERE id=?`).bind(x.ids[0]).run();let failed=false;try{let undo=await undoD1Import(job.id,x.context);while(undo.state!=='undone')undo=await resumeD1Import(job.id,x.context)}catch(error){assert.match(String(error),/NATIVE_EDIT_CONFLICT/);failed=true}assert.equal(failed,true);const value=await live.db.prepare(`SELECT "${column}" value,version FROM "${d.table.tableId}" WHERE id=?`).bind(x.ids[0]).first();assert.deepEqual(value,{value:'777',version:1});assert.equal((await live.db.prepare('SELECT state FROM ik_jobs WHERE id=?').bind(job.id).first()).state,'undoing');await assert.rejects(resumeD1Import(job.id,{...x.context}),/NATIVE_EDIT_CONFLICT/);assert.equal((await readD1ImportOriginals(job.id,x.context))[0].original.base64,x.bytes.toString('base64'))
 }finally{await live.close();await rm(directory,{recursive:true,force:true})}
})
