import './records.css'
import { useEffect, useState } from 'react'
import type { CellValue } from '../../contracts/primitives'
import { RECORD_FORM_ENTITY_ID, RECORD_SCHEMA_ENTITY_ID, type EntitySchema, type Form } from '../../domains/records/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
import { FieldInput } from './record-fields'
export function RecordFormPage({ formId }: { formId: string }) {
  return <OperatorFeaturePage currentPath="/app/records" title=""><div className="cr-page cr-records-page"><a href="/app/records" className="cr-link">← Records</a><RecordForm formId={formId} /></div></OperatorFeaturePage>
}
export function RecordForm({ formId }: { formId: string }) {
  const form = useResource<Form & { schema: EntitySchema }>(`/api/v1/forms/${formId}`)
  return <ResourceState resource={form.resource} operation="record form" retry={form.refresh}>{value => <FormFields key={`${value.id}:${value.version}:${value.schema.version}`} form={value} />}</ResourceState>
}
function FormFields({ form }: { form: Form & { schema: EntitySchema } }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [values, setValues] = useState<Record<string, CellValue>>({})
  const command = useCommand<unknown>(`form-submit:${form.id}`)
  const errors = command.result.state === 'failed' ? command.result.error.detail.issues : undefined
  useEffect(() => { if (command.result.state === 'committed') setValues({}) }, [command.result.state])
  return <form className="cr-form cr-card" onSubmit={event => { event.preventDefault(); if (!ready) return; void command.submit('/api/v1/commands/form.submit', { appId: form.appId, entityId: form.entityId, formId: form.id, values }, [{ ref: { appId: form.appId, entityId: RECORD_FORM_ENTITY_ID, recordId: form.id }, version: form.version }, { ref: { appId: form.appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: form.entityId }, version: form.schema.version }]) }}><h1>{form.title}</h1><fieldset className="cr-form cr-form-fields" disabled={!ready} aria-busy={!ready}><legend className="sr-only">Response fields</legend>{form.fields.map(definition => { const field = form.schema.fields.find(item => item.id === definition.fieldId); return field ? <div key={field.id}><FieldInput appId={form.appId} field={{ ...field, label: definition.label, required: definition.required }} value={values[field.id] ?? null} onChange={value => setValues(current => ({ ...current, [field.id]: value }))} error={errors?.find(issue => issue.fieldId === field.id)?.message} />{definition.help && <p className="cr-muted">{definition.help}</p>}</div> : <p className="cr-error" key={definition.fieldId}>A required form field is unavailable. Refresh this form.</p> })}</fieldset><CommandFeedback {...command} />{command.result.state === 'committed' ? <button type="button" className="cr-button cr-button--quiet" onClick={command.reset}>Start another response</button> : <button className="cr-button" disabled={!ready || !['idle','failed'].includes(command.result.state) || form.fields.some(field => !form.schema.fields.some(item => item.id === field.fieldId))}>Submit</button>}</form>
}
