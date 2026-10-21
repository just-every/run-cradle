import { campaignFields } from './campaign-grid-fields'
import type { CampaignQuery } from './portfolio-types'
export function parseCampaignQuery(search: Record<string, unknown>): CampaignQuery {
  const chosen = typeof search.fields === 'string' ? search.fields.split(',') : null
  return {
    view: search.view === 'launch-prep' || search.view === 'mine' ? search.view : 'all',
    phase: typeof search.phase === 'string' ? search.phase : '',
    status: typeof search.status === 'string' ? search.status : '',
    group: search.group === 'phase' || search.group === 'status' || search.group === 'owner' ? search.group : 'none',
    sort: search.sort === 'name' || search.sort === 'health' ? search.sort : 'launchDate',
    direction: search.direction === 'desc' ? 'desc' : 'asc',
    fields: campaignFields.map((field) => field.id).filter((id) => chosen === null || chosen.includes(id)),
  }
}
