import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {harness as repairHarness,base,quoted,realAuthority} from './repairs-harness.mjs';
const require=createRequire(import.meta.url),{build}=require('../node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild');
export async function harness(){const h=await repairHarness();await h.db.exec((await readFile('migrations/core/0301_admission_provenance.sql','utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));return h;}
const temp=await mkdtemp(join(tmpdir(),'cradle-authority-regressions-'));
await writeFile(join(temp,'entry.ts'),['src/domains/records/actions.server','src/domains/records/policy.server','src/domains/records/descriptors.server','src/domains/records/service.server','src/domains/records/contracts','src/core/registry/commands','src/domains/authority/policy.server','src/domains/authority/context.server','src/domains/admission/service.server','src/domains/admission/sql.server','src/domains/admission/canonical'].map(p=>`export * from '${resolve(p)}';`).join('\n'));
await build({entryPoints:[join(temp,'entry.ts')],outfile:join(temp,'runtime.mjs'),bundle:true,platform:'node',format:'esm'});
export const modules=await import(join(temp,'runtime.mjs'));
await rm(temp,{recursive:true,force:true});
export async function genericFixture(){
 const h=await harness();await base(h);await realAuthority(h);
 const {r,db,ctx}=h,m=modules,app=r.createUlid(),entity=r.createUlid(),a=r.createUlid(),b=r.createUlid();
 const schema={id:entity,appId:app,label:'Independent grant probe',version:1,createdAt:ctx.now,updatedAt:ctx.now,physicalRevision:'probe-one',fields:[{id:a,label:'Editable name',type:'text',required:true,unique:false},{id:b,label:'Restricted authority note',type:'text',required:true,unique:false}],lifecycle:{states:['active'],initial:'active',transitions:[]}};
 const compiled=m.compileSchema(schema,()=>undefined);for(const sql of compiled.sql)await db.prepare(sql).run();
 await db.prepare('INSERT INTO record_schemas VALUES(?,?,?,?,?,?,?)').bind(entity,app,1,'probe-one',JSON.stringify(schema),ctx.now,ctx.now).run();
 const recordId=r.createUlid(),d=compiled.descriptor;
 await db.prepare(`INSERT INTO "${d.table.tableId}"(id,version,created_at,updated_at,lifecycle,schema_version,"${d.fields.get(a).column}","${d.fields.get(b).column}") VALUES(?,1,?,?,'active',1,'name','original private instruction')`).bind(recordId,ctx.now,ctx.now).run();
 const registry=m.createDescriptorRegistry([d]),recordRegistry=m.createRecordEntityRegistry(registry);
 const entities={get(appId,entityId){if(entityId===m.RECORD_SCHEMA_ENTITY_ID)return {id:entityId,table:'record_schemas',idColumn:'id',appColumn:'app_id',fields:[]};return recordRegistry.get(appId,entityId);}};
 const policy=m.createPolicyPort(db,entities),policyId=r.createUlid();
 const rule=(entityId,fields,actions,extra={})=>({id:r.createUlid(),principals:[{id:ctx.principal.id,kind:'human'}],entityId,rows:{kind:'all',conditions:[]},readableFields:fields,writableFields:fields,actions,effect:'allow',...extra});
 const setRules=async rules=>db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policyId).run();
 await db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(policyId,app,'Independent probe policy','[]',Date.now(),Date.now()).run();
 await db.prepare('INSERT INTO authority_memberships(principal_id,app_id,policy_id) VALUES(?,?,?)').bind(ctx.principal.id,app,policyId).run();
 const admission=m.createAdmissionService(db,m.createReplayAccess(db,policy,entities));
 const records=m.createRecordServices(db,registry,policy,'gate-secret-at-least-thirty-two-bytes',undefined,undefined,async()=>({guards:[],mutations:[]}));
 const commands=m.createCommandRegistry(admission);m.registerRecordActions(commands,{...records,deleteEffects:async()=>({erasureJobId:r.createUlid(),guards:[],mutations:[]})});
 return {h,m,app,entity,a,b,recordId,d,rule,setRules,policy,admission,records,commands,ref:{appId:app,entityId:entity,recordId}};
}

export async function booked(h){const b=await base(h),q=await quoted(h,b);const {r,run,ref}=h;
 await run('repair.select-quote',{quoteId:q.quote},[ref('quotes',q.quote),ref('workOrders',q.work)]);
 await run('repair.record-slot-agreement',{quoteId:q.quote,slot:{start:q.slot.start,end:q.slot.end},timezone:'Australia/Brisbane',evidence:[b.ev]},[ref('quotes',q.quote)]);
 const booking=await run('repair.book-visit',{quoteId:q.quote,slot:{start:q.slot.start,end:q.slot.end},connectionId:r.createUlid(),approvalId:null},[ref('quotes',q.quote),ref('workOrders',q.work)]);
 await h.db.prepare("UPDATE test_effects SET state='confirmed',contractor=1,version=version+1 WHERE id=?").bind(booking.value.attemptId).run();
 await run('repair.reconcile-effect',{kind:'visit',id:booking.value.visitId},[ref('visits',booking.value.visitId)]);
 return {b,q,booking};
}

