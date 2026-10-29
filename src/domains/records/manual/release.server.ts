import { prepareRoleSchemaUpdates } from './role-schema.server'
import { createUlid } from '../../../core/shared/ids'
import type { AdmissionPort, AuditFact, SqlPredicate, SqlMutation } from '../../admission/ports'
import type { AuthorityPermit, RequestContext, PolicyPort } from '../../authority/ports'
import { AdmissionError } from '../../admission/errors'
import { canonical } from '../../admission/canonical'
import { registerTable, trustedPredicate } from '../../admission/sql.server'
import {createDescriptorRegistry,type DescriptorRegistry} from '../descriptors.server'
import { compileSchemaSet, stageSchemaSet, prepareSchemaSetActivation } from '../migration.server'
import type { EntitySchema } from '../contracts'
import type { ManualPreview, SchemaDraft } from './contracts'
import { ownerRules, bases, policies, memberships } from './authority.server'
import { snapshotTables } from './snapshot.server'
import { parseFormula } from '../formula-parser'
import { expressionType, calculationKind } from '../calculation-schema'
import { previewCalculations } from './calculation-preview.server'
import { assertGuards } from '../fence.server'
import { snapshotViews, prepareViewRemovals, prepareFormRemovals, type ViewSnapshot } from './view-removal.server'
import { previewRuleViolations } from './rule-preview.server'
import {planFieldConversions} from './conversions.server'
import {schemaDependents} from './dependents.server'
import {prepareSchemaTrash,restoreSchemaMutations,liveSchemaPredicate,type SchemaRestorePlan} from '../trash/schema-markers.server'
import { validateLinkPickers } from '../link-picker-schema'
export const releases=registerTable('manual_record_releases',['id','app_id','owner_id','preview_id','detail_json','created_at'])
export type StoredPreview=ManualPreview & { guards:SqlPredicate[]; adoptionGuards?:SqlPredicate[]; prior:EntitySchema[]; removals:Record<string,string[]>; policy:{id:string;version:number;rules_json:string}|null; baseVersion:number; snapshots:Record<string,Record<string,unknown>[]>; conversionPlan?:ReturnType<typeof planFieldConversions>; restoration?:SchemaRestorePlan; viewSnapshots?:ViewSnapshot[]; formSnapshots?:ViewSnapshot[]; policyOwnerId?:string; baseOwnerId?:string }
/** Whose authority a preview is computed under: `reader` reads every affected table as `ownerId`. */
export type PreviewAuthority={permit:AuthorityPermit;reader:RequestContext;ownerId:string;expiresAt:string;restoration?:SchemaRestorePlan;pendingViews?:import('../link-picker-schema').PickerViewSnapshot[]}

