import type { Hono } from 'hono'
import type { AppEnv } from '../../app/types'
import type { ServerFoundation } from '../../app/foundation.server'
import type { createRecordServices } from '../../../domains/records/service.server'
import { createUlid } from '../../shared/ids'
import { collection } from '../../shared/pagination'
import { createSearchService } from './service'

export const registerSearchRoutes = (app: Hono<AppEnv>, db: D1Database, records: ReturnType<typeof createRecordServices>, authenticate: ServerFoundation['authenticate']) => {
  const service = createSearchService(db, records)
  app.get('/api/search', async context => {
    const ctx = await authenticate(context.req.raw, 'http', createUlid())
    const includeArchived = context.req.query('archived') === 'true'
    return context.json(collection(await service.search(ctx, context.req.query('q'), includeArchived)), 200, { 'cache-control': 'no-store' })
  })
}
