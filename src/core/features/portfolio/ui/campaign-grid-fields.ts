import type { CampaignField, CampaignGroup, CampaignQuery } from './portfolio-types'

/** Grid columns an operator can show or hide; the campaign name is always shown. */
export const campaignFields: readonly { id: CampaignField; label: string }[] = [
  { id: 'phase', label: 'Phase' },
  { id: 'owner', label: 'Owner' },
  { id: 'launchDate', label: 'Launch' },
  { id: 'budget', label: 'Budget' },
  { id: 'status', label: 'Status' },
  { id: 'risk', label: 'Risk' },
]
export const campaignGroupLabels: Record<CampaignGroup, string> = { none: 'No grouping', phase: 'Phase', status: 'Status', owner: 'Owner' }

/** The page's own search: the API query plus the chosen fields when they differ from all. */
export function campaignGridSearch(apiUrl: string, query: CampaignQuery) {
  const search = new URLSearchParams(apiUrl.split('?')[1] ?? '')
  if (query.fields.length !== campaignFields.length) search.set('fields', query.fields.join(','))
  return search.toString()
}
