import { launchCollection } from '../../../apps/launch/paging'
import { executeLegacy } from '../../../apps/launch/legacy.server'
import type { Hono } from 'hono'

import type { AppEnv } from '../../app/types'
import { requirePathParam, parseJson } from '../../shared/http'
import { collection } from '../../shared/pagination'
import { riskEscalationSchema } from '../../shared/schemas'
import type { Platform } from '../../platform'
import { createRiskService } from './service'

export const registerRiskRoutes = (app: Hono<AppEnv>, platform: Platform) => {
  const service = createRiskService(platform)
  app.get('/api/risks/lens', async (context) => {
    const lens = await service.listShippedLens(context.req.query('cursor'))
    return context.json({...lens,items:lens.risks})
  })
  app.get('/api/risks/:id', async (context) => context.json(await service.detail(requirePathParam(context.req.param('id'), 'risk id'))))
  app.post('/api/risks/:id/escalate', async (context) => {
    const input = await parseJson(context.req.raw, riskEscalationSchema)
    const id = requirePathParam(context.req.param('id'), 'risk id')
    const receipt = await executeLegacy(platform,context.req.raw,'risk.escalate',{id,reason:input.reason},{kind:'risk',id,version:input.version})
    const detail = await service.detail(id)
    const created = receipt && typeof receipt === 'object' && !Array.isArray(receipt) ? receipt.decision : null
    return context.json({ ...detail, decision: created ?? null })
  })
}
