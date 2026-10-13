import { IncomingRelations } from './base-import/incoming-relations'
import './records.css'
import { RecordHistory } from '../evidence/record-history'
import { recordLabel } from './record-label'
import { useState } from 'react'
import type { EntitySchema, RecordDetail } from '../../domains/records/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useResource } from '../shared/api'
import { ResourceState, Timestamp } from '../shared/presentation'
import { CellDisplay } from './record-fields'
import { DeleteRecord } from './delete-record'
import { RecordEditor } from './record-editor'
export function RecordDetailPage({ appId, entityId, recordId }: { appId: string; entityId: string; recordId: string }) {
  const base = `/api/v1/apps/${appId}/entities/${entityId}`
  const schema = useResource<EntitySchema>(base)
  const detail = useResource<RecordDetail>(`${base}/records/${recordId}`)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const canEdit = (data: RecordDetail) => data.record.allowedActions.some(action => action.action === 'record.patch' && action.enabled)
  return <OperatorFeaturePage currentPath="/app/records" title=""><div className="cr-page cr-records-page"><a className="cr-record-back" href={`/app/records/${appId}/${entityId}`}>← Back to records</a><ResourceState resource={schema.resource} operation="record schema" retry={schema.refresh}>{schemaData => <ResourceState resource={detail.resource} operation="record" retry={detail.refresh}>{data => { const relations = data.relations.filter(relation => relation.page.items.length > 0); const incoming = data.incomingRelations?.some(relation => relation.page.items.length > 0); return deleting ? <DeleteRecord schema={schemaData} record={data.record} onClose={() => setDeleting(false)} /> : editing ? <section className="cr-card"><RecordEditor schema={schemaData} record={data.record} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); detail.refresh() }} /></section> : <><header className="cr-page-header"><div><p className="cr-eyebrow">{schemaData.label} · version {data.record.version}</p><h1>{recordLabel(data.record, schemaData)}</h1></div><button className="cr-button" onClick={() => setEditing(true)} disabled={!canEdit(data)}>Edit record</button></header><div className={`cr-record-layout${relations.length || incoming ? '' : ' cr-record-layout--single'}`}><dl className="cr-card cr-record-fields">{schemaData.fields.filter(field => !relations.some(relation => relation.fieldId === field.id)).map(field => <div key={field.id} className="cr-field"><dt>{field.label}</dt><dd><CellDisplay appId={schemaData.appId} field={field} cell={data.record.fields[field.id]} /></dd></div>)}</dl>{(relations.length > 0 || incoming) && <div className="cr-record-side">{relations.map(relation => <section className="cr-card cr-section cr-record-relation" key={relation.fieldId}><h2>{schemaData.fields.find(field => field.id === relation.fieldId)?.label ?? 'Linked records'}</h2><CellDisplay appId={schemaData.appId} field={schemaData.fields.find(field => field.id === relation.fieldId)} cell={data.record.fields[relation.fieldId]} /></section>)}<IncomingRelations relations={data.incomingRelations} appId={schemaData.appId} /></div>}</div><details className="cr-detail"><summary>Record actions</summary><button className="cr-button cr-button--quiet" disabled={!data.record.allowedActions.some(action => action.action === 'record.delete' && action.enabled)} onClick={() => setDeleting(true)}>Delete record</button></details><details className="cr-detail" onToggle={event => setHistoryOpen(event.currentTarget.open)}><summary>History and evidence</summary><p>Created <Timestamp value={data.record.createdAt} /> · Updated <Timestamp value={data.record.updatedAt} /></p>{historyOpen && <RecordHistory subject={data.record.ref} schema={schemaData} />}{data.evidenceIds.map((id, index) => <p key={id}><a className="cr-link" href={`/app/evidence/${id}`}>Supporting source {index + 1}</a></p>)}</details></> }}</ResourceState>}</ResourceState></div></OperatorFeaturePage>
}
