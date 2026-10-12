import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {createNativeImportTarget} from '../src/domains/records/base-transfer/target.server.ts'
import {importAuthority} from '../src/domains/records/base-transfer/authority.server.ts'
import {nativeSource,mappingVersion} from '../src/domains/records/base-transfer/storage.server.ts'
import {createD1ImportJob,planD1Import,resumeD1Import,undoD1Import,readD1ImportOriginals,readD1PersistedImport,sha256} from '../vendor/base/modules/import-kit/src/d1/index.ts'
import {recordLabel} from '../src/ui/records/record-label.ts'
import {compileFilter} from '../src/domains/authority/scope.server.ts'
import {createRecordEntityRegistry} from '../src/domains/records/policy.server.ts'
import {fieldSchema} from '../src/domains/records/validators.ts'
import {setup,field} from './helpers/records-import-harness.mjs'
contract('RECORDS-005','native kit bounded rows and cyclic MANY edges reconcile, undo and retain exact original bytes',async()=>{const x=await setup(),{h,r,ids,appId,tableId,name,relation,context,bytes}=x;try{
 let job=await resumeD1Import(x.job.id,context);assert.equal(job.checkpoint,1);assert.equal(job.state,'applying')
 while(job.state!=='completed')job=await resumeD1Import(job.id,context)
 const read=await readD1PersistedImport(context);assert.equal(read.rows.length,4);assert.equal(read.provenance.length,4)
 const scope=await r.policy.scope(h.ctx,{appId,entityId:tableId,purpose:'read'}),record=await r.services.reader.record(h.ctx,scope,{appId,entityId:tableId,recordId:ids[0]})
 assert.equal(recordLabel(record,r.registry.get(appId,tableId).schema),'1');assert.equal(record.fields[relation.id].value[0].recordId,ids[1])
 assert.equal((await h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 let undo=await undoD1Import(job.id,context);while(undo.state!=='undone')undo=await resumeD1Import(job.id,context)
 assert.equal((await readD1PersistedImport(context)).rows.length,0);assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_schemas').first()).n,1)
 assert.equal(Buffer.from((await readD1ImportOriginals(job.id,context))[0].original.base64,'base64').equals(bytes),true)
 }finally{h.close()}})
contract('RECORDS-005 BASE-SEC-003','same-revision edit and revoked-session publication preserve native edits and checkpoint',async()=>{const x=await setup();try{
 let job=x.job;while(job.state!=='completed')job=await resumeD1Import(job.id,x.context)
 const d=x.r.registry.get(x.appId,x.tableId);await x.h.db.prepare(`UPDATE "${d.table.tableId}" SET "${d.fields.get(x.name.id).column}"='999' WHERE id=?`).bind(x.ids[0]).run()
 let conflict=false;try{let u=await undoD1Import(job.id,x.context);while(u.state!=='undone')u=await resumeD1Import(job.id,x.context)}catch(e){assert.match(String(e),/NATIVE_EDIT_CONFLICT/);conflict=true}assert.equal(conflict,true)
 assert.equal((await x.h.db.prepare(`SELECT "${d.fields.get(x.name.id).column}" value FROM "${d.table.tableId}" WHERE id=?`).bind(x.ids[0]).first()).value,'999')
 await x.h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),x.h.session).run();await assert.rejects(resumeD1Import(job.id,x.context),/IMPORT_ATOMIC_GUARD/)
 }finally{x.h.close()}})
contract('RECORDS-005 RECORDS-001','MANY discovery never enables scalar policy filters; primary masking and 10000 options',()=>{
 const f=field('Choice','select');f.options=Array.from({length:10000},(_,i)=>({id:createUlid(),label:String(i)}));assert.equal(fieldSchema.parse(f).options.length,10000);const spaced={...f,options:[{id:createUlid(),label:' A '},{id:createUlid(),label:'A'}]};assert.deepEqual(fieldSchema.parse(spaced).options.map(o=>o.label),[' A ','A'])
 const schema={fields:[field('First'),field('Later')]},record={fields:{[schema.fields[1].id]:{state:'value',value:'Do not fall through'}}};assert.equal(recordLabel(record,schema),'Record without a title')
 schema.primaryFieldId=schema.fields[1].id;record.fields[schema.primaryFieldId]={state:'redacted',reason:'policy'};assert.equal(recordLabel(record,schema),'Record without a title')
 assert.throws(()=>compileFilter({kind:'condition',fieldId:'x',op:'empty'},{id:'e',table:'t',idColumn:'id',fields:[{id:'x',column:'missing',type:'opaque',nullable:true,relationDiscoverable:true}]},new Date().toISOString()),/Policy filter/)
})
contract('RECORDS-005 BASE-SEC-003','persisted MANY policy hides restricted target rows and fields and rejects cross-base/missing membership',async()=>{const x=await setup();try{
 let job=x.job;while(job.state!=='completed')job=await resumeD1Import(job.id,x.context)
 const policy=await x.h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(x.appId).first(),original=JSON.parse(policy.rules_json),ref={appId:x.appId,entityId:x.tableId,recordId:x.ids[0]},read=async()=>x.r.services.reader.record(x.h.ctx,await x.r.policy.scope(x.h.ctx,{appId:x.appId,entityId:x.tableId,purpose:'read'}),ref)
 assert.equal((await read()).fields[x.relation.id].value.length,1)
 const restricted=structuredClone(original);restricted.find(r=>r.entityId===x.tableId).rows={kind:'condition',fieldId:x.name.id,op:'eq',value:'1'}
 await x.h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(restricted),policy.id).run();assert.deepEqual((await read()).fields[x.relation.id].value,[])
 const denied=structuredClone(original);denied.find(r=>r.entityId===x.tableId).readableFields=[x.name.id]
 await x.h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(denied),policy.id).run();assert.equal((await read()).fields[x.relation.id].state,'redacted')
 await assert.rejects(x.r.policy.scope(x.h.ctx,{appId:createUlid(),entityId:x.tableId,purpose:'read'}),/permit|authority/i)
 await x.h.db.prepare('DELETE FROM authority_memberships WHERE app_id=?').bind(x.appId).run();await assert.rejects(read(),/permit|authority/i)
 }finally{x.h.close()}})
