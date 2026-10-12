import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {undoSetup,undoSqlite} from './helpers/records-undo-harness.mjs'
import {add} from './helpers/records-manual-harness.mjs'
import {importAuthority} from '../src/domains/records/base-transfer/authority.server.ts'
import {resumeD1Import,undoD1Import} from '../vendor/base/modules/import-kit/src/d1/index.ts'

async function snapshot(db){const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_cf_METADATA' ORDER BY name").all()).results,result=[];for(const table of tables)result.push([table.name,(await db.prepare('SELECT * FROM "'+table.name.replaceAll('"','""')+'"').all()).results.map(row=>JSON.stringify(row)).sort()]);return JSON.stringify(result)}
for(const race of ['scalar-version','scalar-same-version','link','new-incoming','native-revoke','base-revoke'])contract('RECORDS-005 BASE-SEC-003',`${race} after preserved classification rejects the whole native, report, provenance, source, original and fence publication`,async()=>{
 const x=await undoSetup({storage:undoSqlite(),direct:true,count:3,batchSize:20})
 try{
  let job=x.job;while(job.state!=='completed')job=await resumeD1Import(job.id,x.context)
  if(race==='base-revoke'){
   const now=Date.now();await x.h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES('undo-test-base-owner','undo-base@example.test','Undo owner','owner','active',1,?)").bind(now).run();await x.h.db.prepare("UPDATE cradle_base_operators SET principal_id=? WHERE base_id='undo-test-base-owner'").bind(x.h.owner).run();await x.h.db.prepare("INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at) VALUES('undo-test-base-session','fixture-only','undo-test-base-owner',1,'native',?,?)").bind(now,now+3600000).run();x.h.ctx.principal.baseSessionId='undo-test-base-session';const authority=await importAuthority(x.h.db,x.r.policy,x.h.ctx,x.appId);x.context.authorization.predicate=()=>authority
  }
  // Conflict-only publication must be fenced too: every imported scalar has
  // changed, so no successful native row deletion is needed to detect revocation.
  if(race.endsWith('revoke'))await x.h.db.prepare(`UPDATE "${x.descriptor.table.tableId}" SET "${x.descriptor.fields.get(x.table.fields['column-1']).column}"='Preserved edit'`).run()
  const target=x.context.storage.targets;let before,called=0
  const racing={...target,async preparePreservedUndo(...args){const prepared=await target.preparePreservedUndo(...args);called++
   const table='"'+x.descriptor.table.tableId+'"',column='"'+x.descriptor.fields.get(x.table.fields['column-1']).column+'"'
   if(race==='scalar-version')await x.h.db.prepare(`UPDATE ${table} SET ${column}='Raced edit',version=version+1 WHERE id=?`).bind(x.ids[0]).run()
   if(race==='scalar-same-version')await x.h.db.prepare(`UPDATE ${table} SET ${column}='Same version raced edit' WHERE id=?`).bind(x.ids[0]).run()
   if(race==='link'){const join=x.descriptor.fields.get(x.table.fields['column-2']).join.table.tableId;await x.h.db.prepare(`UPDATE "${join}" SET value=? WHERE record_id=?`).bind(x.ids[2],x.ids[0]).run()}
   if(race==='new-incoming')await add(x.h,x.r,x.descriptor.schema,{[x.table.fields['column-1']]:'Race created',[x.table.fields['column-2']]:[{appId:x.appId,entityId:x.table.entityId,recordId:x.ids[0]}]})
   if(race==='native-revoke')await x.h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),x.h.session).run()
   if(race==='base-revoke')await x.h.db.prepare("UPDATE oa_sessions SET revoked_at=? WHERE id='undo-test-base-session'").bind(Date.now()).run()
   before=await snapshot(x.h.db);return prepared
  }}
  await assert.rejects(undoD1Import(job.id,{...x.context,storage:{database:x.h.db,targets:racing}}),/IMPORT_ATOMIC_GUARD/)
  assert.equal(called,1);assert.equal(await snapshot(x.h.db),before)
  assert.equal((await x.h.db.prepare('SELECT COUNT(*) n FROM ik_provenance WHERE job_id=? AND reversed=1').bind(job.id).first()).n,0)
 }finally{x.h.close()}
})
