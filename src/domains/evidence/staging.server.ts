import type {RequestContext} from '../authority/ports';
import type {EntityDescriptor} from '../records/descriptors.server';
import type {EvidenceDependencies} from './ports';
import {registerTable} from '../admission/sql.server';
import {hash,insert,EvidenceError} from './shared.server';
export const STAGING_ENTITY='00000000000000000000000408';
export const STAGING_OWNER='00000000000000000000000409';
export const STAGING_FILES='00000000000000000000000410';
export const STAGING_PURPOSE='00000000000000000000000412';
export const STAGING_TEXT='00000000000000000000000411';
const table=registerTable('evidence_staging',['id','app_id','owner_id','purpose','label','version','schema_version','lifecycle','created_at','updated_at']);
/** One registered entity per app, backed by the migrated E table and mandatory app column. */
export function stagingDescriptor(appId:string):EntityDescriptor{
 const createdAt='2026-09-27T00:00:00.000Z',fields=[{id:STAGING_OWNER,label:'Owner',type:'person' as const,required:true,unique:false,readOnly:true},{id:STAGING_FILES,label:'Files',type:'attachment' as const,required:false,unique:false},{id:STAGING_TEXT,label:'Source label',type:'text' as const,required:false,unique:false},{id:STAGING_PURPOSE,label:'Purpose',type:'text' as const,required:true,unique:false,readOnly:true}];
 return{schema:{id:STAGING_ENTITY,appId,version:1,createdAt,updatedAt:createdAt,label:'Private source intake',physicalRevision:'evidence-staging-v1',fields,lifecycle:{states:['active','erased'],initial:'active',transitions:[]}},table,fields:new Map([[STAGING_OWNER,{field:fields[0]!,column:'owner_id'}],[STAGING_FILES,{field:fields[1]!,column:'id',join:{table:registerTable('evidence_staging_files',['id','record_id','value','position']),valueColumn:'value'}}],[STAGING_TEXT,{field:fields[2]!,column:'label'}],[STAGING_PURPOSE,{field:fields[3]!,column:'purpose'}]]),idColumn:'id',versionColumn:'version',createdColumn:'created_at',updatedColumn:'updated_at',lifecycleColumn:'lifecycle',schemaVersionColumn:'schema_version',writePolicy:{create:false,patch:false,delete:false,transitions:[]}};
}
export function stagingPolicyEntity(appId:string){return{id:STAGING_ENTITY,table:'evidence_staging',idColumn:'id',appColumn:'app_id',fields:[{id:STAGING_OWNER,column:'owner_id',type:'person' as const,nullable:false},{id:STAGING_FILES,column:'id',type:'opaque' as const,nullable:false},{id:STAGING_TEXT,column:'label',type:'text' as const,nullable:false},{id:STAGING_PURPOSE,column:'purpose',type:'text' as const,nullable:false}]};}
/** Explicit policy additions: create has no read purpose, so it cannot widen owner-private retrieval. */
export function stagingPolicyRules(principalId:string,createRuleId:string,readRuleId:string){return[
 {id:createRuleId,principals:[{id:principalId,kind:'human' as const}],entityId:STAGING_ENTITY,rows:{kind:'all' as const,conditions:[]},readableFields:[],writableFields:[],actions:['source.stage','import.stage'],effect:'allow' as const,purposes:[]},
 {id:readRuleId,principals:[{id:principalId,kind:'human' as const}],entityId:STAGING_ENTITY,rows:{kind:'condition' as const,fieldId:STAGING_OWNER,op:'eq' as const,value:principalId},readableFields:[STAGING_OWNER,STAGING_FILES,STAGING_TEXT,STAGING_PURPOSE],writableFields:[STAGING_FILES,STAGING_TEXT],actions:['source.capture','source.correct','upload.begin','upload.complete','privacy.erase'],effect:'allow' as const,purposes:['read' as const,'export' as const]}
 ];}
export function createSourceStaging(deps:EvidenceDependencies){return{
 async create(ctx:RequestContext,input:{commandId:string;appId:string;purpose:'import'|'source'}){
  if(ctx.principal.kind!=='human')throw new EvidenceError('forbidden','A human owner must prepare private source intake',403);
  const action=input.purpose==='import'?'import.stage':'source.stage',inputHash=await hash(JSON.stringify(input)),permit=await deps.policy.authorize(ctx,{appId:input.appId,action,targetEntityId:STAGING_ENTITY,expected:[],cost:[],inputHash,commandId:input.commandId});
  const subject={appId:input.appId,entityId:STAGING_ENTITY,recordId:input.commandId};
  return deps.admission.commit(ctx,{commandId:input.commandId,appId:input.appId,action,canonicalInputHash:inputHash,permit,guards:[],mutations:[insert(table,{id:input.commandId,app_id:input.appId,owner_id:ctx.principal.id,purpose:input.purpose,label:'',version:1,schema_version:1,lifecycle:'active',created_at:ctx.now,updated_at:ctx.now})],audit:[],events:[],outbox:[],committedResult:{subject,uploadFieldIds:[STAGING_FILES],sourceFieldIds:[STAGING_FILES,STAGING_TEXT]}});
 }
};}

/** Retained Launch CSV rights: original imports are readable by authorized operators; upload writes remain owner-guarded. */
export function legacyImportStagingRules(principalId:string,createRuleId:string,readRuleId:string){const rules=stagingPolicyRules(principalId,createRuleId,readRuleId);return[{...rules[0]!,actions:['import.stage']},{...rules[1]!,rows:{kind:'condition' as const,fieldId:STAGING_PURPOSE,op:'eq' as const,value:'import'},actions:['upload.begin','upload.complete'],writableFields:[STAGING_FILES]}];}
