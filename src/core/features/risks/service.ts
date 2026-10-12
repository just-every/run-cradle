import { readShippedLens } from '../../../apps/launch/shipped-lenses.server'
import { HTTPException } from 'hono/http-exception'

import type { Platform } from '../../platform'
import { createUlid } from '../../shared/ids'
import { createRiskRepository } from './repository'

export const createRiskService = (platform: Platform) => {
  const repository = createRiskRepository(platform.database)

  return {
    async listShippedLens(cursor?:string) {
      const page=await readShippedLens(platform.bindings.DB,'risks',cursor)
      const records=await Promise.all(page.items.map(item=>repository.find(String(item.id))))
      return {name:page.name,description:page.description,risks:records.flatMap(record=>record?[record.risk]:[]),total:page.total.value,totalLabel:page.total.kind==='at_least'?'10,000+':String(page.total.value),nextCursor:page.nextCursor}
    },

    async detail(id: string) {
      const risk = await repository.find(id)
      if (!risk) throw new HTTPException(404, { message: `Risk ${id} was not found.` })
      return risk
    },

  }
}
