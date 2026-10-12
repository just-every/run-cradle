import { campaignLifecycle } from '../../../../apps/launch/lifecycle'
import type { CampaignQuery } from './portfolio-types'

export const queryLabels: Record<CampaignQuery['view'], string> = {
  all: 'All active',
  'launch-prep': 'Launch prep',
  mine: 'My campaigns',
}

export function CampaignGridControls({ query, onChange }: {
  query: CampaignQuery
  onChange: (patch: Partial<CampaignQuery>) => void
}) {
  return (
        <section
          className="portfolio-grid-toolbar"
          aria-label="Campaign grid controls"
        >
          <div
            className="portfolio-view-tabs"
            role="tablist"
            aria-label="Campaign views"
          >
            {(Object.keys(queryLabels) as CampaignQuery["view"][]).map(
              (view) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={query.view === view}
                  onClick={() => onChange({ view })}
                >
                  {queryLabels[view]}
                </button>
              ),
            )}
          </div>
          <div className="portfolio-grid-filters">
            <label>
              Phase
              <select aria-label="Phase"
                value={query.phase}
                onChange={(event) => onChange({ phase: event.target.value })}
              >
                <option value="">All phases</option>
                {campaignLifecycle.phases.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Status
              <select aria-label="Status"
                value={query.status}
                onChange={(event) =>
                  onChange({ status: event.target.value })
                }
              >
                <option value="">All statuses</option>
                {campaignLifecycle.statuses.map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Sort
              <select aria-label="Sort"
                value={`${query.sort}:${query.direction}`}
                onChange={(event) => {
                  const [sort, direction] = event.target.value.split(":") as [
                    CampaignQuery["sort"],
                    CampaignQuery["direction"],
                  ];
                  onChange({ sort, direction });
                }}
              >
                <option value="launchDate:asc">Launch date · earliest</option>
                <option value="launchDate:desc">Launch date · latest</option>
                <option value="name:asc">Name · A–Z</option>
                <option value="health:asc">Health · lowest</option>
              </select>
            </label>
          </div>
        </section>
  )
}
