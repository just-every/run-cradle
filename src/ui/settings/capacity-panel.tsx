import type { ConfigurationEvidence } from '../../domains/channels/contracts'
import { useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'

const entities = [
  ['campaigns', 'Campaigns'],
  ['campaignCustomFields', 'Campaign custom fields'],
  ['deliverables', 'Deliverables'],
  ['milestones', 'Milestones'],
  ['risks', 'Risks'],
  ['decisions', 'Decisions'],
  ['savedLenses', 'Saved lenses'],
  ['automations', 'Automations'],
] as const

export function CapacityPanel() {
  const { resource, refresh } = useResource<Pick<ConfigurationEvidence, 'limits'>>('/api/v1/settings')
  return <section className="cr-card cr-settings-details" aria-label="Stored entity capacity">
    <h2>Stored entity capacity</h2>
    <p>Current stored counts against the declared maxima. Archived campaigns still use capacity. These maxima are capacity targets, not measured scale qualifications.</p>
    <button className="cr-button cr-button--quiet" onClick={refresh} disabled={resource.state === 'loading'}>Refresh capacity</button>
    <ResourceState resource={resource} operation="stored entity capacity" retry={refresh}>{({ limits }) => <dl aria-live="polite">
      {entities.map(([name, label]) => {
        const limit = limits.find(item => item.name === name)
        return <div className="cr-tile" key={name}>
          <dt>{label}</dt>
          <dd>{limit ? <><span aria-label="Current count">{limit.current ?? 'Unknown'}</span> of <span aria-label="Declared maximum">{limit.maximum}</span></> : 'Capacity not declared'}</dd>
        </div>
      })}
    </dl>}</ResourceState>
  </section>
}
