import type { CommandInput, Ref } from '../../../contracts/primitives'
import type { RequestContext } from '../../authority/ports'
import type { RecordAttachmentPort } from '../attachments.server'
import type { TemplateDependencies, SnapshotOptions } from './snapshot.server'
import type { RecordTemplate, RecordTemplateChild } from './contracts'
import { RECORD_TEMPLATE_ENTITY_ID } from './contracts'
import { templateSnapshots } from './snapshot.server'
import { templateCreatePlanner } from './create.server'
import { createUlid } from '../../../core/shared/ids'
import { canonical, canonicalHash } from '../../admission/canonical'
import { AdmissionError } from '../../admission/errors'
import { registerTable, exists, and, eq } from '../../admission/sql.server'
import { requireBaseAuthor } from '../manual/base-access.server'
import { RECORD_SCHEMA_ENTITY_ID } from '../contracts'

const templates=registerTable('record_templates',['id','app_id','entity_id','owner_id','name','definition_json','version','created_at','updated_at'])
export type DuplicateInput = {ref:Ref;includeLinks:boolean;includeAttachments:boolean}
export type SaveTemplateInput = DuplicateInput & {name:string;includeChildren:boolean}
export type ApplyTemplateInput = {appId:string;entityId:string;templateId:string;values?:Record<string,import('../../../contracts/primitives').CellValue>}
export function createRecordTemplates(db:D1Database,deps:TemplateDependencies,attachments?:RecordAttachmentPort){
 const snapshots=templateSnapshots(deps),create=templateCreatePlanner(db,deps,attachments)
 function sourceVersion(command:CommandInput<{ref:Ref}>){const {ref}=command.input,version=command.expected.find(e=>e.ref.appId===ref.appId&&e.ref.entityId===ref.entityId&&e.ref.recordId===ref.recordId)?.version;if(version===undefined)throw new AdmissionError('validation','Current source version required.');return version}
 async function definition(ctx:RequestContext,appId:string,entityId:string,id:string){
  const row=await db.prepare('SELECT definition_json,version FROM record_templates WHERE id=? AND app_id=? AND entity_id=?').bind(id,appId,entityId).first<{definition_json:string;version:number}>()
  if(!row)throw new AdmissionError('not_found','Record template is unavailable.')
  const template=JSON.parse(row.definition_json) as RecordTemplate,parent=await snapshots.project(ctx,template.sourceRef,template.values),guards=[...parent.guards,exists(templates,and(eq(templates,'id',id),eq(templates,'version',row.version)))]
  const children:RecordTemplateChild[]=[]
  for(const child of template.children){const projected=await snapshots.project(ctx,child.sourceRef,child.values);guards.push(...projected.guards);children.push({...child,values:projected.values})}
  return {template:{...template,values:parent.values,children},guards}
 }
 async function list(ctx:RequestContext,appId:string,entityId:string){
  await deps.policy.scope(ctx,{appId,entityId,purpose:'read'})
  const rows=await db.prepare('SELECT id FROM record_templates WHERE app_id=? AND entity_id=? ORDER BY name,id').bind(appId,entityId).all<{id:string}>(),result:RecordTemplate[]=[]
  for(const row of rows.results){try{result.push((await definition(ctx,appId,entityId,row.id)).template)}catch(error){if(!(error instanceof Error)||!('code'in error)||!['forbidden','not_found','grant_revoked','grant_expired'].includes(String(error.code)))throw error}}
  return result
 }
 async function duplicate(ctx:RequestContext,command:CommandInput<DuplicateInput>){const source=await snapshots.snapshot(ctx,command.input.ref,command.input,sourceVersion(command));return create(ctx,command,'record.duplicate',command.input.ref.appId,[{entityId:command.input.ref.entityId,values:source.values,sourceRef:command.input.ref}],source.guards)}
 async function save(ctx:RequestContext,command:CommandInput<SaveTemplateInput>){
  const {ref,name,includeChildren}=command.input,access=await requireBaseAuthor(db,ctx,ref.appId)
  if(!access)throw new AdmissionError('forbidden','A base creator is required to save record templates.')
  const source=await snapshots.snapshot(ctx,ref,command.input,sourceVersion(command)),schema=source.descriptor.schema
  if(!command.expected.some(e=>e.ref.appId===ref.appId&&e.ref.entityId===RECORD_SCHEMA_ENTITY_ID&&e.ref.recordId===ref.entityId&&e.version===schema.version))throw new AdmissionError('schema_conflict','Current schema version required.')
  const guards=[...access.guards,...source.guards],children:RecordTemplateChild[]=[]
  if(includeChildren)for(const descriptor of deps.descriptors.list(ref.appId))for(const field of descriptor.schema.fields){
   if(field.type!=='relation'||field.relation?.ownerAppId!==ref.appId||field.relation.entityId!==ref.entityId)continue
   const scope=await deps.policy.scope(ctx,{appId:ref.appId,entityId:descriptor.schema.id,purpose:'read'})
   if(!scope.readableFieldIds.includes(field.id)||!scope.writableFieldIds.includes(field.id))continue
   let cursor:string|undefined
   do{
    const page=await deps.reader.query(ctx,scope,{limit:100,cursor,filter:{kind:'condition',fieldId:field.id,op:field.relation.cardinality==='many'?'contains':'eq',value:ref}})
    for(const record of page.items){if(children.length>=100)throw new AdmissionError('capacity_limit','Record templates support at most 100 child records.');const child=await snapshots.snapshot(ctx,record.ref,command.input);delete child.values[field.id];children.push({entityId:descriptor.schema.id,parentFieldId:field.id,values:child.values,sourceRef:record.ref});guards.push(...child.guards)}
    cursor=page.nextCursor??undefined
   }while(cursor)
  }
  const id=createUlid(),template:RecordTemplate={id,version:1,appId:ref.appId,entityId:ref.entityId,name,sourceRef:ref,values:source.values,children,createdAt:ctx.now,updatedAt:ctx.now},action='record.template-save',hash=await canonicalHash({action,input:command.input,expected:command.expected,controlEpoch:command.controlEpoch??null}),permit=await deps.policy.authorize(ctx,{appId:ref.appId,action:'record.create',targetEntityId:ref.entityId,expected:[],cost:[],inputHash:hash,commandId:command.commandId})
  return {commandId:command.commandId,appId:ref.appId,action,canonicalInputHash:hash,permit:{...permit,action},guards,mutations:[{kind:'insert' as const,table:templates,row:{id,app_id:ref.appId,entity_id:ref.entityId,owner_id:ctx.principal.id,name,definition_json:canonical(template),version:1,created_at:ctx.now,updated_at:ctx.now}}],audit:[{action,subject:ref,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:template,accessSubjects:[{ref,fieldIds:Object.keys(template.values)},...children.map(child=>({ref:child.sourceRef,fieldIds:Object.keys(child.values)}))]}
 }
 async function apply(ctx:RequestContext,command:CommandInput<ApplyTemplateInput>,allowedFieldIds?:ReadonlySet<string>,identity?:{action:string;command:CommandInput<unknown>}){
  const {appId,entityId,templateId,values={}}=command.input,{template,guards}=await definition(ctx,appId,entityId,templateId),version=command.expected.find(e=>e.ref.appId===appId&&e.ref.entityId===RECORD_TEMPLATE_ENTITY_ID&&e.ref.recordId===templateId)
  if(version&&version.version!==template.version)throw new AdmissionError('version_conflict','Record template changed.')
  const presets=allowedFieldIds?Object.fromEntries(Object.entries(template.values).filter(([id])=>allowedFieldIds.has(id))):template.values
  return create(ctx,identity?.command??command,identity?.action??'record.apply-template',appId,[{entityId,values:{...presets,...values},sourceRef:template.sourceRef},...template.children],guards)
 }
 return {list,definition,duplicate,save,apply}
}
