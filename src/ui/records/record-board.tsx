import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import { CellDisplay } from './record-fields'
import { primaryRecordField } from './record-label'

/** Both the table switcher and saved boards render the records returned by their current query. */
export function RecordBoard({ schema, rows, visible, boardFieldId, titleFieldId, name }: { schema: EntitySchema; rows: RecordRow[]; visible: string[]; boardFieldId: string; titleFieldId?: string; name: string }) {
  const field = schema.fields.find(field => field.id === boardFieldId)
  const title = titleFieldId ?? primaryRecordField(schema)?.id
  return <div className="cr-board" role="region" tabIndex={0} aria-label={`${name} board; scroll for columns`}>
    {[...(field?.options ?? []), { id: '__unset', label: 'Unassigned or unavailable' }].map(option => <section key={option.id}>
      <h3>{option.label}</h3>
      {rows.filter(record => { const cell = record.fields[boardFieldId]; return option.id === '__unset' ? cell?.state !== 'value' || cell.value === null : cell?.state === 'value' && cell.value === option.id }).map(record => <article key={record.id} className="cr-card">
        <h3><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === title)} cell={title ? record.fields[title] : undefined} /></h3>
        {visible.filter(id => id !== title).map(id => <p key={id}><span className="cr-eyebrow">{schema.fields.find(field => field.id === id)?.label}</span><br /><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === id)} cell={record.fields[id]} /></p>)}
        <a className="cr-link" href={`/app/records/${record.ref.appId}/${record.ref.entityId}/${record.id}`}>Open record</a>
      </article>)}
    </section>)}
  </div>
}
