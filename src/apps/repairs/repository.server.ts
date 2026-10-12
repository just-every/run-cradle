import type {RequestContext} from '../../domains/authority/ports';
import {trustedPredicate,and,eq,exists,identifier} from '../../domains/admission/sql.server';
import type {SqlMutation,SqlPredicate,AdmissionPlan} from '../../domains/admission/ports';
import {AdmissionError} from '../../domains/admission/errors';
import type {RevisionRef} from '../../contracts/primitives';
import {REPAIRS_APP_ID,REPAIR_ENTITIES,REPAIR_MODEL,repairRef,repairFieldId,type RepairEntity} from './model';
import {repairTables} from './schema';
import type {RepairDependencies} from './ports';
export type Row={id:string;version:number;created_at:string;updated_at:string;lifecycle:string;schema_version:number;[key:string]:string|number|null};
export function createRepairRepository(d:Pick<RepairDependencies,'db'|'policy'>,readGuards?:SqlPredicate[],accessSubjects?:NonNullable<AdmissionPlan<unknown>['accessSubjects']> extends readonly (infer T)[] ? T[] : never){
 async function scope(ctx:RequestContext,entity:RepairEntity){return d.policy.scope(ctx,{appId:REPAIRS_APP_ID,entityId:REPAIR_ENTITIES[entity],purpose:'read'});}
 async function load(ctx:RequestContext,entity:RepairEntity,id:string,fields=REPAIR_MODEL[entity].fields.map(f=>f.name)):Promise<Row>{const s=await scope(ctx,entity);if(fields.some(f=>!s.readableFieldIds.includes(repairFieldId(entity,f))))throw new AdmissionError('forbidden','Required repair fields are not readable');const row=await d.db.prepare(`SELECT * FROM ${identifier(REPAIR_MODEL[entity].table)} WHERE id=? AND (${s.rowPredicate.sql})`).bind(id,...s.rowPredicate.values).first<Row>();if(!row)throw new AdmissionError('not_found','Repair record not found');readGuards?.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(REPAIR_MODEL[entity].table)} WHERE id=? AND (${s.rowPredicate.sql}))`,[id,...s.rowPredicate.values]),...s.currentAuthorityGuards);accessSubjects?.push({ref:repairRef(entity,row.id),fieldIds:fields.map(f=>repairFieldId(entity,f))});return row;}
 async function list(ctx:RequestContext,entity:RepairEntity,where:SqlPredicate=trustedPredicate('1')){const s=await scope(ctx,entity);if(REPAIR_MODEL[entity].fields.some(f=>!s.readableFieldIds.includes(repairFieldId(entity,f.name))))throw new AdmissionError('forbidden','Required repair fields are not readable');readGuards?.push(...s.currentAuthorityGuards);return (await d.db.prepare(`SELECT * FROM ${identifier(REPAIR_MODEL[entity].table)} WHERE (${s.rowPredicate.sql}) AND (${where.sql}) ORDER BY id LIMIT 201`).bind(...s.rowPredicate.values,...where.values).all<Row>()).results;}
 function version(entity:RepairEntity,row:Row){return exists(repairTables[entity],and(eq(repairTables[entity],'id',row.id),eq(repairTables[entity],'version',row.version)));}
 function update(entity:RepairEntity,row:Row,changes:Record<string,string|number|null>,now:string):SqlMutation{return {kind:'update',table:repairTables[entity],set:{...changes,version:row.version+1,updated_at:now},where:and(eq(repairTables[entity],'id',row.id),eq(repairTables[entity],'version',row.version)),expectedRows:1};}
 function insert(entity:RepairEntity,id:string,values:Record<string,string|number|null>,now:string):SqlMutation{return {kind:'insert',table:repairTables[entity],row:{id,version:1,schema_version:1,created_at:now,updated_at:now,lifecycle:'received',...values}};}
 async function expected(ctx:RequestContext,entity:RepairEntity,value:RevisionRef){if(value.ref.appId!==REPAIRS_APP_ID||value.ref.entityId!==REPAIR_ENTITIES[entity])throw new AdmissionError('validation','Incorrect repair reference');const row=await load(ctx,entity,value.ref.recordId);if(row.version!==value.version)throw new AdmissionError('version_conflict','Repair record changed',row.version);return row;}
 async function configuration(){const row=await d.db.prepare('SELECT * FROM repair_configuration WHERE app_id=?').bind(REPAIRS_APP_ID).first<{manager_id:string;release_id:string;version:number}>();if(!row)throw new AdmissionError('unconfigured','Repair application setup is incomplete');return row;}
 return {load,list,scope,version,update,insert,expected,configuration,ref:repairRef};
}
export type RepairRepository=ReturnType<typeof createRepairRepository>;
export const str=(row:Row,key:string)=>{const v=row[key];if(typeof v!=='string')throw new AdmissionError('validation',`Missing ${key}`);return v;};
export const json=<T>(row:Row,key:string):T=>JSON.parse(str(row,key)) as T;
