import type { Hono } from 'hono'

import type { AppEnv } from '../../app/types'
import type { Platform } from '../../platform'
import { requirePathParam } from '../../shared/http'
import { collection } from '../../shared/pagination'
import { createAutomationService } from './service'

export const registerAutomationRoutes = (app: Hono<AppEnv>, platform: Platform) => {
  const service = createAutomationService(platform)
  app.get('/api/automations', async (context) => {
    const automations = await service.list()
    return context.json({ automations, ...collection(automations) })
  })
  app.get('/api/automations/runs', async (context) => {
    const runs = await service.runs()
    return context.json({ runs, ...collection(runs) })
  })
  app.get('/api/automations/:id/runs', async (context) => {
    const runs = await service.runs(requirePathParam(context.req.param('id'), 'automation id'))
    return context.json({ runs, ...collection(runs) })
  })
}
