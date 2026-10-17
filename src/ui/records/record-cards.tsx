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

export function RecordCards({ schema, rows, visible, titleFieldId, match }: { schema: EntitySchema; rows: RecordRow[]; visible: string[]; titleFieldId: string; match?: ViewMatch | null }) {
  return <div className="cr-record-cards">{rows.map(record => <article key={record.id} className="cr-card">
    <h3><ViewMatchCell recordId={record.id} fieldId={titleFieldId} match={match}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === titleFieldId)} cell={record.fields[titleFieldId]} /></ViewMatchCell></h3>
    <RecordCardFields schema={schema} record={record} visible={visible} titleFieldId={titleFieldId} match={match} />
    <a className="cr-link" href={`/app/records/${schema.appId}/${schema.id}/${record.id}`}>Open record</a>
  </article>)}</div>
}
