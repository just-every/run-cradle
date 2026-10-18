import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import type { ViewMatch } from './find-in-view'
import { CellDisplay } from './record-fields'
import { ViewMatchCell } from './view-match'

export function RecordCardFields({ schema, record, visible, titleFieldId, match }: { schema: EntitySchema; record: RecordRow; visible: string[]; titleFieldId?: string; match?: ViewMatch | null }) {
  return <>{visible.filter(id => id !== titleFieldId).flatMap(id => {
    const field = schema.fields.find(item => item.id === id)
    return field ? <p key={id}><span className="cr-eyebrow">{field.label}</span><br /><ViewMatchCell recordId={record.id} fieldId={id} match={match}><CellDisplay appId={schema.appId} field={field} cell={record.fields[id]} /></ViewMatchCell></p> : []
  })}</>
}
