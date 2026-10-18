import {launchVersionDependencies} from './version-dependencies.server'
import {captureAutomationEventState} from './automation-event-state.server'
import { campaignLifecycle } from './lifecycle'
import { authorizeLaunchWrites } from './write-authority.server'
import type { CommandInput, Json, RevisionRef } from '../../contracts/primitives'
import type { AdmissionPlan, SqlMutation, SqlPredicate, AuditFact, DomainEvent } from '../../domains/admission/ports'
import type { PolicyPort, RequestContext } from '../../domains/authority/ports'
import { trustedPredicate, eq, and, exists } from '../../domains/admission/sql.server'
import { canonicalHash } from '../../domains/admission/canonical'
import { AdmissionError } from '../../domains/admission/errors'
import { createUlid } from '../../core/shared/ids'
import { LAUNCH_APP_ID, launchEntities, campaignFields, deliverableFields, milestoneFields, riskFields, decisionFields } from './contracts'
import { launchColumns, launchTables, type LaunchKind, launchFieldIds } from './descriptors.server'
import { tables, activityTable, type LaunchRow, toWire, isLaunchMetadataColumn } from './storage.server'
import type { LaunchIntegration } from './ports'
export type LaunchContext={releaseId?:string;db:D1Database;policy:PolicyPort;integration:Partial<LaunchIntegration>}
export function integration<K extends keyof LaunchIntegration>(context:LaunchContext,key:K):LaunchIntegration[K]{const port=context.integration[key];if(!port)throw new AdmissionError('unconfigured',`Launch requires the ${key} integration port`);return port as LaunchIntegration[K]}
export type ChangeSet={guards:SqlPredicate[];mutations:SqlMutation[];audit:AuditFact[];events:DomainEvent[];changed:RevisionRef[]}
export const emptyChange=():ChangeSet=>({guards:[],mutations:[],audit:[],events:[],changed:[]})
export const ref=(kind:LaunchKind,id:string)=>({appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:id})
export const fail=(message:string):never=>{throw new AdmissionError('validation',message)}
export async function load(db:D1Database,kind:LaunchKind,id:string){const row=await db.prepare(`SELECT * FROM "${launchTables[kind]}" WHERE id=?`).bind(id).first<LaunchRow>();if(!row)throw new AdmissionError('not_found',`${kind} ${id} was not found`);return row}
export function versionGuard(set:ChangeSet,kind:LaunchKind,row:LaunchRow,expected:RevisionRef[]){const supplied=expected.find(e=>e.ref.appId===LAUNCH_APP_ID&&e.ref.entityId===launchEntities[kind]&&e.ref.recordId===row.id);if(supplied?.version!==row.version)throw new AdmissionError('version_conflict',`${kind} has current version ${row.version}`,row.version);set.guards.push(exists(tables[kind],and(eq(tables[kind],'id',row.id),eq(tables[kind],'version',row.version))))}
export async function operator(db:D1Database,set:ChangeSet,id:unknown){if(typeof id!=='string')fail('A current operator is required');const q=trustedPredicate('EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1)',[id as string]);if(!await db.prepare(`SELECT 1 WHERE ${q.sql}`).bind(...q.values).first())fail(`Operator ${id} is not current`);set.guards.push(q)}
export async function validateDomain(db:D1Database,set:ChangeSet,kind:LaunchKind,fields:Record<string,unknown>,creating:boolean,recordId?:string){
 if(kind==='campaign'){campaignFields.omit({tags:true,customFields:true}).parse(fields);if(String(fields.launchDate)<String(fields.startDate))fail('launchDate must not precede startDate');if(!(campaignLifecycle.phases as readonly string[]).includes(String(fields.phase)))fail('Unknown phase');if(!(campaignLifecycle.statuses as readonly string[]).includes(String(fields.status)))fail('Unknown status');await operator(db,set,fields.ownerId)
  const unique=trustedPredicate('NOT EXISTS(SELECT 1 FROM campaigns WHERE code=? COLLATE NOCASE AND id!=?)',[String(fields.code),recordId??''])
  if(!await db.prepare(`SELECT 1 WHERE ${unique.sql}`).bind(...unique.values).first())fail('code must be unique case-insensitively')
  set.guards.push(unique)
 }
 if(kind==='deliverable'){deliverableFields.parse(fields);await operator(db,set,fields.ownerId)}
 if(kind==='milestone'){milestoneFields.parse(fields);if(fields.endDate&&String(fields.endDate)<String(fields.startDate))fail('endDate must not precede startDate');await operator(db,set,fields.ownerId);if(creating&&fields.status!=='Not started')fail('A milestone starts Not started')}
 if(kind==='risk'){riskFields.parse(fields);await operator(db,set,fields.ownerId)}
 if(kind==='decision'){decisionFields.parse(fields);await operator(db,set,fields.requesterId);if(fields.assigneeId)await operator(db,set,fields.assigneeId);for(const [field,target]of [['riskId','risks'],['supersedesId','decisions']])if(fields[field!]){const p=trustedPredicate(`EXISTS(SELECT 1 FROM ${target} WHERE id=? AND campaign_id=?)`,[String(fields[field!]),String(fields.campaignId)]);if(!await db.prepare(`SELECT 1 WHERE ${p.sql}`).bind(...p.values).first())fail(`${field} must belong to the campaign`);set.guards.push(p)}}
 if(fields.campaignId){const p=trustedPredicate('EXISTS(SELECT 1 FROM campaigns WHERE id=?)',[String(fields.campaignId)]);if(!await db.prepare(`SELECT 1 WHERE ${p.sql}`).bind(...p.values).first())fail('campaignId was not found');set.guards.push(p)}
}
export function mappedFields(kind:LaunchKind,row:LaunchRow){return Object.fromEntries(Object.entries(launchColumns[kind]).filter(([key])=>!['state','resolutionNote','rationale'].includes(key)).map(([k,column])=>[k,column==='due_at'?new Date(Number(row[column])).toISOString():row[column]]))}
export function physicalFields(kind:LaunchKind,fields:Record<string,unknown>){return Object.fromEntries(Object.entries(fields).map(([k,v])=>{const col=(launchColumns[kind] as Record<string,string>)[k];if(!col)fail(`Unknown field ${k}`);return[col,k==='dueAt'?Date.parse(String(v)):v as string|number|null]}))}
export function recordChange(set:ChangeSet,ctx:RequestContext,kind:LaunchKind,before:LaunchRow|null,after:LaunchRow|null,action:string){
 const row=after??before!,subject=ref(kind,row.id),campaignId=kind==='campaign'?row.id:typeof row.campaign_id==='string'?row.campaign_id:null
 const changes=Object.keys(after??before!).filter(k=>!['version','updated_at','created_at'].includes(k)&&!isLaunchMetadataColumn(k)&&(before?.[k]??null)!==(after?.[k]??null)).map(k=>({fieldId:launchFieldIds[kind][Object.entries(launchColumns[kind]).find(([,col])=>col===k)?.[0]??'']??launchEntities[kind],before:{state:'value' as const,value:before?.[k]==null?null:String(before[k])},after:{state:'value' as const,value:after?.[k]==null?null:String(after[k])}}))
 set.audit.push({action,subject,changes,sourceIds:[],personalContentRefs:[]})
 if(campaignId&&after)for(const k of Object.keys(after).filter(k=>!['version','updated_at','created_at'].includes(k)&&!isLaunchMetadataColumn(k)&&(before?.[k]??null)!==after[k]))set.mutations.push({kind:'insert',table:activityTable,row:{id:createUlid(),created_at:Date.parse(ctx.now),updated_at:Date.parse(ctx.now),version:1,campaign_id:campaignId,subject_id:row.id,actor_id:ctx.principal.humanId,type:action,field_name:k,previous_value:before?.[k]==null?null:String(before[k]),next_value:after[k]==null?null:String(after[k]),message:`${action}: ${k}`}})
 if(campaignId&&(!after&&kind!=='campaign'||after&&changes.length===0))set.mutations.push({kind:'insert',table:activityTable,row:{id:createUlid(),created_at:Date.parse(ctx.now),updated_at:Date.parse(ctx.now),version:1,campaign_id:campaignId,subject_id:row.id,actor_id:ctx.principal.humanId,type:action,field_name:null,previous_value:null,next_value:null,message:action}})
 set.events.push({name:action,version:1,subject,payload:{id:row.id,campaignId,...kind==='risk'?{severity:row.severity,previousSeverity:before?.severity??null}:{} },causeRunIds:[]});if(after)set.changed.push({ref:subject,version:after.version})
}
export async function plan(context:LaunchContext,ctx:RequestContext,input:CommandInput<unknown>,action:string,set:ChangeSet,result:Json,target:LaunchKind):Promise<AdmissionPlan<Json>>{
 await captureAutomationEventState(context,set)
 for (const mutation of set.mutations) if (mutation.kind === 'insert' && mutation.table.tableId === 'activity_entries') mutation.row = { ...mutation.row, message: JSON.stringify({ commandId: input.commandId, message: mutation.row.message }) }
 const hash=await canonicalHash({input:input.input,expected:input.expected}),permit=await authorizeLaunchWrites(context,ctx,input,action,hash,set,target)
 return{commandId:input.commandId,action,appId:LAUNCH_APP_ID,canonicalInputHash:hash,permit,guards:[...set.guards,...permit.guards],mutations:set.mutations,audit:set.audit,events:set.events,outbox:[],committedResult:result,changed:set.changed,versionDependencies:[...launchVersionDependencies(context,ctx,input.expected),...permit.versionDependencies]}
}
export async function capacity(db:D1Database,set:ChangeSet,kind:LaunchKind,additional=1){const limit=({campaign:50000,deliverable:500000,milestone:250000,risk:250000,decision:250000,lens:200,customField:50} as Partial<Record<LaunchKind,number>>)[kind];if(!limit)return;const count=await db.prepare(`SELECT COUNT(*) AS n FROM "${launchTables[kind]}"`).first<{n:number}>();if(count!.n+additional>limit)throw new AdmissionError('capacity_limit',`${kind} limit ${limit}; current count ${count!.n}`);set.guards.push(trustedPredicate(`(SELECT COUNT(*) FROM "${launchTables[kind]}")+?<=?`,[additional,limit]))}
export {toWire}
