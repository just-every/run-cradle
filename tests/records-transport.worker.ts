// Isolated test Worker: deterministic policy fixture, never mounted by the product.
import { createCommandRegistry } from '../src/core/registry/commands';
import { createCommandHttp } from '../src/core/registry/http';
import { createMcpTransport } from '../src/core/registry/mcp';
import { compileAdmission } from '../src/domains/admission/compiler.server';
import { createAdmissionService } from '../src/domains/admission/service.server';
import { AdmissionError } from '../src/domains/admission/errors';
import { trustedPredicate } from '../src/domains/admission/sql.server';
import { compileSchema,createDescriptorRegistry } from '../src/domains/records/descriptors.server';
import { createRecordServices } from '../src/domains/records/service.server';
import { registerRecordActions } from '../src/domains/records/actions.server';
import type { PolicyPort,RequestContext } from '../src/domains/authority/ports';
const id=(n:number)=>String(n).padStart(26,'0'),appId=id(10),entityId=id(11),fieldId=id(12),actorId=id(13),now='2026-01-01T00:00:00.000Z';
const compile=()=>compileSchema({id:entityId,appId,label:'Transport fixture',version:1,createdAt:now,updatedAt:now,physicalRevision:'one',fields:[{id:fieldId,label:'Name',type:'text',required:true,unique:false}],lifecycle:{states:['active'],initial:'active',transitions:[]}},()=>undefined);
export default {async fetch(request:Request,env:{DB:D1Database}){
 const compiled=compile();
 if(new URL(request.url).pathname==='/setup'){for(const sql of compiled.sql)await env.DB.prepare(sql).run();await env.DB.prepare('INSERT INTO record_schemas VALUES(?,?,?,?,?,?,?)').bind(entityId,appId,1,'one',JSON.stringify(compiled.descriptor.schema),now,now).run();await env.DB.exec('CREATE TABLE test_policy(readable INTEGER NOT NULL);INSERT INTO test_policy VALUES(1)');return Response.json({appId,entityId,fieldId});}
 const principal={id:actorId,kind:'human' as const,humanId:actorId,sessionId:null,credentialId:null,issuedAt:now,expiresAt:'2099-01-01T00:00:00.000Z',authenticationEpoch:1};
 const policy:PolicyPort={scope:async(ctx)=>({principal:ctx.principal,appId,entityId,policyVersion:1,rowPredicate:trustedPredicate('1'),readableFieldIds:[fieldId],writableFieldIds:[fieldId],discoverableRelations:[],validUntil:principal.expiresAt,currentAuthorityGuards:[]}),authorize:async(ctx,req)=>({actor:{id:actorId,kind:'human'},action:req.action,appId,grantId:null,grantVersion:null,policyVersion:1,validUntil:principal.expiresAt,guards:[],reservationMutations:[],reservationIds:[]})};
 const admission=createAdmissionService(env.DB,{authorizeReplay:async()=>{const row=await env.DB.prepare('SELECT readable FROM test_policy').first<{readable:number}>();if(!row?.readable)throw new AdmissionError('forbidden','Current fields are private');}});
 const commands=createCommandRegistry(admission),services=createRecordServices(env.DB,createDescriptorRegistry([compiled.descriptor]),policy,'transport-test-secret-with-at-least-32-bytes',undefined,undefined,async()=>({guards:[],mutations:[]}));registerRecordActions(commands,{...services,deleteEffects:async()=>({erasureJobId:id(99),guards:[],mutations:[]})});
 if(new URL(request.url).pathname==='/bulk-test'){
  const descriptor=compiled.descriptor,ids=Array.from({length:500},(_,i)=>id(i+1000));await env.DB.prepare(`INSERT INTO "${descriptor.table.tableId}"(id,version,created_at,updated_at,lifecycle,schema_version,"${descriptor.fields.get(fieldId)!.column}") SELECT value,1,?,?,'active',1,'before' FROM json_each(?)`).bind(now,now,JSON.stringify(ids)).run();
  const ctx:RequestContext={principal,requestId:id(2000),ingress:'http',now:new Date().toISOString()};
  const preview=await services.bulk.preview(ctx,{commandId:id(2001),expected:[],input:{appId,entityId,selection:{ids},change:{fieldId,value:'after'}}});await admission.commit(ctx,preview);const v=preview.committedResult as {id:string;token:string};
  const plan=await services.bulk.commit(ctx,{commandId:id(2002),expected:[],input:{previewId:v.id,token:v.token}}),sql=compileAdmission(ctx,plan);await admission.commit(ctx,plan);
  const count=await env.DB.prepare(`SELECT COUNT(*) AS n FROM "${descriptor.table.tableId}" WHERE "${descriptor.fields.get(fieldId)!.column}"='after' AND version=2`).first<{n:number}>();const undo=await services.bulk.undo(ctx,{commandId:id(2003),expected:[],input:{undoId:(plan.committedResult as {undoId:string}).undoId}});await admission.commit(ctx,undo);const restored=await env.DB.prepare(`SELECT COUNT(*) AS n FROM "${descriptor.table.tableId}" WHERE "${descriptor.fields.get(fieldId)!.column}"='before' AND version=3`).first<{n:number}>();return Response.json({restored:restored!.n,count:count!.n,statements:sql.statements.length,maxBindings:Math.max(...sql.statements.map(s=>s.values.length)),maxSqlBytes:Math.max(...sql.statements.map(s=>new TextEncoder().encode(s.sql).length))});
 }
 const authenticate=async(_request:Request,ingress:RequestContext['ingress'],requestId:string):Promise<RequestContext>=>({principal,requestId,ingress,now:new Date().toISOString()});const ports={commands,admission,authenticate};if(new URL(request.url).pathname==='/mcp')return createMcpTransport(ports)(request);return createCommandHttp(ports).fetch(request);
}};
