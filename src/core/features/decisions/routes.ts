import { launchCollection } from '../../../apps/launch/paging'
import { executeLegacy } from '../../../apps/launch/legacy.server'
import type { Hono } from 'hono'

import type { AppEnv } from '../../app/types'
import type { Platform } from '../../platform'
import { parseJson, requirePathParam } from '../../shared/http'
import { collection } from '../../shared/pagination'
import { decisionOutcomeSchema } from '../../shared/schemas'
import { createDecisionService } from './service'

export const registerDecisionRoutes = (app: Hono<AppEnv>, platform: Platform) => {
  const service = createDecisionService(platform)
  app.get('/api/decisions', async (context) => {
    const decisions = await service.list()
    const page=launchCollection(decisions,context.req.query('cursor'),context.req.query('limit'));return context.json({...page,decisions:page.items})
  })
  app.get('/api/decisions/:id', async (context) => context.json(await service.detail(requirePathParam(context.req.param('id'), 'decision id'))))
  app.post('/api/decisions/:id/outcome', async (context) => {
    const input = await parseJson(context.req.raw, decisionOutcomeSchema)
    const id = requirePathParam(context.req.param('id'), 'decision id')
    await executeLegacy(platform,context.req.raw,'decision.outcome',{id,outcome:input.outcome,rationale:input.rationale??''},{kind:'decision',id,version:input.version})
    return context.json(await service.detail(id))
  })
}
