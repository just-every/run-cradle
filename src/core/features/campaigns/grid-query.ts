import { z } from 'zod'
import { campaignLifecycle } from '../../../apps/launch/lifecycle'
import type { Direction, SortKey } from '../../../apps/launch/paging'
import type { CampaignSummary } from './repository'

export const gridQuerySchema = z.object({ view: z.enum(['all', 'launch-prep', 'mine']).default('all'), phase: z.enum(campaignLifecycle.phases).optional(), status: z.enum(campaignLifecycle.statuses).optional(), sort: z.enum(['launchDate', 'name', 'health']).default('launchDate'), direction: z.enum(['asc', 'desc']).default('asc') })
export type GridQuery = z.infer<typeof gridQuerySchema>
export const gridViewLabels: Record<GridQuery['view'], string> = { all: 'All active', 'launch-prep': 'Launch prep', mine: 'My campaigns' }

/** The grid's conditions and its total order: the requested sort, then the campaign ID. */
export function gridSelection(query: GridQuery, operatorId: string) {
 const matches = (row: CampaignSummary) => (!query.phase || row.phase === query.phase) && (!query.status || row.status === query.status) && (query.view !== 'launch-prep' || row.phase === campaignLifecycle.launchPreparationPhase) && (query.view !== 'mine' || row.owner.id === operatorId)
 const key = (row: CampaignSummary): SortKey => [query.sort === 'health' ? row.health ?? -1 : String(row[query.sort]), row.id]
 const directions: Direction[] = [query.direction, 'asc']
 return { matches, key, directions }
}
