import { HTTPException } from 'hono/http-exception'

import type { Platform } from '../../platform'
import { createSearchRepository } from './repository'

export const createSearchService = (platform: Platform) => {
  const repository = createSearchRepository(platform.database)
  return {
    async search(query: string | undefined, includeArchived: boolean) {
      const token = query?.trim()
      if (!token) throw new HTTPException(400, { message: 'Search requires a token.' })
      return repository.search(token, includeArchived)
    },
  }
}
