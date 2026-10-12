import type { CampaignQuery } from './portfolio-types'
export function parseCampaignQuery(search: Record<string, unknown>): CampaignQuery {
  return {
    view: search.view === 'launch-prep' || search.view === 'mine' ? search.view : 'all',
    phase: typeof search.phase === 'string' ? search.phase : '',
    status: typeof search.status === 'string' ? search.status : '',
    sort: search.sort === 'name' || search.sort === 'health' ? search.sort : 'launchDate',
    direction: search.direction === 'desc' ? 'desc' : 'asc',
  }
}
