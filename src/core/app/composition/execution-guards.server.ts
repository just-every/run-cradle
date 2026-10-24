import {trashContext} from '../../../domains/records/trash/authority.server'
import type { ServerFoundation } from '../foundation.server'
import type { ExecutionDependencies } from '../../../domains/execution/ports'
import { trustedPredicate, exists, and, eq } from '../../../domains/admission/sql.server'
import { EVIDENCE_SOURCE_ENTITY_ID } from '../../../domains/evidence/identity'
import { ApiError } from '../../registry/errors'
import { schemaGuard } from '../../../domains/records/change.server'
/** Dispatch freezes the exact adopted source, records and control owner. Readback
 * remains available after source changes; X separately enforces its bound read authority. */
export function createExecutionGuards(db:D1Database,foundation:ServerFoundation):ExecutionDependencies['currentGuards'] {
 return async(ctx,request,mode)=>{
  const guards=[trustedPredicate("NOT EXISTS(SELECT 1 FROM portability_fences WHERE name='restore')")]
  if(mode==='reconcile')return guards
  if(request.action==='record.calendar.sync')guards.push(trustedPredicate('EXISTS(SELECT 1 FROM manual_record_bases b JOIN manual_record_releases r ON r.id=b.release_id AND r.app_id=b.id WHERE b.id=? AND b.release_id=?)',[request.appId,request.releaseId]))
  else guards.push(trustedPredicate("EXISTS(SELECT 1 FROM live_app_releases l JOIN app_releases r ON r.id=l.release_id WHERE l.app_id=? AND l.release_id=? AND r.state='live' AND r.source_hash=l.source_hash)",[request.appId,request.releaseId]))
  for(const revision of request.expected){
   if(revision.ref.entityId===EVIDENCE_SOURCE_ENTITY_ID){guards.push(trustedPredicate('EXISTS(SELECT 1 FROM evidence_sources WHERE id=? AND app_id=? AND current_version=? AND erased_at IS NULL)',[revision.ref.recordId,revision.ref.appId,revision.version]));continue}
   const d=foundation.descriptors.get(revision.ref.appId,revision.ref.entityId)
   const current=request.action==='record.calendar.sync'&&request.calendarBinding?.operation==='cancel'?trashContext(ctx):ctx
   const scope=await foundation.policy.scope(current,{appId:revision.ref.appId,entityId:revision.ref.entityId,purpose:'read'})
   guards.push(...scope.currentAuthorityGuards,schemaGuard(d),exists(d.table,and(scope.rowPredicate,eq(d.table,d.idColumn,revision.ref.recordId),eq(d.table,d.versionColumn,revision.version))))
  }
  if(request.context){
   const context=request.context
   guards.push(trustedPredicate('EXISTS(SELECT 1 FROM evidence_contexts WHERE id=? AND app_id=? AND principal_id=? AND sha256=? AND erased_at IS NULL AND expires_at>?)',[context.id,request.appId,ctx.principal.id,context.sha256,new Date().toISOString()]))
  }
  if(request.modelBinding)guards.push(trustedPredicate('EXISTS(SELECT 1 FROM execution_model_profiles WHERE id=? AND version=? AND version=? AND app_id=?)',[request.modelBinding.id,request.modelBinding.version,request.controlEpoch,request.appId]))
  if(request.caseId)guards.push(trustedPredicate("EXISTS(SELECT 1 FROM operation_cases WHERE id=? AND app_id=? AND control_epoch=? AND state IN ('active','waiting'))",[request.caseId,request.appId,request.controlEpoch]))
  if(request.definitionId&&request.action!=='record.calendar.sync'){if(request.definitionVersion===null)throw new ApiError('validation','An automation definition version is required.');guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automations WHERE id=? AND definition_version=? AND enabled=1)',[request.definitionId,request.definitionVersion]))}
  for(const guard of guards)if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new ApiError('stale_evidence','The release, source, record or control authority changed before dispatch.')
  return guards
 }
}
