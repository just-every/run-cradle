import type { Platform } from '../../platform'
import type { ServerFoundation } from '../foundation.server'
import type { createRecordsComposition } from './records.server'
import { registerRepairIntakeCommands, createRepairIntakeReads, createRepairIntakeHttp } from '../../../apps/repairs/intake-runtime.server'
import { REPAIRS_APP_ID, REPAIR_ENTITIES } from '../../../apps/repairs/model'
import { createOperationsProjection } from '../../../domains/operations/environment.server'
import { OperationsRepository } from '../../../domains/operations/repository.server'
import { createRepairCaseAdapter } from '../../../domains/operations/repair-adapter.server'
import { registerRepairOpenCommand, createRepairCaseReads, createRepairCaseHttp } from '../../../apps/repairs/case-runtime.server'
import {createRepairCaseControls} from '../../../apps/repairs/case-controls.server'
import {registerRepairQuoteCommand} from '../../../apps/repairs/quote-runtime.server'
import {registerRepairContractorCommand} from '../../../apps/repairs/contractor-runtime.server'
import type { EvidenceLink } from '../../../domains/evidence/contracts'

/** Mount the complete manual intake slice; case/booking/provider actions remain separately gated. */
export function createRepairIntakeComposition(platform: Platform, foundation: ServerFoundation, records: ReturnType<typeof createRecordsComposition>) {
  const deps = { db: platform.bindings.DB, policy: foundation.policy, evidence: records.sources }
  registerRepairIntakeCommands(foundation.commands, deps)
  const reads = createRepairIntakeReads({ ...deps, records: records.services.reader,
    async intakeClaims(ctx, id) {
      const rows = await deps.db.prepare("SELECT id,evidence_json FROM evidence_claims WHERE app_id=? AND json_extract(subject_json,'$.appId')=? AND json_extract(subject_json,'$.entityId')=? AND json_extract(subject_json,'$.recordId')=? ORDER BY id").bind(REPAIRS_APP_ID, REPAIRS_APP_ID, REPAIR_ENTITIES.intakes, id).all<{ id: string; evidence_json: string }>()
      const allowed: string[] = []
      for (const row of rows.results) {
        try { await records.sources.validateLinks(ctx, JSON.parse(row.evidence_json) as EvidenceLink[]); allowed.push(row.id) }
        catch (error) { if (!(error instanceof Error) || !('code' in error) || !['forbidden', 'not_found', 'stale_evidence'].includes(String(error.code))) throw error }
      }
      return allowed
    },
  })
  const operations=new OperationsRepository({db:deps.db,policy:deps.policy,environment:{project:createOperationsProjection({...deps,descriptors:foundation.descriptors})}})
  const caseDeps={...deps,cases:createRepairCaseAdapter(operations,records.sources)}
  registerRepairOpenCommand(foundation.commands,caseDeps)
  const controls=createRepairCaseControls(caseDeps,operations)
  controls.register(foundation.commands)
  registerRepairContractorCommand(foundation.commands,caseDeps)
  registerRepairQuoteCommand(foundation.commands,caseDeps)
  const caseReads=createRepairCaseReads(caseDeps,operations,controls)
  return { caseReads, caseHttp:createRepairCaseHttp(caseReads,foundation.authenticate), reads, http: createRepairIntakeHttp(reads, foundation.authenticate) }
}
