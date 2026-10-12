import { planContentBytes, PLAN_BYTES_LIMIT } from '../../../../vendor/base/modules/import-kit/src/plan/size'
import { importCapacityError } from './plan-capacity'
import { compileSchemaSet } from '../migration.server'
import { createDescriptorRegistry, type DescriptorRegistry } from '../descriptors.server'
import type { EntitySchema } from '../contracts'
import type { RequestContext, PolicyPort } from '../../authority/ports'
import { manualAuthority } from '../manual/authority.server'
import { assertGuards } from '../fence.server'
import { AdmissionError } from '../../admission/errors'
import { buildImportPlan } from '../../../../vendor/base/modules/import-kit/src/plan/index'
import { canonicalJson, sha256, preflightD1ImportJob } from '../../../../vendor/base/modules/import-kit/src/d1/index'
import { checkSql } from '../../../../vendor/base/modules/import-kit/src/d1/budget'
import { nativeSource, mappingVersion } from './storage.server'
import { reserveNewBaseImportAuthority } from './authority.server'
import type { BasePreview } from './contracts'
import type { StoredReview } from './storage-review.server'

/** Compile the SAME reviewed manual schemas without staging or activating them.
 * Source validation and custody capacity must succeed before schema adoption. */
export async function prepareNativePlan(db:D1Database,policy:PolicyPort,registry:DescriptorRegistry,ctx:RequestContext,row:Pick<StoredReview,'id'|'app_id'|'schema_preview_id'|'created_at'>,preview:BasePreview) {
 const permit=await manualAuthority(db,policy,ctx,row.app_id,'0'.repeat(64))
 await assertGuards(db,permit.guards)
 const manual=await db.prepare('SELECT detail_json FROM manual_record_previews WHERE id=? AND app_id=? AND owner_id=?').bind(row.schema_preview_id,row.app_id,ctx.principal.id).first<{detail_json:string}>()
 if(!manual)throw new AdmissionError('not_found','Schema review not found.')
 const schemas=(JSON.parse(manual.detail_json) as {schemas:EntitySchema[]}).schemas
 return {...await preparePlanFromSchemas(db,registry,ctx,row,preview,schemas,permit.guards),schemaFingerprint:sha256(canonicalJson(schemas))}
}

export async function preparePlanFromSchemas(db:D1Database,registry:DescriptorRegistry,ctx:RequestContext,row:Pick<StoredReview,'app_id'|'created_at'|'id'>,preview:BasePreview,schemas:EntitySchema[],guards:Parameters<typeof assertGuards>[1]) {
 // A replay may already have these descriptors; compile initial schemas against
 // the other bases only, with all cross-table references resolved by the compiler.
 const prior=createDescriptorRegistry(registry.list().filter(d=>d.schema.appId!==row.app_id)),compiled=await compileSchemaSet(schemas,prior),reviewed=createDescriptorRegistry([...prior.list(),...compiled.descriptors])
 const authorityReservation=reserveNewBaseImportAuthority(ctx,row.app_id,schemas)
 let plan:ReturnType<typeof buildImportPlan>
 try{
 checkSql(authorityReservation.capacityTemplate)
 const native=nativeSource(preview,reviewed,row.created_at,ctx.principal.id)
 plan=buildImportPlan(native.source,native.mapping,{destination:row.app_id,namespace:preview.source.namespace,mappingVersion,authorization:{principalId:ctx.principal.id}})
 // The Kit sizes its actual creation serialization, including custody and the
 // preserved reversal journal, before any native schema is published.
 preflightD1ImportJob(plan,{destination:row.app_id,namespace:preview.source.namespace,mappingVersion,reviewedFingerprint:plan.fingerprint,operationKey:row.id,reversalPolicy:'preserve-conflicts',authorization:{principalId:ctx.principal.id,predicate:()=>authorityReservation.capacityTemplate}})
 const target=(await import('./target.server')).createNativeImportTarget(reviewed)
 for(const entry of plan.entries)for(const effect of entry.effects)for(const statement of target.write({...effect,destination:row.app_id,revision:'preflight'}))checkSql(statement)
 }catch(error){importCapacityError(error)}
 await assertGuards(db,guards)
 return {plan,authorityReservation,planSize:{bytes:planContentBytes(plan),limit:PLAN_BYTES_LIMIT}}
}
