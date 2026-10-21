import { z } from 'zod'
import { campaignLifecycle } from '../../../apps/launch/lifecycle'
import type { Direction, SortKey } from '../../../apps/launch/paging'
import type { CampaignSummary } from './repository'

export const gridQuerySchema = z.object({ view: z.enum(['all', 'launch-prep', 'mine']).default('all'), phase: z.enum(campaignLifecycle.phases).optional(), status: z.enum(campaignLifecycle.statuses).optional(), group: z.enum(['none', 'phase', 'status', 'owner']).default('none'), sort: z.enum(['launchDate', 'name', 'health']).default('launchDate'), direction: z.enum(['asc', 'desc']).default('asc') })
export type GridQuery = z.infer<typeof gridQuerySchema>
export const gridViewLabels: Record<GridQuery['view'], string> = { all: 'All active', 'launch-prep': 'Launch prep', mine: 'My campaigns' }

const position = (values: readonly string[], value: string) => values.indexOf(value)
// Grouped rows stay together across pages: phases and statuses in lifecycle order, owners by name.
const groupKey = (query: GridQuery, row: CampaignSummary): SortKey => query.group === 'phase' ? [position(campaignLifecycle.phases, row.phase)]
 : query.group === 'status' ? [position(campaignLifecycle.statuses, row.status)]
 : query.group === 'owner' ? [row.owner.name, row.owner.id] : []

/** The grid's conditions and its total order: the group, the requested sort, then the campaign ID. */
export function gridSelection(query: GridQuery, operatorId: string) {
 const matches = (row: CampaignSummary) => (!query.phase || row.phase === query.phase) && (!query.status || row.status === query.status) && (query.view !== 'launch-prep' || row.phase === campaignLifecycle.launchPreparationPhase) && (query.view !== 'mine' || row.owner.id === operatorId)
 const key = (row: CampaignSummary): SortKey => [...groupKey(query, row), query.sort === 'health' ? row.health ?? -1 : String(row[query.sort]), row.id]
 const grouped: Direction[] = query.group === 'none' ? [] : query.group === 'owner' ? ['asc', 'asc'] : ['asc']
 const directions: Direction[] = [...grouped, query.direction, 'asc']
 return { matches, key, directions }
}
