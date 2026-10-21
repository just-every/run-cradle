import type { Hono } from 'hono'

import type { AppEnv } from '../../app/types'
import type { Platform } from '../../platform'
import { requirePathParam } from '../../shared/http'
import { collection } from '../../shared/pagination'
import { createAutomationService } from './service'

export const registerAutomationRoutes = (app: Hono<AppEnv>, platform: Platform) => {
  const service = createAutomationService(platform)
  app.get('/api/automations', async (context) => {
    const monitor = await service.monitor(context.req.query('windowEnd'))
    return context.json({ ...monitor, ...collection(monitor.automations) })
  })
  app.get('/api/automations/runs', async (context) => context.json(await service.runs({ cursor: context.req.query('cursor'), limit: context.req.query('limit') })))
  app.get('/api/automations/:id/runs', async (context) => context.json(await service.runs({
    automationId: requirePathParam(context.req.param('id'), 'automation id'), cursor: context.req.query('cursor'), limit: context.req.query('limit'),
  })))
}
