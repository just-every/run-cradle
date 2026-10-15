import type { Platform } from '../../platform'
import type { ServerFoundation } from '../foundation.server'
import type { createRecordsComposition } from './records.server'
import { createRepairIntakeReads, createRepairIntakeHttp } from '../../../apps/repairs/intake-runtime.server'
import { REPAIRS_APP_ID, REPAIR_ENTITIES } from '../../../apps/repairs/model'
import { createOperationsProjection } from '../../../domains/operations/environment.server'
import { OperationsRepository } from '../../../domains/operations/repository.server'
import { createRepairCaseAdapter } from '../../../domains/operations/repair-adapter.server'
import { createRepairCaseReads, createRepairCaseHttp } from '../../../apps/repairs/case-runtime.server'
import {createRepairCaseControls} from '../../../apps/repairs/case-controls.server'
import type { EvidenceLink } from '../../../domains/evidence/contracts'

import { registerRepairCommands } from '../../../apps/repairs/actions.server'
import { createRepairHttp } from '../../../apps/repairs/routes.server'
import { createRepairExecutionBridge } from '../../../domains/execution/repair-bridge.server'
import { currentRepairAgreement } from '../../../apps/repairs/agreement.server'
import { validateRepairCommitment } from '../../../apps/repairs/commitment.server'
import { repairEffectGuards } from '../../../apps/repairs/dispatch-guards.server'
import { createRepairProviderConfiguration, registerRepairAccountingMapping } from '../../../apps/repairs/provider-configuration.server'
import type { RepairDependencies } from '../../../apps/repairs/ports'
import type { createProvidersComposition } from './providers.server'
/** One repair command registry, sharing the real admission and provider runtime. */
export function createRepairIntakeComposition(platform: Platform, foundation: ServerFoundation, records: ReturnType<typeof createRecordsComposition>, providers: ReturnType<typeof createProvidersComposition>) {
  const deps = { db: platform.bindings.DB, policy: foundation.policy, evidence: records.sources }
  const intakeClaims: RepairDependencies['intakeClaims'] = async (ctx, id) => {
      const rows = await deps.db.prepare("SELECT id,evidence_json FROM evidence_claims WHERE app_id=? AND json_extract(subject_json,'$.appId')=? AND json_extract(subject_json,'$.entityId')=? AND json_extract(subject_json,'$.recordId')=? ORDER BY id").bind(REPAIRS_APP_ID, REPAIRS_APP_ID, REPAIR_ENTITIES.intakes, id).all<{ id: string; evidence_json: string }>()
      const allowed: string[] = []
      for (const row of rows.results) {
        try { await records.sources.validateLinks(ctx, JSON.parse(row.evidence_json) as EvidenceLink[]); allowed.push(row.id) }
        catch (error) { if (!(error instanceof Error) || !('code' in error) || !['forbidden', 'not_found', 'stale_evidence'].includes(String(error.code))) throw error }
      }
      return allowed
    }
  const reads = createRepairIntakeReads({ ...deps, records: records.services.reader, intakeClaims })
  const operations=new OperationsRepository({db:deps.db,policy:deps.policy,environment:{project:createOperationsProjection({...deps,descriptors:foundation.descriptors})}})
  const cases=createRepairCaseAdapter(operations,records.sources)
  let execution: RepairDependencies['execution']
  const d:RepairDependencies={get execution(){return execution},...deps,cases,admission:foundation.admission,records:{...records.services.reader,prepareChange:records.services.writer.prepareChange},intakeClaims,authoritySelection:cases.authoritySelection}
  const configuration=createRepairProviderConfiguration(d,providers)
  d.providerConfiguration=(ctx,request)=>configuration.configuration(ctx,{connectionId:request.connectionId,subject:request.businessBinding!.subject})
  execution=createRepairExecutionBridge({db:deps.db,execution:providers.execution,configuration:configuration.configuration,accountingCapability:configuration.accountingCapability,currentAgreement:currentRepairAgreement(d),commitment:validateRepairCommitment(d)})
  const ordinaryGuards=providers.dependencies.currentGuards
  providers.dependencies.currentGuards=async(ctx,request,mode)=>[...await ordinaryGuards(ctx,request,mode),...(request.businessBinding?.kind==='repair'?await repairEffectGuards(d)(ctx,request,mode):[])]
  registerRepairCommands(foundation.commands,d)
  registerRepairAccountingMapping(foundation.commands,d)
  const caseDeps=d
  const controls=createRepairCaseControls(caseDeps,operations)
  controls.register(foundation.commands)
  const caseReads=createRepairCaseReads(caseDeps,operations,controls)
  return { dependencies:d, outcomeHttp:createRepairHttp(d,foundation.authenticate), caseReads, caseHttp:createRepairCaseHttp(caseReads,foundation.authenticate), reads, http: createRepairIntakeHttp(reads, foundation.authenticate) }
}
