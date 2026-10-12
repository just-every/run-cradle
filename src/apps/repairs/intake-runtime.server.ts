import { Hono } from 'hono'
import { z } from 'zod'
import type { CommandRegistry } from '../../core/registry/commands'
import { commandSchema, idSchema } from '../../core/registry/validation'
import { errorResponse } from '../../core/registry/errors.server'
import { createUlid } from '../../core/shared/ids'
import { AdmissionError } from '../../domains/admission/errors'
import { canonicalHash } from '../../domains/admission/canonical'
import { trustedPredicate } from '../../domains/admission/sql.server'
import type { RequestContext } from '../../domains/authority/ports'
import type { PageQuery } from '../../contracts/primitives'
import type { RecordPort } from '../../domains/records/ports'
import { createRepairAdmissionContext, type RepairAdmissionDependencies } from './context.server'
import { repairActionSchemas } from './contracts'
import { submitIntake, resolveIdentity } from './intake.server'
import { projectIntake } from './intake-projection.server'
import { createRepairRepository, str } from './repository.server'
import { resolveRepairCapture } from './capture.server'
import { REPAIRS_APP_ID, REPAIRS_FORM_ID, REPAIR_ENTITIES, repairRef, repairFieldId } from './model'

export function registerRepairIntakeCommands(registry: CommandRegistry, d: RepairAdmissionDependencies) {
  for (const action of ['intake.submit', 'intake.resolve-identity'] as const) {
    const input = repairActionSchemas[action]
    registry.register({ action, description: action.replaceAll('.', ' ').replaceAll('-', ' '),
      inputSchema: z.toJSONSchema(input) as never, input: commandSchema(input),
      visible: async ctx => {
        try { await d.policy.scope(ctx, { appId: REPAIRS_APP_ID, entityId: REPAIR_ENTITIES.intakes, purpose: 'read' }); return ctx.principal.kind === 'human' }
        catch { return false }
      },
      replayIdentity: async (_ctx, command) => ({ appId: REPAIRS_APP_ID, canonicalInputHash: await canonicalHash(command) }),
      prepare: async (ctx, command) => {
        if (ctx.principal.kind !== 'human') throw new AdmissionError('unconfigured', 'Repair automated intake authority is not configured')
        const context = createRepairAdmissionContext(d, ctx, command, action)
        return action === 'intake.submit' ? submitIntake(context, repairActionSchemas['intake.submit'].parse(command.input)) : resolveIdentity(context, repairActionSchemas['intake.resolve-identity'].parse(command.input))
      },
    })
  }
}

export function createRepairIntakeReads(d: Pick<RepairAdmissionDependencies, 'db' | 'policy'> & {
  records: Pick<RecordPort, 'query'>
  intakeClaims(ctx: RequestContext, id: string): Promise<string[]>
}) {
  const repo = createRepairRepository(d)
  async function intake(ctx: RequestContext, id: string) {
    return { ...await projectIntake(ctx, repo, await repo.load(ctx, 'intakes', id)), claimIds: await d.intakeClaims(ctx, id) }
  }
  return { intake,
    async list(ctx: RequestContext, query: PageQuery & { state?: string }) {
      const scope = await repo.scope(ctx, 'intakes'), { state, ...page } = query
      if (state) {
        if (!['received', 'extracting', 'needs_identity', 'needs_review', 'ready', 'admitted', 'duplicate', 'failed'].includes(state)) throw new AdmissionError('validation', 'Unknown intake lifecycle filter')
        scope.rowPredicate = trustedPredicate(`(${scope.rowPredicate.sql}) AND lifecycle=?`, [...scope.rowPredicate.values, state])
      }
      const records = await d.records.query(ctx, scope, page)
      return { ...records, items: await Promise.all(records.items.map(row => intake(ctx, row.id))) }
    },
    async context(ctx: RequestContext) {
      await repo.scope(ctx, 'intakes')
      const staff = await repo.list(ctx, 'staff', trustedPredicate('principal_id=? AND active=1', [ctx.principal.id]))
      const stores = (await Promise.all(staff.map(row => repo.load(ctx, 'stores', str(row, 'store_id'))))).filter(row => row.active === 1)
      const assets = (await Promise.all(stores.map(store => repo.list(ctx, 'assets', trustedPredicate('store_id=? AND active=1', [store.id]))))).flat()
      return { appId: REPAIRS_APP_ID, formId: REPAIRS_FORM_ID, entityId: REPAIR_ENTITIES.intakes,
        fieldIds: { text: repairFieldId('intakes', 'text'), store: repairFieldId('intakes', 'store_id'), asset: repairFieldId('intakes', 'asset_id') },
        stores: stores.map(store => ({ ref: repairRef('stores', store.id), version: store.version, name: str(store, 'name') })),
        assets: assets.map(asset => ({ ref: repairRef('assets', asset.id), version: asset.version, storeId: str(asset, 'store_id'), name: str(asset, 'name'), serial: asset.serial })),
        photoUpload: stores.length === 1 ? { state: 'ready' as const, ...await resolveRepairCapture(d)(ctx, REPAIRS_APP_ID, repairRef('stores', stores[0]!.id), 'file'), uploadAction: 'upload.begin', captureAction: 'source.capture' } : { state: 'needs_store' as const, message: 'Choose the store for this repair photo.' },
      }
    },
  }
}

export function createRepairIntakeHttp(reads: ReturnType<typeof createRepairIntakeReads>, authenticate: (request: Request, ingress: RequestContext['ingress'], requestId: string) => Promise<RequestContext>) {
  const app = new Hono()
  app.all('*', async c => {
    const requestId = createUlid(), operation = `${c.req.method} ${c.req.path}`
    try {
      const ctx = await authenticate(c.req.raw, 'http', requestId)
      if (c.req.method !== 'GET') throw new AdmissionError('not_found', 'Use the typed intake command endpoint')
      if (c.req.query('appId') && c.req.query('appId') !== REPAIRS_APP_ID) throw new AdmissionError('not_found', 'Repair app not found')
      const path = c.req.path, match = path.match(/^\/api\/v1\/intakes\/([^/]+)$/)
      const data = path === '/api/v1/repairs/intake-context' ? await reads.context(ctx) : match ? await reads.intake(ctx, idSchema.parse(match[1])) : path === '/api/v1/intakes' ? await reads.list(ctx, { state: c.req.query('state'), cursor: c.req.query('cursor'), limit: c.req.query('limit') ? Number(c.req.query('limit')) : 50 }) : null
      if (!data) throw new AdmissionError('not_found', 'Repair intake route not found')
      return c.json({ data, meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now, consistencyToken: ctx.consistencyToken ?? '' } }, 200, { 'cache-control': 'no-store' })
    } catch (error) { return errorResponse(error, requestId, operation) }
  })
  return app
}
