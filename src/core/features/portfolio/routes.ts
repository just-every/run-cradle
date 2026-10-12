import type { Hono } from 'hono'

import type { AppEnv } from '../../app/types'
import type { Platform } from '../../platform'
import { createPortfolioService } from './service'

export const registerPortfolioRoutes = (app: Hono<AppEnv>, platform: Platform) => {
  const service = createPortfolioService(platform)
  app.get('/api/portfolio', async (context) => context.json(await service.get()))
}
