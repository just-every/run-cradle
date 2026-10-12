import { Hono } from 'hono'
import { z } from 'zod'
import type { CommandRegistry } from '../../core/registry/commands'
import { commandSchema, idSchema } from '../../core/registry/validation'
import { errorResponse } from '../../core/registry/errors.server'
import { createUlid } from '../../core/shared/ids'
import { AdmissionError } from '../../domains/admission/errors'
import { canonicalHash } from '../../domains/admission/canonical'
import type { Mandate } from '../../domains/operations/contracts'
import type { RequestContext } from '../../domains/authority/ports'
import type { OperationsRepository, OperationsProjectionDependencies } from '../../domains/operations/repository.server'
import { createRepairOpenContext, type RepairOpenDependencies } from './context.server'
import { repairActionSchemas } from './contracts'
import { openRepair } from './intake.server'
import { projectRepair } from './projection.server'
import { createRepairRepository, str, json } from './repository.server'
import {createRepairQuoteRead} from './quote-runtime.server'
import {createRepairContractorRead} from './contractor-runtime.server'
import type {createRepairCaseControls} from './case-controls.server'
import { REPAIRS_APP_ID, REPAIR_ENTITIES, repairRef } from './model'

export function registerRepairOpenCommand(registry: CommandRegistry, d: RepairOpenDependencies) {
  const input = repairActionSchemas['repair.open'].required({ mandate: true, sourceVersions: true })
  registry.register({ action: 'repair.open', description: 'Open current repair work under reviewed operating instructions',
    inputSchema: z.toJSONSchema(input) as never, input: commandSchema(input),
    visible: async ctx => { try { await d.policy.scope(ctx, { appId: REPAIRS_APP_ID, entityId: REPAIR_ENTITIES.intakes, purpose: 'read' }); return ctx.principal.kind === 'human' } catch { return false } },
    replayIdentity: async (_ctx, command) => ({ appId: REPAIRS_APP_ID, canonicalInputHash: await canonicalHash(command) }),
    prepare: async (ctx, command) => {
      if (ctx.principal.kind !== 'human') throw new AdmissionError('forbidden', 'A person must explicitly open current repair work')
      return openRepair(createRepairOpenContext(d, ctx, command, 'repair.open'), command.input)
    },
  })
}
export function createRepairCaseReads(d: RepairOpenDependencies, operations: OperationsRepository<OperationsProjectionDependencies>, controls?:ReturnType<typeof createRepairCaseControls>) {
  const repo = createRepairRepository(d)
  return {
    contractors:createRepairContractorRead(d),
    quotes:createRepairQuoteRead(d),
    async context(ctx: RequestContext, id: string) {
      const intake = await repo.load(ctx, 'intakes', id)
      if (intake.lifecycle !== 'ready') throw new AdmissionError('invalid_transition', 'Only a current ready report can open repair work')
      const asset = await repo.load(ctx, 'assets', str(intake, 'asset_id')), store = await repo.load(ctx, 'stores', str(intake, 'store_id'))
      if (asset.active !== 1 || store.active !== 1 || asset.store_id !== store.id) throw new AdmissionError('invalid_transition', 'The current active store and asset identity must be checked again')
      const mandates = (await operations.all<Mandate>(ctx, 'mandates', REPAIRS_APP_ID)).filter(m => 'eligibleEntities' in m && m.state === 'active' && m.eligibleEntities.includes(REPAIR_ENTITIES.workOrders))
      const sourceIds=[...new Set([...json<string[]>(intake,'source_ids'),...mandates.flatMap(m=>m.sourceIds)])]
      const sourceVersions=await Promise.all(sourceIds.map(async id=>{const {source}=await d.evidence.source(ctx,id);return {id,version:source.version}}))
      return { sourceVersions, intake: { ref: repairRef('intakes', id), version: intake.version }, description: str(intake, 'text'),
        asset: { ref: repairRef('assets', asset.id), version: asset.version }, store: { ref: repairRef('stores', store.id), version: store.version },
        mandates, blockedReason: mandates.length ? null : 'Active operating instructions covering repair work orders are required before work can open.' }
    },
    async repair(ctx: RequestContext, id: string) {
      const row = await repo.load(ctx, 'workOrders', id)
      if (!row.case_id) throw new AdmissionError('unconfigured', 'This prior repair has no continuing case; review its existing record')
      const context = createRepairOpenContext(d, ctx, { commandId: createUlid(), expected: [], input: {} }, 'repair.read')
      return projectRepair(context, row)
    },
    async case(ctx: RequestContext, id: string) { const value=await operations.getCase(ctx,id);if(value.appId!==REPAIRS_APP_ID)throw new AdmissionError('not_found','Repair case not found');return {...value,allowedActions:controls?await controls.allowed(ctx,value):[]}; },
    async mandate(ctx: RequestContext, id: string) { const value=await operations.getMandate(ctx,id);if(value.appId!==REPAIRS_APP_ID)throw new AdmissionError('not_found','Repair mandate not found');return value; },
  }
}
export function createRepairCaseHttp(reads: ReturnType<typeof createRepairCaseReads>, authenticate: (request: Request, ingress: RequestContext['ingress'], requestId: string) => Promise<RequestContext>) {
  const app = new Hono()
  app.all('*', async c => {
    const requestId = createUlid(), operation = `${c.req.method} ${c.req.path}`
    try {
      const ctx = await authenticate(c.req.raw, 'http', requestId)
      if (c.req.method !== 'GET') throw new AdmissionError('not_found', 'Use the typed repair command endpoint')
      const match = c.req.path.match(/^\/api\/v1\/(intakes\/([^/]+)\/open-context|repairs\/([^/]+)|cases\/([^/]+)|mandates\/([^/]+)|repairs\/([^/]+)\/contractors|repairs\/([^/]+)\/quotes)$/)
      if (!match) throw new AdmissionError('not_found', 'Repair operation route not found')
      const data = match[7] ? await reads.quotes(ctx,idSchema.parse(match[7])) : match[6] ? await reads.contractors(ctx,idSchema.parse(match[6])) : match[2] ? await reads.context(ctx, idSchema.parse(match[2])) : match[3] ? await reads.repair(ctx, idSchema.parse(match[3])) : match[4] ? await reads.case(ctx, idSchema.parse(match[4])) : await reads.mandate(ctx, idSchema.parse(match[5]))
      return c.json({ data, meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now, consistencyToken: ctx.consistencyToken ?? '' } }, 200, { 'cache-control': 'no-store' })
    } catch (error) { return errorResponse(error, requestId, operation) }
  })
  return app
}
export type RepairOpenContextData = Awaited<ReturnType<ReturnType<typeof createRepairCaseReads>['context']>>
