import type {CommandInput,Json,RevisionRef,Money} from '../../contracts/primitives';
import type {RequestContext,AuthorizationRequest,AuthorityPermit} from '../../domains/authority/ports';
import type {AdmissionPlan,SqlPredicate,SqlMutation,OutboxCommand,AuditFact} from '../../domains/admission/ports';
import type {EvidenceLink} from '../../domains/evidence/contracts';
import {trustedPredicate} from '../../domains/admission/sql.server';
import {canonicalHash} from '../../domains/admission/canonical';
import {AdmissionError} from '../../domains/admission/errors';
import {REPAIRS_APP_ID,REPAIR_ENTITIES,REPAIR_MODEL,repairFieldId,repairRef,type RepairEntity} from './model';
import type {RepairDependencies} from './ports';
import {createRepairRepository,str,type Row} from './repository.server';
export type RepairAdmissionDependencies = Pick<RepairDependencies,'db'|'policy'> & {evidence:Pick<RepairDependencies['evidence'],'source'>;authoritySelection?:RepairDependencies['authoritySelection']};
export function createRepairAdmissionContext(d:RepairAdmissionDependencies,ctx:RequestContext,command:CommandInput<unknown>,action:string){
 const accessSubjects:{ref:RevisionRef['ref'];fieldIds:string[]}[]=[],guards:SqlPredicate[]=[],repo=createRepairRepository(d,guards,accessSubjects),mutations:SqlMutation[]=[],outbox:OutboxCommand[]=[],sources=new Set<string>(),auditFacts:AuditFact[]=[],changed:RevisionRef[]=[],targets:Pick<AuthorizationRequest,'targetEntityId'|'expected'|'fieldIds'|'proposedRows'>[]=[];
 async function evidence(links:EvidenceLink[]){for(const link of links){const {source}=await d.evidence.source(ctx,link.sourceId);if(source.ownerAppId!==REPAIRS_APP_ID||source.version!==link.sourceVersion)throw new AdmissionError('stale_evidence','Repair evidence changed');guards.push(trustedPredicate('EXISTS(SELECT 1 FROM evidence_sources WHERE id=? AND current_version=? AND erased_at IS NULL)',[source.id,source.version]));sources.add(source.id);
 const owner=await d.db.prepare('SELECT entity_id,record_id,field_ids FROM evidence_sources WHERE id=?').bind(source.id).first<{entity_id:string;record_id:string;field_ids:string}>();
 const entity=(Object.keys(REPAIR_ENTITIES) as RepairEntity[]).find(key=>REPAIR_ENTITIES[key]===owner?.entity_id);
 if(!owner||!entity)throw new AdmissionError('forbidden','Repair evidence must have a current repair record owner');
 const fields=JSON.parse(owner.field_ids) as string[],names=REPAIR_MODEL[entity].fields.filter(field=>fields.includes(repairFieldId(entity,field.name))).map(field=>field.name);
 if(fields.length!==names.length)throw new AdmissionError('forbidden','Repair evidence fields are unavailable');
 await repo.load(ctx,entity,owner.record_id,names);
 }}
 function unexpired(expiresAt:string){if(Date.parse(expiresAt)<=Date.parse(ctx.now))throw new AdmissionError('stale_evidence','The evidence or offer expired');guards.push(trustedPredicate("julianday(?) > MAX(julianday(?),julianday('now'))",[expiresAt,ctx.now]));}
 function requireExpected(entity:RepairEntity,row:Row){const ref=repairRef(entity,row.id);if(!command.expected.some(v=>v.ref.appId===ref.appId&&v.ref.entityId===ref.entityId&&v.ref.recordId===row.id&&v.version===row.version))throw new AdmissionError('version_conflict','Current record confirmation required',row.version);guards.push(repo.version(entity,row));}
 function auditChange(entity:RepairEntity,id:string,before:Row|null,values:Record<string,string|number|null>){const cell=(name:string,value:string|number|null)=>{const field=REPAIR_MODEL[entity].fields.find(f=>f.name===name)!;return {state:'value' as const,value:value===null?null:field.target?repairRef(field.target,String(value)):field.type==='boolean'?value===1:String(value)};};auditFacts.push({action,subject:repairRef(entity,id),changes:Object.entries(values).filter(([name])=>REPAIR_MODEL[entity].fields.some(f=>f.name===name)).map(([name,value])=>({fieldId:repairFieldId(entity,name),before:cell(name,before?.[name]??null),after:cell(name,value)})),sourceIds:[...sources],personalContentRefs:[...sources]});}
 function update(entity:RepairEntity,row:Row,values:Record<string,string|number|null>){targets.push({targetEntityId:REPAIR_ENTITIES[entity],expected:[revision(entity,row)],fieldIds:Object.keys(values).filter(name=>REPAIR_MODEL[entity].fields.some(f=>f.name===name)).map(name=>repairFieldId(entity,name))});auditChange(entity,row.id,row,values);mutations.push(repo.update(entity,row,values,ctx.now));changed.push({ref:repairRef(entity,row.id),version:row.version+1});}
 function insert(entity:RepairEntity,id:string,values:Record<string,string|number|null>){auditChange(entity,id,null,values);const mutation=repo.insert(entity,id,values,ctx.now);if(mutation.kind!=='insert')throw new Error('Expected insertion');targets.push({targetEntityId:REPAIR_ENTITIES[entity],expected:[],proposedRows:[{entityId:REPAIR_ENTITIES[entity],row:mutation.row}],fieldIds:Object.keys(values).filter(name=>REPAIR_MODEL[entity].fields.some(f=>f.name===name)).map(name=>repairFieldId(entity,name))});mutations.push(mutation);changed.push({ref:repairRef(entity,id),version:1});}
 async function finish<T>(value:T,subject:RevisionRef|null,cost:Money[]=[],connectionId?:string):Promise<AdmissionPlan<T>>{const hash=await canonicalHash(command);let selection:Awaited<ReturnType<RepairDependencies['authoritySelection']>>={};if(ctx.principal.kind!=='human'||connectionId||action==='repair.store-acceptance'){if(!d.authoritySelection)throw new AdmissionError('unconfigured','Repair action authority selection is not configured');selection=await d.authoritySelection(ctx,{action,command,connectionId});}let permit:AuthorityPermit|undefined;for(const target of targets){const p=await d.policy.authorize(ctx,{appId:REPAIRS_APP_ID,action,cost:permit?[]:cost,inputHash:hash,commandId:command.commandId,...selection,...target});if(!permit)permit=p;else{guards.push(...p.guards);mutations.push(...p.reservationMutations);}}if(!permit)permit=await d.policy.authorize(ctx,{appId:REPAIRS_APP_ID,action,expected:subject?[subject]:[],cost,connectionId,inputHash:hash,commandId:command.commandId,...selection});return {commandId:command.commandId,action,appId:REPAIRS_APP_ID,canonicalInputHash:hash,permit,guards,mutations,audit:auditFacts.length?auditFacts:[{action,subject:subject?.ref??null,changes:[],sourceIds:[...sources],personalContentRefs:[...sources]}],events:[{name:action,version:1,subject:subject?.ref??null,payload:{commandId:command.commandId} as Json,causeRunIds:[]}],outbox,committedResult:value,changed,accessSubjects};}
 return {d,ctx,command,action,repo,accessSubjects,guards,mutations,outbox,sources,changed,evidence,unexpired,requireExpected,update,insert,finish};
}
export function createRepairWorkContext(d:RepairOpenDependencies,ctx:RequestContext,command:CommandInput<unknown>,action:string){
 const context=createRepairOpenContext(d,ctx,command,action);
 async function work(ref:RevisionRef){const row=await context.repo.expected(ctx,'workOrders',ref);context.requireExpected('workOrders',row);if(row.case_id)context.guards.push(...await d.cases.guards(ctx,str(row,'case_id'),command.controlEpoch));return row;}
 return {...context,work};
}
export function createRepairContext(d:RepairDependencies,ctx:RequestContext,command:CommandInput<unknown>,action:string){return {...createRepairWorkContext(d,ctx,command,action),d};}
export type RepairWorkContext=ReturnType<typeof createRepairWorkContext>;
export type RepairContext=ReturnType<typeof createRepairContext>;
export type RepairIntakeContext=ReturnType<typeof createRepairAdmissionContext>;
export const revision=(entity:RepairEntity,row:Row):RevisionRef=>({ref:repairRef(entity,row.id),version:row.version});

export type RepairOpenDependencies=RepairAdmissionDependencies & Pick<RepairDependencies,'cases'>;
export function createRepairOpenContext(d:RepairOpenDependencies,ctx:RequestContext,command:CommandInput<unknown>,action:string){return {...createRepairAdmissionContext(d,ctx,command,action),d};}
export type RepairOpenContext=ReturnType<typeof createRepairOpenContext>;
