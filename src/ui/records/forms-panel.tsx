import { FormEditor } from './form-editor'
import { useState } from 'react'
import type { Page } from '../../contracts/primitives'
import { type EntitySchema, type Form } from '../../domains/records/contracts'
import { useResource } from '../shared/api'
import { Empty, ResourceState } from '../shared/presentation'
export function FormsPanel({ schema }: { schema: EntitySchema }) {
  const forms = useResource<Page<Form>>(`/api/v1/apps/${schema.appId}/forms`)
  const [editing, setEditing] = useState<Form | 'new' | null>(null)
  return <section className="cr-stack">{editing ? <FormEditor schema={schema} initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); forms.refresh() }} /> : <><button className="cr-button cr-button--quiet" onClick={() => setEditing('new')}>Create form</button><ResourceState resource={forms.resource} operation="record forms" retry={forms.refresh}>{page => <>{page.items.filter(form => form.entityId === schema.id).map(form => <article className="cr-card" key={form.id}><h3>{form.title}</h3><div className="cr-actions"><a className="cr-button cr-button--quiet" href={`/app/forms/${form.id}`}>Open form</a><button className="cr-button cr-button--quiet" onClick={() => setEditing(form)}>Edit form</button></div></article>)}{!page.items.some(form => form.entityId === schema.id) && <Empty headingLevel={2} title="No forms for these records">Create a focused form using the writable fields.</Empty>}</>}</ResourceState></>}</section>
}
