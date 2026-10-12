import test from 'node:test'
import assert from 'node:assert/strict'
import {environment} from './launch-support.mjs'
test('[IMPORT-002 IMPORT-003 IMPORT-004] legacy adapter preserves blanks/custom values and refuses stale whole batch',async()=>{
 const e=await environment();try{const {r,db,ctx,context}=e,c=await e.campaign('MERGE'),custom=await e.commit('custom-field.save',{field:{name:'Market',type:'select',options:['North','South']}}),adapter=r.createLegacyImportAdapter(context,'campaign')
 const prepared=await adapter.prepare(ctx,{code:'MERGE',name:' ',['custom:'+custom.id]:'North'},r.createUlid());assert.equal(prepared.row.operation,'update');const batch=await adapter.prepareBatchStored(ctx,[{...prepared.row,row:2}])
 const permit=e.permit({action:'import.commit'});await e.admission.commit(ctx,{commandId:r.createUlid(),action:'import.commit',appId:r.LAUNCH_APP_ID,canonicalInputHash:'a'.repeat(64),permit,guards:batch.guards,mutations:batch.mutations,audit:batch.audit,events:[],outbox:[],committedResult:{done:true}})
 assert.equal((await db.prepare('SELECT name FROM campaigns WHERE id=?').bind(c.id).first()).name,'Campaign MERGE');assert.equal((await db.prepare('SELECT value_json FROM launch_custom_values WHERE field_id=?').bind(custom.id).first()).value_json,'"North"')
 const unchanged=await adapter.prepare(ctx,{code:'MERGE',name:' ',['custom:'+custom.id]:'North'},r.createUlid());assert.equal(unchanged.row.operation,'unchanged')
 await assert.rejects(()=>adapter.prepare(ctx,{code:'MERGE',['custom:'+custom.id]:'Bad'},r.createUlid()),/Unknown custom field option/)
 await assert.rejects(()=>adapter.prepareStored(ctx,{...prepared.row,row:2}),error=>error.code==='version_conflict')
 const results=await adapter.prepareBatch(ctx,[{id:r.createUlid(),values:{code:'A',name:'New',ownerId:e.actor,startDate:'2026-01-01',launchDate:'2026-10-01',health:'80'}},{id:r.createUlid(),values:{code:'B',health:'101'}}]);assert.ok(results[0].prepared);assert.ok(results[1].error);assert.equal((await db.prepare("SELECT COUNT(*) n FROM campaigns WHERE code IN ('A','B')").first()).n,0)
 }finally{await e.close()}
})
