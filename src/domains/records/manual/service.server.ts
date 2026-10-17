import { assertCalculationBounds } from '../calculation-bounds'
import { principalGuards } from '../../authority/guards.server'
import { recoveryTables } from './recovery.server'
import { createUlid } from '../../../core/shared/ids'
import type { AdmissionPort } from '../../admission/ports'
import type { RequestContext, PolicyPort } from '../../authority/ports'
import { AdmissionError } from '../../admission/errors'
import { canonical, canonicalHash } from '../../admission/canonical'
import { registerTable, trustedPredicate } from '../../admission/sql.server'
import type { DescriptorRegistry } from '../descriptors.server'
import { draftSchema, type ManualPreview, type SchemaDraft } from './contracts'
import { manualAuthority } from './authority.server'
import { createReleaseCore, publicPreview, type StoredPreview } from './release.server'
import { assertGuards } from '../fence.server'
const previews=registerTable('manual_record_previews',['id','app_id','owner_id','state','detail_json','created_at','expires_at'])
export function createManualSchemas(db:D1Database,policy:PolicyPort,admission:AdmissionPort,registry:DescriptorRegistry){
 const core=createReleaseCore(db,policy,admission,registry)
 async function preview(ctx:RequestContext,unknown:unknown,pendingViews?:import('../link-picker-schema').PickerViewSnapshot[]):Promise<ManualPreview>{
  try{assertCalculationBounds(unknown)}catch(error){throw new AdmissionError('validation',(error as Error).message)}
  const draft=draftSchema.parse(unknown),id=createUlid(),inputHash=await canonicalHash(draft)
  const permit=await manualAuthority(db,policy,ctx,draft.appId,inputHash)
  const detail=await core.buildPreview(draft,id,{permit,reader:ctx,ownerId:ctx.principal.id,pendingViews,expiresAt:new Date(Date.parse(ctx.now)+1800000).toISOString()})
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
  const detail=JSON.parse(row.detail_json) as StoredPreview;detail.guards=(detail.adoptionGuards??detail.guards).map(g=>trustedPredicate(g.sql,g.values));const hash=await canonicalHash({kind:'manual_schema',previewId})
  const replay=await admission.replay(ctx,commandId,'release.adopt',detail.appId,hash);if(replay)return replay
  if(row.state!=='prepared'||detail.expiresAt<=ctx.now)throw new AdmissionError('version_conflict','Preview has expired or was already adopted.')
  const permit=await manualAuthority(db,policy,ctx,detail.appId,hash)
  await assertGuards(db,[...permit.guards,...detail.guards])
  return core.applyRelease(ctx,{commandId,hash,detail,previewId,permit,mutations:[{kind:'update',table:previews,set:{state:'adopted'},where:trustedPredicate("id=? AND state='prepared' AND expires_at>?",[previewId,ctx.now]),expectedRows:1}],audit:[{action:'release.adopt',subject:null,changes:[],sourceIds:[],personalContentRefs:[previewId]}]})
 }
 async function read(ctx:RequestContext,appId:string){
  const permit=await manualAuthority(db,policy,ctx,appId,'0'.repeat(64)),guards=[...permit.guards]
  const descriptors=registry.list(appId).filter(d=>d.schema.physicalRevision.startsWith('manual_'))
  for(const descriptor of descriptors){const scope=await policy.scope(ctx,{appId,entityId:descriptor.schema.id,purpose:'read'});if(!scope.unrestrictedRows||descriptor.schema.fields.some(f=>!scope.readableFieldIds.includes(f.id)))throw new AdmissionError('forbidden','Schema editing requires full current table access.');guards.push(...scope.currentAuthorityGuards)}
  const base=await db.prepare('SELECT name FROM manual_record_bases WHERE id=?').bind(appId).first<{name:string}>()
  if(!base)throw new AdmissionError('not_found','This application is source maintained. Manual editing is available for bases created in the records builder.')
  await assertGuards(db,guards)
  return {appId,name:base.name,tables:descriptors.map(d=>({id:d.schema.id,label:d.schema.label,...(d.schema.primaryFieldId?{primaryFieldId:d.schema.primaryFieldId}:{}),...(d.schema.incomingRelations?{incomingRelations:d.schema.incomingRelations}:{}),...(d.schema.validationRules?{validationRules:structuredClone(d.schema.validationRules)}:{}),fields:structuredClone(d.schema.fields)}))} as {appId:string;name:string;tables:SchemaDraft['tables']}
 }
 async function recovery(ctx:RequestContext,releaseId:string){const row=await db.prepare('SELECT app_id,detail_json FROM manual_record_releases WHERE id=? AND owner_id=?').bind(releaseId,ctx.principal.id).first<{app_id:string;detail_json:string}>();if(!row)throw new AdmissionError('not_found','Release not found.');const permit=await manualAuthority(db,policy,ctx,row.app_id,'0'.repeat(64));const d=JSON.parse(row.detail_json) as StoredPreview & {recoveryPolicy:string};const latest=await db.prepare('SELECT r.detail_json FROM manual_record_bases b JOIN manual_record_releases r ON r.id=b.release_id AND r.app_id=b.id WHERE b.id=? AND b.owner_id=?').bind(row.app_id,ctx.principal.id).first<{detail_json:string}>();if(!latest)throw new AdmissionError('forbidden','Current recovery authority is unavailable.');const recoveryPolicy=(JSON.parse(latest.detail_json) as {recoveryPolicy:string}).recoveryPolicy;const current=await db.prepare("SELECT p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.app_id=? AND m.principal_id=? AND m.state='active'").bind(row.app_id,ctx.principal.id).first<{rules_json:string}>();if(current?.rules_json!==recoveryPolicy)throw new AdmissionError('forbidden','Recovery snapshot access changed. A currently authorized recovery review is required.');await assertGuards(db,[...permit.guards,trustedPredicate("EXISTS(SELECT 1 FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.app_id=? AND m.principal_id=? AND m.state='active' AND p.rules_json=?)",[row.app_id,ctx.principal.id,recoveryPolicy])]);return {kind:'manual_schema_recovery',releaseId,priorSchemas:d.prior,retainedRows:d.snapshots,tables:recoveryTables(d.prior,d.snapshots),recovery:d.recovery}}
 return {preview,adopt,read,recovery}
}
