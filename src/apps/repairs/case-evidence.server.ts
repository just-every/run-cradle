import type { RepairOpenContext } from './context.server'
import { REPAIRS_APP_ID, REPAIR_ENTITIES, REPAIR_MODEL, repairFieldId } from './model'
import { AdmissionError } from '../../domains/admission/errors'
/** Every copied case source retains canonical owner/field custody in commit and replay guards. */
export async function retainCaseEvidence(c:RepairOpenContext,ids:string[]){
 for(const sourceId of new Set(ids)){
  const {source}=await c.d.evidence.source(c.ctx,sourceId)
  await c.evidence([{sourceId,sourceVersion:source.version,locator:{kind:'field',path:'content'},observedAt:c.ctx.now}])
  const owner=await c.d.db.prepare('SELECT app_id,entity_id,record_id,field_ids FROM evidence_sources WHERE id=?').bind(sourceId).first<{app_id:string;entity_id:string;record_id:string;field_ids:string}>()
  if(!owner||owner.app_id!==REPAIRS_APP_ID)throw new AdmissionError('forbidden','Case source ownership is not available')
  const entity=(Object.keys(REPAIR_ENTITIES) as (keyof typeof REPAIR_ENTITIES)[]).find(entity=>REPAIR_ENTITIES[entity]===owner.entity_id)
  if(!entity)throw new AdmissionError('unconfigured','Case evidence must have a configured repair record owner')
  const fieldIds=JSON.parse(owner.field_ids) as string[],names=REPAIR_MODEL[entity].fields.filter(field=>fieldIds.includes(repairFieldId(entity,field.name))).map(field=>field.name)
  if(names.length!==fieldIds.length)throw new AdmissionError('forbidden','Case source fields are not available')
  await c.repo.load(c.ctx,entity,owner.record_id,names)
 }
}