export function createReleaseCore(db:D1Database,policy:PolicyPort,admission:AdmissionPort,registry:DescriptorRegistry){
 const retainedRegistry=(schemas:EntitySchema[])=>createDescriptorRegistry(registry.list().filter(descriptor=>descriptor.schema.appId!==schemas[0]?.appId||schemas.some(schema=>schema.id===descriptor.schema.id)))
 /** Validate and measure a schema draft; writes nothing. */
 async function buildPreview(draft:SchemaDraft,id:string,authority:PreviewAuthority):Promise<StoredPreview>{
  const {reader,ownerId,permit}=authority,now=reader.now
  draft=structuredClone(draft)
  for(const [fieldId,source] of Object.entries(draft.formulaSources??{})){
   const table=draft.tables.find(t=>t.fields.some(f=>f.id===fieldId)),field=table?.fields.find(f=>f.id===fieldId)
   if(!table||field?.type!=='computed')throw new AdmissionError('validation','Formula text must identify a computed field.')
   try{field.expression=parseFormula(source,table.fields);field.readOnly=true}catch(error){throw new AdmissionError('validation',`${field.label}: ${(error as Error).message}`)}
  }
  // Resolve result types after every candidate AST is present, including formula dependencies.
  for(const table of draft.tables)for(const field of table.fields)if(draft.formulaSources?.[field.id]!==undefined){try{const type=expressionType(field.expression!,table,draft.tables);field.resultType=type==='blank'?'text':type}catch(error){throw new AdmissionError('validation',`${field.label}: ${(error as Error).message}`)}}
  const base=await db.prepare('SELECT version,release_id,owner_id FROM manual_record_bases WHERE id=?').bind(draft.appId).first<{version:number;release_id:string;owner_id:string}>()
  const prior=registry.list(draft.appId).filter(d=>d.schema.physicalRevision.startsWith('manual_'))
  // A table's incoming fields enter the same custody group. The public impact
  // preview still enumerates each original source table and field below.
  const deletedTables=new Set(prior.filter(descriptor=>!draft.tables.some(table=>table.id===descriptor.schema.id)).map(descriptor=>descriptor.schema.id))
  for(const table of draft.tables){
   table.fields=table.fields.filter(field=>!(field.relation?.ownerAppId===draft.appId&&deletedTables.has(field.relation.entityId)))
   if(table.incomingRelations)table.incomingRelations=table.incomingRelations.filter(section=>!deletedTables.has(section.sourceEntityId))
  }
  const readGuards:SqlPredicate[]=[]
  for(const d of prior){const scope=await policy.scope(reader,{appId:draft.appId,entityId:d.schema.id,purpose:'read'});if(!scope.unrestrictedRows||d.schema.fields.some(f=>!scope.readableFieldIds.includes(f.id)))throw new AdmissionError('forbidden','Schema changes require current read access to every affected row and field.');readGuards.push(...scope.currentAuthorityGuards)}
  if(new Set(draft.tables.map(t=>t.id)).size!==draft.tables.length)throw new AdmissionError('validation','Table identities must be unique.')
  const schemas:EntitySchema[]=draft.tables.map(t=>{const old=prior.find(p=>p.schema.id===t.id);return {...t,appId:draft.appId,version:(old?.schema.version??0)+1,createdAt:old?.schema.createdAt??now,updatedAt:now,physicalRevision:'manual_'+id,lifecycle:{states:['active'],initial:'active',transitions:[]}}})
  const removals:Record<string,string[]>={}
  for(const schema of schemas){
   for(const incoming of schema.incomingRelations??[]){const relation=schemas.find(s=>s.id===incoming.sourceEntityId)?.fields.find(f=>f.id===incoming.sourceFieldId)?.relation;if(!relation||relation.ownerAppId!==schema.appId||relation.entityId!==schema.id)throw new AdmissionError('validation','Incoming relation must reference a canonical link targeting this table.')}
   if(schema.fields.some(f=>f.label==='_record_id'))throw new AdmissionError('validation','The field name _record_id is reserved for recovery imports.');
   if(new Set(schema.fields.map(f=>f.label)).size!==schema.fields.length)throw new AdmissionError('validation','Field names must be unique within a table for unambiguous CSV mapping.')
   if(registry.list().some(d=>d.schema.id===schema.id&&d.schema.appId!==draft.appId))throw new AdmissionError('validation','Table identity already belongs to another base.')
   const old=prior.find(p=>p.schema.id===schema.id)
   removals[schema.id]=old?.schema.fields.filter(f=>!schema.fields.some(n=>n.id===f.id)).map(f=>f.id)??[]
   for(const field of schema.fields){
    if(!['email','rating','duration','phone','text','url','number','date','instant','money','select','multi_select','person','boolean','relation','attachment','computed'].includes(field.type))throw new AdmissionError('validation',`${field.label}: this builder does not support this type.`)
    if(field.readOnly&&field.type!=='computed')throw new AdmissionError('validation','Read-only is reserved for lookup fields.')
    if(field.relation&&(field.relation.ownerAppId!==draft.appId||field.relation.onDelete!=='restrict'))throw new AdmissionError('validation','Links must target records in this base and restrict deletion.')
    if(field.type==='computed'&&(!field.expression||!field.resultType))throw new AdmissionError('validation',`${field.label}: a calculation needs an expression and result type.`)
    if(field.type!=='relation'&&field.relation||field.type!=='computed'&&field.expression)throw new AdmissionError('validation','Only links declare relations and only lookups declare expressions.')
    const existing=old?.fields.get(field.id)?.field
    if(field.type==='person'&&field.notifyOnAdd===undefined&&existing?.type!=='person')field.notifyOnAdd=true
    if(['select','multi_select'].includes(field.type)&&(!field.options?.length||new Set(field.options.map(o=>o.id)).size!==field.options.length||new Set(field.options.map(o=>o.label)).size!==field.options.length))throw new AdmissionError('validation','Select options must be unique and nonempty.')
   }
  }
  const snapshot=await snapshotTables(db,prior),viewSnapshot=await snapshotViews(db,draft.appId)
  const conversionPlan=planFieldConversions(prior,schemas,snapshot.rows),dependents=await schemaDependents(db,prior,schemas,viewSnapshot)
  const overrides=structuredClone(conversionPlan.values)
  for(const [entity,records] of Object.entries(authority.restoration?.values??{}))for(const [record,values] of Object.entries(records))Object.assign((overrides[entity]??={})[record]??={},values)
  const reserved=await db.prepare("SELECT entity_id,record_id,kind FROM record_trash WHERE app_id=? AND kind IN ('field','table')").bind(draft.appId).all<{entity_id:string;record_id:string;kind:string}>()
  for(const held of reserved.results){if(held.kind==='table'&&!authority.restoration?.tableIds?.includes(held.entity_id)&&schemas.some(schema=>schema.id===held.entity_id))throw new AdmissionError('validation','This table identity is reserved by Trash; restore it instead.');if(held.kind==='field'&&!authority.restoration&&schemas.some(schema=>schema.id===held.entity_id&&schema.fields.some(field=>field.id===held.record_id)))throw new AdmissionError('validation','This field identity is reserved by Trash; restore it instead.')}
  for(const old of prior)for(const field of old.schema.fields)if(field.type==='attachment'&&(!schemas.some(schema=>schema.id===old.schema.id&&schema.fields.some(next=>next.id===field.id))))(dependents.refusals[old.schema.id]??=[]).push('Attachment deletion is refused: FILE-002 store-reference and file custody disposal is not defined.')
  for(const old of prior.filter(old=>!schemas.some(schema=>schema.id===old.schema.id)))if(await db.prepare("SELECT 1 FROM record_trash WHERE app_id=? AND entity_id=? AND kind='record' LIMIT 1").bind(draft.appId,old.schema.id).first())(dependents.refusals[old.schema.id]??=[]).push('This table contains records already in Trash. Restore or resolve that record custody before deleting the table.')
  const refused=Object.values(conversionPlan.refusals).some(items=>items.length)||Object.values(dependents.refusals).some(items=>items.length)
  let compiled:Awaited<ReturnType<typeof compileSchemaSet>>|undefined
  if(!refused){try{compiled=await compileSchemaSet(schemas,retainedRegistry(schemas),removals,conversionPlan.fieldIds)}catch(error){throw new AdmissionError('validation',error instanceof Error?error.message:'Schema compilation failed.')}}
  if(authority.pendingViews?.length&&(prior.length||base))throw new AdmissionError('validation','Pending picker views are accepted only for a new native base import.')
  validateLinkPickers(schemas,[...viewSnapshot.views,...(authority.pendingViews??[])])
  const impacts:import('./contracts').SchemaImpact[]=schemas.map(schema=>{const old=prior.find(p=>p.schema.id===schema.id),rows=old?snapshot.rows[old.table.tableId]!:[],changes:string[]=[]
   if(!old)changes.push(`Create table ${schema.label}`)
   else if(old.schema.label!==schema.label)changes.push(`Rename table ${old.schema.label} to ${schema.label}`)
   if(schema.primaryFieldId!==old?.schema.primaryFieldId&&schema.primaryFieldId)changes.push(`Use ${schema.fields.find(f=>f.id===schema.primaryFieldId)?.label} as the primary record label`)
   if(canonical(schema.incomingRelations??[])!==canonical(old?.schema.incomingRelations??[]))changes.push(`Incoming relationship sections: ${(schema.incomingRelations??[]).map(r=>r.label).join(', ')||'none'}`)
   for(const field of schema.fields){const before=old?.fields.get(field.id)?.field;if(!before)changes.push(`Add ${field.label} (${field.type==='computed'?calculationKind(field):field.type})`);else if(before.label!==field.label)changes.push(`Rename ${before.label} to ${field.label}`)}
   for(const field of schema.fields){const before=old?.fields.get(field.id)?.field;if(before&&canonical(before.linkPicker??null)!==canonical(field.linkPicker??null))changes.push(`Update linked-record picker for ${field.label}`)}
   for(const field of schema.fields){const before=old?.fields.get(field.id)?.field;if(before&&field.type==='person'&&(before.notifyOnAdd!==false)!==(field.notifyOnAdd!==false))changes.push(`Turn assignment notifications ${field.notifyOnAdd===false?'off':'on'} for ${field.label}`)}
   for(const conversion of conversionPlan.impacts[schema.id]??[])changes.push(`Convert ${conversion.label} from ${conversion.from} to ${conversion.to}: ${conversion.converted.length} converted, ${conversion.losses.length} lost values`)
   const removedFields=(old?.schema.fields??[]).filter(f=>removals[schema.id]!.includes(f.id)).map(f=>({id:f.id,label:f.label,populated:old!.fields.get(f.id)!.join?new Set((snapshot.rows[old!.fields.get(f.id)!.join!.table.tableId]??[]).map(row=>row.record_id)).size:rows.filter(row=>row[old!.fields.get(f.id)!.column]!==null&&row[old!.fields.get(f.id)!.column]!==undefined).length}))
   for(const field of schema.fields){const before=old?.fields.get(field.id)?.field;if(before?.type==='computed'&&canonical(before.expression??null)!==canonical(field.expression??null))changes.push(`Update calculation ${field.label}`)}
   for(const field of schema.fields){const before=old?.fields.get(field.id)?.field;if(before&&canonical({required:before.required,unique:before.unique,validation:before.validation??null,defaultValue:before.defaultValue??null})!==canonical({required:field.required,unique:field.unique,validation:field.validation??null,defaultValue:field.defaultValue??null}))changes.push(`Update validation or default for ${field.label}`)}
   for(const rule of schema.validationRules??[])if(canonical(rule)!==canonical(old?.schema.validationRules?.find(before=>before.id===rule.id)??null))changes.push(`Validate ${rule.name}: ${rule.message}`)
   for(const rule of old?.schema.validationRules??[])if(!schema.validationRules?.some(next=>next.id===rule.id))changes.push(`Remove validation rule ${rule.name}`)
   changes.push(...removedFields.map(f=>`Remove ${f.label}: ${f.populated} stored ${f.populated===1?'value leaves':'values leave'} the live table`))
   return {entityId:schema.id,label:schema.label,changes,recordIds:changes.length?rows.map(r=>String(r.id)):[],count:changes.length?rows.length:0,removedFields,conversions:conversionPlan.impacts[schema.id]??[],dependencies:dependents.byEntity[schema.id]??[],refusals:[...(conversionPlan.refusals[schema.id]??[]),...(dependents.refusals[schema.id]??[])],...previewRuleViolations(schema,old,snapshot.rows,overrides[schema.id])}
  })
  for(const old of prior.filter(old=>!schemas.some(schema=>schema.id===old.schema.id))){const rows=snapshot.rows[old.table.tableId]??[];impacts.push({entityId:old.schema.id,label:old.schema.label,deletedTable:true,changes:[`Move table ${old.schema.label} to 30-day Trash`],recordIds:rows.map(row=>String(row.id)),count:rows.length,removedFields:old.schema.fields.map(field=>({id:field.id,label:field.label,populated:rows.filter(row=>row[old.fields.get(field.id)!.column]!=null).length})),conversions:[],dependencies:dependents.byEntity[old.schema.id]??[],refusals:dependents.refusals[old.schema.id]??[],validationViolations:[],violatingRecordCount:0} as typeof impacts[number])}
  const currentPolicy=base?await db.prepare("SELECT p.id,p.version,p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.app_id=? AND m.principal_id=? AND m.state='active'").bind(draft.appId,ownerId).first<{id:string;version:number;rules_json:string}>():null
  if(currentPolicy){
   const rules=JSON.parse(currentPolicy.rules_json) as ReturnType<typeof ownerRules>
   for(const schema of schemas){
    const old=prior.find(p=>p.schema.id===schema.id)
    if(!old||!schema.fields.some(f=>!old.fields.has(f.id)))continue
    const ownerAllows=rules.filter(rule=>rule.entityId===schema.id&&rule.effect==='allow'&&rule.principals.some(p=>p.id===ownerId))
    if(!ownerAllows.length||ownerAllows.some(rule=>rule.principals.length!==1))throw new AdmissionError('validation','Adding fields requires a dedicated owner field policy. Shared field policies must be reviewed by the owner before this schema change.')
   }
  }
  const calculations=compiled?await previewCalculations(db,policy,registry,schemas,compiled.descriptors,snapshot.rows,reader):[]
  return {policyOwnerId:ownerId,baseOwnerId:base?.owner_id??ownerId,authorId:ownerId,id,appId:draft.appId,name:draft.name,schemas,calculations,impacts,expiresAt:authority.expiresAt,kind:'manual_schema',parentReleaseId:base?.release_id??null,recovery:'Removed values are kept for recovery. Download the recovery CSV after applying this change. You can import them into a new field by matching the _record_id column (Original record ID); newer records stay unchanged.',access:'New tables and fields become available to members with full-base roles. Existing row and field restrictions stay in place. No other application, automation or provider receives access.',guards:[...permit.guards,...readGuards,...snapshot.guards,...viewSnapshot.guards,...dependents.guards,...(authority.restoration?.guards??[]),trustedPredicate(`(SELECT COUNT(*) FROM record_schemas WHERE app_id=? AND ${liveSchemaPredicate})=?`,[draft.appId,prior.length-(authority.restoration?.tableIds?.length??0)])],prior:prior.map(p=>p.schema),removals,conversionPlan:{...conversionPlan,values:overrides},...(authority.restoration?{restoration:authority.restoration}:{}),policy:currentPolicy?{...currentPolicy}:null,baseVersion:base?.version??0,snapshots:snapshot.rows,viewSnapshots:viewSnapshot.views,formSnapshots:viewSnapshot.forms}
 }
 /** Apply a reviewed preview atomically as the adopting owner, with any extra rows of the same release. */
 async function applyRelease(ctx:RequestContext,input:{commandId:string;hash:string;releaseId?:string;detail:StoredPreview;previewId:string;permit:AuthorityPermit;mutations:SqlMutation[];audit:AuditFact[];provenance?:Record<string,unknown>}){
  const {detail,previewId,permit}=input
  const refusals=detail.impacts.flatMap(impact=>impact.refusals??[]);if(refusals.length)throw new AdmissionError('validation',`Schema adoption refused: ${refusals.join('; ')}`)
  const violations=detail.impacts.flatMap(impact=>impact.validationViolations??[])
  if(violations.length)throw new AdmissionError('validation',`Schema adoption refused: existing records break ${violations.map(v=>`${v.ruleName} (${v.count} records): ${v.message}`).join('; ')}. Correct the records and preview again.`)
  const compiled=await compileSchemaSet(detail.schemas,retainedRegistry(detail.schemas),detail.removals,detail.conversionPlan?.fieldIds)
  await stageSchemaSet(compiled,db,retainedRegistry(detail.schemas),detail.removals,detail.conversionPlan?.fieldIds)
  const activation=await prepareSchemaSetActivation(db,compiled,registry,undefined,detail.conversionPlan?.values)
  const releaseId=input.releaseId??createUlid(),policyId=detail.policy?.id??createUlid(),time=Date.parse(ctx.now)
  const policyOwnerId=detail.policyOwnerId??ctx.principal.id
  let rules=ownerRules(policyOwnerId,detail.schemas)
  if(detail.policy){
   const current=JSON.parse(detail.policy.rules_json) as typeof rules
   // Keep all existing row/action/deny restrictions and every other principal intact.
   rules=current.map(rule=>{const next=detail.schemas.find(s=>s.id===rule.entityId),old=detail.prior.find(s=>s.id===rule.entityId);if(!next||!old)return rule;const added=next.fields.filter(f=>!old.fields.some(p=>p.id===f.id));const owned=rule.effect==='allow'&&rule.principals.length===1&&rule.principals[0]!.id===policyOwnerId;return {...rule,readableFields:[...rule.readableFields.filter(id=>next.fields.some(f=>f.id===id)),...(owned?added.map(f=>f.id):[])],writableFields:[...rule.writableFields.filter(id=>next.fields.some(f=>f.id===id)),...(owned?added.filter(f=>f.type!=='computed').map(f=>f.id):[])]}})
   rules.push(...ownerRules(policyOwnerId,detail.schemas.filter(s=>!detail.prior.some(p=>p.id===s.id))).filter(rule=>detail.schemas.some(s=>s.id===rule.entityId)))
  }
  const roleChanges=await prepareRoleSchemaUpdates(db,detail,ctx.now)
  const mutations:SqlMutation[]=[...prepareSchemaTrash(detail,releaseId,ctx.principal.id,ctx.now),...restoreSchemaMutations(detail.restoration),...roleChanges.mutations,...activation.mutations,...prepareViewRemovals(detail.viewSnapshots??[],detail.schemas,detail.removals,ctx.now),...prepareFormRemovals(detail.formSnapshots??[],detail.schemas,detail.removals,ctx.now)]
  if(!detail.policy||canonical(rules)!==detail.policy.rules_json)mutations.push(detail.policy?{kind:'update',table:policies,set:{rules_json:canonical(rules),version:detail.policy.version+1,updated_at:time},where:trustedPredicate('id=? AND version=?',[policyId,detail.policy.version]),expectedRows:1}:{kind:'insert',table:policies,row:{id:policyId,app_id:detail.appId,name:'Manual base owner',rules_json:canonical(rules),version:1,created_at:time,updated_at:time}})
  if(!detail.policy)mutations.push({kind:'insert',table:memberships,row:{principal_id:ctx.principal.id,app_id:detail.appId,policy_id:policyId,legacy:0,state:'active',version:1}})
  const baseRow={id:detail.appId,owner_id:detail.baseOwnerId??ctx.principal.id,name:detail.name,version:detail.baseVersion+1,release_id:releaseId,updated_at:ctx.now}
  mutations.push(detail.baseVersion?{kind:'update',table:bases,set:baseRow,where:trustedPredicate('id=? AND version=? AND release_id=?',[detail.appId,detail.baseVersion,detail.parentReleaseId]),expectedRows:1}:{kind:'insert',table:bases,row:{...baseRow,created_at:ctx.now}})
  mutations.push({kind:'insert',table:releases,row:{id:releaseId,app_id:detail.appId,owner_id:ctx.principal.id,preview_id:previewId,detail_json:canonical({...detail,recoveryPolicy:roleChanges.rulesByPrincipal[ctx.principal.id]??canonical(rules),recoveryPolicies:{...roleChanges.rulesByPrincipal,[policyOwnerId]:canonical(rules)},...(input.provenance?{proposal:input.provenance}:{})}),created_at:ctx.now}},...input.mutations)
  return admission.commit(ctx,{commandId:input.commandId,action:'release.adopt',appId:detail.appId,canonicalInputHash:input.hash,permit,guards:[...detail.guards,...roleChanges.guards,...activation.guards,trustedPredicate('?>strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')',[detail.expiresAt])],mutations,audit:input.audit,events:[],outbox:[],committedResult:{kind:'manual_schema',releaseId,appId:detail.appId,schemas:detail.schemas.map(s=>({id:s.id,label:s.label})),recoveryUrl:`/api/v1/records/releases/${releaseId}/recovery`}})
 }
 return {buildPreview,applyRelease,assertGuards:(guards:readonly SqlPredicate[])=>assertGuards(db,guards)}
}
export function publicPreview(d:StoredPreview):ManualPreview {const {guards,adoptionGuards,prior,removals,policy,baseVersion,snapshots,viewSnapshots,formSnapshots,policyOwnerId,baseOwnerId,conversionPlan,restoration,...publicFields}=d;return publicFields}
