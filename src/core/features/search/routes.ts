import type { Hono } from 'hono'

import type { AppEnv } from '../../app/types'
import type { Platform } from '../../platform'
import { collection } from '../../shared/pagination'
import { createSearchService } from './service'

export const registerSearchRoutes = (app: Hono<AppEnv>, platform: Platform) => {
  const service = createSearchService(platform)
  app.get('/api/search', async (context) => {
    const includeArchived = context.req.query('archived') === 'true'
    return context.json(collection(await service.search(context.req.query('q'), includeArchived)))
  })
}
