import {createImportService} from '../src/domains/portability/import.server';
import {createRecordImportAdapter} from '../src/domains/portability/record-import.server';
import {createRecordReader} from '../src/domains/records/query.server';
import {createRecordWriter} from '../src/domains/records/change.server';
import {compileSchema,createDescriptorRegistry} from '../src/domains/records/descriptors.server';
import {createAdmissionService} from '../src/domains/admission/service.server';
import {prepareCanonicalInvalidation} from '../src/domains/evidence/canonical-invalidation.server';
import {trustedPredicate} from '../src/domains/admission/sql.server';
import {createUlid} from '../src/core/shared/ids';
import type {PolicyPort,RequestContext} from '../src/domains/authority/ports';
export default{async fetch(request:Request,env:{DB:D1Database}){try{
 const input=await request.json() as any,db=env.DB,schema=JSON.parse((await db.prepare('SELECT schema_json FROM record_schemas').first<{schema_json:string}>())!.schema_json),d=compileSchema(schema,()=>undefined).descriptor,registry=createDescriptorRegistry([d]);
 const ctx:RequestContext={principal:{id:input.actor,kind:'human',humanId:input.actor,sessionId:null,credentialId:null,issuedAt:input.now,expiresAt:'2099-01-01T00:00:00.000Z',authenticationEpoch:1},requestId:createUlid(),now:input.now,ingress:'http'},scope={principal:ctx.principal,appId:schema.appId,entityId:schema.id,policyVersion:1,rowPredicate:trustedPredicate('1'),readableFieldIds:schema.fields.map((f:any)=>f.id),writableFieldIds:schema.fields.map((f:any)=>f.id),discoverableRelations:[],validUntil:ctx.principal.expiresAt,currentAuthorityGuards:[]};
 const policy:PolicyPort={scope:async()=>scope,authorize:async(c,q)=>({actor:{id:c.principal.id,kind:'human'},action:q.action,appId:q.appId,grantId:null,grantVersion:null,policyVersion:1,validUntil:ctx.principal.expiresAt,guards:[],reservationMutations:[],reservationIds:[]})},reader=createRecordReader(db,registry,policy,'x'.repeat(64)),writer=createRecordWriter(db,registry,policy,reader,undefined,(c,change)=>prepareCanonicalInvalidation(db,c,change.before)),adapter=createRecordImportAdapter(db,d,policy,writer,[schema.fields[0].id],reader),baseAdmission=createAdmissionService(db,{authorizeReplay:async()=>{},executionStatus:async()=>null}),service=createImportService(db,policy,{...baseAdmission,async commit(c,plan){console.log('capacity admission',plan.action,plan.mutations.length,plan.guards.length);const start=Date.now();const result=await baseAdmission.commit(c,plan);console.log('capacity admitted',plan.action,Date.now()-start);return result;}},adapter);
 console.log('capacity phase',input.preview?'preview':'commit',input.csv?.length??input.id);const started=Date.now();const result=input.preview?await service.preview(ctx,{commandId:input.commandId,appId:schema.appId,entityId:schema.id,fileId:input.fileId,mapping:{Code:schema.fields[0].id,Name:schema.fields[1].id}},new TextEncoder().encode(input.csv)):await service.commit(ctx,input.id,input.commandId,input.token);
 console.log('capacity complete',input.preview?'preview':'commit',Date.now()-started);return Response.json(result);
 }catch(error){return Response.json({error:String(error),stack:error instanceof Error?error.stack:null},{status:500});}}};