contract('RECORDS-005','native SQL failure and revoke after preflight are atomic; partial rollback resumes stored mode',async()=>{const x=await setup();try{
 const original=x.context.storage.targets,broken={...original,write(row){return [...original.write(row),{sql:'INSERT INTO native_import_missing_table VALUES(1)'}]}}
 await assert.rejects(resumeD1Import(x.job.id,{...x.context,storage:{...x.context.storage,targets:broken}}),/no such table/)
 assert.equal((await x.h.db.prepare('SELECT checkpoint FROM ik_jobs WHERE id=?').bind(x.job.id).first()).checkpoint,0)
 assert.equal((await original.list(x.h.db,x.appId)).length,0)
 let job=await resumeD1Import(x.job.id,x.context);assert.equal(job.checkpoint,1)
 const {rollbackD1Import}=await import('../vendor/base/modules/import-kit/src/d1/index.ts');let reverse=await rollbackD1Import(job.id,x.context);while(reverse.state!=='rolled_back')reverse=await resumeD1Import(job.id,x.context)
 assert.equal((await original.list(x.h.db,x.appId)).length,0)
 assert.equal(Buffer.from((await readD1ImportOriginals(job.id,x.context))[0].original.base64,'base64').equals(x.bytes),true)
 }finally{x.h.close()}
 const y=await setup();try{const original=y.context.storage.targets,racing={...original,write(row){y.h.sql.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').run(Date.now(),y.h.session);return original.write(row)}};await assert.rejects(resumeD1Import(y.job.id,{...y.context,storage:{...y.context.storage,targets:racing}}),/IMPORT_ATOMIC_GUARD/);assert.equal((await y.h.db.prepare('SELECT checkpoint FROM ik_jobs WHERE id=?').bind(y.job.id).first()).checkpoint,0);assert.equal((await original.list(y.h.db,y.appId)).length,0)}finally{y.h.close()}})
contract('RECORDS-005 BASE-INPUT-001','native cell bounds count Unicode code points without changing ASCII limits',async()=>{const {validateCell}=await import('../src/domains/records/validators.ts');const f=field('Text');assert.equal([...validateCell(f,'😀'.repeat(100000))].length,100000);assert.throws(()=>validateCell(f,'😀'.repeat(100001)),/100000/);assert.throws(()=>validateCell(f,'a'.repeat(100001)),/100000/)})
contract('RECORDS-005 RECORDS-002','manual MANY migration preserves join values and includes them in restricted recovery',async()=>{const x=await setup();try{let job=x.job;while(job.state!=='completed')job=await resumeD1Import(job.id,x.context);const draft=await x.r.manual.read(x.h.ctx,x.appId);draft.tables[0].label='Renamed nodes';const p=await x.r.manual.preview(x.h.ctx,draft),adopt=(await x.r.manual.adopt(x.h.ctx,createUlid(),p.id)).result.value,live=await x.h.runtime();assert.equal(live.registry.get(x.appId,x.tableId).schema.primaryFieldId,x.name.id);const recovery=await live.manual.recovery(x.h.ctx,adopt.releaseId);assert.match(recovery.tables[0].csv,new RegExp(x.ids[1]));const scope=await live.policy.scope(x.h.ctx,{appId:x.appId,entityId:x.tableId,purpose:'read'});assert.equal((await live.services.reader.record(x.h.ctx,scope,{appId:x.appId,entityId:x.tableId,recordId:x.ids[0]})).fields[x.relation.id].value[0].recordId,x.ids[1]);assert.equal((await x.h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)}finally{x.h.close()}})
contract('RECORDS-005 BASE-SEC-003','inverse sections use one canonical edge and persisted policy restricts incoming identities',async()=>{const x=await setup();try{let job=x.job;while(job.state!=='completed')job=await resumeD1Import(job.id,x.context);const draft=await x.r.manual.read(x.h.ctx,x.appId);draft.tables[0].incomingRelations=[{id:createUlid(),label:'Incoming nodes',sourceEntityId:x.tableId,sourceFieldId:x.relation.id}];const p=await x.r.manual.preview(x.h.ctx,draft);await x.r.manual.adopt(x.h.ctx,createUlid(),p.id);const live=await x.h.runtime(),{readIncomingRelations}=await import('../src/domains/records/incoming.server.ts'),scope=await live.policy.scope(x.h.ctx,{appId:x.appId,entityId:x.tableId,purpose:'read'}),ref={appId:x.appId,entityId:x.tableId,recordId:x.ids[0]};const incoming=await readIncomingRelations(x.h.db,live.registry,live.policy,live.services.reader.query,x.h.ctx,scope,ref);assert.equal(incoming[0].page.items[0].id,x.ids[1]);const row=await x.h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(x.appId).first(),rules=JSON.parse(row.rules_json);rules.find(r=>r.entityId===x.tableId).rows={kind:'condition',fieldId:x.name.id,op:'eq',value:'1'};await x.h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),row.id).run();const restricted=await live.policy.scope(x.h.ctx,{appId:x.appId,entityId:x.tableId,purpose:'read'});assert.equal((await readIncomingRelations(x.h.db,live.registry,live.policy,live.services.reader.query,x.h.ctx,restricted,ref))[0].page.items.length,0)}finally{x.h.close()}})
contract('RECORDS-005 RECORDS-001','ONE cyclic links use native scalar FK storage, preserve self edits, and reverse links before rows',async()=>{const x=await setup(undefined,'one');try{let job=x.job;while(job.state!=='completed')job=await resumeD1Import(job.id,x.context);const d=x.r.registry.get(x.appId,x.tableId),storage=d.fields.get(x.relation.id);assert.equal(storage.join,undefined);assert.equal((await x.h.db.prepare(`SELECT "${storage.column}" target FROM "${d.table.tableId}" WHERE id=?`).bind(x.ids[0]).first()).target,x.ids[1]);await x.h.db.prepare(`UPDATE "${d.table.tableId}" SET "${storage.column}"=? WHERE id=?`).bind(x.ids[0],x.ids[0]).run();let conflict=false;try{let undo=await undoD1Import(job.id,x.context);while(undo.state!=='undone')undo=await resumeD1Import(job.id,x.context)}catch(e){assert.match(String(e),/NATIVE_EDIT_CONFLICT/);conflict=true}assert.equal(conflict,true);assert.equal((await x.h.db.prepare(`SELECT "${storage.column}" target FROM "${d.table.tableId}" WHERE id=?`).bind(x.ids[0]).first()).target,x.ids[0]);assert.equal((await x.h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)}finally{x.h.close()}})
contract('RECORDS-005','native set readback preserves wide null snapshots and batches relation reads independently of field count',async()=>{
 const h=await harness();try{const appId=createUlid(),entityId=createUlid(),scalar=Array.from({length:40},(_,i)=>field('Value '+i)),relations=Array.from({length:40},(_,i)=>({...field('Relation '+i,'relation'),relation:{ownerAppId:appId,entityId,cardinality:'many',onDelete:'restrict'}})),{r}=await h.create({appId,name:'Wide set',tables:[{id:entityId,label:'Wide',primaryFieldId:scalar[0].id,fields:[...scalar,...relations]}]}),d=r.registry.get(appId,entityId),target=createNativeImportTarget(r.registry),id=createUlid(),row=Object.fromEntries(d.table.writableColumnIds.map(c=>[c,null]));Object.assign(row,{id,version:1,created_at:h.ctx.now,updated_at:h.ctx.now,lifecycle:'active',schema_version:1});row[d.fields.get(scalar[0].id).column]='Wide';const expected={destination:appId,targetKind:'record:'+entityId,targetId:id,value:{row},revision:'wide-revision'};await h.db.batch(target.write(expected).map(s=>h.db.prepare(s.sql).bind(...s.params)))
 let queries=0;const counted={prepare(sql){queries++;return h.db.prepare(sql)},batch:h.db.batch.bind(h.db)},read=await target.list(counted,appId);assert.deepEqual(read,[expected]);assert.ok(queries<=2,'A set read must not query separately for every relation field')
 const guards=target.matchesMany(read,appId);for(const guard of guards)assert.ok(await h.db.prepare('SELECT 1 WHERE '+guard.sql).bind(...guard.params).first());await h.db.prepare(`UPDATE "${d.table.tableId}" SET "${d.fields.get(scalar[39].id).column}"='Changed without revision' WHERE id=?`).bind(id).run();assert.equal((await Promise.all(guards.map(g=>h.db.prepare('SELECT 1 WHERE '+g.sql).bind(...g.params).first()))).every(Boolean),false)
 }finally{h.close()}
})
