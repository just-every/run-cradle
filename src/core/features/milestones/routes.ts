import type { Hono } from 'hono'

import type { AppEnv } from '../../app/types'
import { requirePathParam } from '../../shared/http'
import { collection } from '../../shared/pagination'
import type { Platform } from '../../platform'
import { createMilestoneService } from './service'

export const registerMilestoneRoutes = (app: Hono<AppEnv>, platform: Platform) => {
  const service = createMilestoneService(platform)
  app.get('/api/milestones/timeline', async (context) => {
    const timeline = await service.timeline(context.req.query('cursor'))
    return context.json({ ...timeline,items:timeline.milestones })
  })
  app.get('/api/milestones/:id', async (context) => context.json(await service.detail(requirePathParam(context.req.param('id'), 'milestone id'))))
}
