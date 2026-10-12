import type { CellValue, Page } from '../../contracts/primitives'
import type { Member } from '../../domains/authority/contracts'
import type { Field } from '../../domains/records/contracts'
import { useResource } from '../shared/api'
import { ResourceState } from '../shared/presentation'
export function PersonPicker({ appId, field, value, onChange }: { appId: string; field: Field; value: CellValue; onChange: (value: CellValue) => void }) {
  const members = useResource<Page<Member>>(`/api/v1/members?appId=${encodeURIComponent(appId)}`)
  return <ResourceState resource={members.resource} operation="permitted people" retry={members.refresh}>{page => <select id={`field-${field.id}`} required={field.required} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || null)}><option value="">Choose a person</option>{page.items.filter(member => member.state === 'active').map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select>}</ResourceState>
}
