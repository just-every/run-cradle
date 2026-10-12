import type { Page } from '../../contracts/primitives'
import { useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'

export function LaunchOwnerPicker({ id = 'field-launch-owner', value, onChange }: { id?: string; value: string; onChange: (value: string) => void }) {
  const owners = useResource<Page<{ id: string; name: string }>>('/api/v1/launch/owners')
  return <ResourceState resource={owners.resource} operation="campaign owners" retry={owners.refresh}>{page => <select id={id} required value={value} onChange={event => onChange(event.target.value)}><option value="">Choose a person</option>{page.items.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>}</ResourceState>
}
