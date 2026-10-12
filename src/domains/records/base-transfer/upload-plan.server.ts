import { createUlid } from '../../../core/shared/ids'
import { manualAuthority } from '../manual/authority.server'
import { draftSchema } from '../manual/contracts'
import type { EntitySchema } from '../contracts'
import type { DescriptorRegistry } from '../descriptors.server'
import type { RequestContext, PolicyPort } from '../../authority/ports'
import type { BasePreview } from './contracts'
import { preparePlanFromSchemas } from './storage-plan.server'
import { prepareReviewRetention } from './review-retention'

/** Read-only physical planning before even a retained schema/import review exists.
 * Adoption repeats this using the actual stored manual schemas and current actor. */
export async function preflightUpload(db:D1Database,policy:PolicyPort,registry:DescriptorRegistry,ctx:RequestContext,preview:BasePreview) {
 const draft=draftSchema.parse(preview.schemaDraft),id=createUlid()
 const permit=await manualAuthority(db,policy,ctx,draft.appId,'0'.repeat(64))
 const schemas:EntitySchema[]=draft.tables.map(table=>({...table,appId:draft.appId,version:1,createdAt:ctx.now,updatedAt:ctx.now,physicalRevision:'manual_'+id,lifecycle:{states:['active'],initial:'active',transitions:[]}}))
 const physical=await preparePlanFromSchemas(db,registry,ctx,{id,app_id:draft.appId,created_at:ctx.now},preview,schemas,permit.guards)
 const checked={...preview,planSize:physical.planSize}
 prepareReviewRetention(checked)
 return checked
}
