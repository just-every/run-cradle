import { HTTPException } from 'hono/http-exception'

import type { Platform } from '../../platform'
import { createUlid } from '../../shared/ids'
import { createDecisionRepository } from './repository'

export const createDecisionService = (platform: Platform) => {
  const repository = createDecisionRepository(platform.database)

  return {
    list: () => repository.list(),
    async detail(id: string) {
      const decision = await repository.find(id)
      if (!decision) throw new HTTPException(404, { message: `Decision ${id} was not found.` })
      return { decision }
    },
  }
}
