import { principalGuards } from '../../authority/guards.server'
import { recoveryTables } from './recovery.server'
import { createUlid } from '../../../core/shared/ids'
import type { AdmissionPort, SqlPredicate, SqlMutation } from '../../admission/ports'
import type { RequestContext, PolicyPort } from '../../authority/ports'
import { AdmissionError } from '../../admission/errors'
import { canonical, canonicalHash } from '../../admission/canonical'
import { registerTable, trustedPredicate } from '../../admission/sql.server'
import type { DescriptorRegistry } from '../descriptors.server'
import { compileSchemaSet, stageSchemaSet, prepareSchemaSetActivation } from '../migration.server'
import type { EntitySchema } from '../contracts'
import { draftSchema, type ManualPreview, type SchemaDraft } from './contracts'
import { manualAuthority, ownerRules, bases, policies, memberships } from './authority.server'
import { snapshotTables } from './snapshot.server'
import { assertGuards } from '../fence.server'
const previews=registerTable('manual_record_previews',['id','app_id','owner_id','state','detail_json','created_at','expires_at'])
const releases=registerTable('manual_record_releases',['id','app_id','owner_id','preview_id','detail_json','created_at'])
type Stored=ManualPreview & { guards:SqlPredicate[]; adoptionGuards?:SqlPredicate[]; prior:EntitySchema[]; removals:Record<string,string[]>; policy:{id:string;version:number;rules_json:string}|null; baseVersion:number; snapshots:Record<string,Record<string,unknown>[]> }
export function createManualSchemas(db:D1Database,policy:PolicyPort,admission:AdmissionPort,registry:DescriptorRegistry){
 async function preview(ctx:RequestContext,unknown:unknown):Promise<ManualPreview>{
  const draft=draftSchema.parse(unknown),id=createUlid(),inputHash=await canonicalHash(draft)
  const permit=await manualAuthority(db,policy,ctx,draft.appId,inputHash)
  const base=await db.prepare('SELECT version,release_id FROM manual_record_bases WHERE id=?').bind(draft.appId).first<{version:number;release_id:string}>()
  const prior=registry.list(draft.appId).filter(d=>d.schema.physicalRevision.startsWith('manual_'))
  const readGuards:SqlPredicate[]=[]
  for(const d of prior){const scope=await policy.scope(ctx,{appId:draft.appId,entityId:d.schema.id,purpose:'read'});if(!scope.unrestrictedRows||d.schema.fields.some(f=>!scope.readableFieldIds.includes(f.id)))throw new AdmissionError('forbidden','Schema changes require current read access to every affected row and field.');readGuards.push(...scope.currentAuthorityGuards)}
  if(new Set(draft.tables.map(t=>t.id)).size!==draft.tables.length)throw new AdmissionError('validation','Table identities must be unique.')
  if(prior.some(p=>!draft.tables.some(t=>t.id===p.schema.id)))throw new AdmissionError('validation','Table deletion is not supported. Remove individual fields after reviewing their impact.')
  const schemas:EntitySchema[]=draft.tables.map(t=>{const old=prior.find(p=>p.schema.id===t.id);return {...t,appId:draft.appId,version:(old?.schema.version??0)+1,createdAt:old?.schema.createdAt??ctx.now,updatedAt:ctx.now,physicalRevision:'manual_'+id,lifecycle:{states:['active'],initial:'active',transitions:[]}}})
  const removals:Record<string,string[]>={}
  for(const schema of schemas){
   for(const incoming of schema.incomingRelations??[]){const relation=schemas.find(s=>s.id===incoming.sourceEntityId)?.fields.find(f=>f.id===incoming.sourceFieldId)?.relation;if(!relation||relation.ownerAppId!==schema.appId||relation.entityId!==schema.id)throw new AdmissionError('validation','Incoming relation must reference a canonical link targeting this table.')}
   if(schema.fields.some(f=>f.label==='_record_id'))throw new AdmissionError('validation','The field name _record_id is reserved for recovery imports.');
   if(new Set(schema.fields.map(f=>f.label)).size!==schema.fields.length)throw new AdmissionError('validation','Field names must be unique within a table for unambiguous CSV mapping.')
   if(registry.list().some(d=>d.schema.id===schema.id&&d.schema.appId!==draft.appId))throw new AdmissionError('validation','Table identity already belongs to another base.')
   const old=prior.find(p=>p.schema.id===schema.id)
   removals[schema.id]=old?.schema.fields.filter(f=>!schema.fields.some(n=>n.id===f.id)).map(f=>f.id)??[]
   for(const field of schema.fields){
    if(!['text','url','number','date','select','boolean','relation','computed'].includes(field.type))throw new AdmissionError('validation',`${field.label}: this builder does not support this type.`)
    if(field.readOnly&&field.type!=='computed')throw new AdmissionError('validation','Read-only is reserved for lookup fields.')
    if(field.relation&&(field.relation.ownerAppId!==draft.appId||field.relation.onDelete!=='restrict'))throw new AdmissionError('validation','Links must target records in this base and restrict deletion.')
    if(field.type==='computed'&&(field.expression?.kind!=='rollup'||field.expression.aggregate!=='lookup'||schema.fields.find(f=>f.id===(field.expression as {relationFieldId:string}).relationFieldId)?.relation?.cardinality!=='one'))throw new AdmissionError('validation','Lookup requires one link and a source field.')
    if(field.type==='computed'&&field.expression?.kind==='rollup'){const expression=field.expression,relation=schema.fields.find(f=>f.id===expression.relationFieldId)?.relation,source=schemas.find(t=>t.id===relation?.entityId)?.fields.find(f=>f.id===expression.valueFieldId);if(!source||source.type!==field.resultType||['relation','computed'].includes(source.type))throw new AdmissionError('validation','Lookup source and result type must match a scalar field.');if(source.type==='select'&&canonical(field.options??[])!==canonical(source.options??[]))throw new AdmissionError('validation','Lookup select options must match its source field.')}
    if(field.type!=='relation'&&field.relation||field.type!=='computed'&&field.expression)throw new AdmissionError('validation','Only links declare relations and only lookups declare expressions.')
    const existing=old?.fields.get(field.id)?.field
    if(existing&&canonical({...existing,label:field.label})!==canonical(field))throw new AdmissionError('validation',`${field.label}: changing an existing field type, options, requirement or relation is unsupported. Rename it or add a new field.`)
    if(!existing&&old&&field.required)throw new AdmissionError('validation',`${field.label}: add optional fields to a populated schema; required backfill is not implemented.`)
    if(field.type==='select'&&(!field.options?.length||new Set(field.options.map(o=>o.id)).size!==field.options.length||new Set(field.options.map(o=>o.label)).size!==field.options.length))throw new AdmissionError('validation','Select options must be unique and nonempty.')
   }
  }
  try{await compileSchemaSet(schemas,registry,removals)}catch(error){throw new AdmissionError('validation',error instanceof Error?error.message:'Schema compilation failed.')}
  const snapshot=await snapshotTables(db,prior)
  const impacts=schemas.map(schema=>{const old=prior.find(p=>p.schema.id===schema.id),rows=old?snapshot.rows[old.table.tableId]!:[],changes:string[]=[]
   if(!old)changes.push(`Create table ${schema.label}`)
   else if(old.schema.label!==schema.label)changes.push(`Rename table ${old.schema.label} to ${schema.label}`)
   if(schema.primaryFieldId!==old?.schema.primaryFieldId&&schema.primaryFieldId)changes.push(`Use ${schema.fields.find(f=>f.id===schema.primaryFieldId)?.label} as the primary record label`)
   if(canonical(schema.incomingRelations??[])!==canonical(old?.schema.incomingRelations??[]))changes.push(`Incoming relationship sections: ${(schema.incomingRelations??[]).map(r=>r.label).join(', ')||'none'}`)
   for(const field of schema.fields){const before=old?.fields.get(field.id)?.field;if(!before)changes.push(`Add ${field.label} (${field.type==='computed'?'lookup':field.type})`);else if(before.label!==field.label)changes.push(`Rename ${before.label} to ${field.label}`)}
   const removedFields=(old?.schema.fields??[]).filter(f=>removals[schema.id]!.includes(f.id)).map(f=>({id:f.id,label:f.label,populated:old!.fields.get(f.id)!.join?new Set((snapshot.rows[old!.fields.get(f.id)!.join!.table.tableId]??[]).map(row=>row.record_id)).size:rows.filter(row=>row[old!.fields.get(f.id)!.column]!==null&&row[old!.fields.get(f.id)!.column]!==undefined).length}))
   changes.push(...removedFields.map(f=>`Remove ${f.label}: ${f.populated} stored values leave the live table`))
   return {entityId:schema.id,label:schema.label,changes:changes.length?changes:['Preserve fields and retarget incoming links'],recordIds:rows.map(r=>String(r.id)),count:rows.length,removedFields}
  })
  const currentPolicy=base?await db.prepare("SELECT p.id,p.version,p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.app_id=? AND m.principal_id=? AND m.state='active'").bind(draft.appId,ctx.principal.id).first<{id:string;version:number;rules_json:string}>():null
  if(currentPolicy){
   const rules=JSON.parse(currentPolicy.rules_json) as ReturnType<typeof ownerRules>
   for(const schema of schemas){
    const old=prior.find(p=>p.schema.id===schema.id)
    if(!old||!schema.fields.some(f=>!old.fields.has(f.id)))continue
    const ownerAllows=rules.filter(rule=>rule.entityId===schema.id&&rule.effect==='allow'&&rule.principals.some(p=>p.id===ctx.principal.id))
    if(!ownerAllows.length||ownerAllows.some(rule=>rule.principals.length!==1))throw new AdmissionError('validation','Adding fields requires a dedicated owner field policy. Shared field policies must be reviewed by the owner before this schema change.')
   }
  }
  const detail:Stored={id,appId:draft.appId,name:draft.name,schemas,impacts,expiresAt:new Date(Date.parse(ctx.now)+1800000).toISOString(),kind:'manual_schema',parentReleaseId:base?.release_id??null,recovery:'Removed values remain in retained physical tables and the authenticated release recovery download. Restore them into a new field through a reviewed CSV import matched by Original record ID. Newer records are not rolled back.',access:'Only your current owner membership is updated for the fields explicitly added here. No other application, person, automation or provider receives access.',guards:[...permit.guards,...readGuards,...snapshot.guards,trustedPredicate('(SELECT COUNT(*) FROM record_schemas WHERE app_id=?)=?',[draft.appId,prior.length])],prior:prior.map(p=>p.schema),removals,policy:currentPolicy?{...currentPolicy}:null,baseVersion:base?.version??0,snapshots:snapshot.rows}
  // Keep reviewed state and policy fences, but authenticate adoption with its
  // current session. Only exact principal guards generated for this preview are
  // separated; schema, data, membership, policy and owner fences stay immutable.
  const authentication=new Set(principalGuards(ctx).map(guard=>canonical({sql:guard.sql,values:guard.values})))
  detail.adoptionGuards=detail.guards.filter(guard=>!authentication.has(canonical({sql:guard.sql,values:guard.values})))
  // Preview writes only its review artifact, never live schemas, rows or permissions.
  await assertGuards(db,detail.guards)
  await db.prepare('INSERT INTO manual_record_previews(id,app_id,owner_id,state,detail_json,created_at,expires_at) VALUES(?,?,?,\'prepared\',?,?,?)').bind(id,draft.appId,ctx.principal.id,canonical(detail),ctx.now,detail.expiresAt).run()
  await assertGuards(db,detail.guards)
  return publicPreview(detail)
 }
 async function adopt(ctx:RequestContext,commandId:string,previewId:string){
  const row=await db.prepare('SELECT detail_json,state FROM manual_record_previews WHERE id=? AND owner_id=?').bind(previewId,ctx.principal.id).first<{detail_json:string;state:string}>()
  if(!row)throw new AdmissionError('not_found','Schema preview not found.')
  const detail=JSON.parse(row.detail_json) as Stored;detail.guards=(detail.adoptionGuards??detail.guards).map(g=>trustedPredicate(g.sql,g.values));const hash=await canonicalHash({kind:'manual_schema',previewId})
  const replay=await admission.replay(ctx,commandId,'release.adopt',detail.appId,hash);if(replay)return replay
  if(row.state!=='prepared'||detail.expiresAt<=ctx.now)throw new AdmissionError('version_conflict','Preview has expired or was already adopted.')
  const permit=await manualAuthority(db,policy,ctx,detail.appId,hash)
  await assertGuards(db,[...permit.guards,...detail.guards])
  const compiled=await compileSchemaSet(detail.schemas,registry,detail.removals)
  await stageSchemaSet(compiled,db,registry,detail.removals)
  const activation=await prepareSchemaSetActivation(db,compiled,registry)
  const releaseId=createUlid(),policyId=detail.policy?.id??createUlid(),time=Date.parse(ctx.now)
  let rules=ownerRules(ctx.principal.id,detail.schemas)
  if(detail.policy){
   const current=JSON.parse(detail.policy.rules_json) as typeof rules
   // Keep all existing row/action/deny restrictions and every other principal intact.
   rules=current.map(rule=>{const next=detail.schemas.find(s=>s.id===rule.entityId),old=detail.prior.find(s=>s.id===rule.entityId);if(!next||!old)return rule;const added=next.fields.filter(f=>!old.fields.some(p=>p.id===f.id));const owned=rule.effect==='allow'&&rule.principals.length===1&&rule.principals[0]!.id===ctx.principal.id;return {...rule,readableFields:[...rule.readableFields.filter(id=>next.fields.some(f=>f.id===id)),...(owned?added.map(f=>f.id):[])],writableFields:[...rule.writableFields.filter(id=>next.fields.some(f=>f.id===id)),...(owned?added.filter(f=>f.type!=='computed').map(f=>f.id):[])]}})
   rules.push(...ownerRules(ctx.principal.id,detail.schemas.filter(s=>!detail.prior.some(p=>p.id===s.id))).filter(rule=>detail.schemas.some(s=>s.id===rule.entityId)))
  }
  const mutations:SqlMutation[]=[...activation.mutations]
  mutations.push(detail.policy?{kind:'update',table:policies,set:{rules_json:canonical(rules),version:detail.policy.version+1,updated_at:time},where:trustedPredicate('id=? AND version=?',[policyId,detail.policy.version]),expectedRows:1}:{kind:'insert',table:policies,row:{id:policyId,app_id:detail.appId,name:'Manual base owner',rules_json:canonical(rules),version:1,created_at:time,updated_at:time}})
  if(!detail.policy)mutations.push({kind:'insert',table:memberships,row:{principal_id:ctx.principal.id,app_id:detail.appId,policy_id:policyId,legacy:0,state:'active',version:1}})
  const baseRow={id:detail.appId,owner_id:ctx.principal.id,name:detail.name,version:detail.baseVersion+1,release_id:releaseId,updated_at:ctx.now}
  mutations.push(detail.baseVersion?{kind:'update',table:bases,set:baseRow,where:trustedPredicate('id=? AND version=? AND release_id=?',[detail.appId,detail.baseVersion,detail.parentReleaseId]),expectedRows:1}:{kind:'insert',table:bases,row:{...baseRow,created_at:ctx.now}})
  mutations.push({kind:'insert',table:releases,row:{id:releaseId,app_id:detail.appId,owner_id:ctx.principal.id,preview_id:previewId,detail_json:canonical({...detail,recoveryPolicy:canonical(rules)}),created_at:ctx.now}},{kind:'update',table:previews,set:{state:'adopted'},where:trustedPredicate("id=? AND state='prepared' AND expires_at>?",[previewId,ctx.now]),expectedRows:1})
  return admission.commit(ctx,{commandId,action:'release.adopt',appId:detail.appId,canonicalInputHash:hash,permit,guards:[...detail.guards,...activation.guards,trustedPredicate('?>strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')',[detail.expiresAt])],mutations,audit:[{action:'release.adopt',subject:null,changes:[],sourceIds:[],personalContentRefs:[previewId]}],events:[],outbox:[],committedResult:{kind:'manual_schema',releaseId,appId:detail.appId,schemas:detail.schemas.map(s=>({id:s.id,label:s.label})),recoveryUrl:`/api/v1/records/releases/${releaseId}/recovery`}})
 }
 async function read(ctx:RequestContext,appId:string){
  const permit=await manualAuthority(db,policy,ctx,appId,'0'.repeat(64)),guards=[...permit.guards]
  const descriptors=registry.list(appId).filter(d=>d.schema.physicalRevision.startsWith('manual_'))
  for(const descriptor of descriptors){const scope=await policy.scope(ctx,{appId,entityId:descriptor.schema.id,purpose:'read'});if(!scope.unrestrictedRows||descriptor.schema.fields.some(f=>!scope.readableFieldIds.includes(f.id)))throw new AdmissionError('forbidden','Schema editing requires full current table access.');guards.push(...scope.currentAuthorityGuards)}
  const base=await db.prepare('SELECT name FROM manual_record_bases WHERE id=?').bind(appId).first<{name:string}>()
  if(!base)throw new AdmissionError('not_found','This application is source maintained. Manual editing is available for bases created in the records builder.')
  await assertGuards(db,guards)
  return {appId,name:base.name,tables:descriptors.map(d=>({id:d.schema.id,label:d.schema.label,...(d.schema.primaryFieldId?{primaryFieldId:d.schema.primaryFieldId}:{}),...(d.schema.incomingRelations?{incomingRelations:d.schema.incomingRelations}:{}),fields:structuredClone(d.schema.fields)}))} as {appId:string;name:string;tables:SchemaDraft['tables']}
 }
 async function recovery(ctx:RequestContext,releaseId:string){const row=await db.prepare('SELECT app_id,detail_json FROM manual_record_releases WHERE id=? AND owner_id=?').bind(releaseId,ctx.principal.id).first<{app_id:string;detail_json:string}>();if(!row)throw new AdmissionError('not_found','Release not found.');const permit=await manualAuthority(db,policy,ctx,row.app_id,'0'.repeat(64));const d=JSON.parse(row.detail_json) as Stored & {recoveryPolicy:string};const latest=await db.prepare('SELECT r.detail_json FROM manual_record_bases b JOIN manual_record_releases r ON r.id=b.release_id AND r.app_id=b.id WHERE b.id=? AND b.owner_id=?').bind(row.app_id,ctx.principal.id).first<{detail_json:string}>();if(!latest)throw new AdmissionError('forbidden','Current recovery authority is unavailable.');const recoveryPolicy=(JSON.parse(latest.detail_json) as {recoveryPolicy:string}).recoveryPolicy;const current=await db.prepare("SELECT p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.app_id=? AND m.principal_id=? AND m.state='active'").bind(row.app_id,ctx.principal.id).first<{rules_json:string}>();if(current?.rules_json!==recoveryPolicy)throw new AdmissionError('forbidden','Recovery snapshot access changed. A currently authorized recovery review is required.');await assertGuards(db,[...permit.guards,trustedPredicate("EXISTS(SELECT 1 FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.app_id=? AND m.principal_id=? AND m.state='active' AND p.rules_json=?)",[row.app_id,ctx.principal.id,recoveryPolicy])]);return {kind:'manual_schema_recovery',releaseId,priorSchemas:d.prior,retainedRows:d.snapshots,tables:recoveryTables(d.prior,d.snapshots),recovery:d.recovery}}
 return {preview,adopt,read,recovery}
}
function publicPreview(d:Stored):ManualPreview {const {guards,adoptionGuards,prior,removals,policy,baseVersion,snapshots,...publicFields}=d;return publicFields}
