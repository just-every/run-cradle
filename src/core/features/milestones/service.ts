import { readShippedLens } from '../../../apps/launch/shipped-lenses.server'
import { HTTPException } from 'hono/http-exception'

import type { Platform } from '../../platform'
import { createMilestoneRepository } from './repository'

export const createMilestoneService = (platform: Platform) => {
  const repository = createMilestoneRepository(platform.database)

  return {
    async timeline(cursor?:string) {
      const [page, timezone] = await Promise.all([readShippedLens(platform.bindings.DB,'timeline',cursor), repository.workspaceTimezone()])
      const records=await Promise.all(page.items.map(item=>repository.find(String(item.id))))
      const milestones=records.flatMap(record=>record?[record.milestone]:[])
      if (!timezone) throw new Error('Workspace timezone is unavailable.')
      return { milestones, scale: 'month' as const, timezone,total:page.total.value,totalLabel:page.total.kind==='at_least'?'10,000+':String(page.total.value),nextCursor:page.nextCursor }
    },
    async detail(id: string) {
      const milestone = await repository.find(id)
      if (!milestone) throw new HTTPException(404, { message: `Milestone ${id} was not found.` })
      return milestone
    },
  }
}
