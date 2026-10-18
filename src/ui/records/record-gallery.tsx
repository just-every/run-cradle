import {useViewColor} from './view-formatting'
import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import type { ViewMatch } from './find-in-view'
import { RecordCardFields } from './record-cards'
import { CellDisplay } from './record-fields'
import { ViewMatchCell } from './view-match'
import { GalleryCover } from './gallery-cover'
import './record-gallery.css'

export function RecordGallery({ schema, rows, visible, titleFieldId, groupBy, coverFieldId, coverFit = 'cover', match }: {
  schema: EntitySchema; rows: RecordRow[]; visible: string[]; titleFieldId: string; groupBy: string[]
  coverFieldId?: string; coverFit?: 'cover' | 'contain'; match?: ViewMatch | null
}) {
  const color=useViewColor(schema.fields)
  const groupFields = groupBy.filter(id => schema.fields.some(field => field.id === id))
  const cover = schema.fields.find(field => field.id === coverFieldId && field.type === 'attachment')
  const groups = new Map<string, RecordRow[]>()
  for (const row of rows) {
    const key = JSON.stringify(groupFields.map(id => row.fields[id]))
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return <div className="cr-gallery">{[...groups].map(([key, records]) => <section className="cr-gallery-group" key={key}>
    {groupFields.length > 0 && <h3 className="cr-gallery-group-title">{groupFields.map((id, index) => <span key={id}>{index > 0 && ' · '}<CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === id)} cell={records[0]!.fields[id]} /></span>)}<span className="cr-muted"> · {records.length} on this page</span></h3>}
    <div className="cr-gallery-cards">{records.map(record => <article data-view-color={color(record)} className="cr-card cr-gallery-card" key={record.id}>
      {cover && <GalleryCover record={record} fieldId={cover.id} fit={coverFit} />}
      <h4><ViewMatchCell recordId={record.id} fieldId={titleFieldId} match={match}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === titleFieldId)} cell={record.fields[titleFieldId]} /></ViewMatchCell></h4>
      <RecordCardFields schema={schema} record={record} visible={visible} titleFieldId={titleFieldId} match={match} />
      <a className="cr-link" href={`/app/records/${schema.appId}/${schema.id}/${record.id}`}>Open record</a>
    </article>)}</div>
  </section>)}</div>
}
